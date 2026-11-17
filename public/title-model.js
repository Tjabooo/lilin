// The one title page (app.js renderTitle): which state a title is in for this person, its one gold button and
// where every other action lives. Pure (no DOM, no T()): app.js turns the action ids into buttons, and
// tests/title-state.test.mjs checks each state has at most one primary and that nothing the three old pages
// offered (Discover's title page, the library film page, the library show page) got lost.
//
// Input, plain facts about the title for this person:
//   type        'movie' | 'tv'
//   mine        ready videos of it in their library (film versions, show episodes), converting ones included
//   preparing   every one of them is still being made playable (nothing plays yet)
//   play        what Play starts: 'play' | 'resume' (films: partly watched), shows: 'start' | 'next' | 'resume' | null (caught up)
//   onServer    copies someone else has here that aren't theirs (episodes for shows)
//   transfers   their downloads of it still running; playNow: one of them can play while it downloads
//   canGet      may download (torrents on and Can download); tmdb: the title has a TMDB id; search: TMDB is on
//   unreleased  not out yet (film) / not aired yet (show)
//   leaving     the next automatic delete is less than three days away; keep: Keep longer is still allowed
//   expires     an automatic delete is scheduled at all
//   owner       the server's owner (Identify film); ambiguous: the file matched several films
//   anime       the server says it's anime (Dubbed); versions: versions of the film in the library
//
// Output: { state, primary, secondary, more, inline }
//   primary     the only gold button (null: none, e.g. while preparing)
//   secondary   quiet chips beside it, at most four
//   more        the ⋯ menu beside them
//   inline      actions that live in a block of the page (the hero's Trailer, the reactions, episodes, the state line)

export const TITLE_STATES = ['notOnLilin', 'onServer', 'onItsWay', 'preparing', 'ready', 'leavingSoon', 'unreleased'];

export function pageState(x) {
  if (x.mine > 0) return x.preparing ? 'preparing' : x.leaving ? 'leavingSoon' : 'ready';
  if (x.transfers > 0) return 'onItsWay';
  if (x.onServer > 0) return 'onServer';
  return x.unreleased ? 'unreleased' : 'notOnLilin';
}

export function titleModel(x) {
  const tv = x.type === 'tv';
  const state = pageState(x);
  const watchable = Boolean(x.search && x.tmdb); // Save / Follow need a TMDB title
  const owned = state === 'ready' || state === 'leavingSoon' || state === 'preparing';
  const getMore = Boolean(x.canGet && x.tmdb); // the download command (films: one press; shows: the season panel)

  let primary = null;
  if (state === 'ready' || state === 'leavingSoon') {
    if (!tv) primary = x.play === 'resume' ? 'resume' : 'play';
    else if (x.play) primary = x.play === 'resume' ? 'resume' : 'play';
    else if (x.onServer > 0) primary = 'addAll'; // caught up, and someone else has more here
    else if (getMore) primary = 'moreEpisodes';
  } else if (state === 'onItsWay') primary = x.playNow ? 'playNow' : null;
  else if (state === 'onServer') primary = tv ? 'addAll' : 'addPlay';
  else if (state === 'unreleased') primary = watchable ? (tv ? 'follow' : 'save') : null;
  else if (state === 'notOnLilin') primary = getMore ? 'download' : watchable ? 'save' : null;

  const secondary = [];
  const chip = (id, when = true) => { if (when && id !== primary && !secondary.includes(id) && secondary.length < 4) secondary.push(id); };
  if (!tv) chip('add', state === 'onServer'); // add without playing
  if (tv) {
    chip('addAll', x.onServer > 0 && owned);
    chip('moreEpisodes', getMore && state !== 'notOnLilin' && state !== 'unreleased' && x.onServer === 0);
  }
  chip('save', watchable && !(tv && state === 'unreleased'));
  chip('follow', watchable && tv);
  chip('playOnTv', !tv && owned && state !== 'preparing');

  const more = [];
  const menu = (id, when = true) => { if (when && id !== primary && !secondary.includes(id) && !more.includes(id)) more.push(id); };
  if (!tv && owned) {
    menu('toPhone', state !== 'preparing');
    menu('keep', x.expires && x.keep && state !== 'leavingSoon');
    menu('getVersion', getMore);
    menu('dubbed', getMore && x.anime);
    menu('identify', x.owner);
    menu('delete');
  }
  if (!tv && !owned) {
    menu('advanced', getMore && state !== 'unreleased' && state !== 'onServer');
    menu('dubbed', getMore && x.anime && state === 'onServer'); // their copy may be subtitled: fetch the dub instead
  }
  if (tv) {
    menu('dubbed', getMore && x.anime);
    menu('keep', x.expires && x.keep && state !== 'leavingSoon');
    menu('delete', owned || x.transfers > 0);
  }
  menu('details', x.transfers > 0);

  const inline = [];
  if (x.tmdb && x.search) inline.push('trailer'); // on the hero, when TMDB has one
  inline.push('rate', 'review'); // the reactions block
  if (state === 'leavingSoon' && x.keep) inline.push('keep'); // in the state line
  if (!tv && x.versions > 1) inline.push('versions');
  if (!tv && x.anime && getMore && !owned && state !== 'onServer') inline.push('audio'); // the Audio choice beside Add
  if (!tv && x.ambiguous) inline.push('identityNote');
  if (tv) inline.push('episodes'); // a season's and an episode's own buttons and ⋯ menus:
  if (tv && (getMore || x.onServer > 0)) inline.push('addSeason');
  if (tv && owned) inline.push('toPhone', 'playOnTv');

  return { state, primary, secondary, more, inline };
}
