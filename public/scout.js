// The idea scout's cards in the owner's idea inbox (Settings → Ideas). The scout (agents/lilin-scout) reads
// what people have praised or wished for in streaming services and media servers over the years and
// brings ideas with the evidence; the owner accepts (a comment goes along to the build), comments (the
// scout answers on its next run) or says not now. Accepted ideas get built by an agent and report back here.
//
// app.js passes in its helpers (h, api, toast, ...) so this file has no globals beyond the DOM.
import { T, locale } from './i18n.js';

export const SCOUT_OPEN = ['new', 'discuss', 'approved', 'building', 'failed'];
export const scoutWaiting = (list) => (list || []).filter((i) => i.status === 'new').length;

export function createScout({ h, api, toast, jsonPost, fmtAgo, rerender }) {
  const drafts = new Map();   // id → comment being written, kept across re-renders
  const busy = new Set();     // ids with a request in flight
  const STATUS = () => ({ new: T('Waiting for you'), discuss: T('Scout is thinking'), approved: T('Accepted'),
    building: T('Being built'), added: T('Added'), failed: T('Didn’t work out'), notnow: T('Not now') });
  const SIZE = () => ({ small: T('Small'), medium: T('Medium'), large: T('Large') });

  async function act(idea, action, list, onList) {
    const comment = (drafts.get(idea.id) || '').trim();
    if (action === 'comment' && comment.length < 2) { toast(T('Write a comment first.')); return; }
    busy.add(idea.id); rerender();
    try {
      const r = await api(`/api/ideas/${idea.id}`, jsonPost({ action, comment }));
      drafts.delete(idea.id);
      onList(list.map((i) => (i.id === idea.id ? r.idea : i)));
      toast(action === 'accept' ? T('Accepted. A build agent will pick it up.') : action === 'comment' ? T('Comment sent to the scout') : T('Put aside'));
    } catch (err) { toast(err.message); }
    busy.delete(idea.id); rerender();
  }
  async function remove(idea, list, onList) {
    if (!confirm(T('Delete this idea?'))) return;
    try {
      await api(`/api/ideas/${idea.id}/delete`, jsonPost({}));
      onList(list.filter((i) => i.id !== idea.id));
    } catch (err) { toast(err.message); }
    rerender();
  }

  function host(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
  function evidence(idea) {
    const items = idea.evidence || [];
    if (!items.length) return null;
    return h('details', { class: 'scout-why', open: idea.status === 'new' || idea.status === 'discuss' },
      h('summary', {}, T('Why people want it ({0})', items.length)),
      h('ul', {}, items.map((e) => h('li', {},
        h('q', {}, e.text),
        h('span', { class: 'scout-src' },
          e.url ? h('a', { href: e.url, target: '_blank', rel: 'noopener noreferrer' }, e.where || host(e.url) || T('Source'))
            : (e.where || null),
          e.year ? ` · ${e.year}` : null)))));
  }
  function thread(idea) {
    if (!idea.thread?.length) return null;
    return h('ol', { class: 'scout-thread' }, idea.thread.map((c) => h('li', { class: `scout-say scout-say-${c.from === 'owner' ? 'you' : 'scout'}` },
      h('span', { class: 'idea-reply-who' }, c.from === 'owner' ? T('You') : T('Scout'), h('span', { class: 'scout-when' }, fmtAgo(c.at))),
      c.text)));
  }
  function buildLine(idea) {
    const b = idea.build || {};
    if (idea.status === 'approved') return h('p', { class: 'scout-state' }, T('Accepted. A build agent starts on it as soon as the machine is free.'));
    if (idea.status === 'building') return h('p', { class: 'scout-state scout-live' }, h('span', { class: 'scout-pulse', 'aria-hidden': 'true' }),
      b.started ? T('A build agent has been on it since {0}.', new Date(b.started).toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' })) : T('A build agent is on it.'));
    if (idea.status === 'added') return h('p', { class: 'scout-state' }, T('Built and live.'), b.commit ? h('code', {}, ` ${b.commit.slice(0, 7)}`) : null, b.note ? h('span', { class: 'scout-note' }, b.note) : null);
    if (idea.status === 'failed') return h('p', { class: 'scout-state scout-bad' }, T('The build didn’t work out.'), b.note ? h('span', { class: 'scout-note' }, b.note) : null);
    return null;
  }
  function actions(idea, list, onList) {
    const canDecide = ['new', 'discuss', 'notnow', 'failed'].includes(idea.status);
    const canComment = idea.status !== 'added';
    if (!canComment) return null;
    const pending = busy.has(idea.id);
    const box = h('textarea', { class: 'idea-text scout-comment', rows: '2', maxlength: '1500',
      placeholder: canDecide ? T('Add a comment (optional with Accept)') : T('A note for the build agent'), 'aria-label': T('Comment') });
    box.value = drafts.get(idea.id) || '';
    box.addEventListener('input', () => drafts.set(idea.id, box.value));
    return h('div', { class: 'scout-actions' }, box,
      h('div', { class: 'scout-buttons' },
        canDecide && h('button', { type: 'button', class: 'idea-send', disabled: pending, onclick: () => act(idea, 'accept', list, onList) },
          idea.status === 'failed' ? T('Try again') : T('Accept')),
        h('button', { type: 'button', class: 'chip', disabled: pending, onclick: () => act(idea, 'comment', list, onList) }, T('Comment')),
        canDecide && idea.status !== 'notnow' && h('button', { type: 'button', class: 'chip', disabled: pending, onclick: () => act(idea, 'notnow', list, onList) }, T('Not now')),
        idea.status !== 'building' && h('button', { type: 'button', class: 'idea-link', onclick: () => remove(idea, list, onList) }, T('Delete'))));
  }
  function card(idea, list, onList) {
    const sizes = SIZE();
    return h('li', { class: `scout-card scout-${idea.status}` },
      h('div', { class: 'idea-meta' },
        h('span', { class: `idea-status scout-status-${idea.status}` }, STATUS()[idea.status] || idea.status),
        idea.size && h('span', { class: 'tag' }, sizes[idea.size] || idea.size),
        h('span', { class: 'scout-age' }, fmtAgo(idea.created))),
      h('h4', { class: 'scout-title' }, idea.title),
      h('p', { class: 'idea-body' }, idea.pitch),
      evidence(idea),
      idea.fit && h('p', { class: 'scout-fit' }, h('strong', {}, T('In Lilin')), ' ', idea.fit),
      thread(idea),
      buildLine(idea),
      actions(idea, list, onList));
  }

  // The scout's part of the inbox: open ideas as cards, the rest folded away under them.
  function section(list, onList) {
    if (!list?.length) return [];
    const open = list.filter((i) => SCOUT_OPEN.includes(i.status));
    const rest = list.filter((i) => !SCOUT_OPEN.includes(i.status));
    const waiting = scoutWaiting(list);
    return [h('section', { class: 'scout', 'aria-labelledby': 'scout-head' },
      h('div', { class: 'scout-head' },
        h('span', { class: 'scout-lens', 'aria-hidden': 'true' }),
        h('div', {},
          h('h4', { class: 'idea-title', id: 'scout-head' }, T('From the scout'), waiting ? h('span', { class: 'scout-count' }, ` · ${T('{0} waiting', waiting)}`) : null),
          h('p', { class: 'idea-sub' }, T('Features people have loved or wished for in streaming services over the years, picked for Lilin.')))),
      open.length ? h('ul', { class: 'scout-list' }, open.map((i) => card(i, list, onList)))
        : h('p', { class: 'muted scout-empty' }, T('Nothing waiting. The scout brings new ideas once a week.')),
      rest.length > 0 && h('details', { class: 'scout-earlier' },
        h('summary', {}, T('Earlier scout ideas ({0})', rest.length)),
        h('ul', { class: 'scout-list' }, rest.map((i) => card(i, list, onList)))))];
  }

  return { section };
}
