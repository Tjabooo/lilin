// Owner announcements (src/notices.js). Everyone but restricted people and the owner gets each new one the next
// time they open Lilin: a card over everything that only goes away with OK. The owner writes them in House →
// Server rules → Announcement (English and/or Swedish, title optional), previews, sends and takes them down;
// tapping one in the list below opens the whole message again.
import { T, lang } from './i18n.js';

// The viewer's language, else the other one (the owner may write only one of them).
export const pick = (pair) => (lang === 'sv' ? pair?.sv || pair?.en : pair?.en || pair?.sv) || '';

export function createNotices({ h, api, jsonPost, toast, ago, rerender }) {
  const owner = { list: null, loading: null, sending: false, draft: { title: { en: '', sv: '' }, text: { en: '', sv: '' } } };

  // The announcement itself: resolves when OK is pressed. Escape, clicks outside and Tab can't get past it.
  // read: the owner reopening a sent one from the list: Close instead of OK, Escape/outside closes it, and the
  // other language is shown under it when both were written.
  function showOne(n, { read = false } = {}) {
    return new Promise((resolve) => {
      const title = pick(n.title);
      const ok = h('button', { type: 'button', class: 'play-btn notice-ok' }, T(read ? 'Close' : 'OK'));
      const other = lang === 'sv' ? 'en' : 'sv';
      const otherText = read && n.text?.[other] && n.text[other] !== pick(n.text) ? n.text[other] : '';
      const otherTitle = otherText && n.title?.[other] !== title ? n.title?.[other] : '';
      const card = h('div', { class: 'notice-card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'notice-title', 'aria-describedby': 'notice-text' },
        h('div', { class: 'notice-mark', 'aria-hidden': 'true' }),
        h('div', { class: 'notice-from' }, T('Announcement')),
        title && h('h2', { class: 'notice-title', id: 'notice-title' }, title),
        h('p', { class: 'notice-text', id: 'notice-text' }, pick(n.text)),
        otherText && h('div', { class: 'notice-other' },
          h('div', { class: 'notice-lang-name' }, other === 'sv' ? 'Svenska' : 'English'),
          otherTitle && h('h3', { class: 'notice-title notice-other-title' }, otherTitle),
          h('p', { class: 'notice-text' }, otherText)),
        read && h('div', { class: 'set-hint notice-read-meta' }, [n.created && ago(n.created), n.seen === 1 ? T('1 person pressed OK') : n.seen != null && T('{0} people pressed OK', n.seen), n.active === false && T('Taken down')].filter(Boolean).join(' · ')),
        ok);
      const layer = h('div', { class: 'notice-layer' }, card);
      const opener = document.activeElement;
      const keys = (e) => {
        if (e.key === 'Escape' && read) { e.preventDefault(); e.stopPropagation(); ok.click(); return; }
        if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); ok.focus(); }
      };
      if (read) layer.addEventListener('click', (e) => { if (e.target === layer) ok.click(); });
      ok.onclick = () => {
        document.removeEventListener('keydown', keys, true);
        layer.classList.add('leaving');
        setTimeout(() => { layer.remove(); opener?.focus?.({ preventScroll: true }); resolve(); }, 180);
      };
      document.addEventListener('keydown', keys, true);
      document.body.append(layer);
      requestAnimationFrame(() => { layer.classList.add('open'); ok.focus({ preventScroll: true }); });
    });
  }

  // On open: every waiting announcement, one after the other, each marked seen once OK is pressed.
  let shown = false;
  async function showPending() {
    if (shown) return;
    shown = true;
    let pending = [];
    try { pending = (await api('/api/notices')).pending || []; } catch { shown = false; return; }
    for (const n of pending) {
      await showOne(n);
      api(`/api/notices/${n.id}/seen`, jsonPost({})).catch(() => { /* it shows again next time */ });
    }
  }

  function loadOwner() {
    owner.loading ||= api('/api/notices').then((r) => { owner.list = r.all || []; })
      .catch(() => { owner.list = owner.list || []; }).finally(() => { owner.loading = null; });
    return owner.loading;
  }
  const filled = () => Boolean(owner.draft.text.en.trim() || owner.draft.text.sv.trim());

  // House → Server rules: write, preview, send; earlier announcements below (tap one to read it all) with how many have pressed OK.
  function ownerCard() {
    if (!owner.list && !owner.loading) loadOwner().then(rerender);
    const d = owner.draft;
    const field = (lab, key, part, rows, max) => {
      const attrs = { class: rows ? 'notice-input notice-area' : 'notice-input', maxlength: String(max), 'aria-label': lab,
        oninput: (e) => { d[key][part] = e.target.value; send.disabled = owner.sending || !filled(); preview.disabled = !filled(); } };
      const el = rows ? h('textarea', { ...attrs, rows: String(rows) }) : h('input', { ...attrs, type: 'text' });
      el.value = d[key][part];
      return h('label', { class: 'notice-field' }, h('span', { class: 'notice-field-label' }, lab), el);
    };
    const side = (part, name) => h('div', { class: 'notice-lang' },
      h('div', { class: 'notice-lang-name' }, name),
      field(T('Title (optional)'), 'title', part, 0, 120),
      field(T('Message'), 'text', part, 4, 2000));
    const preview = h('button', { type: 'button', class: 'chip', disabled: !filled(),
      onclick: () => showOne({ title: d.title, text: d.text }) }, T('Preview'));
    const send = h('button', { type: 'button', class: 'chip notice-send', disabled: owner.sending || !filled(), onclick: async () => {
      if (!confirm(T('Send this announcement? Everyone who isn’t restricted gets it the next time they open Lilin.'))) return;
      owner.sending = true; send.disabled = true;
      try {
        owner.list = (await api('/api/notices', jsonPost({ title: d.title, text: d.text }))).all || [];
        owner.draft = { title: { en: '', sv: '' }, text: { en: '', sv: '' } };
        toast(T('Announcement sent'));
      } catch (err) { toast(err.message); }
      owner.sending = false;
      rerender();
    } }, T('Send announcement'));
    const act = async (n, what) => {
      if (what === 'delete' && !confirm(T('Delete this announcement?'))) return;
      try { owner.list = (await api(`/api/notices/${n.id}/${what}`, jsonPost({}))).all || []; } catch (err) { toast(err.message); }
      rerender();
    };
    const list = owner.list?.length ? h('ul', { class: 'notice-list' }, owner.list.map((n) => h('li', { class: 'notice-row' },
      h('button', { type: 'button', class: 'notice-row-text', title: T('Read the whole announcement'), onclick: () => showOne(n, { read: true }) },
        h('div', { class: 'notice-row-title' }, pick(n.title) || pick(n.text).slice(0, 70)),
        pick(n.title) && h('div', { class: 'notice-row-snippet' }, pick(n.text)),
        h('div', { class: 'set-hint' }, [ago(n.created), n.seen === 1 ? T('1 person pressed OK') : T('{0} people pressed OK', n.seen), !n.active && T('Taken down')].filter(Boolean).join(' · '))),
      h('div', { class: 'notice-row-actions' },
        n.active && h('button', { type: 'button', class: 'chip', onclick: () => act(n, 'stop') }, T('Take down')),
        h('button', { type: 'button', class: 'chip', onclick: () => act(n, 'delete') }, T('Delete')))))) : null;
    return h('div', { class: 'set-card notice-compose' },
      h('div', { class: 'set-text' },
        h('span', { class: 'set-label' }, T('Announcement')),
        h('span', { class: 'set-hint' }, T('Shows once to everyone the next time they open Lilin; they press OK to carry on. Restricted people don’t get it. Write English, Swedish or both: each person sees their own language, else the other one.'))),
      h('div', { class: 'notice-langs' }, side('en', 'English'), side('sv', 'Svenska')),
      h('div', { class: 'notice-buttons' }, preview, send),
      list);
  }

  return { showPending, ownerCard, showOne };
}
