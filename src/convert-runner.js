// Runs one conversion's ffmpeg in its own process, so restarting Lilin doesn't stop it.
//   node src/convert-runner.js <run folder>
// The server writes <run folder>/spec.json ({ cmd, args, env }) and starts this outside its own
// process tree. This writes status.json every two seconds (its pid, ffmpeg's pid, progress) and
// exit.json once ffmpeg ends ({ code, stderr }). A server started later finds the folder and picks the
// job up from there: it waits for exit.json and then finishes the copy as usual (convert.js).
// Stopping this process stops its ffmpeg too (Windows closes the job object Node puts children in).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const dir = process.argv[2];
if (!dir) { console.error('usage: node convert-runner.js <run folder>'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8'));

const write = (name, obj) => {
  const file = path.join(dir, name);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(obj));
  fs.renameSync(`${file}.tmp`, file);
};
const state = { pid: process.pid, ffmpegPid: null, outTimeUs: null, speed: null, at: Date.now() };
const beat = () => { state.at = Date.now(); try { write('status.json', state); } catch { /* the server is reading it; next beat */ } };

let finished = false;
function finish(code, stderr) {
  if (finished) return;
  finished = true;
  clearInterval(timer);
  beat();
  write('exit.json', { code, stderr, at: Date.now() });
  process.exit(0);
}

let child;
try {
  child = spawn(spec.cmd, spec.args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...(spec.env || {}) } });
} catch (e) {
  write('exit.json', { code: -1, stderr: e.message, at: Date.now() });
  process.exit(1);
}
state.ffmpegPid = child.pid ?? null;
beat();
const timer = setInterval(beat, 2000);

// ffmpeg's -progress output: keep the two values the server shows.
let buf = '';
child.stdout.on('data', (d) => {
  buf += d;
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    const [k, v = ''] = line.split('=');
    if (k === 'out_time_us' && Number.isFinite(Number(v))) state.outTimeUs = Number(v);
    else if (k === 'speed') state.speed = v.trim();
  }
});
let err = '';
child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
child.on('error', (e) => finish(-1, e.message));
child.on('close', (code) => finish(code ?? -1, err));

for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  try { process.on(sig, () => { try { child.kill(); } catch { /* gone */ } process.exit(1); }); } catch { /* not on this platform */ }
}
