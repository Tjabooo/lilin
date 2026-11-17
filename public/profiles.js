// Profiles: everyone's own page, a bit like Letterboxd. Picture, name, @username, pronouns and bio; four favourite
// films or shows; what they watched lately (a diary behind "More activity"), their stars, reviews, likes and
// friends. The owner of a profile decides how it looks (accent, banner, name font, poster shape, background,
// layout, which sections show and in what order) and who sees it (everyone, friends, only them).
// Server side: src/profiles.js, /api/profiles.
//
// A profile is a full-screen page of its own (.pf). Opened from the header face, Settings, Friends or a review it
// sits under title pages, so tapping a poster opens the title on top and Back comes back. Opened from inside a
// title page or a sheet it's "nested" and sits over them instead; a poster then closes it and opens the title in
// the title page (whose Back returns to the title it was on). The editor opens in the picker sheet and repaints
// the page underneath as you change things, so you see the result before saving.
//
// app.js passes in its helpers; this file has no globals beyond the DOM.
import { T, locale as appLocale } from './i18n.js';
import { tintOf } from './people.js';

const ACCENTS = ['#F4C152', '#FF9B85', '#E9A0C4', '#C3ACF2', '#93D6BA', '#97C9F2', '#F5AE6B', '#FF8C1A', '#E5484D', '#7FD1FF', '#B8E986', '#EDE6DD'];
const GRADIENTS = ['ember', 'dusk', 'ocean', 'forest', 'rose', 'aurora', 'sunset', 'mono'];
const FONTS = [['display', T('Bold')], ['condensed', T('Tall')], ['light', T('Light')], ['serif', T('Serif')], ['mono', T('Mono')], ['rounded', T('Rounded')]];
const POSTERS = [['soft', T('Soft')], ['square', T('Square')], ['round', T('Round')], ['polaroid', T('Polaroid')]];
const SECTION_NAMES = { favorites: T('Favourites'), recent: T('Recent activity'), stats: T('Numbers'), ratings: T('Ratings'), reviews: T('Reviews'), liked: T('Liked'), friends: T('Friends') };
const VISIBILITY = [['public', T('Everyone')], ['friends', T('Friends')], ['private', T('Only me')]];
const VISIBILITY_HINTS = {
  public: T('Everyone on this Lilin can see your profile.'),
  friends: T('Only your friends can see your profile. Others see your name and picture.'),
  private: T('Only you can see your profile. Others see your name and picture.'),
};
const MAX_BIO = 300;

const keyOf = (c) => (c?.key || (c?.type && c?.id != null ? `${c.type}:${c.id}` : null));
const small = (url, size = 'w185') => (url ? String(url).replace(/\/t\/p\/(w\d+|original)\//, `/t/p/${size}/`) : null);
const big = (url) => (url ? String(url).replace(/\/t\/p\/(w\d+|original)\//, '/t/p/w1280/') : null);

export function createProfiles({ h, api, jsonPost, toast, icon, people, me, openTitle, overlay, picker, copyText, friendsChanged = () => {},
  changePicture, removePicture, saveName, mineChanged = () => {} }) {
  const locale = () => appLocale;
  const nestedNow = () => ['#sheet', '#picker'].some((s) => document.querySelector(s)?.classList.contains('open'))
    || Boolean(document.querySelector('.pf.pf-nested.open'));

  // ---------- opening ----------
  // target: { id } or { handle } (a person from anywhere: { id, name, avatar } shows their face while it loads).
  function open(target, opener) {
    if (!target || (!target.id && !target.handle)) return;
    const nested = nestedNow();
    const page = h('div', { class: `pf${nested ? ' pf-nested' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': target.name ? T('{0}’s profile', target.name) : T('Profile'), tabindex: '-1' });
    const ctx = { page, nested, data: null, target, draft: null, diary: null, allReviews: null };
    page.append(skeleton(target, ctx));
    document.body.append(page);
    // The bar turns to glass (and shows the @username) once the banner has scrolled away.
    let frame = 0;
    page.addEventListener('scroll', () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; const on = page.scrollTop > 140; if (on !== Boolean(ctx.scrolled)) { ctx.scrolled = on; page.classList.toggle('scrolled', on); } });
    }, { passive: true });
    requestAnimationFrame(() => { page.classList.add('open'); page.focus({ preventScroll: true }); });
    const hashBefore = location.hash;
    overlay.push(() => {
      ctx.closed = true;
      page.classList.remove('open');
      setTimeout(() => page.remove(), 320);
      if (location.hash.startsWith('#@') && hashBefore !== location.hash) history.replaceState(history.state, '', `${location.pathname}${location.search}${hashBefore.startsWith('#@') ? '' : hashBefore}`);
      opener?.isConnected && opener.focus?.({ preventScroll: true });
    });
    load(ctx);
    return ctx;
  }
  // Your own page; edit: straight into the editor, over the page it previews on (You's Edit profile).
  const openMine = (opener, { edit = false } = {}) => {
    const m = me();
    if (!m) return;
    const ctx = open({ id: m.id, name: m.name, avatar: m.avatar }, opener);
    if (edit && ctx) ctx.editOnLoad = opener;
  };
  // A link to a profile (/#@ebicat) opens it once Lilin has started.
  function fromHash(hash = location.hash) {
    const m = /^#@([A-Za-z0-9._]{1,24})$/.exec(hash);
    if (m) open({ handle: m[1] });
  }

  async function load(ctx) {
    const t = ctx.target;
    try {
      const mine = me() && t.id === me().id;
      ctx.data = await api(mine ? '/api/profiles/me' : t.id ? `/api/profiles/${t.id}` : `/api/profiles/@${encodeURIComponent(t.handle)}`);
    } catch (err) {
      ctx.page.replaceChildren(topBar(ctx), h('div', { class: 'pf-gone' }, h('h2', {}, T('Couldn’t open this profile')), h('p', { class: 'muted' }, err.message)));
      return;
    }
    if (ctx.closed) return;
    // The address shows whose profile this is (/#@ebicat), while it's the page on top.
    const top = [...document.querySelectorAll('.pf.open')].pop();
    ctx.page.dataset.handle = ctx.data.person.handle;
    if (top === ctx.page) history.replaceState(history.state, '', `${location.pathname}${location.search}#@${ctx.data.person.handle}`);
    paint(ctx);
    if (ctx.data.me) { own.data = ctx.data; own.at = Date.now(); }
    if (ctx.editOnLoad !== undefined) { const opener = ctx.editOnLoad; delete ctx.editOnLoad; openEditor(ctx, opener); }
  }

  // ---------- the page ----------
  function paint(ctx) {
    if (ctx.closed) return;
    if (ctx.repaint) { ctx.repaint(); return; } // one of You's own lists (privateList)
    const d = ctx.draft ? previewOf(ctx.data, ctx.draft) : ctx.data;
    const look = d.look || {};
    const accent = look.accent || tintOf(d.person.name);
    const page = ctx.page;
    page.className = ['pf', 'open', ctx.nested && 'pf-nested', `pf-font-${look.font || 'display'}`, `pf-posters-${look.posters || 'soft'}`,
      `pf-bg-${look.background || 'glow'}`, `pf-align-${look.align || 'center'}`, d.locked && 'pf-locked', ctx.scrolled && 'scrolled'].filter(Boolean).join(' ');
    page.style.setProperty('--pf-accent', accent);
    page.setAttribute('aria-label', T('{0}’s profile', d.person.name));
    const scrollTop = page.scrollTop;
    const banner = bannerOf(d);
    page.replaceChildren(
      topBar(ctx, d),
      look.background === 'image' && banner ? h('div', { class: 'pf-wash', 'aria-hidden': 'true' }, h('img', { src: small(banner, 'w300'), alt: '', decoding: 'async' })) : null,
      h('div', { class: `pf-banner${banner ? '' : ` pf-grad pf-grad-${look.banner === 'gradient' ? look.gradient : 'ember'}`}${look.banner === 'none' ? ' pf-banner-none' : ''}`, 'aria-hidden': 'true' },
        banner && look.banner !== 'none' && h('img', { src: banner, alt: '', decoding: 'async' })),
      head(ctx, d),
      ...(d.locked ? [lockedNote(ctx, d)] : sections(ctx, d)),
      !d.locked && d.person.since && h('p', { class: 'pf-since' }, T('On Lilin since {0}', new Date(d.person.since).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }))));
    page.scrollTop = scrollTop;
  }

  function bannerOf(d) {
    const look = d.look || {};
    if (look.banner === 'none' || look.banner === 'gradient') return null;
    if (d.locked) return null;
    return d.banner || null;
  }

  function skeleton(t, ctx) {
    return h('div', { class: 'pf-skel' }, topBar(ctx),
      h('div', { class: 'pf-banner pf-grad pf-grad-ember', 'aria-hidden': 'true' }),
      h('div', { class: 'pf-head' }, h('div', { class: 'pf-face' }, people.face(t.name ? t : { name: '·' }, { size: 104 })),
        t.name ? h('h2', { class: 'pf-name' }, t.name) : h('div', { class: 'pf-line skel' }), h('div', { class: 'pf-line short skel' })));
  }

  function topBar(ctx, d) {
    const back = h('button', { type: 'button', class: 'icon-btn pf-back', 'aria-label': T('Back'), onclick: () => overlay.close() }, icon('back'));
    const right = [];
    if (d && !d.locked && d.person.handle) {
      right.push(h('button', { type: 'button', class: 'icon-btn', 'aria-label': T('Share profile'), title: T('Share profile'), onclick: () => share(d) }, icon('share')));
    }
    const bar = h('div', { class: 'pf-bar' }, back, h('span', { class: 'pf-bar-title' }, d ? `@${d.person.handle}` : ''), h('div', { class: 'pf-bar-actions' }, ...right));
    return bar;
  }

  async function share(d) {
    const url = `${location.origin}/#@${d.person.handle}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: T('{0} on Lilin', d.person.name), url }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    if (await copyText(url)) toast(T('Link copied. It opens for people who can see your profile.'));
  }

  function head(ctx, d) {
    const p = d.person;
    const lb = !d.locked && d.letterboxd?.linked && d.letterboxd;
    const sub = [h('span', { class: 'pf-handle' }, `@${p.handle}`), p.pronouns && h('span', { class: 'pf-pronouns' }, p.pronouns),
      lb && h('a', { class: 'pf-lb-link', href: lb.url, target: '_blank', rel: 'noopener noreferrer', title: T('{0} on Letterboxd', lb.username) }, T('Letterboxd'))].filter(Boolean);
    return h('header', { class: 'pf-head' },
      d.me && changePicture
        ? h('button', { type: 'button', class: 'pf-face pf-face-mine', 'aria-label': p.avatar ? T('Change your picture') : T('Add a picture'),
          title: p.avatar ? T('Change your picture') : T('Add a picture'),
          onclick: (e) => changePicture({ opener: e.currentTarget, over: ctx.nested, done: () => load(ctx) }) },
        people.face(p, { size: 104 }), h('span', { class: 'pf-face-cam', 'aria-hidden': 'true' }, icon('camera')))
        : h('div', { class: 'pf-face' }, people.face(p, { size: 104 })),
      h('h2', { class: 'pf-name' }, p.name),
      h('div', { class: 'pf-sub' }, ...sub.flatMap((x, i) => (i ? [h('span', { class: 'pf-dot', 'aria-hidden': 'true' }, '·'), x] : [x]))),
      !d.locked && p.bio && h('p', { class: 'pf-bio' }, p.bio),
      actions(ctx, d),
      !d.locked && on(d, 'stats') && d.stats && statsRow(d.stats));
  }

  function actions(ctx, d) {
    if (d.me) {
      const vis = VISIBILITY.find(([k]) => k === d.visibility)?.[1] || '';
      return h('div', { class: 'pf-actions' },
        h('button', { type: 'button', class: 'chip pf-edit', onclick: (e) => openEditor(ctx, e.currentTarget) }, icon('pencil'), T('Edit profile')),
        h('span', { class: 'pf-vis', title: VISIBILITY_HINTS[d.visibility] }, icon(d.visibility === 'public' ? 'globe' : 'lock'), T('Visible to: {0}', vis)));
    }
    const f = d.friend;
    if (!f || f === 'unavailable') {
      if (f === 'unavailable') return null;
      return h('div', { class: 'pf-actions' }, h('button', { type: 'button', class: 'chip pf-friend', onclick: (e) => befriend(ctx, 'request', e.currentTarget) }, icon('plus'), T('Add friend')));
    }
    if (f === 'received') return h('div', { class: 'pf-actions' }, h('button', { type: 'button', class: 'chip pf-friend pf-friend-yes', onclick: (e) => befriend(ctx, 'accept', e.currentTarget) }, icon('check'), T('Accept friend request')));
    if (f === 'sent') return h('div', { class: 'pf-actions' }, h('span', { class: 'pf-vis' }, icon('clock'), T('Friend request sent')));
    return h('div', { class: 'pf-actions' }, h('span', { class: 'pf-vis pf-is-friend' }, icon('check'), T('Friends')));
  }

  async function befriend(ctx, action, btn) {
    btn.disabled = true;
    try {
      const r = await api(`/api/friends/${action}`, jsonPost({ id: ctx.data.person.id }));
      toast(r.state === 'friend' ? T('You and {0} are friends now', ctx.data.person.name) : T('Friend request sent to {0}', ctx.data.person.name));
      friendsChanged();
      await load(ctx); // a friend may now see more
    } catch (err) { toast(err.message); btn.disabled = false; }
  }

  function statsRow(s) {
    const tiles = [[s.films, s.films === 1 ? T('Film') : T('Films')], [s.filmsThisYear, T('This year')], [s.episodes, s.episodes === 1 ? T('Episode') : T('Episodes')], [s.hours, s.hours === 1 ? T('Hour') : T('Hours')]];
    return h('dl', { class: 'pf-stats' }, tiles.map(([n, label]) => h('div', { class: 'pf-stat' }, h('dt', {}, label), h('dd', {}, Number(n || 0).toLocaleString(locale())))));
  }

  function lockedNote(ctx, d) {
    const name = d.person.name;
    const text = d.friend === 'unavailable' ? T('Profiles aren’t available here.')
      : d.visibility === 'friends' ? T('{0} shares this profile with friends only.', name) : T('{0} keeps this profile private.', name);
    return h('section', { class: 'pf-lockcard' }, h('span', { class: 'pf-lock-icon', 'aria-hidden': 'true' }, icon('lock')), h('p', {}, text));
  }

  const on = (d, id) => (d.sections || []).some((s) => s.id === id && s.on);

  function sections(ctx, d) {
    const out = [];
    for (const s of d.sections || []) {
      if (!s.on || s.id === 'stats') continue;
      const node = SECTION[s.id]?.(ctx, d);
      if (node) out.push(node);
    }
    if (!out.length && !d.me) out.push(h('p', { class: 'pf-empty pf-quiet' }, T('Nothing here yet.')));
    return out;
  }

  const sectionBox = (id, title, extra, ...kids) => h('section', { class: `pf-sec pf-sec-${id}`, 'aria-label': title },
    h('div', { class: 'pf-sec-head' }, h('h3', { class: 'pf-kicker' }, title), extra), ...kids);

  function stars(n, cls = 'pf-stars') {
    if (!n) return null;
    return h('span', { class: cls, role: 'img', 'aria-label': n === 1 ? T('1 star') : T('{0} stars', n) }, '★'.repeat(n));
  }

  function posterButton(ctx, card, fallback, { size = 'w342', label } = {}) {
    const title = card?.title || fallback?.title || '';
    const btn = h('button', { type: 'button', class: 'pf-poster', 'aria-label': label || title, title },
      card?.poster ? h('img', { src: small(card.poster, size), alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'pf-poster-title' }, title));
    if (card?.id != null) btn.addEventListener('click', () => openTitle(card, btn, ctx.nested));
    else btn.disabled = true;
    return btn;
  }

  const SECTION = {
    favorites(ctx, d) {
      const favs = d.favorites || [];
      if (!favs.length && !d.me) return null;
      const slots = [];
      for (let i = 0; i < 4; i++) {
        const f = favs[i];
        if (f) slots.push(h('li', {}, posterButton(ctx, f, f)));
        else if (d.me) slots.push(h('li', {}, h('button', { type: 'button', class: 'pf-poster pf-slot', 'aria-label': T('Pick a favourite'), onclick: (e) => openEditor(ctx, e.currentTarget, 'favorites') }, icon('plus'))));
      }
      return sectionBox('favorites', T('Favourites'), null, h('ul', { class: 'pf-grid4' }, slots));
    },
    recent(ctx, d) {
      const list = d.recent || [];
      if (!list.length) return d.me ? sectionBox('recent', T('Recent activity'), null, h('p', { class: 'pf-empty' }, T('Films and episodes you watch show up here.'))) : null;
      const items = list.slice(0, 4).map((e) => h('li', {},
        posterButton(ctx, e.card, e, { label: `${e.card?.title || e.title}${e.type === 'tv' ? ` · ${episodesText(e.episodes)}` : ''}` }),
        h('div', { class: 'pf-under' }, stars(e.stars), e.liked && h('span', { class: 'pf-heart', role: 'img', 'aria-label': T('Liked') }, '♥'),
          e.rewatch && h('span', { class: 'pf-rewatch', role: 'img', 'aria-label': T('Rewatched'), title: T('Rewatched') }, icon('rewatch')),
              e.letterboxd && h('span', { class: 'pf-lb-mark', title: T('Logged on Letterboxd') }, 'LB'),
          e.type === 'tv' && e.episodes?.length ? h('span', { class: 'pf-eps' }, episodesShort(e.episodes)) : null)));
      const box = sectionBox('recent', T('Recent activity'), null, h('ul', { class: 'pf-grid4' }, items));
      box.append(ctx.diary ? diaryList(ctx) : h('button', { type: 'button', class: 'pf-more', onclick: () => openDiary(ctx) }, h('span', {}, T('More activity')), icon('chevron')));
      return box;
    },
    ratings(ctx, d) {
      const r = d.ratings;
      const likes = d.stats?.likes ?? null;
      if (!r || (!r.total && !d.me)) return null;
      const max = Math.max(1, ...r.counts);
      const bars = h('div', { class: 'pf-hist', role: 'img', 'aria-label': r.counts.map((n, i) => `${i + 1}★ ${n}`).join(', ') },
        r.counts.map((n) => h('span', { class: 'pf-bar-col', style: `--h:${Math.max(n ? 6 : 2, Math.round((n / max) * 100))}%` })));
      return sectionBox('ratings', T('Ratings'), h('span', { class: 'pf-sec-note' }, r.total === 1 ? T('1 rating') : T('{0} ratings', r.total)),
        r.total ? h('div', { class: 'pf-hist-row' },
          h('span', { class: 'pf-hist-end', 'aria-hidden': 'true' }, '★'), bars, h('span', { class: 'pf-hist-end', 'aria-hidden': 'true' }, '★★★★★'),
          h('div', { class: 'pf-avg' }, h('strong', {}, Number(r.average).toLocaleString(locale(), { maximumFractionDigits: 1 })), h('span', {}, '★'), likes != null && h('small', {}, `♥ ${likes}`)))
          : h('p', { class: 'pf-empty' }, T('Stars you give films and shows show up here.')));
    },
    reviews(ctx, d) {
      const list = ctx.allReviews?.reviews || d.reviews?.reviews || [];
      if (!list.length) return d.me ? sectionBox('reviews', T('Reviews'), null, h('p', { class: 'pf-empty' }, T('Reviews you write show up here.'))) : null;
      const more = ctx.allReviews ? ctx.allReviews.more : d.reviews?.more;
      return sectionBox('reviews', T('Reviews'), null,
        h('ul', { class: 'pf-reviews' }, list.map((r) => reviewCard(ctx, r))),
        more && h('button', { type: 'button', class: 'pf-more', onclick: (e) => loadReviews(ctx, e.currentTarget) }, h('span', {}, T('More reviews')), icon('chevron')));
    },
    liked(ctx, d) {
      const list = d.liked || [];
      if (!list.length) return null;
      return sectionBox('liked', T('Liked'), h('span', { class: 'pf-sec-note' }, d.stats?.likes > list.length ? T('{0} in all', d.stats.likes) : null),
        h('ul', { class: 'pf-strip' }, list.map((l) => h('li', {}, posterButton(ctx, l.card, l, { size: 'w185' })))));
    },
    friends(ctx, d) {
      const list = d.friends || [];
      if (!list.length) return null;
      return sectionBox('friends', T('Friends'), h('span', { class: 'pf-sec-note' }, String(list.length)),
        h('ul', { class: 'pf-people' }, list.map((p) => h('li', {}, h('button', { type: 'button', class: 'pf-person', onclick: (e) => open(p, e.currentTarget) },
          people.face(p, { size: 52 }), h('span', {}, p.name))))));
    },
  };

  function reviewCard(ctx, r) {
    const text = h('p', { class: 'pf-review-text' }, r.text);
    const hide = r.spoiler && !ctx.data.me;
    if (hide) text.hidden = true;
    return h('li', { class: 'pf-review' },
      h('div', { class: 'pf-review-poster' }, posterButton(ctx, r.card, r, { size: 'w185' })),
      h('div', { class: 'pf-review-body' },
        h('div', { class: 'pf-review-title' }, h('strong', {}, r.card?.title || r.title || ''), r.card?.year && h('span', { class: 'muted' }, ` ${r.card.year}`)),
        h('div', { class: 'pf-review-meta' }, stars(r.stars), h('time', { datetime: new Date(r.created).toISOString() }, new Date(r.created).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }))),
        hide && h('button', { type: 'button', class: 'review-spoiler', onclick: (e) => { e.currentTarget.remove(); text.hidden = false; } }, h('strong', {}, T('Contains spoilers')), h('span', {}, T('Tap to show'))),
        text));
  }

  async function loadReviews(ctx, btn) {
    btn.disabled = true;
    try {
      const have = ctx.allReviews?.reviews || [];
      const r = await api(`/api/profiles/${ctx.data.person.id}/reviews?offset=${ctx.allReviews ? have.length : 0}`);
      ctx.allReviews = { reviews: [...have, ...r.reviews], more: r.more };
      paint(ctx);
    } catch (err) { toast(err.message); btn.disabled = false; }
  }

  // ---------- the diary ("More activity") ----------
  async function openDiary(ctx, more = false) {
    try {
      const offset = more ? ctx.diary.entries.length : 0;
      const r = await api(`/api/profiles/${ctx.data.person.id}/diary?offset=${offset}`);
      ctx.diary = { entries: [...(more ? ctx.diary.entries : []), ...r.entries], more: r.more, total: r.total };
      paint(ctx);
      if (!more) requestAnimationFrame(() => ctx.page.querySelector('.pf-diary')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) { toast(err.message); }
  }

  function diaryList(ctx) {
    const months = new Map();
    for (const e of ctx.diary.entries) {
      const m = e.day.slice(0, 7);
      if (!months.has(m)) months.set(m, []);
      months.get(m).push(e);
    }
    const out = h('div', { class: 'pf-diary' }, h('h4', { class: 'pf-kicker pf-diary-title' }, T('Diary')));
    for (const [month, list] of months) {
      out.append(h('h5', { class: 'pf-month' }, new Date(`${month}-15T12:00:00`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })),
        h('ol', { class: 'pf-diary-list' }, list.map((e) => {
          const card = e.card;
          const row = h('button', { type: 'button', class: 'pf-entry', disabled: card?.id == null, onclick: () => card && openTitle(card, row, ctx.nested) },
            h('span', { class: 'pf-entry-day' }, String(Number(e.day.slice(8, 10)))),
            card?.poster ? h('img', { class: 'pf-entry-poster', src: small(card.poster, 'w92'), alt: '', loading: 'lazy' }) : h('span', { class: 'pf-entry-poster' }),
            h('span', { class: 'pf-entry-text' },
              h('strong', {}, card?.title || e.title, card?.year && e.type === 'movie' ? h('span', { class: 'muted' }, ` ${card.year}`) : null),
              e.type === 'tv' && e.episodes?.length ? h('small', {}, episodesText(e.episodes)) : null),
            h('span', { class: 'pf-entry-marks' }, stars(e.stars), e.liked && h('span', { class: 'pf-heart', role: 'img', 'aria-label': T('Liked') }, '♥'),
              e.rewatch && h('span', { class: 'pf-rewatch', role: 'img', 'aria-label': T('Rewatched'), title: T('Rewatched') }, icon('rewatch')),
              e.letterboxd && h('span', { class: 'pf-lb-mark', title: T('Logged on Letterboxd') }, 'LB')));
          return h('li', {}, row);
        })));
    }
    if (ctx.diary.more) out.append(h('button', { type: 'button', class: 'pf-more', onclick: (e) => { e.currentTarget.disabled = true; openDiary(ctx, true); } }, h('span', {}, T('Older')), icon('chevron')));
    return out;
  }

  function episodesText(eps = []) {
    if (!eps.length) return '';
    if (eps.length === 1) return T('S{0} E{1}', eps[0][0], eps[0][1]);
    const seasons = new Set(eps.map(([s]) => s));
    if (seasons.size === 1) {
      const nums = eps.map(([, e]) => e);
      const contiguous = nums.every((n, i) => !i || n === nums[i - 1] + 1);
      if (contiguous) return T('S{0} E{1}–{2}', eps[0][0], nums[0], nums[nums.length - 1]);
    }
    return T('{0} episodes', eps.length);
  }
  const episodesShort = (eps) => (eps.length === 1 ? T('S{0} E{1}', eps[0][0], eps[0][1]) : T('{0} eps', eps.length));

  // ---------- the editor ----------
  // Everything is a draft until Save; the page underneath shows it as you go.
  function openEditor(ctx, opener, focus = null) {
    const d = ctx.data;
    if (!d?.me) return;
    ctx.draft = {
      name: d.person.name || '', handle: d.person.handle, pronouns: d.person.pronouns || '', bio: d.person.bio || '', visibility: d.visibility,
      favorites: (d.favorites || []).map((f) => ({ ...f })), look: { ...d.look }, bannerCard: null, sections: d.sections.map((s) => ({ ...s })),
    };
    let saved = false;
    const draft = ctx.draft;
    const repaint = () => paint(ctx);
    const body = h('div', { class: 'sheet-content pf-editor' });
    const draw = () => body.replaceChildren(...editorNodes(ctx, draft, { repaint, redraw: draw, save }));
    async function save(btn) {
      btn.disabled = true;
      try {
        const name = draft.name.trim();
        if (saveName && name && name !== ctx.data.person.name) await saveName(name);
        const payload = { handle: draft.handle, pronouns: draft.pronouns, bio: draft.bio, visibility: draft.visibility,
          favorites: draft.favorites.map(keyOf), sections: draft.sections,
          look: { accent: draft.look.accent, banner: draft.look.banner, gradient: draft.look.gradient, bannerKey: draft.look.bannerKey, font: draft.look.font,
            posters: draft.look.posters, background: draft.look.background, align: draft.look.align } };
        ctx.data = await api('/api/profiles/me', jsonPost(payload));
        own.data = ctx.data; own.at = Date.now();
        mineChanged();
        saved = true;
        ctx.draft = null;
        ctx.diary = null; ctx.allReviews = null;
        paint(ctx);
        ctx.page.dataset.handle = ctx.data.person.handle;
        history.replaceState(history.state, '', `${location.pathname}${location.search}#@${ctx.data.person.handle}`);
        toast(T('Profile saved'));
        picker.close();
      } catch (err) { toast(err.message); btn.disabled = false; }
    }
    draw();
    picker.open([body], opener, () => { if (!saved) { ctx.draft = null; paint(ctx); } }, ctx.nested);
    if (focus) requestAnimationFrame(() => body.querySelector(`[data-part="${focus}"]`)?.scrollIntoView({ block: 'start' }));
  }

  // Letterboxd (letterboxd.js). Linking happens right away, not on Save: it reads their feed, and a typo should say so
  // here. The export (a zip from Letterboxd's settings) brings the whole history and the top four; it's looked up film
  // by film in the background, so the editor polls how far it got.
  function letterboxdEditor(ctx, { repaint, redraw }) {
    const lb = ctx.data.letterboxd || { linked: false };
    const done = (data) => { ctx.data = { ...ctx.data, ...data }; own.data = ctx.data; own.at = Date.now(); ctx.diary = null; ctx.allReviews = null; mineChanged(); repaint(); redraw(); };
    const run = async (btn, url, body, ok) => {
      btn.disabled = true;
      try { done(await api(url, jsonPost(body))); if (ok) toast(ok); } catch (err) { toast(err.message); btn.disabled = false; }
    };
    const progress = h('p', { class: 'set-hint pf-lb-progress', role: 'status' });
    const file = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
    const upload = h('button', { type: 'button', class: 'chip', onclick: () => file.click() }, icon('plus'), T('Import Letterboxd export'));
    const follow = async () => {
      upload.disabled = true;
      for (;;) {
        let job;
        try { job = await api('/api/profiles/me/letterboxd/import'); } catch { job = null; }
        if (!progress.isConnected && job?.state === 'running') { await new Promise((r) => setTimeout(r, 2000)); continue; }
        if (job?.state === 'running') {
          progress.textContent = job.total ? T('Finding your films… {0} of {1}', job.done, job.total) : T('Reading your export…');
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        upload.disabled = false;
        if (job?.state === 'done') {
          progress.textContent = '';
          const r = job.result;
          toast(r.missed ? T('Imported {0} films ({1} couldn’t be found)', r.films, r.missed) : T('Imported {0} films', r.films));
          try { done(await api('/api/profiles/me')); } catch { /* the page catches up on its next load */ }
        } else if (job?.state === 'failed') { progress.textContent = ''; toast(job.error); }
        return;
      }
    };
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      upload.disabled = true;
      progress.textContent = T('Uploading…');
      try {
        await api('/api/profiles/me/letterboxd/import', { method: 'POST', body: f, headers: { 'Content-Type': 'application/zip' } });
        follow();
      } catch (err) { toast(err.message); upload.disabled = false; progress.textContent = ''; }
    });
    // An import that's still running (the sheet was closed and opened again) keeps showing.
    api('/api/profiles/me/letterboxd/import').then((j) => { if (j?.state === 'running') follow(); }).catch(() => {});
    const exportPart = h('div', { class: 'pf-lb' },
      h('p', { class: 'set-hint' }, lb.importedAt
        ? T('Export imported {0}. Import a newer one any time.', new Date(lb.importedAt).toLocaleDateString(locale(), { dateStyle: 'medium' }))
        : T('For your whole history and your top four: on letterboxd.com go to Settings → Data → Export your data, then pick the zip here.')),
      h('div', { class: 'pf-lb-row' }, upload, file), progress);
    if (!lb.linked) {
      const input = h('input', { type: 'text', class: 'invite-note', maxlength: '80', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
        placeholder: T('Your Letterboxd username'), 'aria-label': T('Letterboxd username') });
      const go = h('button', { type: 'button', class: 'chip', onclick: (e) => input.value.trim() && run(e.currentTarget, '/api/profiles/me/letterboxd', { username: input.value }, T('Letterboxd linked')) }, T('Link'));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
      return h('div', { class: 'pf-lb' },
        h('p', { class: 'set-hint' }, T('Link your Letterboxd account and what you log there shows up here: films in your diary, your stars and your reviews. Lilin checks for new ones every few hours. Anything you rated or reviewed in Lilin yourself is never overwritten.')),
        h('div', { class: 'pf-lb-row' }, input, go),
        exportPart);
    }
    const when = lb.syncedAt ? new Date(lb.syncedAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : null;
    return h('div', { class: 'pf-lb' },
      h('p', { class: 'pf-lb-who' }, T('Linked to'), ' ', h('a', { href: lb.url, target: '_blank', rel: 'noopener noreferrer' }, lb.username)),
      h('p', { class: 'set-hint' }, lb.error ? T('Last check failed: {0}', lb.error) : when ? T('{0} films · last checked {1}', lb.films, when) : T('{0} films', lb.films)),
      h('div', { class: 'pf-lb-row' },
        h('button', { type: 'button', class: 'chip', onclick: (e) => run(e.currentTarget, '/api/profiles/me/letterboxd/sync', {}, T('Checked Letterboxd')) }, icon('rewatch'), T('Check now')),
        h('button', { type: 'button', class: 'chip', onclick: (e) => run(e.currentTarget, '/api/profiles/me/letterboxd', { username: '' }, T('Letterboxd unlinked')) }, T('Unlink'))),
      exportPart,
      h('p', { class: 'set-hint' }, T('Unlinking takes the Letterboxd films out of your diary, and the stars and reviews it brought over that you haven’t changed.')));
  }

  function editorNodes(ctx, draft, { repaint, redraw, save }) {
    const look = draft.look;
    const setLook = (patch) => { Object.assign(look, patch); repaint(); redraw(); };
    const field = (label, input, hint) => h('label', { class: 'pf-field' }, h('span', { class: 'pf-field-label' }, label), input, hint);

    // you
    const name = h('input', { type: 'text', class: 'invite-note', value: draft.name, maxlength: '40', autocomplete: 'nickname', 'aria-label': T('Your name') });
    name.addEventListener('input', () => { draft.name = name.value; repaint(); });
    const avatar = ctx.data.person.avatar;
    const handle = h('input', { type: 'text', class: 'invite-note', value: draft.handle, maxlength: '21', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', 'aria-label': T('Username') });
    handle.addEventListener('input', () => { draft.handle = handle.value.trim().replace(/^@+/, '').toLowerCase(); repaint(); });
    const pronouns = h('input', { type: 'text', class: 'invite-note', value: draft.pronouns, maxlength: '24', placeholder: T('e.g. she/her'), 'aria-label': T('Pronouns') });
    pronouns.addEventListener('input', () => { draft.pronouns = pronouns.value; repaint(); });
    const count = h('span', { class: 'pf-count' });
    const bio = h('textarea', { class: 'invite-note pf-bio-input', rows: '4', maxlength: String(MAX_BIO), placeholder: T('A line or two about you and what you watch'), 'aria-label': T('Bio') }, draft.bio);
    const counted = () => { count.textContent = `${bio.value.length}/${MAX_BIO}`; };
    bio.addEventListener('input', () => { draft.bio = bio.value; counted(); repaint(); });
    counted();

    const part = (id, title, ...kids) => h('section', { class: 'pf-part', 'data-part': id }, h('h3', {}, title), ...kids);
    return [
      h('h2', { id: 'picker-title' }, T('Edit profile')),
      h('p', { class: 'picker-sub muted' }, T('Changes show on your profile behind this sheet. Save to keep them.')),
      part('you', T('You'),
        field(T('Name'), name, h('span', { class: 'set-hint' }, T('Shown everywhere in Lilin.'))),
        h('p', { class: 'set-hint pf-pic-hint' }, T('Tap your picture on your profile to change it.'),
          avatar && removePicture && h('button', { type: 'button', class: 'pf-pic-remove',
            onclick: async (e) => { e.currentTarget.disabled = true; await removePicture(); ctx.data.person.avatar = null; repaint(); redraw(); } }, T('Remove picture'))),
        field(T('Username'), h('span', { class: 'pf-at-field' }, h('span', { 'aria-hidden': 'true' }, '@'), handle), h('span', { class: 'set-hint' }, T('3 to 20 letters, numbers, dots or underscores.'))),
        field(T('Pronouns'), pronouns),
        field(T('Bio'), bio, count)),
      part('favorites', T('Favourites'), favoritesEditor(draft, { repaint, redraw })),
      part('letterboxd', T('Letterboxd'), letterboxdEditor(ctx, { repaint, redraw })),
      part('look', T('Look'),
        h('p', { class: 'pf-field-label' }, T('Accent')),
        h('div', { class: 'pf-swatches' },
          h('button', { type: 'button', class: 'pf-swatch pf-swatch-auto', 'aria-pressed': String(!look.accent), 'aria-label': T('From your picture colour'), title: T('Automatic'), style: `--c:${tintOf(me()?.name)}`, onclick: () => setLook({ accent: null }) }, 'A'),
          ...ACCENTS.map((c) => h('button', { type: 'button', class: 'pf-swatch', 'aria-pressed': String(look.accent?.toLowerCase() === c.toLowerCase()), 'aria-label': c, style: `--c:${c}`, onclick: () => setLook({ accent: c.toLowerCase() }) })),
          (() => {
            const custom = h('input', { type: 'color', class: 'pf-color', value: look.accent || tintOf(me()?.name).toLowerCase(), 'aria-label': T('Pick any colour') });
            custom.addEventListener('input', () => { look.accent = custom.value.toLowerCase(); repaint(); });
            custom.addEventListener('change', () => redraw());
            return h('label', { class: `pf-swatch pf-swatch-custom${look.accent && !ACCENTS.some((c) => c.toLowerCase() === look.accent) ? ' on' : ''}`, title: T('Pick any colour') }, custom, icon('plus'));
          })()),
        h('p', { class: 'pf-field-label' }, T('Banner')),
        segmented([['auto', T('Auto')], ['title', T('A title')], ['gradient', T('Colour')], ['none', T('None')]], look.banner, (v) => setLook({ banner: v })),
        look.banner === 'auto' && h('p', { class: 'set-hint' }, T('A picture from your first favourite, or from what you watched last.')),
        look.banner === 'gradient' && h('div', { class: 'pf-swatches pf-grads' }, GRADIENTS.map((g) => h('button', { type: 'button', class: `pf-gradbtn pf-grad pf-grad-${g}`, 'aria-pressed': String(look.gradient === g), 'aria-label': g, onclick: () => setLook({ gradient: g }) }))),
        look.banner === 'title' && bannerPicker(draft, { repaint, redraw }),
        h('p', { class: 'pf-field-label' }, T('Background')),
        segmented([['glow', T('Glow')], ['image', T('Picture')], ['plain', T('Plain')]], look.background, (v) => setLook({ background: v })),
        h('p', { class: 'pf-field-label' }, T('Name')),
        h('div', { class: 'pf-choices' }, FONTS.map(([k, label]) => h('button', { type: 'button', class: `pf-choice pf-font-${k}`, 'aria-pressed': String(look.font === k), onclick: () => setLook({ font: k }) },
          h('span', { class: 'pf-choice-sample pf-name-sample' }, 'Aa'), h('span', {}, label)))),
        h('p', { class: 'pf-field-label' }, T('Posters')),
        h('div', { class: 'pf-choices' }, POSTERS.map(([k, label]) => h('button', { type: 'button', class: `pf-choice pf-posters-${k}`, 'aria-pressed': String(look.posters === k), onclick: () => setLook({ posters: k }) },
          h('span', { class: 'pf-choice-sample' }, h('span', { class: 'pf-poster pf-mini' })), h('span', {}, label)))),
        h('p', { class: 'pf-field-label' }, T('Layout')),
        segmented([['center', T('Centred')], ['left', T('Left')]], look.align, (v) => setLook({ align: v }))),
      part('sections', T('Sections'),
        h('p', { class: 'set-hint' }, T('Choose what shows and in which order. Empty sections stay hidden from others.')),
        h('ol', { class: 'pf-order' }, draft.sections.map((s, i) => h('li', { class: s.on ? '' : 'off' },
          h('button', { type: 'button', role: 'switch', class: 'pf-switch', 'aria-checked': String(s.on), 'aria-label': SECTION_NAMES[s.id], onclick: () => { s.on = !s.on; repaint(); redraw(); } }, h('span', {})),
          h('span', { class: 'pf-order-name' }, SECTION_NAMES[s.id]),
          h('button', { type: 'button', class: 'pf-move', 'aria-label': T('Move {0} up', SECTION_NAMES[s.id]), disabled: i === 0, onclick: () => { move(draft.sections, i, -1); repaint(); redraw(); } }, icon('up')),
          h('button', { type: 'button', class: 'pf-move', 'aria-label': T('Move {0} down', SECTION_NAMES[s.id]), disabled: i === draft.sections.length - 1, onclick: () => { move(draft.sections, i, 1); repaint(); redraw(); } }, icon('down')))))),
      part('privacy', T('Who can see it'),
        segmented(VISIBILITY, draft.visibility, (v) => { draft.visibility = v; repaint(); redraw(); }),
        h('p', { class: 'set-hint' }, VISIBILITY_HINTS[draft.visibility])),
      h('div', { class: 'pf-save-bar' }, h('button', { type: 'button', class: 'play-btn', onclick: (e) => save(e.currentTarget) }, T('Save'))),
    ];
  }

  const move = (list, i, by) => { const [x] = list.splice(i, 1); list.splice(i + by, 0, x); };
  function segmented(options, value, onPick) {
    return h('div', { class: 'segmented pf-seg', role: 'group' },
      options.map(([key, text]) => h('button', { type: 'button', 'aria-pressed': String(key === value), onclick: () => onPick(key) }, text)));
  }

  function favoritesEditor(draft, { repaint, redraw }) {
    let target = null; // the slot being filled
    const search = titleSearch({
      placeholder: T('Search films and shows'),
      onPick: (card) => {
        const key = keyOf(card);
        const at = draft.favorites.findIndex((f) => keyOf(f) === key);
        if (at >= 0 && at !== target) draft.favorites.splice(at, 1);
        const slot = target == null ? draft.favorites.length : target;
        if (slot < draft.favorites.length) draft.favorites[slot] = { ...card, key };
        else if (draft.favorites.length < 4) draft.favorites.push({ ...card, key });
        else { toast(T('Four favourites at most: remove one first.')); return; }
        target = null;
        repaint(); redraw();
      },
    });
    const slots = h('ol', { class: 'pf-fav-edit' }, Array.from({ length: 4 }, (_, i) => {
      const f = draft.favorites[i];
      const pick = h('button', { type: 'button', class: `pf-poster${f ? '' : ' pf-slot'}`, 'aria-label': f ? T('Replace {0}', f.title) : T('Pick a favourite'),
        onclick: () => { target = f ? i : null; search.focus(); } },
        f?.poster ? h('img', { src: small(f.poster), alt: '' }) : f ? h('span', { class: 'pf-poster-title' }, f.title) : icon('plus'));
      return h('li', {}, pick,
        f && h('button', { type: 'button', class: 'pf-x', 'aria-label': T('Remove {0}', f.title), onclick: () => { draft.favorites.splice(i, 1); repaint(); redraw(); } }, icon('close')),
        f && i > 0 && h('button', { type: 'button', class: 'pf-x pf-left', 'aria-label': T('Move {0} left', f.title), onclick: () => { move(draft.favorites, i, -1); repaint(); redraw(); } }, icon('back')));
    }));
    return h('div', {}, h('p', { class: 'set-hint' }, T('Four films or shows that say something about you. Tap a poster to swap it.')), slots, search.node);
  }

  function bannerPicker(draft, { repaint, redraw }) {
    const chosen = draft.bannerCard || (draft.look.bannerKey ? { title: T('Your picked title') } : null);
    const search = titleSearch({
      placeholder: T('Find the film or show to use'),
      onPick: (card) => {
        if (!card.backdrop) { toast(T('That title has no picture to use. Pick another one.')); return; }
        draft.bannerCard = card;
        draft.look.bannerKey = keyOf(card);
        repaint(); redraw();
      },
      wide: true,
    });
    return h('div', { class: 'pf-banner-pick' }, chosen && h('p', { class: 'set-hint' }, T('Banner: {0}', chosen.title)), search.node);
  }

  // A search box for films and shows; results as small posters (or wide pictures for the banner).
  function titleSearch({ placeholder, onPick, wide = false }) {
    const input = h('input', { type: 'search', class: 'invite-note', placeholder, 'aria-label': placeholder, autocomplete: 'off', enterkeyhint: 'search' });
    const results = h('ul', { class: `pf-results${wide ? ' wide' : ''}`, 'aria-live': 'polite' });
    let timer = null, n = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { results.replaceChildren(); return; }
      timer = setTimeout(async () => {
        const mine = ++n;
        try {
          const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
          if (mine !== n) return;
          const list = (r.results || []).filter((c) => (c.type === 'movie' || c.type === 'tv') && (wide ? c.backdrop : true)).slice(0, wide ? 6 : 12);
          results.replaceChildren(...(list.length ? list.map((c) => h('li', {}, h('button', { type: 'button', class: 'pf-result', title: c.title, onclick: () => onPick(c) },
            (wide ? c.backdrop : c.poster) ? h('img', { src: small(wide ? c.backdrop : c.poster, wide ? 'w300' : 'w185'), alt: '', loading: 'lazy' }) : h('span', { class: 'pf-poster-title' }, c.title),
            h('span', { class: 'pf-result-name' }, c.title, c.year ? ` (${c.year})` : '')))) : [h('li', { class: 'set-hint' }, T('Nothing found.'))]));
        } catch (err) { if (mine === n) results.replaceChildren(h('li', { class: 'set-hint' }, err.message)); }
      }, 260);
    });
    return { node: h('div', { class: 'pf-search' }, input, results), focus: () => { input.focus(); input.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
  }

  // The data the page would show with the draft saved (the server's banner is redone for "automatic").
  function previewOf(data, draft) {
    const look = { ...draft.look };
    let banner = data.banner;
    if (look.banner === 'title') banner = draft.bannerCard?.backdrop ? big(draft.bannerCard.backdrop) : data.look.banner === 'title' && data.look.bannerKey === look.bannerKey ? data.banner : null;
    else if (look.banner === 'auto') {
      const auto = draft.favorites.find((f) => f.backdrop)?.backdrop || data.recent?.find((r) => r.card?.backdrop)?.card.backdrop || data.liked?.find((r) => r.card?.backdrop)?.card.backdrop;
      banner = auto ? big(auto) : null;
    }
    return { ...data, person: { ...data.person, name: draft.name.trim() || data.person.name, handle: draft.handle || data.person.handle, pronouns: draft.pronouns.trim(), bio: draft.bio.trim() },
      visibility: draft.visibility, look, sections: draft.sections, favorites: draft.favorites, banner };
  }

  // ---------- You: your own numbers and lists, privately ----------
  // /api/profiles/me is always your own full view ('self', the home network's shared account too), whatever the
  // public page shows. mine() keeps it a minute for You's list (its meta lines), Overview and pages.
  const own = { data: null, at: 0, loading: null, lists: {} };
  function mine({ fresh = false } = {}) {
    if (!fresh && own.data && Date.now() - own.at < 60000) return Promise.resolve(own.data);
    own.loading ??= api('/api/profiles/me').then((d) => { own.data = d; own.at = Date.now(); own.lists = {}; return d; }).finally(() => { own.loading = null; });
    return own.loading;
  }
  const mineNow = () => own.data;
  const forgetMine = () => { own.at = 0; };
  const numbers = (d = own.data) => (d?.stats ? statsRow(d.stats) : null);

  // The latest few things you watched, as diary lines (You's Overview). more: opens History.
  function recentLines(d = own.data, limit = 5) {
    const list = (d?.recent || []).slice(0, limit);
    if (!list.length) return null;
    return diaryList({ nested: false, data: d, diary: { entries: list, more: false } });
  }

  // You → History / Ratings and reviews / Liked: the full lists, drawn into the open You page. redraw(): app.js
  // draws the page again (after Older, More reviews or loading).
  function privateList(kind, redraw) {
    const d = own.data;
    if (!d) {
      mine().then(redraw, (err) => toast(err.message));
      return [h('p', { class: 'muted' }, T('Loading…'))];
    }
    const ctx = own.lists[kind] ||= { nested: false, data: d, diary: null, allReviews: null, likedAll: null, page: h('div') };
    ctx.repaint = redraw;
    const wrap = (...kids) => h('div', { class: 'you-own' }, ...kids);
    if (kind === 'history') {
      if (!ctx.diary) { openDiary(ctx); return [wrap(h('p', { class: 'muted' }, T('Loading…')))]; }
      if (!ctx.diary.entries.length) return [wrap(h('p', { class: 'pf-empty' }, T('Films and episodes you watch show up here.')))];
      return [wrap(diaryList(ctx))];
    }
    if (kind === 'ratings') {
      return [wrap(SECTION.ratings(ctx, d)), wrap(SECTION.reviews(ctx, d))];
    }
    if (kind === 'liked') {
      if (!ctx.likedAll) { loadLiked(ctx); return [wrap(h('p', { class: 'muted' }, T('Loading…')))]; }
      const list = ctx.likedAll.liked;
      if (!list.length) return [wrap(h('p', { class: 'pf-empty' }, T('Titles you give a thumbs up show up here.')))];
      return [wrap(h('ul', { class: 'pf-grid4' }, list.map((l) => h('li', {}, posterButton(ctx, l.card, l, { size: 'w185' })))),
        ctx.likedAll.more && h('button', { type: 'button', class: 'pf-more', onclick: (e) => loadLiked(ctx, e.currentTarget) }, h('span', {}, T('More')), icon('chevron')))];
    }
    return [];
  }
  // 24 at a time; titles TMDB can't name keep their own title (no poster).
  async function loadLiked(ctx, btn = null) {
    if (btn) btn.disabled = true;
    try {
      const have = ctx.likedAll?.liked || [];
      const r = await api(`/api/profiles/${ctx.data.person.id}/liked?offset=${have.length}`);
      ctx.likedAll = { liked: [...have, ...r.liked], more: r.more };
      paint(ctx);
    } catch (err) { toast(err.message); if (btn) btn.disabled = false; else ctx.likedAll = { liked: [], more: false }; }
  }

  return { open, openMine, fromHash, mine, mineNow, forgetMine, numbers, recentLines, privateList };
}
