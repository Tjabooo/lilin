// Reviews in the web app: the "Review" button beside the thumbs, the Rate sheet (thumbs + optional
// stars + optional review), the quiet Reviews section on a title page and the full list behind
// "See all". The server (src/reviews.js) keeps stars and thumbs in agreement: 5 stars = thumbs up,
// ½-2 = thumbs down, 2½-4½ = no thumb. Stars go in halves: tap the left half of a star for a half. Review text is always put on the page as text, never as HTML.
// app.js passes in its helpers; restricted people get neither the button nor the section.
import { T, locale } from './i18n.js';

export const MAX_TEXT = 2000;
export const thumbFor = (stars) => (stars >= 5 ? 1 : stars <= 2 ? -1 : 0);
// "3.5" in English, "3,5" in Swedish; whole stars without a decimal.
export const starsNumber = (n) => Number(n).toLocaleString(locale, { maximumFractionDigits: 1 });
export const starsLabel = (n) => (n === 1 ? T('1 star') : T('{0} stars', starsNumber(n)));
// "4.5" in English, "4,5" in Swedish.
export const averageText = (n) => Number(n).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function reviewDate(ms, now = Date.now()) {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

// "4,2 · 5 ratings · 3 reviews": the summary line. Average only once two or more people gave stars.
export function summaryText({ average, ratings = 0, count = 0 }) {
  const parts = [];
  if (average != null) parts.push(ratings === 1 ? T('1 rating') : T('{0} ratings', ratings));
  if (count) parts.push(count === 1 ? T('1 review') : T('{0} reviews', count));
  return parts.join(' · ');
}

export function createReviews({ h, api, jsonPost, toast, people, me = () => null, sheet, openProfile = null }) {
  const face = (p, opts) => people?.face(p, opts) || null;
  const blocked = () => Boolean(me()?.restricted);
  const cache = new Map();      // key -> last answer from /api/reviews
  const loading = new Map();    // key -> promise, so the button and the section share one request
  const views = new Set();      // open buttons and sections: { key, el, paint }
  let open = null;              // the sheet on screen: { key, draw }

  function load(key, { all = false } = {}) {
    const id = `${key}|${all ? 1 : 0}`;
    if (!loading.has(id)) {
      loading.set(id, api(`/api/reviews?key=${encodeURIComponent(key)}${all ? '&all=1' : ''}`)
        .then((data) => { cache.set(key, all ? { ...data, reviews: data.reviews.slice(0, 2) } : data); return data; })
        .finally(() => setTimeout(() => loading.delete(id), 1500)));
    }
    return loading.get(id);
  }
  function paintAll(key) {
    for (const v of views) {
      if (!v.el.isConnected) { views.delete(v); continue; }
      if (v.key === key) v.paint(cache.get(key));
    }
  }
  function track(key, el, paint) {
    const v = { key, el, paint };
    views.add(v);
    if (cache.has(key)) paint(cache.get(key));
    load(key).then(() => paintAll(key)).catch(() => {});
    return el;
  }

  const thumbIcon = (down) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="M7 11v9H4v-9zM7 11l4-8a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.5 20H7"/>';
    if (down) svg.style.transform = 'scaleY(-1)';
    return svg;
  };
  const forget = (key) => { loading.delete(`${key}|0`); loading.delete(`${key}|1`); };

  // Five stars as text: filled ones lit, a half star half lit, the rest dim. Read out as "3.5 stars".
  const starRow = (n, cls = 'review-stars') => h('span', { class: cls, role: 'img', 'aria-label': starsLabel(n) },
    [1, 2, 3, 4, 5].map((i) => h('i', { class: i <= n ? 'on' : i - 0.5 === n ? 'half' : null, 'aria-hidden': 'true' }, '★')));

  // ---------- the button beside the thumbs ----------
  // hooks: { thumb() -> the thumb on screen, repaint(rating) -> repaints the thumbs row }
  function rateButton(key, title, hooks = {}) {
    if (!key || blocked()) return null;
    const label = h('span', {});
    const star = h('span', { class: 'rate-review-star', 'aria-hidden': 'true' }, '★');
    const btn = h('button', { type: 'button', class: 'rate-review', 'aria-label': T('Rate and review') }, star, label);
    btn.onclick = () => openComposer(key, title, hooks, btn);
    const paint = (data) => {
      if (!data || data.restricted) { btn.hidden = true; return; }
      btn.hidden = false;
      const mine = data.mine;
      btn.classList.toggle('has-stars', Boolean(mine?.stars));
      label.textContent = mine?.stars ? starsNumber(mine.stars) : mine?.text ? T('Your review') : T('Review');
      btn.title = mine ? T('Edit your review') : T('Stars and a review, if you like');
    };
    btn.hidden = !cache.has(key);
    return track(key, btn, paint);
  }

  // ---------- the Rate sheet ----------
  function openComposer(key, title, hooks = {}, opener = null) {
    const data = cache.get(key);
    const mine = data?.mine || null;
    const fromList = open?.key === key ? open : null; // opened from See all: go back there afterwards
    open = null;
    let stars = mine?.stars || 0;
    let thumb = hooks.thumb?.() ?? data?.thumb ?? 0;
    let thumbTouched = false; // an untouched thumb is left as it is on the server
    const thumbBtn = (value, text) => h('button', { type: 'button', class: 'chip compose-thumb', 'aria-pressed': 'false', onclick: () => {
      thumb = thumb === value ? 0 : value; thumbTouched = true;
      if (stars && thumbFor(stars) !== thumb) stars = 0; // stars always agree with the thumb
      sync();
    } }, thumbIcon(value === -1), text);
    const up = thumbBtn(1, T('I like it')), down = thumbBtn(-1, T('Not for me'));
    // The left half of a star gives a half star; tapping what's already picked clears it. Arrow keys step by halves.
    const pick = (n) => { stars = stars === n ? 0 : n; if (stars) thumb = thumbFor(stars); sync(); };
    const starBtns = [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: 'compose-star', role: 'radio', 'aria-checked': 'false',
      'aria-label': starsLabel(n), onclick: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const half = e.detail > 0 && e.clientX && e.clientX < r.left + r.width / 2;
        pick(half ? n - 0.5 : n);
      } }, h('span', { 'aria-hidden': 'true' }, '★')));
    const starGroup = h('div', { class: 'compose-stars', role: 'radiogroup', 'aria-label': T('Stars') }, starBtns);
    starGroup.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.5 : 0;
      if (!step) return;
      e.preventDefault();
      stars = Math.min(5, Math.max(0, stars + step));
      if (stars) thumb = thumbFor(stars);
      sync();
      starBtns[Math.max(0, Math.ceil(stars) - 1)].focus();
    });
    const starHint = h('p', { class: 'compose-hint', 'aria-live': 'polite' });
    const text = h('textarea', { class: 'idea-text compose-text', maxlength: String(MAX_TEXT), rows: '5',
      placeholder: T('What did you think? (optional)'), 'aria-label': T('Your review') });
    text.value = mine?.text || '';
    const count = h('span', { class: 'idea-count' });
    const spoilerBox = h('input', { type: 'checkbox' });
    spoilerBox.checked = Boolean(mine?.spoiler);
    const spoiler = h('label', { class: 'compose-spoiler' }, spoilerBox, h('span', {}, T('Contains spoilers')));
    const note = h('p', { class: 'muted compose-note' });
    const status = h('p', { class: 'muted', role: 'status' });
    const save = h('button', { type: 'button', class: 'play-btn compose-save' }, T('Save'));
    const remove = mine && h('button', { type: 'button', class: 'chip compose-delete' }, T('Delete review'));
    const done = () => {
      if (fromList) { open = fromList; fromList.draw(); } else sheet.close();
    };
    const sync = () => {
      up.setAttribute('aria-pressed', String(thumb === 1));
      down.setAttribute('aria-pressed', String(thumb === -1));
      starBtns.forEach((b, i) => {
        b.setAttribute('aria-checked', String(Math.ceil(stars) === i + 1));
        b.classList.toggle('on', i + 1 <= stars);
        b.classList.toggle('half', i + 0.5 === stars);
      });
      starHint.textContent = stars ? `${starsLabel(stars)} · ${stars >= 5 ? T('counts as a thumbs up') : stars <= 2 ? T('counts as a thumbs down') : T('no thumb either way')}`
        : T('Optional. Tap the left half of a star for a half star.');
      const words = text.value.trim();
      spoiler.hidden = !words;
      count.textContent = text.value.length > MAX_TEXT - 300 ? `${text.value.length} / ${MAX_TEXT}` : '';
      note.textContent = words ? T('Everyone on Lilin can read your review, with your name and stars.')
        : stars ? T('Stars without a review only count towards the average; nobody sees they’re yours.')
          : T('A thumbs down on its own stays private.');
    };
    text.addEventListener('input', sync);
    save.onclick = async () => {
      save.disabled = true; status.textContent = '';
      try {
        const res = await api('/api/reviews', jsonPost({ key, title, stars: stars || null, text: text.value, spoiler: spoilerBox.checked,
          thumb: thumbTouched ? thumb : undefined }));
        afterChange(key, res);
        hooks.repaint?.(res.rating);
        done();
      } catch (err) { status.textContent = err.message; save.disabled = false; }
    };
    if (remove) remove.onclick = confirmTwice(remove, T('Delete review'), T('Tap again to delete'), async () => {
      try {
        afterChange(key, await api('/api/reviews/delete', jsonPost({ key })));
        done();
      } catch (err) { status.textContent = err.message; }
    });
    sync();
    sheet.open([
      h('h2', { id: 'picker-title' }, mine ? T('Your review') : T('Rate it')),
      h('p', { class: 'muted picker-sub' }, title),
      h('div', { class: 'compose-thumbs', role: 'group', 'aria-label': T('Thumbs') }, up, down),
      starGroup,
      starHint,
      text,
      h('div', { class: 'compose-row' }, spoiler, count),
      note,
      h('div', { class: 'compose-actions' }, save, remove),
      status,
    ], opener);
  }

  // A destructive button that needs a second tap within a few seconds.
  function confirmTwice(btn, label, sure, run) {
    let armed = null;
    return async () => {
      if (!armed) {
        btn.textContent = sure; btn.classList.add('armed');
        armed = setTimeout(() => { armed = null; btn.textContent = label; btn.classList.remove('armed'); }, 4000);
        return;
      }
      clearTimeout(armed); armed = null;
      btn.disabled = true;
      try { await run(); } finally { btn.disabled = false; btn.textContent = label; btn.classList.remove('armed'); }
    };
  }

  function afterChange(key, res) {
    forget(key);
    cache.set(key, { ...res, reviews: res.reviews.slice(0, 2) });
    paintAll(key);
    if (open?.key === key) open.draw();
  }

  // ---------- one review ----------
  function card(r, { full = false, key, title } = {}) {
    const textEl = h('p', { class: `review-text${full ? '' : ' clamp'}` }, r.text);
    const hide = r.spoiler && !r.mine;
    const reveal = hide && h('button', { type: 'button', class: 'review-spoiler', 'aria-expanded': 'false', onclick: (e) => {
      e.currentTarget.remove(); textEl.hidden = false;
    } }, h('strong', {}, T('Contains spoilers')), h('span', {}, T('Tap to show')));
    if (hide) textEl.hidden = true;
    const meta = [r.stars && starRow(r.stars), h('time', { datetime: new Date(r.created).toISOString() }, reviewDate(r.created)),
      r.edited && h('span', {}, T('edited')), r.spoiler && r.mine && h('span', {}, T('marked as a spoiler'))].filter(Boolean);
    const actions = full && (r.mine || r.canRemove) && h('div', { class: 'review-actions' },
      r.mine && h('button', { type: 'button', class: 'review-link', onclick: (e) => openComposer(key, title, {}, e.currentTarget) }, T('Edit')),
      (() => {
        if (!r.canRemove) return null;
        const label = r.mine ? T('Delete') : T('Remove');
        const b = h('button', { type: 'button', class: 'review-link' }, label);
        b.onclick = confirmTwice(b, label, T('Tap again to confirm'), async () => {
          try { afterChange(key, await api('/api/reviews/delete', jsonPost({ key, userId: r.userId, all: true }))); }
          catch (err) { toast(err.message); }
        });
        return b;
      })());
    // profiles: the writer's face and name open their profile.
    const toProfile = openProfile && r.userId != null ? (e) => openProfile({ id: r.userId, name: r.name, avatar: r.avatar }, e.currentTarget) : null;
    const faceEl = face(r, { size: full ? 40 : 34, cls: 'review-face' });
    return h('li', { class: `review${r.mine ? ' mine' : ''}` },
      toProfile ? h('button', { type: 'button', class: 'review-face-btn', 'aria-label': T('Open {0}’s profile', r.name), onclick: toProfile }, faceEl) : faceEl,
      h('div', { class: 'review-body' },
        h('div', { class: 'review-who' }, toProfile ? h('button', { type: 'button', class: 'review-name-btn', onclick: toProfile }, h('strong', {}, r.mine ? T('You') : r.name)) : h('strong', {}, r.mine ? T('You') : r.name), r.friend && h('span', { class: 'review-friend' }, T('Friend'))),
        h('div', { class: 'review-meta' }, ...meta.flatMap((m, i) => (i ? [h('span', { class: 'dot', 'aria-hidden': 'true' }, '·'), m] : [m]))),
        reveal, textEl, actions));
  }

  const summary = (data) => {
    const words = summaryText(data);
    return h('div', { class: 'reviews-summary' },
      data.average != null && h('span', { class: 'reviews-average', role: 'img', 'aria-label': T('Average {0} out of 5', averageText(data.average)) },
        h('span', { class: 'reviews-average-star', 'aria-hidden': 'true' }, '★'), h('span', { 'aria-hidden': 'true' }, averageText(data.average))),
      h('span', { class: 'muted' }, words || T('No reviews yet')));
  };

  // ---------- the Reviews section on a title page ----------
  function section(key, title) {
    if (!key || blocked()) return null;
    const el = h('section', { class: 'page-section reviews-section', 'aria-label': T('Reviews'), hidden: true });
    const paint = (data) => {
      if (!data || data.restricted) { el.hidden = true; return; }
      el.hidden = false;
      const write = h('button', { type: 'button', class: 'review-link reviews-write', onclick: (e) => openComposer(key, title, {}, e.currentTarget) },
        data.mine ? T('Edit your review') : data.count ? T('Write a review') : T('Write the first'));
      const list = data.reviews?.length ? h('ul', { class: 'review-list' }, data.reviews.map((r) => card(r, { key, title }))) : null;
      const seeAll = data.count > 0 && h('button', { type: 'button', class: 'chip reviews-all', onclick: (e) => openList(key, title, e.currentTarget) },
        data.count > (data.reviews?.length || 0) ? T('See all {0} reviews', data.count) : T('See all'));
      el.replaceChildren(h('div', { class: 'reviews-head' }, h('h3', {}, T('Reviews')), write), summary(data), list, seeAll);
    };
    return track(key, el, paint);
  }

  // ---------- See all ----------
  function openList(key, title, opener) {
    let data = null, error = null;
    const head = () => [h('h2', { id: 'picker-title' }, T('Reviews')), h('p', { class: 'muted picker-sub' }, title)];
    const state = { key, draw: null };
    state.draw = async () => {
      try { data = await load(key, { all: true }); error = null; } catch (err) { error = err.message; }
      if (open !== state) return;
      sheet.draw([...head(),
        data && summary(data),
        data && !data.restricted && h('button', { type: 'button', class: 'chip reviews-write-chip', onclick: (e) => openComposer(key, title, {}, e.currentTarget) },
          data.mine ? T('Edit your review') : T('Write a review')),
        !data ? h('p', { class: 'muted', role: 'status' }, error || T('Loading…'))
          : data.reviews.length ? h('ul', { class: 'review-list full' }, data.reviews.map((r) => card(r, { full: true, key, title })))
            : h('p', { class: 'muted' }, T('No written reviews yet.'))]);
    };
    open = state;
    sheet.open([...head(), h('p', { class: 'muted', role: 'status' }, T('Loading…'))], opener, () => { if (open === state) open = null; });
    state.draw();
  }

  // Live update: someone wrote, edited or removed a review (or a thumb cleared someone's stars).
  function refresh() {
    const keys = new Set();
    for (const v of views) { if (!v.el.isConnected) views.delete(v); else keys.add(v.key); }
    if (open) keys.add(open.key);
    for (const key of keys) forget(key);
    for (const key of keys) load(key).then(() => paintAll(key)).catch(() => {});
    open?.draw();
  }

  return { rateButton, section, refresh, openComposer };
}
