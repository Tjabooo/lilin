// Live TV in the web app: the guide (channels × time with a "now" line) and the owner's channel editor.
// Tuning in and the live player are in app.js (tuneIn), on top of a Watch Together room per channel.
import { T, locale } from './i18n.js';

const MIN = 60000;
const AUTO_NAMES = () => ({ anime: T('Anime'), sitcoms: T('Sitcoms'), films: T('Films'), docs: T('Documentaries') });

// What a channel is called for this viewer.
export function channelName(c, me) {
  if (!c) return '';
  if (c.kind === 'auto') return AUTO_NAMES()[c.id] || c.id;
  if (c.kind === 'picks') return c.id === `picks-${me?.id}` ? T('Your picks') : T('{0}’s picks', c.person || '');
  return c.name || '';
}

export const clock = (ms) => new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

// "S01 E02 · Pilot" under a programme's title (films: nothing).
export function programmeLine(p, episodeLabel) {
  if (!p || p.kind !== 'episode') return '';
  return [episodeLabel(p), p.name].filter(Boolean).join(' · ');
}

export function createLiveView({ h, icon, api, jsonPost, toast, people, episodeLabel, me, tune, overlay, sheet, emptyState }) {
  const state = { guide: null, loading: null, error: '', at: 0, scrolled: false, nowTimer: null };
  const pxPerMin = () => (matchMedia('(max-width: 699px)').matches ? 4 : 6.5);

  async function load(force = false) {
    if (!force && state.guide && Date.now() - state.at < 30000) return state.guide;
    state.loading ||= api(`/api/live?from=${Date.now() - 30 * MIN}&to=${Date.now() + 3.5 * 60 * MIN}`).then((guide) => {
      state.guide = guide; state.at = Date.now(); state.error = '';
      return guide;
    }).catch((e) => { state.error = e.message; return state.guide; }).finally(() => { state.loading = null; });
    return state.loading;
  }

  const channels = () => state.guide?.channels || [];
  const displayName = () => state.guide?.name || 'Lilin TV';
  const onNow = (c, at = Date.now()) => c.programmes.find((p) => p.s <= at && at < p.e) || null;
  const nextUp = (c, at = Date.now()) => c.programmes.find((p) => p.s > at) || null;

  // ---------- the guide ----------
  function render(body) {
    clearInterval(state.nowTimer);
    const heading = document.getElementById('live-heading');
    if (heading) heading.replaceChildren(h('span', { class: 'live-mark', 'aria-hidden': 'true' }), displayName());
    const list = channels();
    if (!state.guide && state.error) { body.replaceChildren(emptyState(T('Live TV isn’t available right now.'), state.error)); return; }
    if (!state.guide) { body.replaceChildren(h('p', { class: 'muted live-loading' }, T('Tuning in…'))); return; }
    const tools = me()?.isOwner ? h('div', { class: 'live-tools' },
      h('button', { type: 'button', class: 'chip', onclick: (e) => openEditor(e.currentTarget) }, icon('plus'), T('Your channels'))) : null;
    if (!list.length) {
      body.replaceChildren(...[tools, emptyState(T('No channels yet.'), T('Channels fill themselves from the library: add a few shows or films and they start broadcasting.'))].filter(Boolean));
      return;
    }
    const { from, to } = state.guide;
    const ppm = pxPerMin();
    const x = (ms) => Math.round(((ms - from) / MIN) * ppm);
    const width = x(to);
    const ruler = h('div', { class: 'guide-ruler', style: `width:${width}px` });
    const first = Math.ceil(from / (30 * MIN)) * 30 * MIN;
    for (let t = first; t < to; t += 30 * MIN) ruler.append(h('span', { class: 'guide-tick', style: `left:${x(t)}px` }, clock(t)));
    const nowLine = h('div', { class: 'guide-now', 'aria-hidden': 'true' });
    const rows = list.map((c) => {
      const live = onNow(c);
      const watching = (c.faces || []).filter((f) => f.name !== me()?.name);
      const head = h('button', { type: 'button', class: 'guide-channel', 'aria-label': T('Channel {0}: {1}. Now: {2}', c.number, channelName(c, me()), live?.title || T('nothing')),
        onclick: () => tune(c.id) },
        h('span', { class: 'guide-number' }, String(c.number)),
        h('span', { class: 'guide-channel-text' }, h('b', {}, channelName(c, me())),
          watching.length ? h('span', { class: 'guide-faces' }, people.faces(watching, { size: 18, max: 3 })) : null));
      const lane = h('div', { class: 'guide-lane', style: `width:${width}px` });
      for (const p of c.programmes) {
        const left = Math.max(0, x(p.s)), right = Math.min(width, x(p.e));
        if (right - left < 2) continue;
        const airing = p === live;
        lane.append(h('button', { type: 'button', class: `guide-show${airing ? ' is-now' : ''}${p.e <= Date.now() ? ' is-past' : ''}`,
          style: `left:${left}px;width:${right - left - 3}px`,
          title: [p.title, programmeLine(p, episodeLabel), `${clock(p.s)}–${clock(p.e)}`].filter(Boolean).join('\n'),
          onclick: () => (p.s <= Date.now() + 60000 ? tune(c.id) : toast(T('{0} starts at {1} on {2}', p.title, clock(p.s), channelName(c, me())))) },
          h('b', {}, p.title), h('small', {}, programmeLine(p, episodeLabel) || `${clock(p.s)}–${clock(p.e)}`)));
      }
      return h('div', { class: 'guide-row' }, head, lane);
    });
    const scroller = h('div', { class: 'guide-scroll' },
      h('div', { class: 'guide-grid', style: `--guide-w:${width}px` },
        h('div', { class: 'guide-row guide-head' }, h('span', { class: 'guide-corner' }, clock(Date.now())), ruler), ...rows, nowLine));
    const placeNow = () => {
      const left = x(Date.now());
      nowLine.style.transform = `translateX(${left}px)`;
      scroller.querySelector('.guide-corner').textContent = clock(Date.now());
      if (Date.now() > to - 60 * MIN) refresh();
    };
    placeNow();
    // Up next: one line per channel on what's on and what follows (quick to read on a phone).
    const nowNext = h('ul', { class: 'live-nownext' }, list.slice(0, 12).map((c) => {
      const p = onNow(c), n = nextUp(c);
      const left = p ? Math.max(1, Math.round((p.e - Date.now()) / MIN)) : null;
      return h('li', {}, h('button', { type: 'button', class: 'nownext', onclick: () => tune(c.id) },
        h('span', { class: 'nownext-art', style: p?.art ? `background-image:url("${artUrl(p.art)}")` : '' },
          h('span', { class: 'nownext-number' }, String(c.number))),
        h('span', { class: 'nownext-text' },
          h('small', { class: 'nownext-channel' }, channelName(c, me())),
          h('b', {}, p ? p.title : T('Off air')),
          p && programmeLine(p, episodeLabel) ? h('span', { class: 'nownext-sub' }, programmeLine(p, episodeLabel)) : null,
          p ? h('span', { class: 'nownext-bar', style: `--done:${Math.min(1, (Date.now() - p.s) / (p.e - p.s))}` }) : null,
          h('small', { class: 'muted' }, [left != null ? T('{0} min left', left) : null, n ? T('Next: {0} at {1}', n.title, clock(n.s)) : null].filter(Boolean).join(' · ')))));
    }));
    body.replaceChildren(...[tools, h('h3', { class: 'live-sub' }, T('On now')), nowNext, h('h3', { class: 'live-sub' }, T('Guide')), scroller].filter(Boolean));
    // Start with "now" a little in from the left.
    requestAnimationFrame(() => { scroller.scrollLeft = Math.max(0, x(Date.now()) - 60); });
    state.nowTimer = setInterval(() => { if (!body.isConnected || body.closest('[hidden]')) { clearInterval(state.nowTimer); return; } placeNow(); }, 30000);
    let refreshing = false;
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      await load(true);
      refreshing = false;
      if (body.isConnected && !body.closest('[hidden]')) render(body);
    }
  }
  // TMDB pictures come through the server in a small size (see /api/art).
  const artUrl = (src) => {
    const m = /^(?:https:\/\/image\.tmdb\.org)?\/t\/p\/(?:w\d+|original)(\/[A-Za-z0-9_-]{4,64}\.(?:jpg|png))$/.exec(String(src || ''));
    return m ? `/api/art?path=${encodeURIComponent(`/t/p/w300${m[1]}`)}` : src;
  };

  // ---------- channel surfing (the player's ▲ ▼, number keys and "last channel") ----------
  function neighbour(id, step) {
    const list = channels();
    if (!list.length) return null;
    const at = list.findIndex((c) => c.id === id);
    return list[((at < 0 ? 0 : at) + step + list.length) % list.length];
  }
  const byNumber = (n) => channels().find((c) => c.number === n) || null;
  const byId = (id) => channels().find((c) => c.id === id) || null;

  // ---------- the owner's channels ----------
  async function openEditor(opener, editing = null) {
    let data;
    try { data = await api('/api/live/channels'); } catch (e) { toast(e.message); return; }
    const body = document.getElementById('picker-body');
    const paint = () => {
      const list = h('ul', { class: 'live-edit-list' }, data.channels.map((c) => h('li', {},
        h('span', { class: 'guide-number' }, String(c.number)), h('b', {}, c.name),
        h('button', { type: 'button', class: 'chip', onclick: () => { editing = c; paint(); } }, T('Edit')),
        h('button', { type: 'button', class: 'chip', onclick: async () => {
          try { data = await api('/api/live/channels', jsonPost({ remove: c.id })); editing = null; paint(); changed(); } catch (e) { toast(e.message); }
        } }, T('Remove')))));
      const draft = editing || { name: '', shows: [], genres: [], libraries: [], types: 'all', order: 'shuffle', audience: [] };
      const name = h('input', { type: 'text', maxlength: '40', value: draft.name, placeholder: T('Friday films'), 'aria-label': T('Channel name') });
      const pick = (label, options, chosen, key) => {
        const set = new Set(chosen.map(String));
        const field = h('fieldset', { class: 'live-pick' }, h('legend', {}, label),
          h('div', { class: 'live-chips' }, options.map((o) => {
            const b = h('button', { type: 'button', class: `chip${set.has(String(o.value)) ? ' is-on' : ''}`, 'aria-pressed': String(set.has(String(o.value))),
              onclick: () => { const v = String(o.value); if (set.has(v)) set.delete(v); else set.add(v); b.classList.toggle('is-on', set.has(v)); b.setAttribute('aria-pressed', String(set.has(v))); } }, o.label);
            return b;
          })));
        field.set = set; field.key = key;
        return field;
      };
      const genreChosen = data.genres.filter((g) => g.ids.some((id) => draft.genres.includes(id))).map((g) => g.ids.join(','));
      const shows = pick(T('Shows'), data.shows.map((s) => ({ value: s.id, label: s.title })), draft.shows, 'shows');
      const genres = pick(T('Genres'), data.genres.map((g) => ({ value: g.ids.join(','), label: g.name })), genreChosen, 'genres');
      const libraries = pick(T('Everything in someone’s library'), data.people.map((u) => ({ value: u.id, label: u.name })), draft.libraries, 'libraries');
      const audience = pick(T('Who sees it (nobody picked: everyone)'), data.people.map((u) => ({ value: u.id, label: u.name })), draft.audience, 'audience');
      const select = (label, value, options) => h('label', { class: 'live-select' }, label,
        h('select', {}, options.map(([v, text]) => h('option', { value: v, selected: v === value }, text))));
      const types = select(T('Plays'), draft.types, [['all', T('Films and episodes')], ['films', T('Films only')], ['episodes', T('Episodes only')]]);
      const order = select(T('Order'), draft.order, [['shuffle', T('Shuffle')], ['order', T('In order')]]);
      const status = h('p', { class: 'muted', role: 'status' });
      const save = h('button', { type: 'button', class: 'play-btn', onclick: async () => {
        const value = (f) => [...f.set];
        const body = { id: editing?.id, name: name.value, shows: value(shows), libraries: value(libraries).map(Number), audience: value(audience).map(Number),
          genres: value(genres).flatMap((g) => g.split(',').map(Number)), types: types.querySelector('select').value, order: order.querySelector('select').value };
        save.disabled = true;
        try { data = await api('/api/live/channels', jsonPost(body)); editing = null; paint(); changed(); toast(T('Channel saved. It’s on the air.')); }
        catch (e) { status.textContent = e.message; }
        finally { save.disabled = false; }
      } }, editing ? T('Save channel') : T('Add channel'));
      const liveName = h('input', { type: 'text', maxlength: '30', value: data.nameSetting, placeholder: data.name, 'aria-label': T('Name of Live TV') });
      const rename = h('button', { type: 'button', class: 'chip', onclick: async () => {
        try { await api('/api/admin/settings', jsonPost({ liveName: liveName.value })); state.at = 0; toast(T('Saved')); changed(); }
        catch (e) { toast(e.message); }
      } }, T('Save name'));
      body.replaceChildren(h('h2', { id: 'picker-title' }, T('Your channels')),
        h('p', { class: 'muted' }, T('Channels run around the clock from what’s on the server. Automatic ones (Anime, Sitcoms, Films, Documentaries and everyone’s picks) are always there.')),
        h('div', { class: 'live-rename' }, liveName, rename),
        data.channels.length ? list : null,
        h('h3', { class: 'live-sub' }, editing ? T('Edit {0}', editing.name) : T('New channel')),
        name, h('div', { class: 'live-selects' }, types, order), shows, genres, libraries, audience, status,
        h('div', { class: 'live-edit-actions' }, save, editing ? h('button', { type: 'button', class: 'chip', onclick: () => { editing = null; paint(); } }, T('Cancel')) : null));
    };
    paint();
    overlay.push(sheet(() => opener?.focus?.()));
  }
  let onChange = () => {};
  function changed() { state.at = 0; onChange(); }

  return { load, render, channels, byNumber, byId, neighbour, onNow, nextUp, displayName, artUrl,
    get guide() { return state.guide; }, onChanged: (fn) => { onChange = fn; }, invalidate: () => { state.at = 0; } };
}
