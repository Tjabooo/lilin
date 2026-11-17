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
export const PLAYHEAD_RELEASE = 'v0.2.5';
export const PLAYHEAD_SHA256 = {
  'playhead-windows-x86_64.exe': 'f6287dec98578c842842337fc90f832f66ce7d6c77d00930205e5dedca4cd4b3',
  'playhead-linux-x86_64': '9ca32a7d6a6afb5da81d89742415f81fe4b032ed95b872e7041403c284dcbb8e',
  'playhead-linux-aarch64': 'ba9aef114e8115ccd79e1900db4c9919ca2441d539a54bd708741201d5c390ff',
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
