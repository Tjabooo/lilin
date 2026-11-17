# Audit r1: app shell, Discover, Search, title sheet, peek

Scope: header, tab bar, toasts, offline/error states, Discover (billboard, rows, Moods/vibes, genres, See all, type
filters, Documentaries, Coming soon), Search, the title sheet (film, show, SVT), peek. Sizes: phone 390, tablet 768,
desktop 1440, tv 1920; Swedish on phone.

Sources: live shots `/tmp/lilin-fleet/shots-live/`, my Swedish phone set `/tmp/lilin-fleet/shots-discover-sv/`, and
extra scenes (SVT title, real phone search, phone genre, phone Documentaries, Coming soon, paper theme) in
`/tmp/lilin-fleet/shots-discover-x/` (harness copy + `extra.mjs` in `/tmp/lilin-fleet/scratch-discover/ui-shots/`,
the repo is untouched). Line numbers are from the working tree at audit time. Note: someone had uncommitted edits in
`public/app.js` and `src/server.js` while I was reading, so app.js numbers can drift by ~30 lines.

Harness notes (not UI bugs): `discover-films/docs/genre/genres-open` fail on phone/tablet because the filters live behind
the header's Browse button below 900 px (`style.css:363`). The `search` scene types into `#q` without opening search,
so phone shots show the closed header. The gold ring on the close button / peek primary in every sheet shot comes from
programmatic `.focus()` after a synthetic click. On a real tap it probably won't show; check once on an iPhone.

## Already fixed from docs/design/audit.md (checked)
Billboard is a real billboard; peek exists; title pages are wide panels with logo, cast faces, More like this and an
episode browser; desktop runs full width with sections in the header; "On server"/rating collision is gone (rating
moved to the caption); personal rows (Continue watching, Because you watched, Top picks, New in your library, On its
way) are on Discover; arrows hidden on touch; genre strip folds behind a Genres chip. **Still open from that
audit:** row/card type and the header don't scale on TV (fixed px, see S3); empty states don't always offer "one way
forward" (D9, X3).

---

## Shell (header, tabs, toasts, offline)

**S1. The offline screen shows "Trending this week" as its title: broken**
`index.html:95` ships `<h2 id="discover-heading">Trending this week</h2>`. `renderDiscover()` (app.js:1208) normally
renames it and makes it sr-only, but when `/api/status` fails, `init()` (app.js:10211) returns before that runs. So the
offline screen reads "Trending this week" / "Can't reach the server" (seen in `offline--phone--sv`: "Populärt den här
veckan" above "Kan inte nå servern"). Fix: the static heading should be `Discover` with `class="view-heading sr-only"`,
or set it in the catch block.

**S2. Offline copy is written for the admin, not the family: broken (wording)**
"Make sure server.js is running, then reload this page." (app.js:10211, sv: "Kontrollera att server.js körs…").
Pappa/Anita can't act on this. Fix: "Lilin isn't answering right now. It's probably restarting; try again in a
minute." (owner gets the server.js hint as a second line only if `state.me?.isOwner`, which isn't known yet, so drop it).
Also give the notice the lilin sign (emptyState style) so the one screen a family member sees when things break looks
like Lilin, not a grey box.

**S3. Raw browser network errors leak into toasts and notices: inconsistent / broken in Swedish**
`api()` (app.js:114) rethrows the fetch `TypeError`, and the callers print `err.message`: "Couldn't load Discover ·
Failed to fetch" (Chrome), "NetworkError when attempting to fetch resource." (Firefox), "Load failed" (iOS). All
English, even in the Swedish UI. Lilin also never listens to `online`/`offline` events, so on a phone that drops Wi-Fi
every row errors separately. Fix: in `api()`, map a non-Abort fetch failure to `T('No connection to Lilin. Check your
Wi-Fi and try again.')`. Add a small glass "Offline: reconnecting…" pill under the header on `offline`, and re-render
the current view on `online`.

**S4. Toast: one look for everything, 2.6 s for everything: polish/inconsistent**
`toast()` (app.js:410, css `style.css:1884`): success and error get the same paper pill with a bulb dot. Errors are
`err.message` strings, sometimes two lines long, and they still vanish after 2600 ms. A two-line message in a 999 px
radius pill also looks squeezed. Fix: `toast(msg, { tone: 'error' })` gets an `--alert` dot, and the time scales with
length (`2600 + 40 ms × chars`, max 8 s). Use `--r-lg` instead of a full pill once the text wraps
(`.toast.is-long`). The yellow bulb dot on cream paper is also low contrast on the default theme: use `--on-bulb` ring
or a darker bulb mix.

**S5. What's new on phones is an unlabeled empty ring: confusing**
<600 px hides `.news-label` (style.css:365). With nothing new, the button is a 36 px pill holding a 9 px hollow ring
(`.news-bulb`, style.css:288). It sits where every other app puts the profile picture (see `discover--phone--en`, top
right), and nobody will guess it means "What's new". Fix: on phones, hide the button entirely when there's nothing new
(What's new stays in Settings), and when there is something, show the lit bulb plus the count. Or replace it with the
user's face (the revamp brief promised "your face" in the header) with a lit bulb badge for news.

**S6. Header controls are four different heights: inconsistent**
Browse 36 px (`.browse-btn`, style.css:345), news 36, search toggle 40 (`.search-toggle`), icon buttons 44, `.head-btn`
40, chips 40, segmented 40. On the phone header the Browse pill, search circle and news pill visibly don't line up
(`discover--phone--en`). Fix: one `--ctl-h` token (40 px phone, 44 at ≥1600) for every header control.

**S7. Browse label truncates its own value: ugly**
`.browse-btn { max-width: 34vw }` (style.css:345) cuts "Documentaries" to "Document…" on 390 px (`x-docs-phone`). Swedish
"Dokumentärer" and long genres ("Science Fiction", "Action & Adventure") truncate too. There is room: on phones the
header has the wordmark, Browse, search and news. Fix: `max-width: calc(100vw - 2*gutter - 200px)`, or shorten the
labels to "Docs"/"Dokumentär" in the button only.

**S8. Selected Browse turns the header pill bulb-yellow: inconsistent with the light rules**
`.browse-btn.is-set` (style.css:353) paints a filter state with `--bulb`, the colour the brief reserves for the
primary action, focus, progress and new/live. On a genre page the yellow "Comedy ⌄" pill competes with the billboard's
Play (`x-genre-phone`). Fix: use paper-on-velvet like a pressed chip (`.chip[aria-pressed=true]`).

**S9. Header, tab labels, chips, peek and toast use fixed px, so nothing grows on TV: inconsistent with revamp.md**
`.chip` 14 px, `.segmented button` 14 px, `.news-btn` 13 px, `.browse-btn` 14 px, `.see-all` uses `--t-small` (good),
`.carousel-arrow` 36 px, `.peek-title` 22 px / `.peek-meta` 13 px (style.css:767), `.toast` 14 px, `.vibe-name` 15/16 px.
At 1920 the filters and arrows look like phone parts (`discover--tv--en`, `title-show--tv--en`). Fix: chips/segmented
`font-size: var(--t-small)`, heights `clamp(34px, 30px + .4vw, 44px)`; arrows `clamp(36px, 30px + .5vw, 48px)`; peek
width `clamp(340px, 24vw, 520px)` with type tokens.

**S10. Light themes: the current section is dark-on-dark over the billboard: broken (Paper/Daylight)**
Over the billboard the header is transparent with a dark scrim (`body.has-billboard .top::after`, style.css:263), but
`.tab[aria-current="page"]` uses `color: var(--text)`, which is dark brown on Paper. "Discover", the tab you're on, is
the one you can't read (`x-discover-paper--desktop--en--paper`, crop: inactive tabs are grey and readable, the active
one disappears). Fix: inside `body.has-billboard:not(.searching)` with `html:not(.scrolled)`, header text is
`--on-image` (`#F6EADF`) whatever the theme, the way `.bb-*` and the filters already force white.

## Discover home

**D1. Visible seam where the billboard ends: ugly (every size, worst on desktop/TV)**
`.bb-art::after` (style.css:644, 719) fades the picture to solid `var(--velvet)`, but the page behind it is
`body::before { background: var(--room) }`, which darkens toward `color-mix(velvet 86%, #000)` at 100 vh. At the
billboard's bottom edge the fade ends at rgb(30,15,24) and the page continues at rgb(27,14,22), a light band then a
step (measured on `discover--desktop--en`, y≈736). Fix: end the fade in transparency with a mask instead of painting
velvet: `.bb-art { mask-image: linear-gradient(to bottom, #000 80%, transparent) }` and drop the first gradient layer.
On light themes it's worse: the always-dark scrim fades through a muddy grey band into paper
(`x-discover-paper--desktop--en--paper`, bottom of the billboard). With the mask, the picture fades straight into
the room in either scheme.

**D2. Trending is shown twice in a row: polish/redundant**
`featured` = the first 6 of `trending-all` (src/server.js:736), and `r1` is the same `trending-all` list
(server.js:626). The billboard's six slides are the first six cards of "Trending this week" right below it
(`discover-rows--phone--en`: The Odyssey, VisionQuest, Rings of Power, again). Fix: start the Trending row at item 7
(`results.slice(featured.length)`), or rename the row "More trending" and skip the featured ids.

**D3. Two different "Moods": confusing**
The vibe tile row is titled "Moods" (vibes.js:94), and the old `MOODS` rows (app.js ~1132: "Laugh out loud", "Edge of
your seat"…) are also called moods in code, and in the UI they look like normal rows. "Laugh out loud → See all" lands
on a page titled "Comedy" with the genre sort (app.js:1153), which loses the mood's name. Fix: retire the `MOODS` genre
rows into the vibe system (each becomes a vibe with a tile and a page), or rename them in the code and have their See
all open a page that keeps the row's title.

**D4. Rating truncates to "★ …" in every phone grid: broken (information lost)**
`.title-card .sub` is single-line with ellipsis (style.css:478). In the 3-column phone grid (108 px posters) "2005 ·
Series · ★ 8.1" becomes "2005 · Series · ★ …" on every card in search, genre, See all and vibe pages (`x-genre-phone`,
`search--phone--en`). Fix: drop the word "Film/Series" in grids under 132 px (the container query already exists at
style.css:498 for the badge; add `@container (max-width: 132px) { .sub .kind { display: none } }` with the type in its
own span), or let `.sub` wrap to 2 lines with `-webkit-line-clamp: 2`.

**D5. Status badge on narrow cards is an unexplained yellow or dark square: confusing**
Under 132 px (all phone rows) the badge collapses to a 22 px square with a dot (style.css:498). "In your library" =
yellow square, "On server" = dark square with a yellow dot. Nobody can tell them apart or know what either means
(`discover-rows--phone--en`). Fix: two glyphs: a check for In your library, a small "server/house" mark for On server.
Keep `aria-label`/`title` on the badge (it currently has text only, which is `font-size: 0` here, so screen readers
still get it, but sighted users don't).

**D6. Popular on Lilin repeats "On server" on every card and switches icon language: inconsistent**
Every card in "Popular on Lilin" is by definition on the server, yet each carries the "On server" badge
(`peek-hover--desktop--en`). Its caption swaps to "♥ 5", "♥ da goat", "2 people watched" (social.js:139), using a
heart. But likes are thumbs everywhere else (title page `rateRow`). "♥ da goat" also reads as "loves da goat". Fix:
hide `ownershipBadge` inside this shelf (or show only "In your library"); use the thumbs-up glyph: "👍 5" /
"Liked by ebi" / "2 watched".

**D7. Continue watching: "6d left" next to "8 min left": confusing**
`continueCard` (app.js:1671) puts the auto-delete countdown on the art as "6d left" and the time remaining in the
caption as "8 min left". Two "left"s mean different things on one card; Swedish "6 d kvar" / "8 min kvar" is the same.
The same expiry has three spellings across the app: "6d left" (cards, 1671/1728), "6 days left" (`timeLeft`, app.js:578),
"Leaving soon". Fix: the badge says what happens: "Leaves in 6 d" / "Raderas om 6 d" with a small clock-out glyph, and
use one helper for all three places.

**D8. Single-card rows leave a black hole on wide screens: polish**
Continue watching with one item is a 340 px card and 1,000 px of nothing (`peek-hover--desktop--en`, `discover--tv`).
Same for On its way. Fix: when Continue watching has 1–2 items on ≥900 px, render them as a wider "resume" card
(backdrop 16:9 at `--row-wide × 1.6` with a Resume button and episode name), or merge Continue + On its way into one
row.

**D9. Genre page has no way back and no heading context: inconsistent nav**
See all (app.js:1254), Coming soon (coming-soon.js:145), vibes (vibes.js:117) and Documentaries categories all have
"‹ Discover". The genre page (app.js:1262) has only `h3` + sort. On phones the only way out is the yellow Browse pill →
"All" (`x-genre-phone`). The genre page also loses the type context: "Comedy" under the Shows tab doesn't say it's
shows. Fix: add the same back link; title "Comedy shows" / "Comedy films" when a type is set.

**D10. Genre chips on desktop are an unscrollable strip: broken for mouse users**
`.genre-chips` is `overflow-x: auto; scrollbar-width: none` (style.css:614) with no arrows and no fade, over the
billboard art. At 1440 the strip is clipped mid-chip ("Reality" cut off, `discover-genres-open--desktop--en`), and
with a mouse wheel there's no way to reach Romance…Western. Fix: ≥900 px `flex-wrap: wrap` (20 chips are 2 lines at
1440), or reuse the carousel arrows; add the same edge mask the tab bar uses (style.css:396).

**D11. "Documentary" genre and "Documentaries" tab are two different things: confusing**
Browse sheet shows the type tile "Documentaries" (SVT + curated categories) and a genre chip "Documentary" (plain TMDB
99 grid) side by side (`discover-browse--phone--en`). Same for "Real lives" mood (genre 99). Fix: filter genre 99 out
of `genreFits` and make "Documentary" chips route to the Documentaries tab.

**D12. Coming soon page shows two type switches: inconsistent**
The global filters (All/Films/Shows/Documentaries + Genres) stay above the page and the page adds its own
All/Films/Shows (coming-soon.js:147). See `x-coming-soon-page--desktop--en`. Picking the global one also throws you
out of Coming soon (`pickDiscover` clears `disc.list`). Fix: on list pages hide `discoverFilters()` (as vibes already
does), or drive the page from `disc.type` and drop its own segmented.

**D13. Coming soon "This week" isn't in date order: confusing**
Cards read Wed 18, Fri 20, Sat 21, Thu 19, Fri 20, Fri 20, Wed 18 (`x-coming-soon-page--desktop--en`). "Closest and
most talked-about first" is a score; with a date stamp on every poster people read it as a calendar. Fix: inside each
week group sort by date and then buzz. The ranking matters for the home row, not for a page that's already grouped
by week.

**D14. Coming soon card captions wrap to two lines with a dangling "·": ugly**
`.cs-card .sub` builds "In cinemas · tomorrow" from spans that wrap (coming-soon.js:122), so phone rows get "In cinemas
·" / "tomorrow" and break the row's baseline (`x-coming-soon--phone--en`). Fix: one line, clamp; or put the relative day
in the date badge ("Wed 18 Nov · tomorrow") and keep the kind in the caption.

**D15. "See all" exists on some rows, not others: inconsistent**
TMDB rows and the 2 genre-mood rows have See all; Because you watched, Top picks, New in your library, On its way,
Moods (vibes) and Popular on Lilin don't (app.js:1111–1156, social.js:144). Desktop gets arrows only. Fine for short
rows, but "New in your library" and "Popular on Lilin" are exactly the lists people want in full. Fix: See all →
Library filtered to "New" / a Popular-on-Lilin grid.

**D16. Swedish: "Trendar · #1" over a row called "Populärt den här veckan": inconsistent wording**
Billboard kicker `T('Trending · #{0}')` = "Trendar · #1" (a verb). The row below translates the same idea as "Populärt
den här veckan". Fix: "Populärt · #1" or "Veckans #1".

**D17. Billboard on Documentaries still says "TRENDING · #1": wrong label**
`createBillboard` hardcodes the kicker (billboard.js:43); documentaries.js:71 reuses it for the docs featured list.
Fix: pass `kicker` in the options (`{ label, kicker: T('Documentary pick · #{0}') }`).

**D18. Parallax runs on phones: contrary to revamp.md ("no parallax on phones")**
`onPageScroll` in billboard.js (~line 170) only checks `reduced()`. Phones get the 30 % image shift on every scroll
frame. That costs paint/compositing on the iPhone PWA and is exactly what the brief ruled out. Fix: `if (!wide())
return;` in `onPageScroll`.

**D19. Numbers ignore the locale: Swedish polish**
Ratings use `toFixed(1)` (app.js:831, 900, 947): Swedish shows "★ 8.0" instead of "8,0". Progress uses `42%` in
app.js and `42 %` in documentaries.js:92. Fix: one `fmtRating = (r) => r.toLocaleString(locale, { minimumFractionDigits:
1, maximumFractionDigits: 1 })` and `Intl.NumberFormat(locale, { style: 'percent' })`.

**D20. Empty-state sign flickers forever: contrary to the motion rules**
`.lilin-sign-bulbs i:nth-child(3n+1)` animates `flicker 4s infinite` (style.css:883). The brief says nothing loops
except loading/live. It's also the "no matches" sign, the one place calm matters. Fix: one flicker on appear
(`animation-iteration-count: 2`), then lit.

## Search

**X1. SVT Play hits always come first, even when irrelevant: confusing**
app.js:1230 puts "Free on SVT Play" above the results. Searching "dune" shows "AB Dun och Bolster" as a full-width
hero-sized card before Dune (2021) (`x-search-real--phone--en`); "house" puts a Hallmark film above House M.D. On
phones the SVT row takes ~40 % of the first screen. Fix: put the SVT row after the first grid row (or after the
results) unless an SVT title matches the query exactly; use regular-height wide cards on phones.

**X2. Search ignores the type filter and has no way to narrow: polish**
`/api/search?q=` (app.js:1226) mixes films and shows with no count and no Films/Shows switch, and the Discover filters
disappear while searching. Fix: a small segmented under "Results for…" (All · Films · Shows · People) that filters
client-side.

**X3. "No matches" is a dead end: missing the brief's "one way forward"**
`emptyState(T('No matches for “{0}”'), T('Check the spelling, or try the original title.'))` (app.js:1232) has no
action. Fix: for people who can download, "Search torrents for “q”" (opens `openTorrents({ query })`, which already
exists for the library header). For everyone, "Clear search" and a link to Coming soon / SVT Play.

**X4. Search errors and empty use two different components: inconsistent**
Errors use `notice()` (plain card, no sign), no-match uses `emptyState()` (sign). Same for `pagedGrid` "Nothing here"
(app.js:1184), whose text "Try another genre or type." also shows on See all lists, where there's no genre. Fix: one
`stateCard({ kind: 'empty'|'error', … })`, and context-specific text.

## Title sheet (film, show, SVT)

**T1. SVT title sheet: title printed on raw art, unreadable: broken**
`documentaries.js:177` builds `.sheet-hero` as a `background-image` div, without the `.hero-img` mask the TMDB page
uses. Then `#sheet .sheet-hero + .sheet-content { margin-top: -90…-150px }` pulls the title and facts onto the bright
picture, which has no bottom scrim, and the art already has its own title baked in (`x-svt-title--phone--en`: "A
Bramble House Christmas" over "A Bramble House CHRISTMAS"; facts invisible). Fix: build it with `pageHero(backdrop)`
(app.js ~2563, export it through `ui`) so it gets the mask, the colour wash and the fade. Replace the bare "Loading…"
(documentaries.js:135) with the same skeleton bars the details fold uses.

**T2. Facts wrap with a separator at the start of the line: ugly**
`.facts li + li::before` (style.css:1047) puts the dot before each item, so a wrapped line starts with "· Adventure,
Thriller · ★ 7.6" (`title-film--phone--en`, `title-show--phone--en`, Swedish too). Every phone title page hits this
because certification + runtime + genres don't fit 358 px. Fix: put the dot in a gap: `.facts { gap: 4px 18px }
.facts li { position: relative } .facts li::before { position: absolute; left: -11px }` and `.facts { overflow: hidden;
margin-left: -18px; padding-left: 18px }` (classic clipped-separator trick), or drop genres onto their own line.

**T3. Rating shows "★ 8" on the page and "★ 8.0" on the card: inconsistent**
renderDetails: `` `★ ${t.rating}` `` (app.js:2797; also library film page app.js:1848) vs cards `toFixed(1)`. Law & Order
SVU shows "★ 8" (`title-show--phone--en`). Fix: shared `fmtRating` (see D19).

**T4. Three button styles in one row of extras: inconsistent**
Thumbs are outlined circles, Review is an outlined chip with a star, Save/Follow are filled chips tinted with the
bulb (`title-film--phone--en`). On shows, Save + Follow wrap to a second row. Fix: one secondary style for the whole
row (`.chip`, icon + label, same fill). Group them as [👍 👎] [Review] [Save] [Follow] with equal heights; on phones,
4 icon-over-label buttons in a grid (like `.library-film-actions`).

**T5. Empty "Reviews" section on every unreviewed title: noise**
"Reviews · Write the first / No reviews yet" (`title-film-more--phone--en`) costs ~120 px on most titles, and there's
already a Review button above. "Write the first" is an underlined link; every other section action uses the `.see-all`
style. Fix: hide the section when empty (the Review button is the entry point), or collapse to a single line "No
reviews yet · Write one ›" in `.see-all` style.

**T6. Show page for people without download rights has no top action: dead end**
`renderDetails` (app.js ~2782): if `!canGet()`, `tv` is null, so the action row is empty. The "Already on the server"
offer (`serverOffer`) is placed after the overview, cast and the whole episode browser. Parents/family without download
rights open a show that *is* on the server and see no button at the top. Fix: when `!canGet() && onServer.length`, put
the primary "Add to my library" (or "Play S1 E1") in `actions` and keep the per-season list lower down. When nothing
is possible, show the Save/Follow chip as the primary with a line "Ask Oliver to add it" (Ideas: request button).

**T7. Peek, billboard and title page say different things for the same state: inconsistent**
`quickAction` (app.js:967–1010): a show you own → "Watch"; a film you own → "Play"/"Resume"; a show on the server →
"Add" (opens the page and clicks its button); a film on the server → "Play" (adds silently, then plays); a film to
download → "Add to library". On the page the same show says "Add to library". Fix: one vocabulary: "Play"/"Resume" for
anything playable now (films and shows: for a show on the server, add + play next episode like films do), "Add to
library" for everything that starts a download.

**T8. Desktop/TV panel doesn't scale: polish**
`#sheet { width: min(1180px, 94vw) }` (style.css:1970). On 1920 the panel is 61 % wide with desktop-size type for
thumbs/Save/meta (`title-show--tv--en`). The 1180 px cap also squeezes the overview to the left half while the right
half is empty from the facts down. Fix: ≥1600 `width: min(1480px, 86vw)`; two-column body from 1200 px (left: actions,
overview, cast; right: facts card with director, runtime, Save/Follow, versions).

**T9. Trailer button floats on the far side from the title: polish**
`.trailer-btn { right: var(--gutter); bottom: 22% }` (style.css ~1004). On desktop it sits at the right edge of the hero,
600 px from the title and actions it belongs to (`title-film--desktop--en`). Fix: put "▶ Trailer" in the action row as
a glass secondary next to the primary (billboard already pairs primary + glass); keep the overlay button only on phones.

## Peek

**P1. Peek's buttons use different classes than the billboard: inconsistent**
Peek: `.play-btn` + `.chip` "More info" (peek.js:35); billboard: `.btn-primary` + `.btn-glass`. On the peek sheet "More
info" is a dark seat chip; on the billboard it's glass. Fix: use `.btn-primary`/`.btn-glass` in peek (it sits over the
art wash too).

**P2. Press-peek sheet has no handle and no close: inconsistent with every other sheet**
`.peek.is-sheet` (style.css:777): no `.sheet-handle`, no ✕, no swipe-down. The only way out is tapping the shade
(`peek-press--phone--sv`). Fix: add the handle and a drag-to-dismiss (pointer events on the handle, like a sheet), and
`aria-label` Close on the shade.

**P3. Peek is unreachable from the keyboard or a remote: polish**
Only `pointerover` (mouse ≥900 px) and long-press open it (peek.js:96–135). The 1920 "tv" size (browser on a TV,
keyboard/remote) never gets it. Fix: open on focus after 700 ms when the focus came from the keyboard
(`:focus-visible`), close on blur; or `i`/`Menu` key on a focused card.

**P4. Peek repeats the On server badge over art that doesn't need it: polish**
`ownershipBadge(t)` in `.peek-art` (peek.js:30) and in the meta line of the billboard: fine on the billboard, but in
the peek the badge sits on the top-left of the art, where the poster card's badge was a moment earlier. Fix: in the
peek, put status in the meta line as text ("On Lilin · 1997 · Series").

## Moods (vibes)

**V1. Shuffle uses a spiral icon: confusing**
`glyph('spiral', 'vibe-shuffle-icon')` (vibes.js:115) + a 360° spin on click. It reads as "loading"/hypnosis, not
shuffle. Fix: a crossed-arrows shuffle glyph; drop the spin (or a short card riffle on the grid instead).

**V2. "Show more" here, "Load more" everywhere else: inconsistent**
vibes.js:109 vs app.js:1176. Same control, same `.load-more` class. Swedish is "Visa fler" for both already. Fix: one
string.

**V3. Vibe kicker is its own style: inconsistent**
`.vibe-kicker` 12 px / .08em / custom colour (vibes.css:62) vs the global `.kicker` (`--t-kicker`, .14em, bulb) used by
the billboard. Fix: `class="kicker"` with a local colour override only.

**V4. Mood pages lose the row/tile art: missed polish**
A tile is just a colour gradient + glyph; the page header is the same gradient. There's no poster in either, so the
Moods row is the only row on Discover with no pictures and tiles read as buttons, not as content. Fix: fan 2–3 of the
mood's top posters into the right side of each tile (tilted, 40 % width, under the glyph). Data is
`/api/vibes/:id` and is cached anyway when the page opens. Prefetch the first 6 tiles' top posters with the row.

## Documentaries

**DOC1. Category chips sit between rows, and lazy rows reserve empty 210 px slots: janky**
documentaries.js `browse()` renders 5 groups of horizontally scrolling chip strips after the first row; every
category row below is a `.doc-lazy` placeholder with just a heading until it loads (style.css:563), and empty ones are
removed afterwards, so the page jumps (`x-docs-phone--phone--en` full page: ~20 headings over blank space). Fix:
skeleton posters inside `.doc-lazy` (reuse `homeSkeleton`'s `posters(n)`), and move the category browser into the
Browse sheet (phones) / a "Categories" chip that folds out (desktop), like Genres.

**DOC2. SVT title sheet is a second, older title page: inconsistent**
Beyond T1: `row`-style episodes with tiny 120 px stills (style.css:569), `.play-btn round` icon-only actions, no
thumbs/Save, no cast, no More like this. It should share `episodeItem` (wide stills, runtime, overview) and the
page-extras row. Effort M.

---

## Ideas

1. **"Ask for it" button for people who can't download.** Pitch: on a title page, users without download rights (parents,
   friends) get "Ask Oliver for this" instead of an empty action row; owners get a push + a "Requests" row on
   Discover/Activity with one-tap Add. For: family, ebi's friends. Fits: Lilin is a household server where only some people
   download, and T6 shows those people hit a dead end now. Effort M. Exists: Save ("Lilin adds it once a good copy is
   out") covers only people who can download; no request flow found in whats-new.

2. **In-app person pages.** Pitch: tapping a cast face opens a Lilin page (photo, known for, and "On Lilin" first: what of
   theirs is already on the server), not TMDB in a new tab. For everyone, especially on the iPhone PWA where leaving the
   app is clumsy. Fits: Lilin's value is "what can I watch right now here". Effort M (TMDB `/person/:id/combined_credits`
   + `serverMatchesFor`). Exists: "Look up the actors" (11-08) links out to TMDB.

3. **Search that knows the server.** Pitch: results grouped "On Lilin" first (with Play), then "Can be added", then SVT,
   plus recent searches and a type switch (X2). People search too. For everyone. Fits: the most common search is "is X on
   Lilin?". Today you scan badges in a TMDB-ordered grid. Effort S–M (client-side regroup with `matchesFor` /
   `serverMatchesFor`). Exists: partially (badges only).

4. **"Tonight" pick / Surprise me.** Pitch: a button on the billboard row (and on the TV app) that picks one playable title
   from your library + server that fits a chosen length ("under 2 h", "one episode") and mood, with a re-roll. For: parents
   on the TV, couples who can't decide. Fits: Lilin already knows runtimes, what's partly watched, moods and what's on the
   server. Effort S–M. Exists: Shuffle exists only inside a mood page and isn't limited to playable titles.

5. **Offline/reconnect awareness (S3) as a feature.** Pitch: a calm "Lilin is restarting, back in a moment" pill that
   auto-retries with backoff and re-renders when the server answers. For family members who otherwise see "Failed to
   fetch". Fits: Lilin restarts often (owner restarts "any time without asking"). Effort S. Exists: no.

6. **Mood tiles with posters + "moods for right now".** Pitch: tiles show a poster fan (V4). The row leads with time-aware
   moods (weeknight short, Sunday afternoon, Friday late) based on the clock, and Swedish seasonal ones (Lucia, midsommar).
   For everyone. Fits: the Moods row is already seasonal-aware (`rotateVibes` seasonal set). Effort S–M. Exists:
   partially (seasonal moods, no posters, no time-of-day).

7. **"Leaving soon" on Discover with one-tap Keep.** Pitch: a home row of your library items with the auto-delete
   countdown ≤ 2 days and a Keep button on each card, instead of discovering it from a "6d left" badge (D7). For
   everyone with auto-delete. Fits: the expiry rules are a Lilin-specific thing users trip over. Effort S. Exists: Library
   has Leaving soon; Discover doesn't.

8. **"Friends are watching" row.** Pitch: next to Popular on Lilin, a row of what people you share with have started this
   week (faces on cards, "ebi is on S2 E4"), with "Watch together" as the quick action. For Oliver + ebi + friends. Fits:
   Watch Together, faces and Friends already exist; this links them. Effort M. Exists: Popular on Lilin (aggregate likes
   and viewers), Friends section in Settings; no per-person "currently watching" row found.

9. **Wider resume card for 1–2 items (D8).** Pitch: when only one or two things are in progress, Continue watching becomes
   a large backdrop card with episode name, time left and a Resume button. That's the most common state for parents.
   Effort S. Exists: no.

10. **Billboard that's personal.** Pitch: mix the six slides: 3 trending, 1 "new episode of a show you follow", 1 "just
    added to your library", 1 Coming soon this week with Save. Kicker per slide ("New episode", "Just added", "Out Friday").
    Fits: kills D2's duplication and makes the top of Discover about *your* Lilin. Effort M (billboard already takes items
    + a kicker would come with D17). Exists: no.
