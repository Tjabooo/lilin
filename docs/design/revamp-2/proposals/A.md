# Proposal A: keep the tabs, give every job one home

Designer A, Lilin revamp round 2 (2026-11-17). Input: `../inventory.md` (ground truth), before-shots in
a local screenshots folder on the desktop, `../../revamp.md` (the 11-10 look, unchanged here) and
`../../fleet-2026-11-17.md` (open items: owner hub tab, one lit thing per screen, CSS budget).
Mockups: `A/` (HTML + PNG).

## 1. Thesis

The skeleton isn't what broke. Discover (find something), Live (what's on now), Library (what you have) and Settings
(how Lilin behaves) are four jobs everyone in the family already understands. They match the TV app the parents use,
where the home screen *is* the library (`public/tv/tv.js` `homeScreen`: Search · Live · Discover · Documentaries over
your own rows), and every old link already points at them. What broke is the order things landed in: about 100 changes in
a week, each dropped onto the nearest screen. Discover grew to 18 blocks (21 at most). Settings became the inbox for
friends, moments, ideas, invites, Wrapped and every owner tool (5.7k px on a phone). The owner got 8 unlabelled tabs.
The same job now lives in 3 to 7 places (downloads 7, watchlist 4, invites 5, search 6 meanings). Plan A keeps the
four tabs and gives each one a single meaning again, with **one home per job and everything else a link to it**.
Discover drops from 18 blocks to 11. Library becomes the one home for your titles, your watchlist and your downloads,
as three segments. Settings holds only settings (owner: 10 groups → 5). Personal and social things go where they
belong: your face for you and your friends, the What's new bulb for things sent to you, Live for watch parties. The
owner's 4 extra tabs and 3 Settings groups fold into one labelled **Owner** tab. Members' tab bars don't change at all.
The owner's goes from 8 icon-only tabs to 5 labelled ones.

### Why keep the skeleton (the case against B and C, briefly)

- **Library is a daily job; "You" is a weekly one.** On a self-hosted server, "what's on my server, what's still
  downloading, what's leaving" is logistics that people check every time they open the app. A profile (favourites,
  diary, Wrapped) is something you visit now and then. B would put the daily job behind the weekly one, or make the
  "You" tab carry both and grow into the next Settings.
- **The roles that use Lilin most can't use most social features.** Restricted accounts have no friends, live chat or
  reviews. The Home network account has no profile, friends or moments list. A "Together" tab (C) would be half empty
  for exactly the family accounts, while the 2–3 social users already reach social features through the thing they
  are about (a title, a channel, a person). Social should follow the object, not get a destination of its own.
- **Muscle memory and links.** 35 accounts, the TV app's library-first home, `#library`, `#downloads`, `?travel=1`
  and the "Open Lilin on: Library" preference all assume a Library. A keeps every one of them meaning what it meant.
- **Ships in small, revertable batches.** Every move below is independent (Discover rows, Library segments, Settings
  regroup, Owner hub, title page). B and C need the new tab and the removal of the old one to land together.

## 2. Sitemap and navigation

### 2.1 Tabs per role (after)

| Role | Tabs, in order | Phone/tablet tab bar | Change |
| --- | --- | --- | --- |
| Home network shared account (H) | Discover · Live · Library · Settings | 4, labelled | none |
| Member (M), restricted (R) | Discover · Live · Library · Settings | 4, labelled | none |
| Member with **Can see activity** | Discover · Live · Library · Activity · Settings | 5, labelled | none |
| Owner without Notes (co-owner) | Discover · Live · Library · **Owner** · Settings | 5, labelled | was 7, icon-only |
| Owner with Notes (Owner) | Discover · Live · Library · **Owner** · Settings | 5, labelled | was 8, icon-only, scrolling |

Rule: **at most 5 tabs for any role**, always labelled. All `.tabs:has(.tab:nth-child(6|7|8))` overrides go.

### 2.2 Sitemap

```
Header (every tab)
├─ Wordmark → Discover home (resets type/genre/mood)
├─ Search → one global search layer over the current tab: On Lilin first, then TMDB, then Free on SVT Play
├─ What's new bulb → sheet: For you (moments sent to you, answers to your ideas, friend requests waiting)
│                     · Updates (+ All updates) · footer: Send an idea or a bug (not owners)
└─ Face → your profile (M, O, R) / household page (H, new: Numbers, Wrapped, Moments, reviews; no friends/edit)
           profile action row: Edit profile · Friends (n) · Moments · Share; Numbers block: Wrapped {year}
           Friends sheet: find by name, requests, list, remove, Invite someone to Lilin (+inv; owner → Owner › People)

Discover
├─ Billboard
├─ Controls (one row, every width, under the billboard): All · Films · Shows · Documentaries · Genres ▾
├─ Continue watching (+ Up next)          ← the only Continue watching
├─ Moods: [Pick together tile] [Today: 2 moods] [vibes…]   ← mood rows + vibes merged; Pick moves here
├─ Trending this week · For you (Because you watched + Top picks) · Popular on Lilin
├─ Popular · In cinemas now · New episodes this week · Coming soon · Top rated
└─ (seasonal) Wrapped banner under the billboard

Live
├─ Watch parties (only while one is planned: join · copy link · cancel)   ← moved from Library
├─ SEELE TV guide → tune → player with channel strip, Live chat (not R)
└─ Your channels (owner chip) → channel editor + SEELE TV picks

Library  (header line: Shared with Robin and Alex…, when shared)
├─ Titles     All · Films · Shows · Sort ▾ (Newest · Recently watched · Leaving soonest · A–Z)
│             shelves only when non-empty: New since your last visit · Leaving soon (<48 h)
│             grids: Films · Shows · Unidentified (slim progress on downloading cards)
├─ Watchlist  Coming up (dated: saved films' releases, followed shows' next episodes) · Saved · Following
└─ Downloads  [Find torrents (+dl)] [All server downloads (O)]
              Preparing playback · On the way · Needs attention · On this phone (always listed) · source notices

Activity (+act members only, read-only, unchanged)

Owner (O only; chip row on phone/tablet, side index on desktop; opens on the last segment used)
├─ Activity   stats, people strip, filters, feed (faces → person panel)
├─ People     Invite · access list · everyone → person panel (permissions, sign-in access, password link,
│             library sharing, never auto-delete, their activity, open profile)
├─ House      Overview · Screen Time
├─ Game clips (renamed from Clips: "Moments" is the everyone feature)
├─ Notes      (Owner only)
├─ Ideas      inbox + idea scout
└─ Server     rules · Live TV channels (→ editor) · All server downloads (→ sheet)

Settings  (index on every width: chip row on phones/tablets, side nav on desktop)
├─ Account              You card (face, sign-in line, tags, Your profile) · Change password · Sign out
├─ Look                 Language · Appearance
├─ Watching             Subtitles · Intros · Open Lilin on (Discover · Live · Library)
├─ Downloads & storage  Quality · Largest download · Audio language (+dl) · Storage card → links to Leaving soon
└─ Devices              Notifications on this device · Sign in a TV · Android TV · Jellyfin

Overlays (unchanged containers): title page (#sheet), small sheets (#picker), profile (.pf), Pick together,
Wrapped, peek, room, live chat, player menus. Player ⋯ menu: Clip a moment · Stats for nerds (new touch entry).
```

### 2.3 Navigation per width

| Width | Header | Sections | Sub-navigation |
| --- | --- | --- | --- |
| Phone <600 | wordmark · search icon · What's new bulb · face (**4**, was 5 on Discover: Browse ▾ goes) | glass tab bar, 4–5 labelled tabs | Library segments, Owner chips and Settings index chips: one sticky `segmented`/chip row under the view heading |
| Tablet 600–899 | same, What's new label shows | tab bar, labelled | same as phone; title pages full-screen with two-column header (unchanged) |
| Desktop ≥900 | wordmark · section links · search field (global) · What's new pill · face | header links | Library segments under the heading; Owner and Settings get the sticky side index (`.set-index`, today Settings only) |

Restricted: same tabs as members. Inside, every rule stays as today: no Friends button on their profile, no live
chat, no reviews, never offered as an invitee, Moments as today. co-owner: Owner hub without Notes. Members with **Can see
activity**: their read-only Activity tab stays a tab (they have no hub). Owners reach Activity as the first Owner
segment.

### 2.4 Deep links (all old ones keep working)

| Link | Today | After |
| --- | --- | --- |
| `#discover` `#live` `#library` `#settings` | tab | same |
| `#activity` | Activity tab | owner: Owner › Activity; +act: Activity tab |
| `#house` `#clips` `#notes` | tab | Owner › House / Game clips / Notes |
| `#downloads` | Library + "On the way" | Library › Downloads |
| `#watchlist`, `#owner` | — | new: Library › Watchlist, Owner (last segment) |
| `?moment=` | Settings → Moments | Moments sheet over the current tab, plays it |
| `?friends=1` | Settings → Friends | Friends sheet (from the profile) |
| `?ideas=1` | Settings → idea box / Ideas inbox | member: idea box sheet; owner: Owner › Ideas |
| `?travel=1` | Library + phone-copies sheet | Library › Downloads › On this phone |
| `?watch=` `/c/w/` `?pick=` `?update=` `?wrapped=` `?note=` `/c/n/` `?play=` `/#@handle`, `/c/*` pages | — | unchanged |

## 3. Every feature, placed

Entry points = places in the UI you can open or start it from (cards and rows count once per screen type). Links
and notifications are kept and not counted. **Stays** = same place; **Moves** = one new home; **Merges** = two
things become one; **Demoted** = still there, one level deeper. Nothing is deleted.

### 3.1 Discover and browsing

| Feature | Who | Today | After | Entry points | Change |
| --- | --- | --- | --- | --- | --- |
| Billboard | All | Discover top | Discover top | 1 → 1 | Stays |
| Trending this week, In cinemas now, New episodes this week, Coming soon (TMDB) | All | Discover rows | Discover rows | 1 → 1 each | Stays |
| Popular films + Popular shows | All | 2 rows (type All) | one **Popular** row on All (interleaved; See all opens with a Films/Shows toggle); Films/Shows types unchanged | 2 → 1 | Merges |
| Top rated films + Top rated shows | All | 2 rows | one **Top rated** row, same rule | 2 → 1 | Merges |
| Continue watching (+ Up next, hide ⋯) | All | Discover row 1 **and** Library shelf | Discover row 1 only. Library gets progress bars on cards and a **Recently watched** sort | 2 → 1 (+ sort) | Merges |
| On its way | All | Discover row | Library › Downloads › On the way | see Downloads | Moves |
| Saved for later | All | Discover row | Library › Watchlist › Saved | see Watchlist | Moves |
| Popular on Lilin | All | Discover row | Discover row | 1 → 1 | Stays |
| Because you watched X + Top picks for you | All | 2 rows | one **For you** row (picks across seeds); See all → page of "Because you watched …" groups | 2 → 1 | Merges |
| New in your library | All | Discover row (+ Newest sort, New badges) | Library › Titles: "New since your last visit" shelf + New badges + Newest sort | 3 → 2 | Moves |
| Mood genre rows (2 a day from 10) | All | 2 Discover rows | the 10 genre moods join the Moods set; today's 2 lead the Moods row marked **Today**; their page = today's genre grid with sort | 2 rows → 0 rows, 1 system | Merges |
| Moods (vibe tiles, mood page) | All | row after Trending | row right after Continue watching | 1 → 1 | Stays (moves up) |
| Type filter + Genres | All | segmented over the billboard (desktop) **or** Browse ▾ sheet (<900 px) | one chip row under the billboard on every width | 2 controls → 1 | Merges |
| Documentaries + SVT Play | All (Add needs `canAdd`) | desktop segment / phone Browse → Docs (2 taps); SVT in search | **Documentaries** chip on every width (1 tap); SVT in global search | 2 → 1 | Merges |
| Coming soon page | All | row → See all | same | 1 → 1 | Stays |
| Search | All | one box, 6 meanings (Discover, Library filter, Activity, House, Clips, Notes; typing on Settings/Live jumps to Discover) | one box, one meaning everywhere: global layer, On Lilin first (your library + server), then TMDB, then Free on SVT Play; Cancel returns to the tab you were on. Owner segments get their own labelled filter fields | 6 meanings → 1 | Merges |
| Peek | All | hover / long press | same | 2 → 2 | Stays |
| Pick together | All (invitee lists skip R) | one quiet card, block 7 of 18 (~1,850 px down on a phone) | leading tile of the Moods row (block 3, ~900 px down); "is going" state kept on the tile. Matches planned for later show up as parties in Live | 1 → 1 | Moves up |
| Wrapped teaser | All | Discover under billboard (release day → end of January) | same | 1 → 1 | Stays |

### 3.2 Title pages

| Feature | Who | Today | After | Entry points | Change |
| --- | --- | --- | --- | --- | --- |
| Title page (Discover, library film, library show variants) | All | 3 renderers with different action sets | **one** title page whose actions follow the title's state (not on server → Add/Download; on server → Add & play; in your library → Play; downloading → Play now + progress) | 3 variants → 1 | Merges |
| Trailer | All | hero button | hero secondary row | 1 → 1 | Stays |
| Add / Download / Advanced options / Dubbed | +dl | Discover variant only | primary action on every variant; Advanced options and Dubbed inside the Download sheet as today | 1 → 1 | Stays (now on every variant) |
| Already on the server (Add, Add & play, Add season) | members without +dl | Discover variant | primary action (same page) | 1 → 1 | Stays |
| Save for later / Follow (+ auto-download switch) | All | `page-extras` box on Discover variant; one-tap on Coming soon cards | hero secondary button **Save** / **Follow** on every variant (switch in its small sheet); Coming soon one-tap unchanged; the list lives in Library › Watchlist | 2 → 2 | Moves (into hero) |
| Thumbs + Liked by | All | `page-extras` on 3 variants | **Reactions** block (Liked by faces → profiles) + hero **Rate** button | 1 → 2 | Merges with reviews |
| Reviews (button, section, See all, composer) | All but R | Review button beside thumbs, section | Rate button (thumbs + review in one sheet) + Reactions block → See all | 2 → 2 | Merges |
| Cast rail | All | page | page | 1 → 1 | Stays |
| Episodes | All | tabbed browser (Discover) vs season grid → rows (library) | one list: season chips + episode rows (still, title, air date, progress, row ⋯ for file actions); one season rendered at a time; season ⋯ = Keep all · Season to phone · Delete season | 2 UIs → 1 | Merges |
| Versions (4K/1080p, Your versions) | All | film pages | "Your copy" block (version chips) | 1 → 1 | Stays |
| More like this | All | page | page | 1 → 1 | Stays |
| More details | All | closed fold | closed fold (last block) | 1 → 1 | Stays |
| Keep longer / Leaving soon countdown | All (rules O) | keep bar on library pages, card badge, Library shelf, Settings text with no link | "Your copy" block (one line: "Leaving in 3 d · Keep 7 more days"), card badge, Titles › Leaving soon shelf, Settings › Storage card now **links** there | 4 → 4 (dead end fixed) | Stays |
| Play on TV / To phone / Delete | All | chips on library film page; file ⋯ | title ⋯ **More** sheet; episode/file ⋯ (unchanged) | 2 → 2 | Demoted (chips → ⋯) |
| Identify film | O | chip on library film page | title ⋯ More (owner only) | 1 → 1 | Demoted |

### 3.3 Library and downloads

| Feature | Who | Today | After | Entry points | Change |
| --- | --- | --- | --- | --- | --- |
| Library grid (Films / Shows / Unidentified) + All/Films/Shows | All | Library | Library › Titles | 1 → 1 | Stays |
| Availability select (All / Ready / On the way / Needs attention) | All | Library toolbar `<select>` | split: Ready = Titles; On the way + Needs attention = Downloads segment sections | 1 → 1 | Merges into segments |
| Library order (Newest / Leaving soonest / A–Z) | All | Settings › Watching | Library › Titles **Sort ▾** (still saved to the account) + new "Recently watched" | 1 → 1 | Moves |
| Shared-library note | sharing people | Library top | Library header line (all three segments) | 1 → 1 | Stays |
| Coming up (saved releases, followed next episodes) | All | Library shelf | Library › Watchlist › Coming up (dated list) | 1 → 1 | Moves |
| Watchlist as a whole (Saved + Following) | All | nowhere complete (Discover row + Library shelf slices) | Library › Watchlist (Coming up · Saved · Following) | 2 partial → 1 complete | Merges |
| Leaving soon (<48 h) | All | Library shelf | Library › Titles shelf | 1 → 1 | Stays |
| Downloads in progress | All (+dl to start) | 7 surfaces: Discover On its way, card transfer panels, "N downloading" button, Availability = On the way, tab badge, Manage downloads, '•••' per card | 3: Library tab badge · Library › Downloads (On the way, Needs attention) · per-title status (slim bar on cards, "Your copy" on the title page) | 7 → 3 | Merges |
| Manage downloads (all transfers) | O | Library header button | Library › Downloads header **All server downloads** + Owner › Server row | 1 → 2 | Stays (+ hub link) |
| Find torrents | +dl, TORRENTS | Library header button | Library › Downloads header | 1 → 1 | Moves (one level) |
| Conversion banner (Preparing playback) | All | Library top | Library › Downloads top + "Your copy" on the title page; the player's "Can't play here" box **links** there instead of saying "in the Library tab" | 1 → 2 (dead end fixed) | Moves |
| Download to phone (copies list) | All | film chip, file ⋯, Season to phone, Library summary (only while copies exist), `?travel=1` | title ⋯ More, episode ⋯, season ⋯, Library › Downloads › **On this phone** (always listed) | 4 → 4 (list gets a permanent home) | Moves |
| Planned watch parties (join / copy / cancel) | All | Library shelf | **Live › Watch parties** (top of Live, only while one exists) | 1 → 1 | Moves |
| '•••' download details on library cards | All | text button on each card | title page "Your copy" ⋯ and Downloads rows ⋯ (one ⋯ glyph, always "more") | 1 → 1 | Merges |

### 3.4 Playback, rooms, TV

| Feature | Who | Today | After | Entry points | Change |
| --- | --- | --- | --- | --- | --- |
| Player | All | `#player` | same | — | Stays |
| Play now | All | player + buffering popup | same | — | Stays |
| Skip intro / Up next / Play next episode | All | player; Settings › Intros | same; Settings › Watching › Intros | 1 → 1 | Stays |
| Bedtime, subtitle look | All | player menus | same | 2 → 2 | Stays |
| Quality, Audio, Subtitles (incl. AI subs) | All | player menus | same | 3 → 3 | Stays |
| AirPlay / PiP / fullscreen guide / iPhone PiP hand-off | All | player | same | — | Stays |
| Stats for nerds | All | `I` key or right-click only | + player ⋯ menu item (touch entry; ⋯ stops being a one-item menu) | 0 touch → 1 | Gains entry |
| Watch Together rooms | All (R: link only) | player pill, link, notification, Library parties shelf, Pick match | player pill, link, notification, Live › Watch parties, Pick match. Wording: rooms say **Ask to join**, not "invite" | 5 → 5 | Stays |
| Moments (Clip a moment) | All (R, H: link only) | player ⋯ | player ⋯ | 1 → 1 | Stays |
| Play on TV + nowbar + remote | All | film chip, file ⋯, nowbar | title ⋯ More, episode ⋯, nowbar | 3 → 3 | Demoted (chip → ⋯) |
| Live TV guide + tuning + channel strip | All | Live tab | Live tab (under Watch parties when there are any) | 1 → 1 | Stays |
| Live chat | All but R | channel strip Chat | same; chat faces open profiles (M, O) | 1 → 1 | Stays |
| Channel editor + SEELE TV picks | O | Live › Your channels chip | same + Owner › Server › Live TV channels | 1 → 2 | Stays (+ hub link) |

### 3.5 People, social, personal

| Feature | Who | Today | After | Entry points | Change |
| --- | --- | --- | --- | --- | --- |
| Own profile (favourites, numbers, diary, ratings, reviews, liked, friends, share, visibility) | M, O, R; **H none** | header face, Settings › Your profile, `/#@handle` | header face for everyone (H: **household page**, see below), Settings › Account › Your profile | 2 → 2 (H 0 → 2) | Stays, H gains it |
| Household page (H) | H | — (Moments made but never listed, Wrapped only in Settings, reviews under the shared name with no place to see them) | face → household page: Numbers + Wrapped, Moments, reviews. No friends, edit or share. `/api/profiles/me` and `/api/moments` already answer for H; only client gating (`renderMeButton`, `moments.js` `!me()?.email`) changes | 0 → 1 | Fixes a dead end |
| Profile editor | M, O, R | profile › Edit profile | same | 1 → 1 | Stays |
| Others' profiles | M, O | Friends list, review authors, `/#@handle` | + every face: Liked by, live chat, room roster, Pick faces; owner Activity faces open the person panel, which has Open profile. Visibility rules unchanged | 2 → 6 | Faces become links |
| Friends (search, requests, list, remove) | M, O | Settings › Friends (deep scroll), profile Add/Accept, popup | profile action row **Friends (n)** → Friends sheet; profile Add/Accept; popup | 3 → 3 (2 taps, no scroll) | Moves |
| Friend-request popup | M, O | automatic | same; pending requests also listed under What's new › For you | 1 → 1 | Stays |
| Moments inbox (shared with you, your moments) | M, O, R (+ H now) | Settings › Moments (hidden until one exists) | profile/household **Moments** → Moments sheet; new ones under What's new › For you | 1 → 2 | Moves |
| Activity | O; +act read-only | tab | owner: Owner › Activity; +act: Activity tab | 1 → 1 | Moves (owner) |
| Wrapped (story, share card) | All | Discover banner (seasonal), Settings › You button | Discover banner (seasonal), profile/household **Numbers › Wrapped {year}** | 2 → 2 | Moves |
| What's new (unseen popup, full history) | All | header pill/bulb, automatic, `?update=` | same, plus a **For you** section and the idea-box footer | 2 → 2 | Stays (grows) |
| Idea box (send, see answers) | M, H, R | Settings › You group | What's new sheet footer **Send an idea or a bug**; answers arrive in What's new › For you | 1 → 1 | Moves |
| Ideas inbox + idea scout | O | Settings › Ideas (group 9 of 10) | Owner › Ideas (Owner tab badge for new ideas) | 1 → 1 | Moves |
| Invite people (member links) | +inv (not O) | Settings › Invite people | Friends sheet › **Invite someone to Lilin** | 1 → 1 | Moves |
| Owner invites + who may sign in (Zero Trust list, password links) | O | Activity › Invite tile, person panel | Owner › People (Invite button, access list, person panel); owner's Friends-sheet invite button opens the same | 1 → 2 | Moves, merges with People |
| Room / Pick together / profile "invite" wording | — | 5 things called invite | **Invite** = bring someone into Lilin only. Rooms and Pick: "Ask to join" / "Send link". Profile: "Share" | 5 meanings → 1 | Renamed |

### 3.6 Settings and owner tools

| Feature | Who | Today | After | Entry points | Change |
| --- | --- | --- | --- | --- | --- |
| You card (face, sign-in line, tags) + Your profile | All (button needs email) | Settings › You | Settings › Account | 1 → 1 | Stays |
| Sign out, change password | session / password users | Settings › You | Settings › Account | 1 → 1 | Stays |
| Language, Appearance (9 themes + own colours) | All | Settings | Settings › Look | 1 → 1 | Stays |
| Subtitles, Intros | All | Settings › Watching | Settings › Watching | 1 → 1 | Stays |
| Open Lilin on | All | Settings › Watching (Discover/Library) | Settings › Watching (Discover/**Live**/Library) | 1 → 1 | Stays (+ Live) |
| Sign in a TV, Android TV, Jellyfin | All | Settings › Watching rows 4–6 | Settings › **Devices** | 1 → 1 | Moves |
| Notifications (this device, kinds) | All | Settings › Notifications | Settings › Devices | 1 → 1 | Moves |
| Download preferences (quality, largest size, audio language) | +dl | Settings › Downloads | Settings › Downloads & storage | 1 → 1 | Stays |
| Your library card (count, size, next to go, retention) | All | Settings › Your library (dead-end text) | Settings › Downloads & storage › **Storage** card (renamed: "Your library" now only means the tab), "Next to go" links to Library › Leaving soon | 1 → 1 | Renamed + link |
| Server rules (retention, keep longer, new people can download, default colours, staying signed in) | O | Settings › Server | Owner › Server | 1 → 1 | Moves |
| People (pictures, Can download, Can invite, Restrict, Can see activity, Never auto-delete, Library sharing) | O | Settings › People (last group, ~35 cards) | Owner › People › person panel (one place per person for permissions, access, invites and their activity) | 1 → 1 | Moves, merges with Activity's access list |
| House: Overview + Screen Time | O | House tab, 2 segments | Owner › House, same 2 segments | 1 → 1 | Moves |
| Clips (game clips: galleries, trim, rename, share, delete) | O (CLIPS_DIR) | Clips tab; `/c/<token>` | Owner › **Game clips**; `/c/<token>` unchanged | 1 → 1 | Moves, renamed |
| Notes | O + Notes | Notes tab; `?note=`, `/c/n/` | Owner › Notes; links unchanged | 1 → 1 | Moves |
| Preview pill | anyone in preview | fixed pill | same | — | Stays |

**Totals.** The tables have 91 rows: the inventory's 79 features, split where parts go to different homes. 41 stay,
26 move, 16 merge, 3 are demoted one level, 2 are renamed, and 3 gain a missing entry (Stats for nerds on touch, H's
household page, faces as links). Nothing is deleted. Duplicated jobs: Continue watching 2 → 1, downloads 7 → 3,
watchlist 2 partial → 1 complete, mood systems 2 → 1, title page variants 3 → 1, episode UIs 2 → 1, search meanings
6 → 1, "invite" meanings 5 → 1, owner tool locations 6 → 1 (plus 2 contextual shortcuts that already existed: the Live
channels chip and All server downloads in Library).

### 3.7 Taps to the hard-to-find list (inventory 3.4)

| Feature | Today | After |
| --- | --- | --- |
| Pick together | Discover + scroll 2.2 screens to a quiet card | Discover + scroll ~1 screen to the first Moods tile (still a scroll; see risks) |
| Friend search / add | Settings + deep scroll | face → Friends (2) |
| Moments you received | Settings + scroll (hidden until one exists) | What's new (1, while new) or face → Moments (2) |
| Your ratings, reviews, likes, diary | face → scroll; H impossible | same; H: face → household page |
| Wrapped outside Dec–Jan | Settings → button (2) | face → Wrapped (2) |
| Phone copies list | only while copies exist | Library → Downloads (2) |
| Library order | Settings → scroll to Watching | Library → Sort (2) |
| Sign in a TV / Android TV / Jellyfin | Settings → scroll to Watching rows 4–6 | Settings → Devices chip (2) |
| Notifications switch | Settings → scroll to group 5–7 | Settings → Devices chip (2) |
| Documentaries on phones | Browse ▾ → Documentaries (2) | Documentaries chip (1) |
| Stats for nerds | no touch entry | player ⋯ → Stats (2, inside the player) |
| Owner: Ideas, People, Server | Settings + ~5k px scroll | Owner → chip (2) |
| Owner: invite someone | Activity → Invite tile (2) | Owner → People → Invite (2–3; 2 when People was last used) |
| Owner: channel editor | Live → chip (2) | same (2), or Owner → Server (3) |
| Owner: Screen Time | House → segment (2) | Owner → House → Screen Time (3) — **one tap worse** |
| Owner phone: any owner tool | 1 tap on an unlabelled, scrolling icon | Owner → chip (2, labelled; 1 for the last used) |

## 4. Screen by screen

### 4.1 Discover: 18 blocks → 11

| # | Today (H account, type All) | After |
| --- | --- | --- |
| 1 | Billboard | Billboard |
| — | (type/genre control: over the billboard on desktop, Browse ▾ in the header on phones) | Controls row under the billboard: All · Films · Shows · Documentaries · Genres ▾ (every width) |
| 2 | Continue watching | Continue watching (+ Up next) |
| 3 | Popular on Lilin | **Moods**: Pick together tile · Today ×2 · vibes |
| 4 | Because you watched X | Trending this week |
| 5 | Trending this week | **For you** (Because you watched + Top picks) |
| 6 | Moods | Popular on Lilin |
| 7 | Pick together card | **Popular** (films + shows) |
| 8 | Popular films | In cinemas now |
| 9 | mood row | New episodes this week |
| 10 | New in your library | Coming soon |
| 11 | Popular shows | **Top rated** (films + shows) |
| 12 | In cinemas now | — |
| 13 | Top picks for you | — |
| 14 | mood row | — |
| 15 | New episodes this week | — |
| 16 | Coming soon | — |
| 17 | Top rated films | — |
| 18 | Top rated shows | — |
| + | Wrapped banner, On its way, Saved for later (up to 21) | Wrapped banner only (up to 12) |

Phone height: 5,669 px → about 3,600 px (billboard ~480 + controls 56 + 10 rows × ~305). Desktop: 7,145 → ~4,500 px.
Rule for later: **Discover holds at most 12 blocks**; a new row replaces or merges with one. Discover is for finding
things. Your stuff (downloads, watchlist, new arrivals) lives in Library. The header loses Browse ▾. The desktop
over-billboard filter glass goes (one `backdrop-filter` and its trailer-live variants fewer).

### 4.2 Title page: one page, 7–8 blocks, one lit button

| Block | Film | Show | Notes |
| --- | --- | --- | --- |
| 1 Hero | ✓ | ✓ | art + wash, logo, meta; **one** primary (lit) by state; secondary row: Trailer · Save/Follow · Rate · ⋯ More |
| 2 Your copy | when in library/downloading | same | version chips, transfer or Preparing playback, "Leaving in 3 d · Keep 7 more days" (quiet link), ⋯ details |
| 3 About | ✓ | ✓ | overview + tagline |
| 4 Episodes | — | ✓ | season chips (All seasons sheet above 8), rows with air dates; Play on rows is quiet, not gold |
| 5 Reactions | ✓ | ✓ | thumbs count, Liked by faces, reviews → See all (not R) |
| 6 Cast | ✓ | ✓ | |
| 7 More like this | ✓ | ✓ | |
| 8 More details | ✓ | ✓ | closed fold |

| Variant | Blocks before → after | Buttons before → after (est.) | Lit before → after |
| --- | --- | --- | --- |
| Discover film | 10 → 7 | 32–34 → ~24 | 1 → 1 |
| Library film | 11 → 7 | 44–48 → ~26 | 2 → 1 |
| Discover show | 11 → 8 | 257 → ~60 (one season rendered) | 1 → 1 |
| Library show | 12 → 8 | 71–73 → ~50 | 7 → 1 |

⋯ More holds: Play on TV · To phone · Keep longer · Delete · Identify (O) · Send to a friend (slot for the
fleet's next-tier feature). Same ⋯ glyph everywhere; the '•••' text button is gone.

### 4.3 Library: one long page with 11 kinds of block → three short segments

| Today (one page) | After |
| --- | --- |
| Header + Find torrents + Manage downloads | Header "Library" + shared note line + segments **Titles · Watchlist (n) · Downloads (n)** |
| Conversion banner | → Downloads (top) |
| Toolbar: All/Films/Shows + Availability select | Titles toolbar: All/Films/Shows + Sort ▾ |
| Shared-library note | header line |
| "N downloading" summary button | → Downloads (segment count) |
| "For your phone" summary button | → Downloads › On this phone |
| Source notices | → Downloads (bottom) |
| Watch parties shelf | → Live |
| Shelves: Continue · Coming up · Leaving soon | Titles: New since last visit · Leaving soon (each only when non-empty); Continue → Discover; Coming up → Watchlist |
| Grids: Films · Shows · Unidentified | Titles grids, unchanged; downloading cards show a slim bar instead of the transfer panel |
| Empty state | per segment |

Blocks: Titles 3–5, Watchlist 3, Downloads 3–6 (vs 8 live / 11 possible on one page). The tab badge still counts
downloads. Segment chips show counts, so you can see "2 on the way" without opening the segment. Library stays
first-class for the TV-first family: the default segment is Titles, which is what the TV home shows.

### 4.4 Settings: owner 10 groups → 5, H 7 → 5

| Group (after) | Rows | Came from |
| --- | --- | --- |
| Account | You card (+ Your profile) · password · sign out | You, Account |
| Look | Language · Appearance | Language, Appearance |
| Watching | Subtitles · Intros · Open Lilin on (+ Live) | Watching rows 1–3 |
| Downloads & storage | Quality · Largest download · Audio language (+dl) · Storage card | Downloads, Your library |
| Devices | Notifications on this device · Sign in a TV · Android TV · Jellyfin | Notifications, Watching rows 4–6 |

Moved out: Wrapped button (→ profile), idea box (→ What's new), Friends (→ profile), Moments (→ profile + What's
new), Invite people (→ Friends sheet), Library order (→ Library), Server · Ideas · People (→ Owner). The index (side
nav on desktop today) shows on phones too, as a chip row, so any group is 2 taps away. Phone height: H 3,929 →
~2,400 px; owner 5,657 (test server; live adds ~35 people cards) → ~2,500 px whatever the number of people.
Rule for later: **Settings holds only preferences, at most 5 groups**. Per-device things go in Devices.

### 4.5 Owner tools: 6 places → one Owner tab

| Segment | From | Notes |
| --- | --- | --- |
| Activity | Activity tab | stat tiles, people strip, filters, feed; faces → person panel |
| People | Settings › People + Activity's Invite tile, access list and person panel | one list; Invite on top; person panel = permissions + sign-in access + password link + library sharing + never auto-delete + their activity + Open profile |
| House | House tab | Overview · Screen Time (sub-segments as today) |
| Game clips | Clips tab | renamed so "clip" means game clips and "moment" means the everyone feature |
| Notes | Notes tab | Owner only (NOTES_EMAILS / canSeeNotes) |
| Ideas | Settings › Ideas | inbox + idea scout; Owner tab badge for unread |
| Server | Settings › Server | rules + Live TV channels (→ editor) + All server downloads (→ sheet) |

Phone/tablet: a sticky chip row (7 chips, co-owner 6, scrolls sideways on phones). Desktop: the Settings side index
pattern. The tab opens on the last segment used, so a Notes-heavy day is still one tap. Each segment keeps its own
filter field (the header search no longer filters these).

### 4.6 Live

Before: guide (+ owner chip), 1–2 blocks. After: Watch parties (only while one is planned) · guide · owner chip, 2–3
blocks. Live becomes "anything with a clock": channels on now, parties at a set time. Tuning, chat and the channel
editor are unchanged.

### 4.7 Header and What's new

Phone header: 5 controls on Discover → 4 on every tab. The What's new sheet becomes "what reached you":

1. **For you** (only when something's there): moments sent to you, answers to your ideas, friend requests waiting
   (each opens its sheet).
2. **Updates**: unseen whats-new entries, All updates.
3. Footer: **Send an idea or a bug** (members, H, R). Owners see "Ideas inbox (n) →" instead.

The bulb lights for unseen updates or For-you items. Swedish already calls it "Nyheter", which covers both.

## 5. How future features slot in

Each home has a rule and a budget, so the next 100 changes have somewhere to go without piling up.

| If the new feature is… | It goes… | Budget |
| --- | --- | --- |
| a way to find titles | Discover: a row (replacing or merging one) or a chip in the controls row | ≤ 12 blocks |
| something about a title | title page: ⋯ More item, a hero secondary button (max 3 + ⋯), or one of the 8 blocks | ≤ 8 blocks, 1 lit |
| about what you have or are waiting for | a section inside Library's Titles / Watchlist / Downloads | 3 segments |
| happening now or at a set time | Live (above or below the guide) | — |
| about you or your people | profile action row or a profile section | ≤ 4 actions |
| something sent to you | What's new › For you | — |
| a preference | a row in one of the 5 Settings groups (per-device → Devices) | 5 groups |
| an owner tool | an Owner segment | ≤ 8 segments |
| a player thing | player ⋯ menu or a player menu | — |

Worked examples from the fleet backlog: **Watch privately** → player ⋯ toggle + profile visibility (Settings ›
Account if it has to be global). **Up next for the whole room** → room panel. **Send a title to a friend** → title ⋯
More; arrivals in What's new › For you; a "From friends" row would *replace* Popular on Lilin or merge with it.
**Collection strip** → title page block 7 (More like this becomes "More like this · In this collection"). **Skip
recap / after-credits chip** → player overlays. **Personal billboard** ("co-owner loved it") → the billboard's reason line,
no new block. **Lock-screen controls / wake lock** → no UI. A rooms-open-now list → Live › Watch parties.

## 6. Risks and weaknesses (honest)

1. **The personal page is still behind a 32 px face.** Friends, Moments, Wrapped, your reviews and the household page
   all live behind the header face, not a tab. B's best argument: you don't see "you" in the tab bar, so for
   members the profile stays a secret door. Mitigation: the face carries a dot for friend requests and new moments,
   and What's new › For you surfaces new things. That's still weaker than a tab.
2. **Personal things are split across two places.** "Your stuff" is in Library (titles, watchlist, downloads),
   "you" is on the profile (taste, diary, friends, Wrapped). That's defensible (logistics vs identity), but someone
   looking for "my reviews" in Library won't find them.
3. **Pick together still needs a scroll.** It moves from 2.2 screens down to about 1, as a full tile, but it isn't
   ≤2 taps from cold. I tried a chip in the controls row: on a 390 px phone it scrolls off the right edge behind
   Documentaries and Genres. A tab or header slot would break the ≤5-tab or 4-control rules.
4. **The owner pays a tap.** Notes, House and Game clips go from 1 tap to 2 (1 for the last one used). Screen Time
   goes from 2 to 3. Owner uses Notes, House and Clips daily, so this is a real cost, paid to get labelled tabs and
   one hub.
5. **Continue watching leaves Library.** "Open Lilin on: Library" users (likely the TV-minded family) lose the shelf
   at the top of their start screen. The Recently watched sort and the card progress bars cover the job, but it's one
   step further away. If this tests badly, put the shelf back in Titles and take it off Discover. Don't keep both.
6. **"On its way" leaves Discover.** Pressing Download on Discover no longer shows the title in a row on the same
   page. Feedback becomes a toast ("Downloading · See Downloads") + the tab badge. Some people liked seeing it there.
7. **The type control scrolls away on phones.** Browse ▾ in the fixed header could change type from anywhere. The
   chip row under the billboard can't, once you've scrolled. Tapping Discover again should scroll to top (check
   that it does).
8. **Global search changes a habit.** Library's in-place text filter becomes the "On Lilin" section of global search.
   It's quicker for finding one title, but you can no longer narrow the grid by text while browsing.
9. **Merged rows trade variety for length.** One Popular and one Top rated row on All show half as many films and
   half as many shows as today. See all restores the full lists. Needs a `HOME_ROWS` change in `src/server.js`
   (the TV app uses the same endpoint: give the merge a new key and leave the old rows for TV).
10. **A changes the least.** If the real problem is that Lilin is now partly a social product, A only tidies the
    rooms and doesn't add one. C's critique ("social is scattered across Live, the profile, Discover and the player")
    is fair. A's answer is that social follows its object. That's a bet on the family accounts, not the 2–3 social
    users.
11. **More sheets.** Friends and Moments become sheets over the profile (#picker). That's fine on phones, but on
    desktop it's a dialog over a dialog when the profile is nested over a title page.

## 7. Scope

**Files that change** (`public/` unless noted):

| File | What |
| --- | --- |
| `index.html` | drop `#browse-btn`; Library segment bar; search layer section; Owner tab slot |
| `app.js` | `renderDiscover` row list + controls (drop `openBrowse`/`updateBrowseButton`, `onItsWayRow`, `savedShelf`, `newInLibraryRow` moves, `becauseRow`+`topPicksRow` merge, `moodRow` → vibes); search input → global layer; `renderLibrary` segments (drop Availability select, summary/travel buttons, Continue shelf; add Watchlist + Downloads); `renderSettings` 5 groups (drop `ideaBox`, Wrapped button, friends/moments/invite/owner groups) + phone index in `settingsLayout`; `ownerSettings` + `addAdminTab`/`enable*Tab`/`enableActivityTab` → one Owner hub; `renderActivity` access list → People; `renderDetails`/`renderFilm`/`renderShow` → one title renderer + one episode list (largest piece); What's new sheet (For you + footer); player ⋯ (Stats); "Can't play here" link; deep-link routing (2.4); Open Lilin on + Live; `renderMeButton` for H |
| `social.js` | `partiesShelf` → Live; `rateRow` → Reactions block |
| `live.js` | Watch parties section on top; editor reachable from Owner › Server |
| `friends.js`, `moments.js` | `settings()` → sheets opened from the profile; Moments for H |
| `profiles.js` (+ `profiles.css` ≈ 0) | action row (Friends, Moments), Wrapped in Numbers, household variant for H, faces → profile helper |
| `match.js` (+ `match.css`) | entry card → Moods-row tile (reuses vibe tile styles); "Ask to join" wording |
| `vibes.js` | absorbs `MOODS` (genre-backed vibes), Today tiles, Pick tile slot |
| `watchlist.js`, `coming-soon.js` | Watchlist segment; Save toast links there |
| `library-downloads.js`, `travel.js` | Downloads segment, On this phone |
| `reviews.js` | Reactions block + Rate sheet |
| `scout.js`, `notes-view.js`, `people.js` | Owner segments; person panel merge |
| `player-stats.js` | ⋯ menu entry |
| `documentaries.js` | entry via the controls chip |
| `i18n-sv.js` | ~70 new/changed strings (segment and group names, For you, Ask to join, Storage, Game clips…) |
| `sw.js` | cache version |
| `src/server.js` | merged Popular / Top rated keys in `HOME_ROWS` (new keys; old ones kept for the TV apps) |

**CSS (app CSS today 364,654 B).** Removed: Browse button + sheet (~1.4 KB), the over-billboard filter variants
(~1.6 KB of 2.4 KB), 6/7/8-tab overrides (~0.8 KB), Library availability/summary/travel buttons (~1.2 KB), '•••'
card button (~0.3 KB), the library season grid + episode rows once episodes are one list (~1.8 KB of 2.5 KB),
Settings Wrapped button (~0.5 KB), duplicated access/people cards (~1.5 KB), Pick entry card (~1.5 KB of 1.9 KB in
`match.css`), `page-extras` box (~0.3 KB). Added: Owner chip row + side index reuse (~0.4 KB), Library segment bar
(~0.3 KB), What's new For you (~0.6 KB), phone Settings index (~0.3 KB), Your copy block (~0.4 KB), Pick tile (~0.3
KB). **Net ≈ −8 KB (≈ −2.3 %), to ~356 KB.** Drift counters: `backdrop-filter` −1 to −2, `!important` −1, `@media`
−4 or so, nothing rises. The saving is modest on purpose: A moves features, it doesn't restyle them. JS: `app.js` net
−10 to −20 KB, mostly from the one title renderer and the Browse sheet.

**Suggested batches** (each shippable and revertable alone): 1) Owner hub + 5-tab rule · 2) Settings regroup +
profile/household/What's new homes · 3) Library segments + downloads/watchlist merges + parties → Live · 4) Discover
rows + controls + Moods/Pick · 5) global search · 6) one title page + one episode list.

## 8. Mockups (`A/`)

| File | Size | Shows |
| --- | --- | --- |
| `A/discover-phone.png` + `A/discover-phone-full.png` | 390×844 + 390×3780 (whole page) | Discover: 4-control header (Browse ▾ gone), one controls row, Continue watching, Moods with the Pick together tile and today's moods, the 11-block order, member tab bar with the Library badge |
| `A/owner-phone.png` | 390×844 | Owner tab on the People segment: chip row (Activity · People · House · Game clips · Notes · Ideas · Server), Invite as the one lit button, people with permission tags, 5 labelled owner tabs |
| `A/library-desktop.png` | 1440×900 | desktop header with the owner's 5 links, Library with Titles · Watchlist · Downloads (Watchlist open: Coming up, Saved, Following) and what the other two segments hold |

Source HTML is next to each PNG (`A/*.html`). They link `public/style.css`, `vibes.css` and `profiles.css` for the real
tokens and components, plus `A/mock.css` for the mockup-only bits. Blue dashed boxes are notes, not UI. Posters and
billboard art are crops of the before-shots (`A/assets/`).
