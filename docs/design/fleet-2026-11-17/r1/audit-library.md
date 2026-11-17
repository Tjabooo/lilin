# Audit: Library, film/show pages and their sheets (round 1)

Scope: Library view (toolbar, groups, Continue watching, Coming up, Leaving soon, transfer cards, convert banner,
watch parties, empty states), film and show pages (facts, actions, keep bar, seasons, episode rows, missing/pending
episodes, versions, Upgrade) and the sheets from there (Play on TV, remote/nowbar, delete, identify, Download to
phone, transfer details, Continue ⋯ menu, release browser).

Evidence: live shots `/tmp/lilin-fleet/shots-live/` (EN, 4 sizes), Swedish phone `/tmp/lilin-fleet/shots-library-sv/`,
extra scenes `/tmp/lilin-fleet/shots-library-x/` (downloads, busy library, picker with devices, travel list,
download-only pages, season bottom, ⋯ menus; scene file `/tmp/lilin-fleet/scratch-library/tool/my-scenes.mjs`).
The LAN identity is a non-owner with download rights, so Identify film and owner-only bits were checked in code only.
Caveat: the yellow focus ring on the sheet ✕ in phone shots comes from `showSheet` focusing `.sheet-close`
(app.js:2478) with no prior pointer input in headless Chrome. Check it on a real iPhone before treating it as a bug.

Severity: **broken** (wrong or dead), **inconsistent**, **ugly**, **polish**.

---

## A. Library view

### A1. A busy day pushes the first title more than a screen down (not fixed since the pre-revamp audit) (ugly)
- Where: `renderLibrary` app.js:1458-1462 (stack order), shots `x-lib-busy--phone--en.png`, `library--phone--sv.png`.
- What: before any title, phone shows: convert banner (one card per job, raw file names, 4-6 lines each) →
  segmented filter → "Availability" label + select (its own row on phone) → a permanent 2-line "Shared library
  with Pappa and Anita…" sentence → "4 downloading · 1 needs attention" pill → "3 for your phone…" pill →
  Watch parties cards. With two conversions and one party, Continue watching starts at y≈1200 on a 390×844 screen.
  `docs/design/audit.md` already reported "Filters, an availability select and three notes stack before any title
  appears". Since then the list has grown.
- Fix: (1) move the shared-library sentence to Settings → Your library and show it at most once (a dismissible
  hint, or a tooltip on the heading); (2) put the downloading and phone pills in one horizontal row of chips under
  the toolbar (they're already pill-shaped), `flex-wrap: nowrap; overflow-x: auto`; (3) on phones collapse
  Availability into the segmented row as a filter icon button that opens a small menu (All / Ready / On the way /
  Needs attention + the sort from Settings, see A6); (4) see A2 for the banner.

### A2. The convert banner is the loudest thing on the page, for a job that needs nothing from anyone (ugly / inconsistent)
- Where: `renderConvertBanner` app.js:1408-1441, `.convert-banner` style.css:1556. Shots `library--desktop--en.jpg`,
  `x-dl-details--phone--sv.png`.
- What: a full-width card at the very top of Library: "Preparing playback: Evil Dead Burn (2026) (1080p BluRay x265
  Ghost).mp4", purpose line, 30-bulb progress bar, "28.8 % · re-encoding · 17.7x speed · 5 min left · 1 more waiting".
  Every user sees it, family included, and it shows the raw file name with the release group and codec. The purpose
  text itself says "You can already watch it." When several jobs run, one card is stacked per job. The "N files
  couldn't be converted" failures list shows ffmpeg errors to everyone.
- Why: it's a server chore. The title card is where people look, and it can already carry a "Preparing" pill
  (`transfer-pill`, app.js:1576).
- Fix: drop the banner for non-owners. On a title, show "Preparing" on the card and a one-line note on the
  title page (the film page already has a `pack-transfer` style line for this). Owners get one compact line
  ("Converting 2 files · 5 min left ›") that opens a sheet with the details and failures. Show the title, not the file
  name (`cur.title || prettify(cur.name)`).

### A3. Transfer badge is truncated in Swedish and fights the ⋯ button (broken)
- Where: `.transfer-pill` style.css:482-497 (shares rules with `.on-server`), `updateUnifiedCard` app.js:1576,
  `.unified-card:has(.transfer-pill) .library-more { top: 38px }` style.css:2756. Shot `owner-downloads--phone--sv.png`.
- What: "Behöver åtgärdas" is clipped to "Behöver åtgärd" on 3-column phone cards. `.on-server` collapses to a dot
  under `@container (max-width: 132px)` but `.transfer-pill` doesn't. To make room, the 40 px "•••" button is pushed
  down to 38 px, so on an error card it sits in the middle of the poster.
- Fix: give `.transfer-pill` the same narrow-card collapse (an alert-coloured dot or a "!" glyph with the text in
  `aria-label`), or use shorter labels ("Fel" / "Error", "Pausad"). Keep ⋯ in the corner.

### A4. Two different "more" buttons on neighbouring shelves (inconsistent)
- Where: Continue watching `.continue-more` (32 px, `icon('more')` SVG, `top/right: 7px`, style.css:2899) and
  library cards `.library-more` (40 px, literal text `'•••'`, `margin: 4px`, `letter-spacing: 1px`, app.js:1546,
  style.css:2755).
- Fix: one `.card-more` component (36 px, SVG icon, same inset), used by both.

### A5. Card captions repeat what the section already says (polish)
- Where: `libraryAvailability` library-downloads.js:74; `.sub` on unified cards.
- What: every ready film card in the "Films" group reads "Ready to watch" ("Kan ses nu"), and every download card reads
  "Film". It's noise, and it uses the one caption line that could carry something useful.
- Fix: ready film → year, or "8 min left" when started; download → its state (already shown in the transfer
  line, so blank is fine); shows → "S3 · 4 of 8" (see A10).

### A6. Sort order is only in Settings (polish)
- Where: `librarySort` is read in app.js:1472 and set only in Settings (app.js:7773: Newest / Leaving soonest / A–Z).
- Why: "what's about to be deleted" is a library question. Nobody goes to Settings to answer it.
- Fix: add Sort to the toolbar menu proposed in A1; "Leaving soonest" pairs naturally with the Leaving soon shelf.

### A7. "Time left" is computed and worded three different ways (inconsistent)
- Where: `timeLeft` app.js:579 (`Math.floor` hours, `Math.round` days, "Deleting soon" / "Deleted within the hour" /
  "{0} h left" / "{0} days left"); `libraryCard` app.js:1725 and `continueCard` app.js:1665 (`Math.ceil`, "<1h left",
  "{0}h left" / "{0}d left", "Leaving soon"); `updateUnifiedCard` app.js:1561 (`<1 h` → "Leaving soon", no "<1h left").
- What: one file can read "3d left" on its card and "2 days left" on its episode row (2.4 days: ceil vs round), or
  "5h left" against "4 h left". Swedish adds "Försvinner snart" next to "Raderas snart" for the same moment.
- Fix: one `expiryLabel(ms, { short })` helper in app.js, used by all four places, with one rounding rule (ceil) and
  one vocabulary.

### A8. "No matching titles" is a dead end (polish)
- Where: app.js:1517-1521, shot `x-filter-empty--phone--en.png`.
- What: heading "No matching titles", body "No titles match these filters." (says the same thing twice) and nothing to
  press. The filter that caused it (Availability: Needs attention) sits two rows up.
- Fix: body names the active filter ("Nothing needs attention right now."), plus a "Show all titles" button that
  resets `libFilter`/`libAvailability`/the query.

### A9. Empty library still shows the filter toolbar and shared note (polish)
- Where: app.js:1458-1462 (toolbar always rendered), shot `owner-library-empty--phone--sv.png`.
- Fix: hide `.library-toolbar` and `.library-shared` while `all.length === 0`. The empty state is good otherwise.

### A10. Sparse libraries waste the screen on desktop/TV (polish)
- Where: groups `movie/tv/unknown` app.js:1456. Shots `library-grid--tv--en.jpg`, `library--desktop--en.jpg`.
- What: with "All" chosen and one film + one show, you get two headed groups with one poster each. Two thirds of a
  1920 px screen stay empty and the page scrolls anyway.
- Fix: when the "All" filter is chosen and the library is small (say fewer than 2 rows per group), render one mixed
  grid. The segmented filter already does the Films/Shows split.

### A11. Smaller Library issues
- **Swedish group name** "Oidentifierad" should be plural "Oidentifierade" (heading for a group of titles) (polish).
- **Downloading pill double-counts**: "4 downloading · 1 needs attention" counts the errored one in both
  (`active` includes attention entries, app.js:1474). Use `active - attention` (polish).
- **Phone pill wraps**: "3 for your phone · 1 ready · 1 being made · 1 failed" wraps to two lines inside a
  999 px-radius pill (`x-lib-busy` crop). Clamp to one line with ellipsis, or show "3 for your phone · 1 failed" only
  (polish).
- **Poster fallback breaks words**: `.poster-fallback { overflow-wrap: anywhere }` (style.css:465) gives
  "Oppenheim/er" on narrow cards. Use `overflow-wrap: break-word; hyphens: auto` with `lang` set (ugly).
- **"Find torrents" in the Library header** (index.html:102): torrent jargon on a family page. It opens the Discover
  release browser with the current filter text. Move it into the search sheet in Discover, or behind ⋯ (polish).
- **Watch parties**: Cancel uses native `confirm()` (app.js:4891). That's the only native dialog in these flows;
  everything else confirms in the picker sheet (inconsistent). `social.planPartyBody`/`plannedBody`
  (social.js:149-178) have had no caller since 12fac9e removed planning: dead code (polish).

---

## B. Film page (`renderFilm`, app.js:1819-1866)

### B1. Library film page and Discover title sheet are two different pages for the same film (inconsistent)
- What: from Discover the same owned film opens `renderDetails` (app.js:2785-2805) with a **version picker**
  (`filmVersionPick`, line 2799), "In your library" fact and filmActions. From Library it opens `renderFilm`, which
  has **no version picker** (a film with 4K + 1080p versions can't choose what Play starts here), no Upgrade, but has
  To phone / Delete / Identify. Facts differ too (Library adds "MP4 · 4.9 GB").
- Fix: one title page. Make `renderFilm` call `filmVersionPick` (minimum), and longer term render the same
  component with a "library" mode, so facts/actions/versions can't drift again.

### B2. Five equal-weight actions; Delete sits with the everyday ones (ugly)
- Where: `.library-film-actions` app.js:1852-1857; shots `library-film--phone--sv.png` (Delete alone on a third row),
  desktop row `Resume · Play on TV · To phone · Delete`.
- What: Delete has the same chip style and position as Play on TV. For owners, "Identify film" is the only chip
  without an icon. The revamp spec says "primary action, secondary actions as icon+label buttons". A destructive one
  belongs with them only if it's visually separated.
- Fix: Play + Play on TV + To phone in the row. Delete and Identify go into a ⋯ "More" chip (the same `rowMenu` that
  episode rows already use, app.js:627), with Delete marked `is-danger`.

### B3. Facts row wraps with a leading dot (ugly)
- Where: `.facts li + li::before` style.css:1047; shot `library-film--phone--sv.png` line 2 reads "• MP4 • 4.9 GB".
- Fix: put the separator on the item before (`li:not(:last-child)::after`) with `margin-right` inside the item, or
  use `column-gap` with a background dot via `::before` that is hidden on the first item of each line (only possible
  with the ::after trick). Also consider dropping "MP4 · 4.9 GB" from facts. It's file trivia. Show it in the Delete
  sheet, where size matters.

### B4. Keep bar for kept films is noise (polish)
- Where: `keepBar` is-kept branch app.js:1750 ("Kept in your library / No automatic deletion scheduled.").
- Fix: render nothing when nothing is scheduled; it's the default state for many libraries.

### B5. Size disagrees between page and Delete sheet (polish)
- Facts say 4.9 GB (`f.size`), Delete says "5.0 GB will be freed" (server adds extras: MP4/browser copies, subs,
  server.js:5171). Say "5.0 GB with its copies", or show the same number in both.

### B6. Download-only page is bare and has no way out except "Details" (ugly)
- Where: app.js:1824-1826 (entry with transfers, no files); shots `x-dl-film--phone--en.png`,
  `x-dl-error-film--phone--sv.png`.
- What: title + "Film" + a progress card with Pause/Retry and a "Details" link. No poster or overview (even when
  `d.tmdbId` is known), no Cancel (two taps away inside Details), no Play on TV for Play now. On error, the
  bar stays bulb-yellow at 63 % and the only text is "Needs attention", with no reason and no hint.
- Fix: when `tmdbId` is known, open the regular title page (`openDetails` already embeds `transferSummary`). Add a
  "Cancel download" chip next to Pause. In error state, colour the track `--alert` and print the qBittorrent reason
  ("Download stopped with an error. Retry, or cancel and add it again.").

---

## C. Show page and seasons (`renderShow`, app.js:1958-2035)

### C1. Two (three) yellow primaries on one page (inconsistent with the design system)
- Where: `title-actions` app.js:2022: `showPlayButton` (full-width yellow) + `tv.toggle` "More episodes" (yellow
  `action-btn`) + keep bar "Keep all 4 · 30 more days" (yellow `play-btn`, app.js:1762). Shots
  `library-show--phone--sv.png`, `library-show--tv--en.jpg`.
- What: revamp.md: "primary (bulb, one per surface)". On the show page Play competes with More episodes, and on
  desktop Play is stretched to 360 px while the film page's Play is auto-width (`.library-film-actions > .play-btn`
  `flex: 0 0 auto` vs `.title-actions` grid).
- Fix: Play stays primary. "More episodes" becomes a secondary (surface) button. The keep bar button becomes a chip
  styled like `.library-keep` (bulb-dim). Use the same Play width rule on film and show pages.

### C2. "You're all caught up." on a show where nothing has downloaded yet (broken)
- Where: `showPlayButton` app.js:1950-1953 returns the caught-up line whenever `nextUp` is null; shot
  `x-dl-show--phone--en.png` (Severance, season pack 18 % "In line").
- Fix: only say caught up when `files.length > 0`. With no ready files, show nothing, or "First episode plays as
  soon as it's here".

### C3. Download-in-progress show page says the same thing four times (ugly)
- Same shot: facts "Season on its way", the transfer card "In line 18 %", heading "Season 2 / 0 episodes ready", and a
  boxed "Season 2 pack / Episode availability is shown when individual files are verified." + "Season pack details".
  "Remove from my library" sits above it all as the first button.
- Fix: one transfer card (state, %, Pause, Cancel). Hide "0 episodes ready" when 0. Put the pack note in the card as
  one muted line. Move "Remove from my library" into a ⋯ menu (same as B2).

### C4. Missing episodes ignore air dates and offer "Add" for unaired ones (broken)
- Where: missing rows app.js:2001; the library show cache stores only `name` + `still` per episode (src/shows.js:116),
  and `fillEpisodeDetails` (app.js:1937) adds runtime + overview but no date. Shot `x-season-missing--phone--en.png`:
  "5. Episode 5 · Not added yet · [Add]" ×4 with the show backdrop repeated as the still.
- What: Discover's episode list (`episodeItem`, app.js:2744) shows "Airs 3 Dec 2026" and is otherwise the same list.
  These are two implementations of one list, and the Library one is behind.
- Fix: carry `air_date` in shows.js (or fill it in `fillEpisodeDetails` from `/api/tv/:id/season/:n`, which already has
  it). Unaired: "Airs 3 Dec", no Add button, and a muted still. Aired but missing: "Not added yet · Add".

### C5. Episode rows are tall and repeat the same actions on every row (ugly)
- Where: `fileRow` app.js:641 + `expiryBits` app.js:588; style.css:2913-2938. Shots `library-season--phone--sv.png`,
  `library-season--desktop--en.jpg`.
- What: each phone row stacks title, 3-line overview, "1 h 14 min · MP4 · 10.1 GB", "• 3 days left", a yellow
  "Keep 30 more days" link, then a separate line with ⋯ and a round Play. That's about 250 px per episode, and the
  Keep link repeats on all four rows directly under the keep bar that already offers "Keep all 4". The still is also
  a play target, so there are two Play controls per row. The overview arrives late (`fillEpisodeDetails`), so rows grow
  after first paint (seen: the same scene shot once with overviews and once without).
- Fix: drop the per-row Keep link when the keep bar covers the season (show it only on the row that's about to go,
  or in the ⋯ menu). Drop "MP4 · 10.1 GB" from rows (it's in Delete). On phones, put ⋯ and Play on the title line (grid
  column 3) instead of a new line, or rely on the still as Play and keep only ⋯. Reserve 2 lines of overview height
  (`min-height`) to stop the jump.

### C6. Episode titles stay English in Swedish (inconsistent)
- Where: show cache names from TMDB in English (src/shows.js:116-118); shot `x-season-head--phone--sv.png`
  ("The Gift of Men", while the overview arrives in Swedish from `fillEpisodeDetails`).
- Fix: let `fillEpisodeDetails` also replace `.row-title` with the localised `ep.name` (it already fetches it).

### C7. Smaller show-page issues
- **"Klara: 4" in the facts row** (`libraryAvailability`, library-downloads.js:78; sv "{0} ready" → "Klara: {0}") sits
  between "Serie" and the age badge. It reads like a label, not a fact. Use "4 avsnitt klara" / "4 episodes ready"
  (polish).
- **"Series" vs "Shows"**: the fact and the missing-show heading say "Series"; the filter and group say "Shows"
  (inconsistent).
- **Missing show state** (app.js:1961) is a bare `h2 Series` + one sentence. The film equivalent uses `emptyState`
  with a "Back to your library" button. Use that here too (inconsistent).
- **"Ready · watch it from Details"** on a pending row (app.js:2000, 2290) sends people to the transfer sheet to
  play an episode. Make the row's Play button play it (`playNowItem`) and drop the instruction (polish).
- **Season to phone uses `.delete-many`** (app.js:2007), so it turns red on hover/focus (style.css:2450) (broken).
  Give it its own class.
- **Upgrade explanation always visible** ("Looks soft? Finds a clearly better release…", app.js:3411): 3 lines on
  phone for an action most seasons never need. Make it the button's `title`/a small ⓘ, or show it after the first press
  (polish).
- **Season to phone** offers no Full quality option and no total ("About 230 MB per half hour"). Show "≈ 2.1 GB for
  4 episodes", computed from runtimes (polish).

---

## D. Sheets

### D1. Play on TV
- **Ugly subtitle for episodes**: `name = [file.title, episodeLabel(file)].join(' ')` (app.js:3508) prints the
  filename-derived "The Lord Of The Rings The Rings Of Power S03 E01" (shot `x-ep-menu--phone--en.png`). Use the
  show title + "· S3 E1 · Marnûkh" (broken).
- **"Or from this phone" / "this phone's own list" on desktop** (app.js:3514-3520): desktop Chrome qualifies via
  `canCastFromBrowser`, so the copy says "phone" on a laptop and a TV-size window (shot `picker--desktop--en.jpg`). Use
  "this device"/"this browser" off touch screens (broken wording).
- **"Search again" is shown during the search** (disabled, app.js:3511/3528) right under "Looking for TVs…". Hide it
  until the first result (polish).
- **"Open its remote"** sits loose under its device card (`device-remote` chip, app.js:3567). Put it inside the card's
  right side so it reads as part of that TV (ugly).

### D2. Remote + nowbar
- Phone remote (shot `owner-remote--phone--sv.png`) is mostly empty: title, state, scrubber, transport, volume, Stop.
  No artwork, and nothing to show which episode is playing beyond `session.subtitle`. Add the backdrop/still behind the
  title (as `.up-next-art` already does), and subtitle/audio pickers if the cast type supports them (polish).
- Stop is coral text on a pill (good), but it's the only control on the sheet that ends the session. Keep it
  well clear of the volume slider on small phones. It is today; just don't regress it.

### D3. Delete
- Good: Keep it is focused, Undo toast, sharing explained.
- `plural(info.others, T('other person has'), …)` passes already-translated strings into `plural`, which calls `T()`
  again (app.js:3640). This is harmless today but breaks if a Swedish string is also an English key (polish).

### D4. Download to phone
- **List sheet prints `false`**: `openTravelList` ends `replaceChildren(..., items.length > 0 && h('p', …))`
  (app.js:783). Removing the last copy redraws with 0 items and prints a bare "false". The pre-revamp audit reported
  this exact bug in `openTravel`. That one was fixed (comment at app.js:733), this sibling wasn't (broken).
- **Swedish subtitle duplicates the heading**: `travelSummary(items).replace(' for your phone', ' copies')`
  (app.js:766) only works in English. Swedish shows "Till din telefon / 3 till din telefon · Klara: 1 · 1 skapas"
  (shot crop `scratch-library/sv-travel-crop.png`). Build the count with its own T key ("{0} copies") (broken i18n).
- **Quality label untranslated in the list**: rows print the server's `item.label` ("Small · 480p") raw (app.js:769).
  `openTravel` wraps it in `T()`. Same fix here (broken i18n).
- The film sheet's Small row puts its note on the size line ("About 803 MB · For a phone screen"), while Standard's
  wraps to its own line. Give `.row-meta` spans `display:block` for the note so all rows match (polish).
- The 5-line footer explanation could become 2 lines: "Small and Standard are made on the server first. We'll notify
  you when they're ready." (polish).

### D5. Transfer details
- Title "Dune: Part Two downloads" / sv "Dune: Part Two nedladdningar" (app.js:2264) wraps badly next to ✕
  and is ungrammatical in Swedish. Use the heading "Download" + subtitle with the title, like other sheets
  (`picker-sub`) (ugly).
- "Pause" and "Cancel download" are identical chips side by side (shot `x-dl-details--phone--sv.png`). Mark Cancel
  `is-danger` like the row menu does (polish).
- An empty "Files" disclosure row shows for single-file torrents. Hide it when `files.length < 2` (polish).

### D6. Continue watching ⋯ menu (app.js:1681-1714)
- Both options are full-width `del-cancel` buttons: one has an icon, the other doesn't. There's a text "Cancel" as
  well as the ✕ (shot `x-continue-menu--phone--sv.png`) (inconsistent).
- Missing obvious actions: "Go to show/film" (tapping the card starts playback, so the ⋯ is the only path to the page
  from here), "Play from the beginning", "Play on TV" (polish → dead end for "I want the episode list").

### D7. Identify film (owner, code only, app.js:1868-1909)
- Shows `File: <raw filename>` as a muted line, which is fine for the owner. Results are buttons with posters, OK. The search
  input has no visible label (only aria-label). The pre-filled value is `f.title` (filename-derived), so the first
  search often fails for "The.Movie.2019" style names. Prefill with the parsed title + year (polish).

---

## E. Previous-audit check (docs/design/audit.md)
- Fixed: five round icon buttons per episode row → one ⋯ + Play (fileRow comment app.js:657). Episode descriptions
  and runtimes added. Empty library has the lilin sign. Download-to-phone `false` fixed in `openTravel`. Swedish
  "For a phone screen" lines translated in that sheet.
- **Not fixed**: "Filters, an availability select and three notes stack before any title appears" (now worse, A1).
  "Seasons are a poster grid you have to open before you see any episode" (revamp.md promised "seasons as tabs with
  episode rows"; multi-season shows still use `.season-grid`, app.js:1984). "Transfer cards visually detached" is
  partly addressed (inline transfer line on the card).
- New regression of an old bug: `false` in `openTravelList` (D4).

---

## Ideas

1. **Season tabs instead of the season poster grid** (the revamp spec item that never landed). Pitch: a
   segmented row "S1 S2 S3" above the episode list on show pages, opening on the season with your next episode.
   For: everyone who watches shows (the family on phones especially, one tap less every evening). Fits Lilin:
   `nextUp` already knows the right season, and the Discover episode browser already uses a list. Effort: M.
   Exists: no (grid + "All seasons" back chip).
2. **"Keep the next one" rather than per-episode Keep links.** Pitch: auto-delete countdown shown once per show
   ("Next to go: S3 E1 in 3 days"), with Keep in the keep bar and in the ⋯ menu. Rows lose the yellow link. For:
   people who finish shows slowly (Pappa/Anita). Fits: 7-day auto-delete is Lilin-specific and currently
   repeated on every row. Effort: S. Exists: partly (keep bar).
3. **Toolbar "View" menu: sort + availability + density.** Pitch: one icon button next to All/Films/Shows that holds
   Availability, Sort (Newest / Leaving soonest / A–Z, now in Settings) and "Group by type" on/off. For: Oliver and
   ebi with bigger libraries. Fits: frees two phone rows (A1) and moves the sort to where it's used. Effort: S-M.
   Exists: sort in Settings only.
4. **One title page for Discover and Library.** Pitch: merge `renderFilm`/`renderShow` with `renderDetails`, so
   versions, Upgrade, cast, reviews and downloads behave the same wherever you open a title. For: every user. Fits: B1
   and C4 are both drift between the two paths. Effort: L. Exists: no (two implementations).
5. **Upgrade for films.** Pitch: the season Upgrade (finds a clearly better release, swaps it when done, keeps
   progress) on film pages and in the player Quality menu for films. For: Oliver/ebi when a soft 720p WEB-DL was
   the first thing found. Fits: `upgradeState` + versions already exist; only `type: 'tv'` is wired. Effort: M.
   Exists: TV seasons only.
6. **Air-date aware missing episodes + "Get it when it airs".** Pitch: unaired rows say "Airs 3 Dec" with a bell
   (Follow) instead of Add. Aired-but-missing rows get Add. For: people following running shows. Fits: Follow and
   auto-download already exist in watchlist.js. Effort: S-M. Exists: Discover's episode list shows dates; Library's
   doesn't.
7. **"Up next tonight" on the remote.** Pitch: the phone remote shows the still/backdrop, the episode name and a
   Queue next episode toggle, so parents on the Samsung TV can be steered from a phone without opening Library.
   For: family TV watching. Fits: the remote already computes Up next for the TV. Effort: S. Exists: partly (Up next card
   appears only at the credits).
8. **Server chores page for owners.** Pitch: conversions, failed conversions, stalled downloads and phone-copy
   jobs in one owner sheet (badge on the Library heading), instead of banners in everyone's Library. For: Oliver and
   ebi. Fits: A2. The data is all there (`/api/convert`, `/api/downloads`, `/api/travel`). Effort: M.
   Exists: Manage downloads sheet covers downloads only.
9. **Season-level "Mark as watched / unwatched".** Pitch: in the show ⋯ menu, mark a whole season watched (for
   shows started elsewhere), which also fixes Play S1 E1 being offered for a show you've seen. For: everyone migrating
   habits from Netflix. Fits: per-episode Mark as watched exists in the Continue ⋯ menu. Effort: S. Exists: per item
   only.
