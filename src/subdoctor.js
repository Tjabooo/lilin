// Subtitle doctor: walks the whole library in the background and makes sure every video has English subtitles
// that actually work, without anyone pressing play first. No model involved; each check is a plain rule:
//   missing    no English subtitle file at all             → the video's own track, else an OpenSubtitles download
//   unreadable a file with no timed lines (empty, binary)  → set aside, fetched again
//   forced     the release's forced track under the plain name (subtitles.promoteFullSidecar swaps it)
//   short      lines stop long before the video ends       → other uploads, the first one that covers the video wins
//   long       lines run far past the video's end          → other uploads; when every one does, the video itself
//              is probably cut off and that's reported instead
// Downloads that fail (daily limit, OpenSubtitles down) are tried again on a later round instead of given up on.
// Everything it found and did is kept in .lilin-subdoctor.json; the log gets one summary line per round.
import fs from 'node:fs';
import path from 'node:path';

const MIN_VIDEO = 20 * 60;        // shorter videos (clips, extras) aren't checked for coverage
const SHORT_GAP = 15 * 60;        // "short": the last line ends this long before the video does...
const SHORT_SHARE = 0.6;          // ...and before this share of it
const LONG_GAP = 10 * 60;         // "long": the last line ends this long after the video does
const RECHECK_OK = 7 * 24 * 3600 * 1000;
const RETRY_FAILED = 6 * 3600 * 1000;
const RETRY_NOTHING = 3 * 24 * 3600 * 1000;
const SETTLE = 30 * 60 * 1000;    // a video written to in the last 30 min may still be downloading or converting

export function lastLineEnd(text, parseCues) {
  const cues = parseCues(text);
  return { count: cues.length, end: cues.reduce((m, c) => Math.max(m, c.end), 0) };
}

// What's wrong with a subtitle text for a video of `duration` seconds, or null when it looks fine.
export function diagnose({ text, duration, parseCues }) {
  if (text == null) return 'missing';
  const { count, end } = lastLineEnd(text, parseCues);
  if (!count) return 'unreadable';
  if (!duration || duration < MIN_VIDEO) return null;
  if (end < duration * SHORT_SHARE && duration - end > SHORT_GAP) return 'short';
  if (end - duration > LONG_GAP) return 'long';
  return null;
}

// Does a candidate cover a video of `duration` seconds properly?
export function fits(text, duration, parseCues) {
  return diagnose({ text, duration, parseCues }) == null;
}

export class SubDoctor {
  // deps: { videos() → paths, infoFor(file), findSidecar(file, lang), ensureSubtitle(file, info, lang),
  //         otherUploads(file, info, lang, srt) → [{ text, label }], parseCues(text), duration(file) → seconds,
  //         sync(srt, file), busy() → bool, quotaLow() → bool }
  constructor({ dataDir, lang = 'en', perRound = 12, now = () => Date.now(), log = console.log, ...deps }) {
    this.deps = deps;
    this.lang = lang;
    this.perRound = perRound;
    this.now = now;
    this.log = log;
    this.file = dataDir ? path.join(dataDir, '.lilin-subdoctor.json') : null;
    this.asideDir = dataDir ? path.join(dataDir, 'cache', 'subdoctor') : null;
    this.state = {};
    try { this.state = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* first run */ }
    this.running = false;
  }

  save() {
    if (!this.file) return;
    try { fs.writeFileSync(this.file, JSON.stringify(this.state, null, 1)); } catch { /* next round */ }
  }

  sig(p) {
    try { const s = fs.statSync(p); return `${s.size}:${Math.round(s.mtimeMs)}`; } catch { return null; }
  }

  // Skip a video when nothing changed since a check that's still fresh enough for its outcome.
  due(file, vsig, ssig) {
    const st = this.state[file];
    if (!st || st.video !== vsig || st.srt !== ssig) return true;
    const age = this.now() - (st.at || 0);
    if (st.status === 'ok' || st.status === 'video-short') return age > RECHECK_OK;
    if (st.status === 'nothing') return age > RETRY_NOTHING;
    return age > RETRY_FAILED;
  }

  set(file, vsig, srt, status, note) {
    const prev = this.state[file];
    this.state[file] = { video: vsig, srt: srt ? this.sig(srt) : null, status, at: this.now(), ...(note && { note }) };
    if (prev?.status !== status && status !== 'ok') this.log(`[subdoctor] ${path.basename(file)}: ${status}${note ? ` (${note})` : ''}`);
  }

  setAside(srt) {
    if (!this.asideDir) return fs.rmSync(srt, { force: true });
    fs.mkdirSync(this.asideDir, { recursive: true });
    fs.renameSync(srt, path.join(this.asideDir, `${Date.now()}-${path.basename(srt)}`));
  }

  async round() {
    if (this.running) return null;
    this.running = true;
    const tally = { checked: 0, fixed: 0, problems: 0 };
    try {
      const videos = (await this.deps.videos()) || [];
      const live = new Set(videos);
      for (const k of Object.keys(this.state)) if (!live.has(k)) delete this.state[k];
      let repairs = 0;
      for (const file of videos) {
        if (repairs >= this.perRound || this.deps.busy?.()) break;
        if (/[\\/]sample[\\/]|\bsample\.[a-z0-9]+$/i.test(file) || /-sample\./i.test(file)) continue;
        let vst;
        try { vst = fs.statSync(file); } catch { continue; }
        if (this.now() - vst.mtimeMs < SETTLE) continue;
        const vsig = `${vst.size}:${Math.round(vst.mtimeMs)}`;
        let srt = this.deps.findSidecar(file, this.lang); // also swaps a forced-only file for the full one
        if (!this.due(file, vsig, srt && this.sig(srt))) continue;
        tally.checked++;
        const outcome = await this.check(file, vsig, srt).catch((e) => ({ status: 'failed', note: e.message }));
        if (outcome.repaired) repairs++;
        if (outcome.status === 'ok' && outcome.repaired) tally.fixed++;
        else if (outcome.status !== 'ok') tally.problems++;
        srt = this.deps.findSidecar(file, this.lang);
        this.set(file, vsig, srt, outcome.status, outcome.note);
      }
      this.save();
      if (tally.fixed || tally.problems) this.log(`[subdoctor] checked ${tally.checked}: ${tally.fixed} fixed, ${tally.problems} still need work`);
      return tally;
    } finally {
      this.running = false;
    }
  }

  async check(file, vsig, srt) {
    const { parseCues } = this.deps;
    const text = srt ? fs.readFileSync(srt, 'utf8') : null;
    const duration = await this.deps.duration(file).catch(() => null);
    // Extras, trailers and clips: not worth a download, and a title search would find the main film's subtitles.
    if (!duration || duration < MIN_VIDEO) return { status: 'ok', note: 'too short to check' };
    const problem = diagnose({ text, duration, parseCues });
    if (!problem) return { status: 'ok' };
    const info = this.deps.infoFor(file);
    if (!info?.tmdbId && info?.season == null) return { status: 'nothing', note: 'not matched to a film or episode' };
    if (problem === 'missing' || problem === 'unreadable') {
      if (problem === 'unreadable') this.setAside(srt);
      if (this.deps.quotaLow?.()) return { status: 'waiting', note: `${problem}, download limit` };
      try {
        const got = await this.deps.ensureSubtitle(file, info, this.lang);
        const again = got && diagnose({ text: fs.readFileSync(got, 'utf8'), duration, parseCues });
        if (got) this.deps.sync?.(got, file);
        return again ? { status: again, repaired: true, note: 'new file has the same problem' } : { status: 'ok', repaired: true };
      } catch (e) {
        if (e.status === 404) return { status: 'nothing', note: e.message };
        return { status: 'failed', repaired: true, note: e.message };
      }
    }
    // short / long: look for an upload that covers this video.
    if (this.deps.quotaLow?.()) return { status: 'waiting', note: `${problem}, download limit` };
    const others = await this.deps.otherUploads(file, info, this.lang, srt).catch(() => []);
    const good = others.find((o) => fits(o.text, duration, parseCues));
    if (good) {
      this.setAside(srt);
      fs.writeFileSync(srt, good.text, 'utf8');
      this.deps.sync?.(srt, file);
      return { status: 'ok', repaired: true, note: `replaced by ${good.label}` };
    }
    if (problem === 'long' && others.length && others.every((o) => diagnose({ text: o.text, duration, parseCues }) === 'long')) {
      return { status: 'video-short', repaired: true, note: `every subtitle runs past ${Math.round(duration / 60)} min: the video file looks cut off` };
    }
    return { status: problem, repaired: others.length > 0, note: others.length ? `${others.length} other uploads didn't fit` : 'no other uploads' };
  }
}
