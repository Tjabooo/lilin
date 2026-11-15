// The playhead program (https://github.com/Tjabooo/playhead) that Play now uses next to qBittorrent
// (src/playhead.js). Like Clipper, it's other code, so Lilin never takes "the latest": it pins one
// release and checks the download against the SHA-256 recorded here before it's ever run. To move to
// a newer playhead: review its changes, then update PLAYHEAD_RELEASE and the checksums.
//
// The program lives in DATA_DIR/bin/playhead(.exe). PLAYHEAD_BIN points at another one instead (your
// own build); then nothing is downloaded or checked.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PLAYHEAD_REPO = 'Tjabooo/playhead';
export const PLAYHEAD_RELEASE = 'v0.2.2';
export const PLAYHEAD_SHA256 = {
  'playhead-windows-x86_64.exe': '6d417df99ae7d560be4765ef8aaf0e95557e2c1ac1e51b937d0279322d21dc45',
  'playhead-linux-x86_64': 'c605e6af52f2ce57e27a746b6eb62427d43609b74e03c1dc05b7f06b572f3d2e',
  'playhead-linux-aarch64': '95bb731333c50338e1666f991c6f95db00d77e54af80737fce3b233678ae4e44',
};

export function playheadAsset(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return 'playhead-windows-x86_64.exe';
  if (platform === 'linux' && arch === 'x64') return 'playhead-linux-x86_64';
  if (platform === 'linux' && arch === 'arm64') return 'playhead-linux-aarch64';
  return null;
}

export const playheadPath = (dataDir, platform = process.platform) => path.join(dataDir, 'bin', platform === 'win32' ? 'playhead.exe' : 'playhead');

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Path of a checked playhead, downloading the pinned release when it's missing or doesn't match.
// Returns null where there's no build for this platform.
export async function ensurePlayhead({ dataDir, env = process.env, fetchFn = globalThis.fetch, log = console, platform = process.platform, arch = process.arch } = {}) {
  if (env.PLAYHEAD_BIN) return path.resolve(env.PLAYHEAD_BIN);
  const asset = playheadAsset(platform, arch);
  if (!asset) return null;
  const want = PLAYHEAD_SHA256[asset];
  const file = playheadPath(dataDir, platform);
  if (fs.existsSync(file) && sha256File(file) === want) return file;
  const url = `https://github.com/${PLAYHEAD_REPO}/releases/download/${PLAYHEAD_RELEASE}/${asset}`;
  const r = await fetchFn(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`playhead download failed (${r.status})`);
  const body = Buffer.from(await r.arrayBuffer());
  const got = crypto.createHash('sha256').update(body).digest('hex');
  if (got !== want) throw new Error(`playhead ${PLAYHEAD_RELEASE} didn’t match its checksum (got ${got}); not installed`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.download`;
  fs.writeFileSync(tmp, body, { mode: 0o755 });
  try { fs.renameSync(tmp, file); } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`couldn’t replace ${file} (${error.code}); is an old playhead still running?`);
  }
  log.info?.(`[playhead] installed ${PLAYHEAD_RELEASE} (${asset}, checksum ok)`);
  return file;
}
