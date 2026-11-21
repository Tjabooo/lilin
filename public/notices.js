// Owner popups (src/notices.js). Everyone but restricted people and the owner gets each new popup the next time
// they open Lilin: a card over everything that only goes away with OK. The owner writes them in House →
// Server rules → Popup message (English and/or Swedish, title optional), previews, sends and takes them down.
import { T, lang } from './i18n.js';

// The viewer's language, else the other one (the owner may write only one of them).
export const pick = (pair) => (lang === 'sv' ? pair?.sv || pair?.en : pair?.en || pair?.sv) || '';

export function createNotices({ h, api, jsonPost, toast, ago, rerender }) {
  const owner = { list: null, loading: null, sending: false, draft: { title: { en: '', sv: '' }, text: { en: '', sv: '' } } };

  // The popup itself: resolves when OK is pressed. Escape, clicks outside and Tab can't get past it.
  function showOne(n) {
    return new Promise((resolve) => {
      const title = pick(n.title);
      const ok = h('button', { type: 'button', class: 'play-btn notice-ok' }, T('OK'));
      const card = h('div', { class: 'notice-card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'notice-title', 'aria-describedby': 'notice-text' },
        h('div', { class: 'notice-mark', 'aria-hidden': 'true' }),
        h('div', { class: 'notice-from' }, T('From the owner')),
        title && h('h2', { class: 'notice-title', id: 'notice-title' }, title),
        h('p', { class: 'notice-text', id: 'notice-text' }, pick(n.text)),
        ok);
      const layer = h('div', { class: 'notice-layer' }, card);
      const opener = document.activeElement;
      const keys = (e) => {
        if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); ok.focus(); }
      };
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

  // On open: every waiting popup, one after the other, each marked seen once OK is pressed.
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

  // House → Server rules: write, preview, send; earlier popups below with how many have pressed OK.
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
      if (!confirm(T('Send this popup? Everyone who isn’t restricted gets it the next time they open Lilin.'))) return;
      owner.sending = true; send.disabled = true;
      try {
        owner.list = (await api('/api/notices', jsonPost({ title: d.title, text: d.text }))).all || [];
        owner.draft = { title: { en: '', sv: '' }, text: { en: '', sv: '' } };
        toast(T('Popup sent'));
      } catch (err) { toast(err.message); }
      owner.sending = false;
      rerender();
    } }, T('Send popup'));
    const act = async (n, what) => {
      if (what === 'delete' && !confirm(T('Delete this popup?'))) return;
      try { owner.list = (await api(`/api/notices/${n.id}/${what}`, jsonPost({}))).all || []; } catch (err) { toast(err.message); }
      rerender();
    };
    const list = owner.list?.length ? h('ul', { class: 'notice-list' }, owner.list.map((n) => h('li', { class: 'notice-row' },
      h('div', { class: 'notice-row-text' },
        h('div', { class: 'notice-row-title' }, pick(n.title) || pick(n.text).slice(0, 70)),
        h('div', { class: 'set-hint' }, [ago(n.created), n.seen === 1 ? T('1 person pressed OK') : T('{0} people pressed OK', n.seen), !n.active && T('Taken down')].filter(Boolean).join(' · '))),
      h('div', { class: 'notice-row-actions' },
        n.active && h('button', { type: 'button', class: 'chip', onclick: () => act(n, 'stop') }, T('Take down')),
        h('button', { type: 'button', class: 'chip', onclick: () => act(n, 'delete') }, T('Delete')))))) : null;
    return h('div', { class: 'set-card notice-compose' },
      h('div', { class: 'set-text' },
        h('span', { class: 'set-label' }, T('Popup message')),
        h('span', { class: 'set-hint' }, T('Shows once to everyone the next time they open Lilin; they press OK to carry on. Restricted people don’t get it. Write English, Swedish or both: each person sees their own language, else the other one.'))),
      h('div', { class: 'notice-langs' }, side('en', 'English'), side('sv', 'Svenska')),
      h('div', { class: 'notice-buttons' }, preview, send),
      list);
  }

  return { showPending, ownerCard, showOne };
}
