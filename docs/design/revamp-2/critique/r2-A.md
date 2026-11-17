# Round 2: designer A on the hybrid draft, plus the Discover + Library spec

Input: `hybrid-draft.md` and `critique/r1-{A,B,C,D}.md`. Code facts checked at master `b85d964`.

## 1. Holes in the hybrid (5, each with a fix)

1. **"Right now on top of Discover" collides with three things.**
   - It collides with the billboard: the full-bleed art sits under the transparent header, and the strip can't go
     above it without breaking the 11-10 look.
   - It's ambiguous about the type filter: `continueRow()` already filters by type (`homeType`), but urgent items
     must not be filtered.
   - It does nothing for "Open Lilin on: Library" users, who now lose both Continue watching and Right now from
     their start screen (A risk 5, D r1).

   **Fix:**
   - Place it **directly under the billboard, above the control row**. Everything above the chips is yours and
     unfiltered; everything below follows the chips.
   - The strip **follows the start view**. Accounts that open on Library get it at the top of Library › Titles
     instead (one instance per account, never both), and their Titles sort defaults to *Recently watched*.
   - Fold the seasonal **Wrapped banner into a Right now row**. That's one fewer block, and the `.wrapped-banner`
     CSS goes.
2. **Two inboxes.** The hybrid keeps What's new › For you (moments, idea answers, requests) *and* gives You
   Friends + requests and Moments. All three r1 critiques of A flagged the bulb carrying two meanings (release notes +
   personal mail). Now that You is a tab, For you is redundant. **Fix:**
   - Drop For you, and with it A's own idea.
   - Personal arrivals get a **dot on the You tab** plus a "New for you" card stack at the top of You: C's
     request card (Accept is the screen's one lit button), new moments and idea answers.
   - What's new goes back to release notes only.
   - `?moment=`, `?friends=1` and `?ideas=1` (member) land on the You sub-pages.
3. **The owner tab is undefined, and "House" collides.**
   - The hybrid names the owner tab House, but House already names the machines/VPN/Screen Time view, so "House ›
     House" is ambiguous.
   - It doesn't say how the hub navigates, and A's 7-chip row was cut off at 390 px (B, C and D all caught it).
   - Activity's home is ambiguous for owners.

   **Fix:**
   - Tab **House**. The landing is B's **Needs you** (0–3 actionable rows) followed by D's **2-column tiles**, all
     visible without sideways scrolling: Notes · Game clips · People · Ideas · Machines · Screen Time · Channels ·
     All downloads · Server rules.
   - D's **tab stack**: re-tapping House returns to the last tool, and a second tap goes to the tiles.
   - Rename the old Overview section **Machines**.
   - **Activity has one home: You**, for everyone allowed to see it (owners and +act). Its admin half (Invite
     tile, access list, person panel) lives in House › People.
4. **Settings sinks one level and can get buried.** You replaces the Settings tab. B's mockup showed how a hub
   buries settings under shelves: "Sign in a TV" became 3 taps (D r1). **Fix:**
   - Fixed You order: card → New for you (conditional) → **Settings rows** (Account · Look & language · Watching ·
     Devices & notifications · Downloads) → People (Friends, Moments, Activity, Invite) → Yours (Wrapped, Ideas).
     Settings is then ≤2 taps with no scroll: every group is a row on the first screen and its page one tap away.
   - Register every group and row in the **Go to** registry ("settings", "inställningar", "TV", "subtitles").
   - Desktop: the header face opens You.
   - H gets a "Home network" card (no profile, no friends) plus Moments, Wrapped and Settings.
5. **Pick together still fails ≤2 taps, and party creation reverses an 11-10 decision.**
   - The first Moods tile is ~1 screen down on a phone (A risk 3, all three critiques).
   - "Start/plan a party from Live" brings back the planning that was deliberately removed from title pages and
     the player on 11-10. That's a product call, not an IA move.

   **Fix:**
   - Live gets a top block, **Watch with someone**: the Pick together tile + planned parties (join · copy ·
     cancel). That's 2 taps cold, and the Moods tile stays as the in-context nudge.
   - Ship party *creation* from Live only if Owner OKs it. v1 plans through Pick together's match popup, as today.

## 2. Build-ready spec: Discover + Library

### 2.1 Discover, home view (`#discover`, type All, no query, no `disc.list`/`disc.genre`/vibe page)

| # | Block | Shows when | Filtered by chips | Source |
| --- | --- | --- | --- | --- |
| 1 | Billboard | `data.featured.length` | yes (featured per type, as today) | billboard.js |
| 2 | **Right now** (0–3 rows) | ≥1 row and start view = Discover | **no** | right-now.js (new) |
| — | **Control row** (not counted) | always | — | `discoverControls()` |
| 3 | Continue watching (+ Up next) | items | yes (`homeType`, as today) | `continueRow()` |
| 4 | **Moods**: Pick together tile · Today ×2 · vibes | always | yes (vibes per type, as today) | vibes.js + match.js `tile()` |
| 5 | Trending this week | TMDB | yes | `data.rows[0]` |
| 6 | **For you** (Because you watched + Top picks merged) | ≥1 watched seed | yes | `forYouRow()` |
| 7 | Popular on Lilin | social.js returns a shelf | yes | `social.popularShelf` |
| 8 | **Popular** (films + shows interleaved on All) | TMDB | — | client merge of `popular-movie` + `popular-tv` |
| 9 | In cinemas now | TMDB | — | `cinemas` |
| 10 | New episodes this week | TMDB | — | `on-air` |
| 11 | Coming soon (dated cards) | TMDB | — | coming-soon.js `row()` |
| 12 | **Top rated** (films + shows interleaved) | TMDB | — | client merge of `top-movie` + `top-tv` |

Cap: **12 blocks**, including Right now. Any new row has to replace or merge one. The merges are **done on the
client**: `public/tv/tv.js:812` calls the same `/api/discover/home`, so `HOME_ROWS` stays untouched. The See all for
a merged row opens a list page with a Films/Shows segmented control that switches the key.

Types Films / Shows: the same order. TMDB rows come from that type's `HOME_ROWS` set unchanged, and nothing is
merged. Documentaries: billboard → Right now → controls → `documentaries.render` (unchanged). Sub-pages (See all,
genre, mood, Coming soon page, search results): unchanged, with no Right now.

**Per role (type All):**

| Account | Blocks | Differences |
| --- | --- | --- |
| Owner (Owner, co-owner) | 12 | Right now's "needs attention" counts **own** downloads only (everyone's go in House › Needs you) |
| Member | 12 | — |
| Restricted | 12 | Right now: no party row unless the API returns one for them (link-joined, as today). Pick tile works by link only (invitee lists skip R, unchanged). Popular on Lilin as `social.js` decides today |
| Home network | 12 | same as member; phone-copy row on touch devices |
| New member, empty library | **9** | billboard, controls, Moods (Pick tile), Trending, Popular on Lilin (server-wide), Popular, In cinemas, New episodes, Coming soon, Top rated. No Right now, Continue or For you. No placeholder blocks |

Moved off Discover: On its way → Library › Downloads (+ a Right now summary row) · Saved for later → Library ›
Watchlist · New in your library → Library › Titles shelf · Wrapped banner → Right now row · 2 mood rows → Moods
(Today tiles) · Pick line → Moods tile + Live.

### 2.2 Right now: rules

- **Anatomy:** a heading ("Right now" / "Just nu") followed by up to 3 rows of 56 px each. A row has a 40×60 thumb
  or icon, a title line, a sub line and **one quiet chip action**. It is never lit: the billboard's Play stays the
  page's one lit button. Tapping the row opens the item's home; the chip performs the action.
- **Kinds, in priority order** (top 3 shown; kinds of the same type collapse into one summary row):

| # | Kind | Condition | Row | Chip → action | Row tap → |
| --- | --- | --- | --- | --- | --- |
| 1 | party | you're host/joined, starts ≤12 h or is live (`loadParties`) | "Watch party 21:00 · The Odyssey" | Join → room | Live › Watch with someone |
| 2 | leaving | own file, `expiresAt − now < 48 h`, not `me.keep` | "Evil Dead Burn leaves tomorrow" / "3 titles leave within 2 days" | Keep N more days (only if rules allow; else no chip) → `extendItems` | title page / Titles sorted Leaving soonest |
| 3 | attention | own download `attention` | "1 download needs a look" | See → Library › Downloads | same |
| 4 | preparing | conversion for a title you started | "Preparing playback · 45 %" | — | title page |
| 5 | ready | finished ≤24 h ago, never played | "Dune is ready" / "3 new titles ready" | Play (quiet) | title page / Titles › New |
| 6 | wrapped | `status.wrapped` season, not opened or hidden | "Your Lilin Wrapped 2026" | Open → `openWrapped` | same |
| 7 | phone | travel copy ready (touch only) | "2 copies ready on this phone" | Open → `openTravelList` | Library › Downloads › On this phone |
| 8 | on the way | own active transfers, no attention | "2 on the way · Dune 64 %" | — | Library › Downloads |

- **Dismiss:** only *ready*, *wrapped* and *phone* get a ✕. The choice is saved per device
  (`localStorage['lilin.rn.hidden']`, id + time). The other kinds resolve themselves. Wrapped's ✕ says "Still in
  You" (same as today's banner).
- **Empty:** the whole strip is absent. There's no empty state and no reserved space.
- **Updates:** rebuilt on `renderDiscover` and on library/transfer/party SSE. Percentages update **in place** (text
  node + bar width, at most 1/s). If a row is added or removed while `scrollY > strip.offsetTop`, the change waits
  until the next view render, so there's no layout jump above the reader.
- **Start view = Library:** the same component renders at the top of Library › Titles instead, and Discover shows
  none.
- **Text:** all strings through `T()` with Swedish. Plurals use `plural()`. a11y: a `<section aria-labelledby>`
  with a list of `<li>`, and the chips have their own labels ("Keep Evil Dead Burn 7 more days").

### 2.3 Control row

- Markup: `div.discover-controls` containing `.segmented` (All · Films · Shows · Documentaries) and a `button.chip`
  "Genres ▾" (`aria-expanded`). Opening it shows the existing inline `genre-chips` wrap under the row at **every
  width** (today's desktop behaviour), which deletes the Browse sheet. A picked genre turns the chip into "Comedy ✕"
  (`aria-pressed`).
- Position: in the page flow under the billboard + Right now. **Not** absolute over the billboard, not sticky, no
  glass.
- Phones: one line that scrolls sideways (`overflow-x:auto`, hidden scrollbar, static right-edge mask). At 390 px,
  All, Films, Shows and Documentaries are fully visible and Genres is half-visible, which signals the scroll
  (`A/discover-phone.png`).
- After scrolling, re-tapping Discover scrolls to the top. That already works: `setView` scrolls to top when the
  view is unchanged.
- Hidden while searching (`body.searching`). The wordmark still resets type, genre and mood.
- Header on phones: the Browse ▾ button goes, leaving 4 controls on every tab.

### 2.4 Library

**Shell:** heading "Library" · shared note line (when `libraryMates()`) · `.segmented` with **Titles · Watchlist (n)
· Downloads (n)**.
- Count rules:
  - Watchlist n = saved + followed.
  - Downloads n = active + attention + preparing. The count is lit (bulb) only when attention > 0.
  - The tab badge `#dl-badge` stays as it is today.
- Segment = URL: `#library`, `#library/watchlist`, `#library/downloads`.
- Tab stack: re-entering Library restores the last segment. Re-tapping on Titles scrolls to the top.
- Only the active segment's DOM is built.

| Segment | Blocks, in order | Empty state |
| --- | --- | --- |
| **Titles** | (Right now, only for accounts that start on Library) · toolbar: All/Films/Shows · **Sort ▾** (Newest · Recently watched · Leaving soonest · A–Z, saved with `saveMe({librarySort})`) · **Filter field** (funnel icon, so it can't be mistaken for the header search's magnifier; phones: the icon expands into a field; desktop: an inline 220 px field; `state.libQuery`, separate from the header's `state.query`) · shelf **New in your library** (today's 21-day rule, ≤16) · shelf **Leaving soon** (<48 h) · grids Films · Shows · Unidentified · footer line "214 titles · 1.2 TB · next to go: X in 2 d · Keep" (Settings' Your library card moves here and links to Leaving soon) | Empty library: "Your library is empty" + "Find something to watch" → Discover (exists today). Filtered to nothing: today's `filteredText()` + "Show all titles" |
| **Watchlist** | **Coming up** (dated rows: date block, thumb, title, sub, Follow switch for shows; from `comingUpShelf` data) · **Saved** (released and not in your library: poster grid with Add/Download state) · **Following** (shows with the auto-download switch) | "Nothing saved yet. Tap Save on a film or Follow on a show, and it waits here with its dates." + "See what's coming soon" → Coming soon page |
| **Downloads** | header actions: Find torrents (+dl and TORRENTS) · All server downloads (O) · **Preparing playback** (`renderConvertBanner` content) · **Needs attention** · **On the way** (rows: thumb, title, state, %, ⋯ → `openTransferDetails`) · **On this phone** (touch devices always, desktop only when copies exist; `openTravelList` content) · source notices | Downloads: "Nothing on its way. Downloads you start show their progress here." (+dl: "Find something to add" → Discover). On this phone: "Copies you save to watch offline show here." |

Cards in the Titles grid: poster, New badge, expiry badge, progress bar, and a **slim 3 px transfer bar** for
downloading titles. The `.library-transfer` panel and the `.library-more` '•••' button go; details are on the title
page and in Downloads › ⋯.

**Per role:** owner: + All server downloads + Unidentified, and Identify sits in the title ⋯. Member and H: as
above. Restricted: no Find torrents and no download actions when `!canDownload()`; Watchlist works (Save/Follow is
"All"). New member: Titles empty state, an empty Watchlist, and a Downloads segment showing its empty state.

### 2.5 Files and functions

| File | Change |
| --- | --- |
| `public/index.html` | remove `#browse-btn`; move `#find-torrents` and `#manage-downloads` out of `.library-heading-row` into the Downloads segment; add `#library-seg` |
| `public/app.js` | `renderDiscover`: new block list (2.1); delete `onItsWayRow`, `moodRow`/`todaysMoods`/`MOODS` (→ vibes.js), `wrappedBanner` (→ right-now.js); merge `becauseRow` + `topPicksRow` → `forYouRow` (See all = per-seed groups); `discoverFilters` → `discoverControls`; delete `openBrowse`, `updateBrowseButton` and the `#browse-btn` lines in `setView`/`renderDiscover`. `renderLibrary`: segment router; Titles keeps the card diffing (`libraryCards`, focus anchors); delete the Availability `select`, `summary`/`travel` buttons and the Continue shelf; add the filter field + footer; `makeUnifiedCard` drops the panel and '•••'; `savedShelf`/`comingUpShelf` → watchlist.js; `loadParties`/parties shelf → live.js + right-now.js; `renderConvertBanner` → Downloads. `setView`/`linkedView`: `library/<seg>` + aliases (2.7). `renderSettings`: Library order row and Your library card leave. Player "Can't play here" text → link `#library/downloads`. Download/Save toasts link to their segment |
| `public/right-now.js` (new, ~120 lines) | `rows(state)` → ranked kinds; `render(slot)`; in-place progress updates; dismissals |
| `public/vibes.js` / `vibes.css` | absorb `MOODS` as genre-backed vibes (dedupe); Today ×2 lead the row; slot for the Pick tile |
| `public/match.js` / `match.css` | `entry(signal)` → `tile(signal)`, a `.vibe-tile` with the two-cards glyph and the static "is going" state; `.pick-entry*` CSS goes |
| `public/watchlist.js` | the Watchlist segment (Coming up / Saved / Following) |
| `public/coming-soon.js` | one-tap Save/Follow toast → "Saved · Watchlist" |
| `public/library-downloads.js`, `public/travel.js` | the Downloads segment sections; On this phone as an always-present section |
| `public/social.js` | `partiesShelf` data reused by Live and right-now.js |
| `public/i18n-sv.js` | ≈ 35 strings: Right now = *Just nu*, Titles = *Titlar*, Watchlist = *Bevakat*, For you = *För dig*, Popular = *Populärt*, Top rated = *Högst betyg*, Recently watched = *Senast sedda*, Filter your library = *Filtrera biblioteket*, the row texts and empty states |
| `public/sw.js` | cache version |
| `src/` | **no change** (client merges; `START_VIEWS` already holds `library`/`downloads`) |

### 2.6 CSS (my area; baseline app CSS 364,654 B)

| Deleted | ≈ B |
| --- | ---: |
| `.browse-btn`, `.browse-types`, `.browse-type`, `.browse-head`, `.browse-genres`, the 3 `@media` hide rules (incl. 1 `!important`) | 1,430 |
| over-billboard `.discover-filters` variants (`body.has-billboard …`, `body.bb-trailer-live …`, phone segmented overrides; 1 `backdrop-filter`) | 1,400 |
| `.wrapped-banner*` (the Discover teaser; `.wrapped-open` belongs to the You owner) | 1,100 |
| `.pick-entry*` (match.css) | 1,700 |
| `.library-toolbar`/`.library-availability` select | 530 |
| summary + travel summary buttons | 970 |
| `.library-transfer` card panel (keep the `transfer-*` rules that Downloads rows and the details sheet reuse) | 1,500 |
| `.library-more` | 320 |
| **Out** | **≈ 8,950** |

| Added | ≈ B |
| --- | ---: |
| `.right-now` rows (reuse `.chip`, `.face`, `.poster-progress`) | 900 |
| `.discover-controls` (reuse `.segmented`, `.chip`, `.genre-chips`) | 250 |
| Library segment bar + counts | 200 |
| Watchlist date rows | 600 |
| Titles filter field + footer line | 350 |
| slim card transfer bar | 120 |
| Pick tile glyph | 200 |
| **In** | **≈ 2,600** |

**Net ≈ −6.3 KB** for Discover + Library. Drift counters: `backdrop-filter` −1, `!important` −1, `@media` −4, no new
`@keyframes` or `infinite`.

### 2.7 Old hashes and redirects

| In | Lands | How |
| --- | --- | --- |
| `#discover` | Discover home | as today |
| `#library` | Library › Titles | as today |
| `#library/watchlist`, `#library/downloads` | segment | new |
| `#downloads` | Library › Downloads | `replaceState` to `#library/downloads` (today it sets `libAvailability='downloading'`) |
| `#watchlist` | Library › Watchlist | `replaceState` |
| `?travel=1` (+`#library`) | Library › Downloads, scrolled to On this phone, list sheet open | as today's handler, new target |
| push `/#library` (download ready) | Titles | unchanged; no server change |
| saved start view `discover` / `library` / `downloads` | Discover / Titles / Downloads (+ Right now follows it) | `START_VIEWS` unchanged |
| `?wrapped=` | Wrapped story | unchanged |

`linkedView()` becomes a page table, `{ 'library/watchlist': { tab: 'library', seg: 'watchlist' }, … }` (B's
idea), instead of `.tab[data-view]` matching. Unknown or forbidden pages fall back to the start view, as today.
Every alias uses `replaceState`, so Back never bounces.

### 2.8 Scroll performance

- **Discover gets lighter:** 12 blocks at most, down from 21. That's 6–9 fewer carousels, and roughly 150–200
  fewer poster `<img>` on a full scroll (~20 cards per row), at roughly 3,600 px on a phone instead of 5,669. One `backdrop-filter` goes
  (the filters over the billboard), which matters under the desktop trailer. Keep `content-visibility:auto` on
  `.shelf-items` (style.css:757).
- **Right now** is plain DOM with 40×60 lazy thumbs and no animation. Risk: a late party fetch inserting a row above
  the reader causes CLS. The deferral rule in 2.2 covers it. Measure with `tools/ui-shots/scrollperf.mjs`, plus a
  CLS probe on a cold load.
- **Moods row** grows to about 31–41 gradient tiles: three `radial-gradient`s each, no images. Add
  `content-visibility:auto` to `.vibe-tiles` if scrollperf shows paint cost. The Pick tile's "is going" state is a
  static glow, never a pulse.
- **Library › Titles:** removing the per-card transfer panels takes per-tick transfer DOM writes off the whole grid,
  which is a win for 200+ cards during downloads. Add `content-visibility:auto; contain-intrinsic-size` to
  `.lib-group`. Only the active segment is in the DOM, and Downloads subscribes to transfer ticks only while it's
  visible.
- **Control row:** a static mask, no sticky, no glass. The Firefox no-glass path has one blur fewer to strip.
- **Gate before ship:** scrollperf on Discover (phone + desktop with trailer) and Library Titles (214 titles,
  downloads active). Neither may get worse than the `b85d964` baseline.

### 2.9 Tests to add or update

- `deep-links` (new): every row of 2.7 for owner, member, R and H.
- `right-now` (new): ranking, collapse, dismissals, start-view follow, R/H gates, empty → absent.
- Update: `library-downloads-ui`, `download-ui`, `library-refresh`, `travel`, `watchlist`, `vibes`, `match`,
  `coming-soon`, `carousel`, `i18n` (Swedish coverage).
- A CSS budget counter test (the fleet open item) on top of the `b85d964` numbers.
