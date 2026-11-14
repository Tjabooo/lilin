import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Conversions run in src/convert-runner.js, outside the server, so a restart doesn't throw away a
// half-done encode: the next server start finds the run folder and finishes the job.
const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const RUNNER = fileURLToPath(new URL('../src/convert-runner.js', import.meta.url));

async function ffmpegReady(t) {
  try { await run(FFMPEG, ['-version']); await run(process.env.FFPROBE || 'ffprobe', ['-version']); return true; }
  catch { t.skip('FFmpeg unavailable'); return false; }
}
const waitFor = async (check, ms) => {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  return check();
};

// A run folder as an earlier server process leaves it: an MKV being repackaged into "<name>.lilin-tmp.mp4".
async function leftRun(dir, { seconds = 4, realtime = false } = {}) {
  const mkv = path.join(dir, 'Film.2026.mkv');
  await run(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=blue:s=128x128:r=4:d=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-c:v', 'mpeg4', '-c:a', 'aac', '-y', mkv]);
  const tmp = path.join(dir, 'Film.2026.lilin-tmp.mp4');
  const output = path.join(dir, 'Film.2026.mp4');
  const runDir = path.join(dir, 'convert-runs', 'left-1');
  await fs.mkdir(runDir, { recursive: true });
  const args = ['-hide_banner', '-nostdin', '-y', ...(realtime ? ['-re'] : []), '-i', mkv, '-map', '0:v', '-map', '0:a', '-c', 'copy',
    '-progress', 'pipe:1', '-nostats', '-f', 'mp4', tmp];
  const spec = { cmd: FFMPEG, args, env: {}, started: Date.now(), meta: {
    job: { file: mkv, fix: false, h264: false, redo: false, force: false, deleteOriginal: false, prepare: false },
    lane: 'copy', output, tmp, localTmp: tmp, sidecars: [], shift: 0, duration: seconds, scratchNeed: 0,
    slot: { mode: 'Repackaging', purpose: 'apple' } } };
  await fs.writeFile(path.join(runDir, 'spec.json'), JSON.stringify(spec));
  return { mkv, tmp, output, runDir };
}

test('a conversion still running from before a restart is picked up and finished', { timeout: 60000 }, async (t) => {
  if (!(await ffmpegReady(t))) return;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-detached-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { mkv, output, runDir } = await leftRun(dir, { seconds: 6, realtime: true });
  // The runner the "previous server" started, still going (ffmpeg -re: about six seconds).
  const runner = spawn(process.execPath, [RUNNER, runDir], { stdio: 'ignore' });
  t.after(() => { try { runner.kill(); } catch { /* done */ } });
  assert.ok(await waitFor(() => existsSync(path.join(runDir, 'status.json')), 10000), 'runner started');

  const convert = await import('../src/convert.js?detached-adopt-test');
  await convert.startConverter({ dataDir: dir, listCandidates: async () => null });
  assert.equal(convert.jobState(mkv), 'converting', 'the picked-up job holds its lane');
  assert.ok(await waitFor(() => existsSync(output), 30000), 'the copy was moved into place');
  assert.ok(await waitFor(() => !existsSync(runDir), 5000), 'the run folder is removed');
  assert.equal(convert.jobState(mkv), null);
  const { stdout } = await run(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output]);
  assert.ok(Math.abs(Number(stdout) - 6) < 0.5, `full length (${stdout.trim()} s)`);
});

test('a run that finished while no server ran is completed; a dead one is cleaned up', { timeout: 60000 }, async (t) => {
  if (!(await ffmpegReady(t))) return;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-detached-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const done = await leftRun(dir);
  await run(FFMPEG, done.args ?? JSON.parse(await fs.readFile(path.join(done.runDir, 'spec.json'), 'utf8')).args);
  await fs.writeFile(path.join(done.runDir, 'exit.json'), JSON.stringify({ code: 0, stderr: '' }));

  // A second, dead run (no heartbeat for a minute, no exit): its temp file goes, it isn't adopted.
  const deadDir = path.join(dir, 'convert-runs', 'dead-1');
  const deadTmp = path.join(dir, 'Other.lilin-tmp.mp4');
  await fs.mkdir(deadDir, { recursive: true });
  await fs.writeFile(deadTmp, 'half');
  await fs.writeFile(path.join(deadDir, 'spec.json'), JSON.stringify({ cmd: FFMPEG, args: [], started: Date.now() - 120000,
    meta: { job: { file: done.mkv }, lane: 'encode', output: path.join(dir, 'Other.mp4'), tmp: deadTmp, localTmp: deadTmp, sidecars: [] } }));
  const old = new Date(Date.now() - 120000);
  await fs.utimes(path.join(deadDir, 'spec.json'), old, old);

  const convert = await import('../src/convert.js?detached-finished-test');
  await convert.startConverter({ dataDir: dir, listCandidates: async () => null });
  assert.ok(await waitFor(() => existsSync(done.output), 10000), 'the finished copy was moved into place');
  assert.ok(!existsSync(deadTmp), 'the dead run’s temp file is removed');
  assert.ok(await waitFor(() => readdirSync(path.join(dir, 'convert-runs')).length === 0, 5000), 'both run folders are gone');
});

test('new conversions run in their own process and leave nothing behind', { timeout: 60000 }, async (t) => {
  if (!(await ffmpegReady(t))) return;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilin-detached-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const mkv = path.join(dir, 'Show.S01E01.mkv');
  await run(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=128x128:r=4:d=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'mpeg4', '-c:a', 'aac', '-y', mkv]);
  const convert = await import('../src/convert.js?detached-new-test');
  await convert.startConverter({ dataDir: dir, listCandidates: async () => [{ file: mkv, deleteOriginal: false }] });
  let sawRun = false;
  const ok = await waitFor(() => {
    try { if (readdirSync(path.join(dir, 'convert-runs')).length) sawRun = true; } catch { /* not yet */ }
    return existsSync(convert.twinPath(mkv));
  }, 40000);
  assert.ok(ok, 'the MP4 copy was made');
  assert.ok(sawRun, 'through a run folder (a separate process)');
  assert.ok(await waitFor(() => readdirSync(path.join(dir, 'convert-runs')).length === 0, 5000), 'run folder removed');
});
