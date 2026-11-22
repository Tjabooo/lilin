// lines: quote search in the search layer (search.js). What you type is also looked for in the subtitles of
// everything on the server (/api/lines, src/quote-search.js); films and episodes where it's said show as a
// "Lines" group: the frame at that moment, the line with the ones around it, and the other times it's said.
// A tap plays from a few seconds before the line. Quiet by default: three rows, the rest behind Show more, and
// nothing at all when no line matches.
const SHOWN = 3;
const LEAD = 3; // seconds of run-up before the line
const CHIPS = 6; // other times it's said, at most

const norm = (s) => String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const flat = (s) => String(s || '').replace(/\s*\n\s*/g, ' ');

export function createQuoteLines({ h, T, api, play, remember, fmtTime }) {
  let ctrl = null;
  const stop = () => { ctrl?.abort(); ctrl = null; };

  // The quote gets one mark where the line says it (the last typed word may be half a word); a line that has the
  // words in another order gets a mark on each of them.
  function marked(text, q) {
    const typed = norm(q).match(/[\p{L}\p{N}]+/gu) || [];
    const parts = text.split(/([\p{L}\p{N}]+)/u); // words at odd places
    const at = parts.map((p, i) => i).filter((i) => i % 2 === 1);
    const said = at.map((i) => norm(parts[i]));
    const fits = (w, j) => w === typed[j] || (j === typed.length - 1 && typed[j].length >= 2 && w.startsWith(typed[j]));
    const runs = []; // [first part, last part]
    for (let k = 0; typed.length && k + typed.length <= said.length; k++) {
      if (typed.every((_, j) => fits(said[k + j], j))) { runs.push([at[k], at[k + typed.length - 1]]); k += typed.length - 1; }
    }
    if (!runs.length) at.forEach((i, k) => { if (typed.some((_, j) => fits(said[k], j))) runs.push([i, i]); });
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const run = runs.find(([a]) => a === i);
      if (!run) { if (parts[i]) out.push(parts[i]); continue; }
      out.push(h('mark', { class: 'ql-mark' }, parts.slice(run[0], run[1] + 1).join('')));
      i = run[1];
    }
    return out;
  }

  // The frame where the line is said: the server's sharp still, asked for once a row is on screen (and a moment
  // after the results arrive, so a fast typist doesn't make frames for results gone a keystroke later); the
  // title's picture if there's no frame.
  function frame(r, li) {
    const img = h('img', { alt: '', decoding: 'async' });
    let fallback = Boolean(r.art);
    img.addEventListener('error', () => {
      if (fallback) { fallback = false; img.src = r.art; img.classList.add('is-art'); } else img.remove();
    });
    li.showFrame = () => { if (img.isConnected && !img.getAttribute('src')) img.src = `/api/media/lib/${encodeURIComponent(r.id)}/still?t=${Math.floor(r.line.at + 1)}`; };
    return h('span', { class: 'ql-frame', 'aria-hidden': 'true' }, img, h('span', { class: 'ql-time' }, fmtTime(r.line.at)));
  }

  function go(r, at) { remember(); play(r, Math.max(0.01, at - LEAD)); }

  function row(q, r) {
    const film = r.kind !== 'episode';
    const name = film ? r.title : r.showTitle || r.title;
    const where = [film ? T('Film') : T('S{0} E{1}', r.season, r.episode), !film && r.episodeName,
      r.count > 1 && T('said {0} times', r.count)].filter(Boolean).join(' · ');
    const others = (r.times || []).filter((t) => Math.abs(t - r.line.at) >= 1).slice(0, CHIPS);
    const li = h('li', { class: 'ql-row' });
    li.append(...[
      h('button', { type: 'button', class: 'ql-hit', 'aria-label': T('Play {0} from {1}', name, fmtTime(r.line.at)), onclick: () => go(r, r.line.at) },
        frame(r, li),
        h('span', { class: 'ql-title' }, h('span', { class: 'set-label' }, name), where && h('span', { class: 'set-hint' }, where)),
        h('span', { class: 'ql-quote' },
          r.line.before && h('span', { class: 'ql-around' }, flat(r.line.before)),
          h('span', { class: 'ql-said' }, marked(flat(r.line.text), q)),
          r.line.after && h('span', { class: 'ql-around' }, flat(r.line.after)))),
      others.length > 0 && h('div', { class: 'ql-times' }, h('span', { class: 'ql-times-label' }, T('Also at')),
        others.map((t) => h('button', { type: 'button', class: 'ql-at', 'aria-label': T('Play {0} from {1}', name, fmtTime(t)), onclick: () => go(r, t) }, fmtTime(t)))),
    ].filter(Boolean));
    return li;
  }

  function render(q, list) {
    const rows = list.map((r) => row(q, r));
    const stack = h('ul', { class: 'set-stack ql-list' }, rows.slice(0, SHOWN));
    const more = list.length > SHOWN && h('button', { type: 'button', class: 'chip ql-more', onclick: () => {
      stack.append(...rows.slice(SHOWN));
      for (const li of rows.slice(SHOWN)) li.showFrame();
      more.remove();
      rows[SHOWN]?.querySelector('.ql-hit')?.focus({ preventScroll: true });
    } }, T('Show {0} more', list.length - SHOWN));
    return h('section', { class: 'sr-group ql-group' }, h('h3', { class: 'sr-head' }, T('Lines')), stack, more);
  }

  async function find(q, slot) {
    stop();
    const mine = ctrl = new AbortController();
    try {
      const data = await api(`/api/lines?q=${encodeURIComponent(q)}`, { signal: mine.signal });
      if (ctrl !== mine) return;
      const list = data.results || [];
      slot.replaceChildren(...(list.length ? [render(q, list)] : []));
      setTimeout(() => { for (const li of slot.querySelectorAll('.ql-row')) li.showFrame?.(); }, 450);
    } catch (err) {
      if (err.name !== 'AbortError' && ctrl === mine) slot.replaceChildren(); // quiet: titles still work
    }
  }

  return { find, stop };
}
