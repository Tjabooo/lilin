# Critique round 2: designer D on the hybrid draft + build spec for D's parts

Base: `hybrid-draft.md`; round-1 files `r1-{A,B,C,D}.md`; code at master. Function names and byte counts below come
from `public/app.js` and `public/style.css` as they are today (bytes measured with a rule-splitter over style.css).

Hygiene done: `proposals/D/house-phone.html` now says "media-server" and "DNS filter: not answering" instead of the
real host and service/port, and "Today 3 h 12 m on the desktop" for Screen Time. `watch-phone.html` uses "Sam and
Alex" instead of family names. Both PNGs are re-rendered. `D.md` and `r1-D.md` had no hostnames or ports.

## 1. Holes in the hybrid (5)

| # | Hole | Concrete fix |
| --- | --- | --- |
| 1 | **Two inboxes.** Friend requests and Moments land in **You**, and What's new › **For you** lists moments, idea answers and requests again. The bulb would then light for release notes *and* for people (r1: A's worst flaw). | One inbox: **You**. The top of You gets a "New for you" block (0–3 rows: request → Accept, moment → play, idea answer → open), and the You tab gets a dot. The What's new bulb stays release notes only. `?moment=`, `?friends=1` and `?ideas=1` (members) land on the matching You page. |
| 2 | **Right now "on top" of Discover.** Above the billboard, it breaks the edge-to-edge billboard under the transparent header. It also becomes a 4th downloads surface (strip, Library › Downloads, badge, title page) and a 2nd home for parties (strip, Live). | Place it **under the billboard, before Continue watching**. Each row is a pointer to the single home of that item (Downloads segment, the title's Keep in its state line, Live › party), never a list of its own. A "download ready" row stays 24 h. The badge counts don't change. |
| 3 | **Activity has no stated home for owners.** The draft says You holds Activity "if Can see activity". The owner's Activity also carries invites, sign-in access and the per-person panel. | One view, one entry per role: `#activity` = the read-only feed. Owners reach it from **House › Activity**; +act members from **You › Activity**. Nobody gets both. Invites, the access list and the person panel leave Activity for **House › People** (section 2.3). |
| 4 | **Pick together is still a scroll.** The first Moods tile sits about 900–1,100 px down once Right now, the billboard, the controls row and Continue watching are above it (A, risk 3). The draft also moves party start/plan/join to Live but leaves Pick on Discover, while a Pick match leads to a party. | Live gets a **"Watch with someone"** row: [Pick together] [Plan a party]. "Plan a party" uses the existing `POST /api/watch/plan`, as C proposed. That puts Pick at 2 taps from cold. Keep the Moods tile as the browsing-time nudge, and add a Go to entry ("pick", "välj tillsammans"). |
| 5 | **Continue watching only on Discover hurts Library-start users.** "Open Lilin on: Library" users (likely the TV-minded family; the TV app's home is the library, `public/tv/tv.js` `homeScreen`) lose the resume shelf on their start screen (A, risk 5). | In Library › Titles, the **Recently watched** sort puts in-progress titles first with progress bars. Make it the default sort when `startView === 'library'`. Don't add a second Continue row. |

## 2. Build spec for D's parts

### 2.1 Routes (shared by tabs, search and old links)

New pure module **`public/routes.js`** (no DOM): `ROUTES = { id → { view, tab, sub?, allowed(me, status) } }`, plus
`LEGACY` (old hash or query → route id), `tabsFor(me, status)` and `resolve(hash, me, status)`. `app.js` changes:
`linkedView()` (today it checks `.tab[data-view]`) calls `resolve()`. `setView()` sets `aria-current` on
`ROUTES[id].tab` rather than on the view itself, so sub-views light their parent tab. The service-worker
`lilin:open` handler and the `init()` deep-link branches go through `resolve()` too, instead of hard-coding
`setView('settings')` / `setView('library')`.

**Tab stacks:** `lastSub[tab]` lives in sessionStorage `lilin:stack`. Tapping a tab opens its last sub-view. Tapping
the current tab while you're on a sub-view goes up to the tab root, and tapping it at the root scrolls to the top
(that last part is today's behaviour).

| Old link | Resolves to |
| --- | --- |
| `#discover`, `#live` | same |
| `#library` | Library › Titles |
| `#downloads`, saved startView `downloads` | Library › Downloads |
| `#settings` | You (settings list) |
| `#activity` | owner: House › Activity · +act: You › Activity · else: start view (as today) |
| `#house` | House hub (status card = condensed Overview) |
| `#clips`, `#notes` | House › Game clips / Notes (view ids unchanged: `clips`, `notes`) |
| `?friends=1`, `?moment=` | You › Friends / You › Moments (plays it) |
| `?ideas=1` | member: You › Ideas · owner: House › Ideas |
| `?travel=1` | Library › Downloads + `openTravelList()` |
| `?note=`, `/c/n/` | House › Notes, focused note |
| `/#@handle`, `?watch=`, `/c/w/`, `?pick=`, `?update=`, `?wrapped=`, `?play=`, `/c/*` | unchanged |

`src/accounts.js` `START_VIEWS`: add `live`. Keep `downloads`, which resolves via `LEGACY`.

### 2.2 Search + Go to registry

**Behaviour.** One box with one placeholder, "Search Lilin" / "Sök i Lilin". It never changes view:
- Results show in **`#search-layer`**, new in `index.html` after `<header>`. On phones (< 900 px) it's a fixed
  panel under the header, full height, `overscroll-behavior: contain`, opened from the existing search icon
  (`setSearching()`). On desktop it's a panel under the field (max 640 px wide, scrolls inside), and "All results"
  or Shift+Enter widens it to the full content width.
- `/` or Ctrl/⌘K focuses the box. Escape or Cancel closes the layer and leaves the tab exactly as it was.
- With the field empty: 5 recent searches (localStorage `lilin:recent-search`) and 6 role-default Go to chips.
- Keyboard: `role=combobox` on the input, a `listbox` of rows, `aria-activedescendant`, ↑↓ / Enter.

**Groups** (order fixed; caps in brackets; Go to and On Lilin render on the first keystroke, network groups fill in
after a 250 ms debounce, with the abort handled by the existing `searchCtrl`):

| Group | Source (exists today) | Who |
| --- | --- | --- |
| On Lilin [4] | local `state.library` match + `/api/search` results whose `ownershipBadge` is library/server | all |
| Films & shows [6] | `/api/search` `results` (rest via All results → `titleGrid`) | all |
| Free on SVT Play [3] | `/api/search` `svt` | all |
| Live [3] | `liveView`'s cached guide: channel name/number, programmes now/next | all |
| People [3] | `/api/friends/search` | M, O (not R, not H) |
| Go to [4] | `places.js` match (sync) | per place `who()` |
| Footer actions | "Search torrents for “q”" → `openTorrents({query})` (+dl && `status.torrents`); "Search notes for “q”" → House › Notes with its field filled (Notes) | as noted |

I recommend People and Live over the draft's "find a title" (one line each, data already loaded). That's what makes
"sign" find Signs, the channel airing it and Signe.

**In-page filters** replace the old meanings. Each is a small `.filter-field` (filter icon, not the magnifier) on
its own page:

| Page | Filter |
| --- | --- |
| Library › Titles | `state.libQuery`, in `filterLibrary` and the shelf key |
| Activity | `activityQuery`, at `app.js` ~8950 |
| House › Overview machines | `houseQuery`, ~9191 |
| Game clips | `clipsQuery`, ~10182 |
| Notes | `createNotesView({ query: () => notesQuery })` |

**Delete from `app.js`:**
- the `input` listener's per-view branches (the `setView('discover')` jump on Settings/Live, the Notes reload, the
  `renderView()` filter);
- the `PLACEHOLDERS` map;
- `renderDiscover()`'s `if (q)` branch and its "Results for" heading (it moves into the layer);
- every other read of `state.query`;
- the `#find-torrents` header button (it moves into Library › Downloads and the search footer).

**New files:**
- `public/search.js`: `createSearch({ h, api, T, titleCard, places, … })`, exposing `open`, `close`, `query` and
  `renderGroups`.
- `public/places.js`: `PLACES = [{ id, label /* English, through T() */, syn: { en: [], sv: [] }, route, who(me,
  status), open? }]`. About 45 static entries (every route in 2.1 and 2.3, every You settings page, Pick together,
  Wrapped, What's new, Sign in a TV, Android TV, Jellyfin, Appearance, Language, Subtitles, Notifications, Download
  preferences, Invite to Lilin, Who may sign in, Server rules, Screen Time, Channels). Plus dynamic entries for the
  28 vibes (vibes.js names) and the channels (live guide).
- `public/i18n-sv.js`: ~50 labels + `syn.sv`.

**Test `tests/routes-places.test.mjs`** (node:test, imports `routes.js`, `places.js`, `i18n-sv.js`). It fails if:
- a route has no place (unless it's flagged `searchable: false`);
- a place's label has no Swedish entry or an empty `syn.sv`;
- a place points at an unknown route;
- `place.who` is true for a role where `route.allowed` is false (role fixtures: H, M, M+act, M+inv, R, co-owner, Owner);
- a role has more than 5 tabs;
- a `LEGACY` link resolves to a route its role can't open, instead of the start view.

**CSS:**
- **Out:** the `.search-toggle` / `.search-cancel` / `body.searching` rules that only served Discover-in-place
  (~300 B of 741; the phone toggle stays), and `body.searching .browse-btn`.
- **In:** `.search-layer`, `.sr-group`, `.sr-row`, built on the existing `.rows .row` list-row styles (~1.0–1.3 KB).
  No `backdrop-filter`: the layer uses `--surface-solid-glass`.

### 2.3 House (owners only)

**Tabs.** `init()` keeps only `enableHouseTab()` for `status.admin`. `enableNotesTab`, `enableClipsTab`, the owner
branch of `enableActivityTab` and the `insertBefore` reordering hack all go. Their views (`#view-notes`,
`#view-clips`, `#view-activity`) stay as sub-views, with `ROUTES[*].tab = 'house'` and a "‹ House" back link in the
view heading. Nothing gets remounted.

**Hub = `renderHouse()` landing** (the old Overview becomes the sub-view `overview`):

1. **Status card.** The worst status line ("1 thing needs a look · …") plus one line of numbers. Tapping it opens
   Overview (Server, VPN, Sharing, Power, Machines), with its own machines filter.
2. **Needs you** (0–3 rows on `.set-stack`, from B): house alerts, new ideas (`ideaInbox` unread), downloads
   needing attention, people waiting for sign-in. Hidden when empty.
3. **Tiles**, a 2-column grid. Each tile has one live line; the bulb badge appears only for actionable counts.

| Tile | Mounts (existing code) | Owner | co-owner | no CLIPS_DIR |
| --- | --- | :-: | :-: | :-: |
| Notes | `notesView.render()` into `#notes-body` | ✓ | — | ✓ |
| Game clips (renamed, sv "Spelklipp") | `renderClips()` / `#clips-body` | ✓ | ✓ | — |
| People | see below | ✓ | ✓ | ✓ |
| Activity | `renderActivity()` minus `activityInvite()` / `activityPersonPanel()` | ✓ | ✓ | ✓ |
| Ideas | `ideaInbox()` + scout.js (out of `ownerSettings()`) | ✓ | ✓ | ✓ |
| Downloads | `openTransferDetails(null)` content as a page + Find torrents | ✓ | ✓ | ✓ |
| Channels | live.js `openEditor` as a page (the Live "Your channels" chip stays as a shortcut) | ✓ | ✓ | ✓ |
| Server rules | `ownerSettings()` Server rows, incl. "Staying signed in" | ✓ | ✓ | ✓ |
| Screen Time | the old House segment 2 | ✓ | ✓ | ✓ |
| | **count** | **9** | **8** | **−1** |

**People** = one page:
- top: **Invite to Lilin** (the screen's one gold button) → C's shared Invite sheet, Lilin context. This is today's
  `activityInvite()` + `memberInviteSettings()`; the member version stays in You.
- a filter field, then pending invites;
- one row per person: face, name, last seen, permission tags.

Tapping a row opens a person page that merges:
- `ownerSettings()` People cards (picture, Can download, Can invite, Restrict, Can see activity, Never auto-delete,
  library sharing);
- `activityPersonPanel()` (sign-in access, password link, `accessAction` / `accessName`);
- "Their activity" → House › Activity filtered;
- Open profile.

`ownerSettings()` then holds nothing; its parts move to Server rules, Ideas and People, and `renderSettings()` stops
calling it. `loadPeople()` runs when People is opened, not on every Settings open.

**CSS:**
- **Out:**
  - `.act-invite` / `.access-*` / `.invite-*`: 2,970 B, re-expressed as `.set-stack` rows (~+500);
  - `.act-person` / `.act-panel`: ~1.0 of 2,143 B (the rest is still used by the feed's person filter);
  - House Overview/Screen Time segment rules: ~587 B, including `#view-house` max-width tweaks.
- **In:** `.house-status`, `.tool-grid`, `.tool`: ~1.1 KB.

### 2.4 One title page, buttons by state, one gold button

**Entry.**
- New `openTitle(ref, opener)`, where `ref` = `{ type, id }` (TMDB) | `{ entryKey }` | `{ fileId }` |
  `{ svtPath }` (phase 2).
- `openDetails(t)`, `openFilm(f)` and `openShow(id)` stay as one-line wrappers, so billboard.js, coming-soon.js,
  peek.js and the 14 `app.js` callers don't change.
- One renderer, `renderTitle()`, replaces `renderDetails()`, `renderFilm()` and `renderShow()`.
- One live-update path: `titleView = { ref, key }` + `updateOpenTitle()` replaces
  `updateOpenFilm()` / `updateOpenShow()` / `detailsView.t`. It keeps `followFilmId()`, `followFinishedDownload()`
  (On its way → Ready in place) and the "Removed from your library" card.

**Model, kept pure for tests.** `titleModel({ t, files, onServer, entry, transfers, watch, me, rules })` →
`{ state, primary, secondary[], more[], stateLine }`. It's built from `matchesFor`, `serverMatchesFor`,
`unifiedLibrary`, `titleState` and `transferPanel` data.

| State | Primary (the only `.play-btn`) | State line |
| --- | --- | --- |
| `notOnLilin` | Download / Add (`canGet()`), else Save | Not on Lilin |
| `onServer` (not yours) | Add & play / Add season (today's `serverOffer`) | On Lilin · 4K, 1080p |
| `onItsWay` | Play now if streamable, else none | 43 % · about 20 min |
| `preparing` | none (disabled "Preparing playback…" is not lit) | Preparing playback |
| `ready` | Play / Resume S2 E4 | 4K · 2 h 52 m |
| `leavingSoon` | Play | Leaves in 2 days · Keep (a quiet button; today's `keepBar`) |
| `unreleased` | Save / Follow (`watchBox` logic) | In cinemas 21 Nov |
| `svt` (phase 2) | Play on SVT Play / Add (`canAdd`) | Free on SVT Play |

**Secondary and More.**
- Secondary row: `.chip`s, at most 4: Trailer · Save/Follow (unless it's the primary) · Rate · Play on TV (owned).
- More ⋯ (existing `rowMenu`): Download details · Advanced options (`advancedOptions`) · Dubbed · Get another
  version · To phone · Keep longer · Delete · Identify film (O).

**Blocks.** hero (`detailsHero`, falling back to `pageHero`) · `pageTitle` + `pageFacts` + state line · action bar
(+ the inline `showDownload().panel` when picking seasons) · identity note (O, ambiguous files) · overview ·
**episodes** · versions (only when there's more than one) · reactions (`social.rateRow` + `reviews.section`, next to
each other) · cast · More like this · More details.

**Episodes.** One `episodeList()` replaces `episodeBrowser()` / `episodeItem()` and `renderShow()`'s season grid:
- season chips, with an "All seasons" sheet above 8 seasons;
- only the selected season is rendered (257 buttons → ~60);
- each row: still, number and title, air date, runtime, progress;
- row actions: owned → a quiet play glyph + ⋯ (Play on TV, To phone, Keep, Delete); missing → a quiet "Get"
  (`episodeDownload`); downloading → the transfer state;
- season ⋯: Download / Add season, Keep all, Season to phone, Delete season.

That removes the 7 gold buttons from the library show page.

**Tests.**
- `tests/title-state.test.mjs`, with fixtures per state × role (+dl, no dl, O, R). Each state has ≤ 1 primary.
  Every action from today's three variants (Play, Resume, Play now, Download, Add, Add & play, Add season, Save,
  Follow, Trailer, Rate/Review, Play on TV, To phone, Delete, Keep longer, Identify, Advanced options, Dubbed,
  versions, Download details) must be reachable in at least one state: the "nothing lost" check.
- ui-shots: `report.json` "lit" ≤ 1 on the title-film, title-show, library-film and library-show scenes.

**CSS:**
- **Out:**
  - `.library-film-actions`: 437 B;
  - `.page-extras`: 268 B;
  - `.library-keep*` keep bar: 1,275 B (→ state line ~250);
  - one of the two episode layouts (`.episode-tabs` + the library `.season-*` grid): ~1.1 KB;
  - `.title-actions` / `.action-row` → one `.title-bar`: 470 → ~250 B.
- Net about **−2.8 KB**.

### 2.5 Tab bar and header, by device and role

| | Phone < 600 / tablet < 900 | Desktop ≥ 900 |
| --- | --- | --- |
| Sections | bottom bar, always labelled: Discover · Live · Library · You (+ House before You for owners) | header links: Discover · Live · Library · (House) |
| You | a tab whose icon is `people.face(me, 23)`; H gets a person glyph | the `#me-btn` face at the far right opens You, not the profile; `.tab[data-view=you]` is hidden at ≥ 900. H gets the glyph too (today the button is hidden) |
| Header | wordmark · search icon · What's new bulb (Browse ▾ goes; the face moves to the tab) | wordmark · links · search field (Ctrl K) · What's new pill · face |
| Badges | Library: `#dl-badge` (downloads) · You: dot (New for you) · House: dot (Needs you) | same, inline |

| Role | Tabs |
| --- | --- |
| H, M, R | 4 |
| M + Can see activity | 4 (was 5; Activity moves into You) |
| co-owner | 5 (was 7, icon-only) |
| Owner | 5 (was 8, icon-only and scrolling) |

**Code:**
- `index.html`: static `.tab`s for discover, live, library and you. Delete `#browse-btn`; keep `#search-toggle`
  and `#search-cancel`.
- `enableLiveTab()` → static.
- `renderMeButton()`: shown for every account (glyph for H), and the click goes to `setView('you')`.
- `revealSectionTab()` / `updateTabOverflow()` and the `.tabs` scroll listener: deleted.
- `updateBrowseButton()` / `openBrowse()`: deleted (A's controls row replaces them).

**CSS out:**
- the `.tabs:has(.tab:nth-child(6|7|8))`, `.can-scroll-*` and `--tab-edge-*` mask rules: 1,559 B;
- `.browse-btn`, `.browse-*` and the `max-width: 899px` hide rule: 1,525 B.

**CSS in:** `.tab .face` + `.tab .dot`: ~250 B.

### 2.6 CSS sum for these four parts

Out ≈ 1.5 (tab overflow) + 1.5 (Browse) + 0.3 (search bits) + 3.7 (title) + 2.9 (access) + 1.0 (person panel) +
0.6 (House segments) ≈ **11.5 KB**. In ≈ 1.2 (search layer) + 1.1 (House tiles) + 0.5 (People rows) + 0.5 (state
line, title bar) + 0.25 (tab face) ≈ **3.6 KB**. **Net ≈ −8 KB** of the 364,654 B app CSS, with no new
`backdrop-filter`, `@keyframes` or `infinite`.

### 2.7 Build order (each step can ship on its own)

1. routes.js + tab bar/header + House hub with sub-views (no remounts);
2. search layer + places.js + the routes/places test;
3. People merge (ownerSettings/Activity access → House › People);
4. `titleModel` + its test, then `renderTitle` + `episodeList` behind the old wrappers;
5. SVT on the one title page.
