// The one title page (app.js renderTitle): which state a title is in for this person, its one gold button and
// where every other action lives. Pure (no DOM, no T()): app.js turns the action ids into buttons, and
// tests/title-state.test.mjs checks each state has at most one primary and that members never meet a download tool.
//
// Play first: Play is the only thing a member does with a title. Yours plays; someone else's copy here plays at once
// (it joins your library behind the scenes); one that's still coming opens the player on "Getting it ready"; one that
// isn't here starts that (cold-start.js on the server finds a copy, usually in well under a minute). Downloads,
// keeping, deleting and release choices are the owner's tools (admin) and sit in the ⋯ menu.
//
// Input, plain facts about the title for this person:
//   type        'movie' | 'tv'
//   mine        ready videos of it in their library (film versions, show episodes), converting ones included
//   preparing   every one of them is still being made playable (nothing plays yet)
//   play        what Play starts: 'play' | 'resume' (films: partly watched), shows: 'start' | 'next' | 'resume' | null (caught up)
//   onServer    copies someone else has here that aren't theirs (episodes for shows)
//   transfers   their downloads of it still running (a Play that is getting it ready)
//   canGet      may download (torrents on and Can download); tmdb: the title has a TMDB id; search: TMDB is on
//   unreleased  not out yet (film) / not aired yet (show)
//   leaving     the next automatic delete is less than three days away; keep: Keep longer is still allowed
//   expires     an automatic delete is scheduled at all
//   owner       the server's owner (Identify film); admin: owner rights (the download tools); ambiguous: the file
//               matched several films
//   anime       the server says it's anime; versions: versions of the film in the library
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
  const watchable = Boolean(x.search && x.tmdb); // My list needs a TMDB title
  const owned = state === 'ready' || state === 'leavingSoon' || state === 'preparing';
  const getMore = Boolean(x.canGet && x.tmdb); // Play can fetch it (a cold start)
  const tools = Boolean(x.admin); // the owner's download tools

  let primary = null;
  if (state === 'ready' || state === 'leavingSoon') {
    if (!tv || x.play) primary = x.play === 'resume' ? 'resume' : 'play';
    else if (x.onServer > 0 || getMore) primary = 'play'; // caught up: the next episode, here or fetched
  } else if (state === 'onItsWay' || state === 'onServer') primary = 'play';
  else if (state === 'unreleased') primary = watchable ? 'save' : null; // save: the My list button
  else if (state === 'notOnLilin') primary = getMore ? 'play' : watchable ? 'save' : null;

  const secondary = [];
  const chip = (id, when = true) => { if (when && id !== primary && !secondary.includes(id) && secondary.length < 4) secondary.push(id); };
  chip('save', watchable);
  chip('playOnTv', !tv && owned && state !== 'preparing');

  const more = [];
  const menu = (id, when = true) => { if (when && id !== primary && !secondary.includes(id) && !more.includes(id)) more.push(id); };
  if (!tv && owned) {
    menu('toPhone', state !== 'preparing');
    menu('keep', tools && x.expires && x.keep && state !== 'leavingSoon');
    menu('getVersion', tools && getMore);
    menu('identify', x.owner);
    menu('delete', tools);
  }
  if (!tv && !owned) {
    menu('download', tools && getMore && state === 'notOnLilin'); // fetch it without playing
    menu('advanced', tools && getMore && state !== 'unreleased' && state !== 'onServer');
  }
  if (tv) {
    menu('moreEpisodes', tools && getMore && state !== 'unreleased'); // the season panel: a whole season, a quality
    menu('keep', tools && x.expires && x.keep && state !== 'leavingSoon');
    menu('delete', tools && (owned || x.transfers > 0));
  }
  menu('details', tools && x.transfers > 0);

  const inline = [];
  if (x.tmdb && x.search) inline.push('trailer'); // on the hero, when TMDB has one
  inline.push('rate', 'review'); // the reactions block
  if (tools && state === 'leavingSoon' && x.keep) inline.push('keep'); // in the state line
  if (!tv && x.versions > 1) inline.push('versions');
  if (!tv && x.ambiguous) inline.push('identityNote');
  if (tv) inline.push('episodes'); // each episode plays when pressed; a season's ⋯ holds the rest
  if (tv && tools && (getMore || x.onServer > 0)) inline.push('addSeason');
  if (tv && owned) inline.push('toPhone', 'playOnTv');

  return { state, primary, secondary, more, inline };
}
