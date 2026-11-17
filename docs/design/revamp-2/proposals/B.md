# Proposal B: no Library tab, a "You" hub instead

Designer B, revamp round 2. Stance: **remove the Library tab and move what it holds into a personal hub.** This is
Owner's idea, argued as strongly as I can make it and then attacked by me in section 9. Ground truth is
`inventory.md`; section and table numbers below (2.1, 3.6 and so on) point into it. Mockups are in `B/` (section 11).

## 1. Thesis

Lilin's tabs were laid out by *where code lived*, not by *what a person is asking*. That's why the same thing
appears in two or three places. Today a viewer asks three questions: **what should I watch?** (Discover), **what's
on right now?** (Live) and **what's mine?** The third answer is spread over five places: the Library tab, three
Discover rows, the profile, half of Settings and three notification landings that scroll Settings to an anchor. The
inventory found that apart from the grid (with its Unidentified group), transfer management (Find torrents, Manage
downloads) and two conditional bits (the phone-copies summary, planned parties), everything in Library already
exists somewhere else (3.6). The watchlist is split three ways and downloads show up on seven
surfaces. So B removes the tab and builds one private hub, **You**, that answers "what's mine" completely: your
library, your list, downloads, history, ratings, Wrapped, friends, Moments and your settings, plus a "Right now"
strip for the time-bound things. The freed tab slot goes to **Search**. It becomes the one place to *find* things:
universal search, browse by type, genres, Moods, Coming soon, Documentaries and Pick together. That lets Discover
go back to being a curated feed. Owners get one more tab, **House**, which gathers every owner tool. Result:
every role has 4 or 5 labelled tabs that never scroll (Owner has 8 icon-only tabs today), Settings becomes pure
preferences, and every feature is at most 2 taps from a tab. The pattern isn't new: YouTube renamed Library to
**You** (2023) and Netflix replaced its Downloads tab with **My Netflix** (2023). Both did it for the same reason.

## 2. Sitemap

```
Discover  #discover       what to watch next (curated feed, 14 blocks max)
│  billboard (Dec–Jan: Wrapped is its first slide) · Continue watching · Popular on Lilin · Because you watched ·
│  Trending · Today's mood · Popular films · Popular shows · In cinemas · Top picks · New episodes · Coming soon ·
│  Top rated films · Top rated shows        type modes (Films/Shows/Documentaries) entered from Search, "Films ×" chip
│
Live      #live           what's on right now (unchanged: guide, channel strip, chat, owner "Your channels")
│
Search    #search         find anything (phone/tablet tab; on desktop the header field opens the same page)
│  field → results: In your library · On Lilin · Films & shows · Free on SVT Play · People · Live now
│  empty field → landing: Pick together · Browse (Films, Shows, Documentaries, Coming soon) · Moods · Genres
│
You       #you            everything that's yours (private; the public profile is one link away)
│  identity: face, name, @handle, View profile, Edit profile, ⚙ Settings
│  Right now (0–3 rows, time-bound): downloads on the way · leaving soon (Keep) · party today (Join) · preparing
│  Your library  shelf → #library  grid page: type · availability (+Leaving soon) · sort · filter · Unidentified · storage footer
│  Your list     shelf → #list     Plans (watch parties) · Coming up (dated) · Saved · Following
│  Yours:  Notes (Notes accounts) · Downloads #downloads · History #history · Ratings and reviews #reviews · Liked #liked
│  Wrapped card
│  People: Friends #friends (search, requests, list, invite someone) · Moments #moments · Activity #activity (owner, +act)
│  Lilin:  Ideas and bugs #ideas (members) · What's new · Settings #settings
│
House     #house          owners only: running the server
   status strip (server, VPN, sharing) · Needs you (0–3) ·
   People #people (invite, access list, permissions, restrict) · Everyone's downloads · Game clips #clips · Channels ·
   Ideas #ideas (inbox + scout) · Machines and power #machines · Screen Time · Server rules

Overlays (unchanged containers): title page (#sheet), small sheets (#picker), profile (.pf), player + room + live chat,
Pick together, Wrapped, Peek, TV remote/nowbar, What's new sheet.
```

## 3. Navigation

### 3.1 Tabs per role

| Role | Phone + tablet (< 900 px, bottom bar, always labelled) | Desktop (≥ 900 px, header) | Today |
| --- | --- | --- | --- |
| Home network shared account (H) | Discover · Live · Search · You | Discover · Live · You + search field | 4 (same) |
| Member, restricted (M, R) | Discover · Live · Search · You | Discover · Live · You + field | 4 |
| Member with Can see activity | Discover · Live · Search · You (Activity is in You) | same | 5, 11 px labels |
| Owner without Notes (co-owner) | Discover · Live · Search · You · House | Discover · Live · You · House + field | 7, icon-only |
| Owner with Notes (Owner) | Discover · Live · Search · You · House (Notes is in You) | same | 8, icon-only, scrolls |

- **The You tab wears your face** (24 px). H has no face, so it gets a person glyph. The tab carries the download
  count badge (moved from Library) and a bulb dot when something unseen waits: What's new, a friend request or a
  new Moment.
- **Phone header = the wordmark only.** Browse ▾, the search icon, the What's new pill and the profile face all
  leave the header: Search, Search, You and You respectively. The billboard gets a clean top edge on every width.
- **Desktop header:** wordmark · Discover · Live · You (with the face) · House · search field. The field is the only
  search. Focusing it (or pressing `/`) opens the Search page with the browse landing, so phones and desktop show
  the same content. There's no What's new pill or face button any more.
- The `.tabs:has(.tab:nth-child(6|7|8))` overflow rules, the edge fades and the icon-only mode are deleted. Five is
  the maximum, by rule (section 8).
- **Sub-pages** (Your library, Your list, Downloads, Friends, Settings, House → People…) open inside their tab with a
  back arrow and a page title in the header. They are pushState entries, so the phone's back gesture returns to the
  hub. The tab stays lit.

### 3.2 Why Search gets the slot (and the fewer-tabs alternative)

Removing Library and folding Settings into You frees **two** slots. B spends one on Search and gives the other back.
Search earns the slot because:
1. It absorbs five things that clutter Discover or have no home: the phone-only Browse ▾ sheet, the desktop
   segmented control + Genres chip, the Moods tile row, the Pick together line and the Coming soon "See all". That is
   what lets Discover drop from 18–21 blocks to 14.
2. It ends the **six meanings** of the search box (1.3). One global search, grouped, with "In your library" first.
   That is also the fleet review's feature #5 ("Search shows what's on Lilin first"). Lists that need a filter
   (your library, Activity, People, Game clips, Notes) get a small local filter field of their own.
3. On phones it moves search from the top-right corner into thumb reach. That matches Disney+, Apple TV and Prime
   Video, which all have a Search tab (Netflix keeps an icon at the top).

**Fallback, if the panel prefers fewer tabs:** Discover · Live · You (3 tabs; 4 for owners), with search back in
the header as an icon and the Search page reached from it. Everything else in B stays the same. The costs: browse
lives one tap deeper on phones, and the bar looks emptier. B also works as a hybrid with C. If a "Together" space
wins, it can take the slot, Search drops back to the header icon, and the hub hands its People group to Together.

## 4. Screens, before → after

### 4.1 Discover

| | Before (H account, type All) | After |
| --- | --- | --- |
| Blocks | 18; up to **21** with Wrapped banner, On its way, Saved for later | **14, fixed cap** (no conditional extras except Continue watching) |
| Phone height | 5,669 px | ~4,400 px (est.) |
| Controls above the rows | desktop: segmented type control + Genres chip; phones: Browse ▾ in the header | none: Search owns them. A type mode shows one "Films ×" chip |
| Removed blocks → new home | — | Moods tiles → Search · Pick together line → Search · 2 mood genre rows + Moods row → 1 "Today's mood" row · New in your library → You · On its way → You · Saved for later → You · Wrapped banner → billboard slide |

Discover stays the place for *discovery plus resume*: Continue watching remains row 1 (its Library copy goes away).

### 4.2 Search (new page, takes the freed slot)

Landing (empty field, see `B/phone-search.png`): field · Pick together card · Browse tiles (Films, Shows,
Documentaries, Coming soon) · Moods (4 tiles + See all, the merged set) · Genres chips. That's 5 blocks.
Typing: grouped results. In your library (instant, local) · On Lilin (server titles) · Films & shows (TMDB) ·
Free on SVT Play · People (M/O only, the existing friend search) · Live now (channel programmes). Restricted
filtering and SVT rules don't change.

### 4.3 You hub (new)

See `B/phone-you.png` (first screen), `B/phone-you-full.png` (whole hub) and `B/desktop-you.png` (two columns:
shelves left, lists right).

| Block | Owner | Member | +act | H | Restricted |
| --- | --- | --- | --- | --- | --- |
| Identity: face, name, @handle, View profile, Edit profile, ⚙ | ✓ | ✓ | ✓ | "Home network · shared by everyone at home", no profile link | ✓ (profile has no Friends section, as today) |
| Right now (0–3 rows) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Your library shelf (newest first, New/expiry/progress badges, "Shared with …") | ✓ | ✓ | ✓ | ✓ | ✓ |
| Your list shelf (dates lit when soon) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Yours: Notes · Downloads · History · Ratings and reviews · Liked | Notes if NOTES_EMAILS | no Notes | no Notes | **all of them (new for H)** | "Ratings" (R can't review) |
| Wrapped card | ✓ | ✓ | ✓ | ✓ | ✓ |
| People: Friends · Moments · Activity | all 3 | Friends, Moments | + Activity (read-only) | **Moments (new for H)** | Moments |
| Lilin: Ideas and bugs · What's new · Settings | no Ideas (it's in House) | ✓ | ✓ | ✓ | ✓ |

Blocks: **7–8** (identity, Right now, 2 shelves, Yours, Wrapped, People, Lilin). Member phone height ~1,880 px
(measured on the mockup). Compare what the hub replaces: Library 1,259 px + Settings 3,832 px for the same
member, across two tabs.

**Right now** replaces six scattered bits: the Library conversion banner, the "N downloading" and "for your phone"
summary buttons, the parties shelf, the Leaving soon shelf and Discover's On its way row. Priority order, 3 rows at
most: watch party in the next 12 h → leaving within 48 h (one-tap Keep) → downloads on the way / need attention →
preparing playback → phone copy ready. When there's nothing time-bound, the block is gone.

### 4.4 Sub-pages under You

| Page | Blocks | What it absorbs |
| --- | --- | --- |
| **Your library** `#library` | 3–7: toolbar (type · availability incl. Leaving soon · **Sort** · filter field), shared note, source notices, Films/Shows/Unidentified grids, empty state, storage footer | Library tab grid (11 blocks → these); Settings → Library order; Settings → Your library card (count, size, next to go, retention text, now beside the Keep badges it talks about) |
| **Your list** `#list` | segmented All · Coming up · Saved · Following, then Plans (parties) on top, then the list | Discover Saved for later + Library Coming up + Library parties shelf. Fixes "Coming soon" vs "Coming up" naming: TMDB keeps "Coming soon", yours is "Your list" |
| **Downloads** `#downloads` | header (Find torrents, Download settings, owner: Mine/Everyone), Preparing, On the way, Needs attention, On this phone | Library card transfer panels, '•••' details, summary buttons, Manage downloads (owner), Find torrents, convert banner, phone-copies list (now permanent) |
| History / Ratings and reviews / Liked | one list each | the profile's "More activity / More reviews / Liked" list pages, reused but scoped to you (private: includes what Watch privately will later hide from the profile) |
| Friends `#friends` | search, requests, list, Invite someone to Lilin (+inv) | Settings → Friends, Settings → Invite people |
| Moments `#moments` | Shared with you, Yours, an empty state that explains player ⋯ → Clip a moment | Settings → Moments |
| Activity `#activity` | stats, people strip, filters, feed (owner's Invite tile and access list leave for House → People) | Activity tab |
| Notes `#notes` | unchanged Notes view | Notes tab |
| Ideas and bugs `#ideas` | unchanged idea box | Settings → You → idea box |
| Settings `#settings` | see 4.5 | Settings tab |

### 4.5 Settings: preferences only

| | Before | After |
| --- | --- | --- |
| Groups, H | 7 (You, Language, Appearance, Watching 7 rows, Notifications, Downloads, Your library) | **6**: Language, Appearance, Watching (3 rows), Devices (3 rows), Notifications, Downloads |
| Groups, member with email | 8–11 (+ Friends, Moments, Invite people, Account) | **7**: Account + the 6 above |
| Groups, owner | 10 (+ Server, Ideas, People with ~35 cards on live) | **7** (owner groups move to House) |
| Phone height | member 3,832 px; owner 5,657 px on the test server, far more live | ~2,300–2,500 px for every role (est.) |

Watching keeps Subtitles, Intros and **Open Lilin on** (now Discover · Live · You · Your library, which fixes the
missing Live option). Sign in a TV, Android TV and Jellyfin move to a new **Devices** group. Library order becomes
the Sort control on the Your library page. The You card goes to the hub; the sign-in line and tags go to Account.
The Wrapped button, idea box, Friends, Moments, Invite people and Your library card all move to the hub. Settings
never holds content again (rule, section 8). The phone-only problem of having no index gets smaller because the page
roughly halves.

### 4.6 Title pages

Without a Library tab, "the library variant" of a title page stops meaning anything. B merges the three renderers
into **one page with two states**:
- *Not yours:* Add / Download (+ Advanced options, Dubbed), or "Already on the server: Add / Add & play / Add
  season".
- *Yours:* Play (the one lit button), Play on TV, versions, and a **⋯ Manage** menu (To phone, Keep longer,
  Delete, Identify for owners). The keep bar shows only inside 48 h.
- *Both states:* trailer, Save/Follow (today Discover-only, so you can now follow a show you already have),
  thumbs + Liked by (faces open profiles), Review, overview, cast, **one episode list with season chips** (fleet
  feature #4; per-episode ⋯ holds Keep/To phone/Play on TV/Delete), reviews, More like this, More details.

| | Before | After |
| --- | --- | --- |
| Discover film page | 10 blocks, 1 lit | ~10 blocks, 1 lit |
| Library film page | 11 blocks, 2 lit | same page as above, 1 lit |
| Library show page | 12 blocks, 71–73 buttons, **7 lit** | ~11 blocks, 1 lit (Play next episode); Keep links quiet |
| Episode UI | tabbed browser vs season grid → rows | one list, season chips |

This can ship separately (phase 2) if the tab change needs to land first.

### 4.7 Profiles: the public page vs the private hub

- **Profile** (`.pf`, `/#@handle`) is *how others see you*, Letterboxd-style: banner, favourites, numbers, recent
  activity, ratings, reviews, liked, friends. Content unchanged. Your own opens from You → identity card / View
  profile. The header face that opened it is gone because the You tab wears the face. Before 3 entries (header
  face, Settings → Your profile, `/#@handle`), after 2 + the tab icon.
- **You** is *what only you see and control*. It never renders banner, bio or favourites. Its History, Ratings and
  Liked rows open the same list component the profile's "More …" links use, scoped privately. One list
  implementation, two doors: the hub (private) and the profile (public, curated by your section settings).
- **Others' profiles** (nested `.pf`) are unchanged, but every face now leads somewhere: Activity people strip,
  Liked by, room roster, Live chat names, Pick together faces and search "People" results join the Friends list and
  review authors. Permission rules don't change (R and H still can't open others' profiles).

### 4.8 House: the owner hub (fleet open item "one owner hub tab")

See `B/phone-house.png`. Owner tools sit in **6 places** today (3.5): Settings (Server, Ideas, People), Activity
(invites, access), Live (channels), House, Clips and Notes. After: **one tab**.

| | Before | After |
| --- | --- | --- |
| House | 2 segments: Overview (status, Server, VPN, Sharing, Power, Machines) + Screen Time | status strip (3 tiles) · Needs you (0–3: new ideas, failed downloads, low disk) · Run the house: People, Everyone's downloads, Game clips, Channels, Ideas · System: Machines and power, Screen Time, Server rules. **3–4 blocks**, each tool one tap further |
| People admin | permissions in Settings → People + invites/access/person panel in Activity | one **People** page: Invite button, filter, list, person panel with permissions + access + last seen |
| Clips | "Clips" tab (name clashes with Moments) | **Game clips** page (renamed; `/c/<token>` share pages unchanged) |
| Ideas inbox + scout | Settings group 9 of 10 | House → Ideas, plus a Needs-you row when new |
| Channel editor + SEELE TV picks | Live → Your channels chip | same chip + House → Channels |
| Notes, Activity | owner tabs | You (Notes is personal; Activity is shared with +act members, so it sits where both roles can reach it) |

## 5. Every feature, placed

"Entries" counts UI entry points as the inventory lists them (tabs, buttons, rows, links, notifications/deep
links). = means unchanged. Nothing is deleted. Things move, merge or get demoted.

### 5.1 Discover and browsing (inventory 2.1)

| Feature | Today | B: new home | Entries |
| --- | --- | --- | --- |
| Billboard | Discover top | = (Wrapped becomes its first slide Dec–Jan) | 1 → 1 |
| TMDB rows ×8 + See all grids, type sets | Discover | = all 8; type sets via Search → Films/Shows/Documentaries (opens Discover in that mode) | 2 → 2 |
| Continue watching (+ Up next, hide ⋯) | Discover row 1 **and** Library shelf | Discover row 1 only; progress bars on Your library cards | 2 → 1 |
| On its way | Discover row | You → Right now → Downloads (counted under Downloads, 5.3) | moved |
| Saved for later | Discover row | You → Your list | 1 → 1 |
| Popular on Lilin, Because you watched, Top picks | Discover | = | 1 → 1 |
| New in your library | Discover row | You → Your library shelf (newest first, New badges) | 1 → 1 |
| Mood genre rows (2/day of 10) | Discover ×2 | the 10 moods join the vibe set; Discover shows **one** "Today's mood" row | 2 rows → 1 |
| Moods (28 vibe tiles + mood page) | Discover row | Search → Moods + Discover "Today's mood" (See all) | 1 → 2 |
| Type filter + Genres | desktop segmented + chip; phones Browse ▾ sheet | Search → Browse tiles + Genres, same control at every width | 2 different → 1 |
| Documentaries + SVT Play | type filter / Browse; SVT hits in search; SVT sheet | Search → Documentaries tile; "Free on SVT Play" result group; SVT sheet = | 3 → 3 |
| Coming soon (row + page) | Discover row → See all | = + Search → Coming soon tile | 1 → 2 |
| Search | header field/icon, 6 meanings | Search tab (phone/tablet) / header field (desktop), 1 meaning, grouped results; local filter fields on list pages | 1 → 1 |
| Peek | hover / long press | = | 2 → 2 |
| Pick together | Discover block 7 of 18, one quiet line; `?pick=`; notifications | Search → Pick together card (first thing on the landing); `?pick=`, notifications = | 3 → 3 (scroll → 2 taps) |
| Wrapped teaser | Discover block (Dec–Jan) | billboard first slide (Dec–Jan), hideable | 1 → 1 |

### 5.2 Title pages (2.2)

| Feature | Today | B: new home | Entries |
| --- | --- | --- | --- |
| Title page, Discover variant | `#sheet`, renderDetails | one title page, "not yours" state | callers = |
| Title page, library film | renderFilm | one title page, "yours" state | Library card → Your library card; others = |
| Title page, library show | renderShow | one title page, "yours" state, one episode list | same |
| Trailer | hero | = | 1 → 1 |
| Add / Download / Advanced / Dubbed | Discover variant | "not yours" state | 1 → 1 |
| Already on the server | Discover variant | "not yours" state | 1 → 1 |
| Save for later / Follow (+ auto-download) | Discover variant; Coming soon cards | **both** states; Coming soon cards =; the list: You → Your list | 2 → 2 (+ list) |
| Thumbs + Liked by | all variants | =; faces open profiles | 1 → 1 |
| Reviews (button, section, See all, composer) | title page | =; your own also in You → Ratings and reviews | 3 → 4 |
| Cast rail | title page | = | — |
| Episodes | tabbed browser vs season grid → rows | one list, season chips, per-episode ⋯ | 2 patterns → 1 |
| Versions | both | "yours" state | = |
| More like this | title page | = | = |
| More details | title page bottom | = | = |
| Keep longer / Leaving soon | keep bar, card badges, Library shelf, Settings text | keep bar (<48 h, else ⋯ Manage), card badge, You → Right now (one-tap Keep), Your library → Leaving soon filter; rules text in the Your library footer | 4 → 4 |
| Play on TV / To phone / Delete | library film chips; file ⋯ | "yours": Play on TV button; To phone + Delete in ⋯ Manage; per-episode ⋯ | 2 → 2 |
| Identify film (O) | library film chip | ⋯ Manage + Your library → Unidentified group | 1 → 2 |

### 5.3 Library and downloads (2.3)

| Feature | Today | B: new home | Entries |
| --- | --- | --- | --- |
| Library grid + All/Films/Shows + Availability | Library tab | You → Your library shelf → `#library` page (toolbar + Sort + filter) | 1 → 2 (shelf, "Open Lilin on: Your library"); newest 10 at 1 tap, full grid at 2 |
| Shared-library note | Library top | `#library` top + hub shelf subtitle | 1 → 2 |
| Continue watching | Discover + Library | see 5.1 | 2 → 1 |
| Coming up (saved releases, next episodes) | Library shelf | You → Your list, Coming up | 1 → 1 |
| Leaving soon (< 48 h) | Library shelf | You → Right now + Your library filter | 1 → 2 |
| Downloads in progress | **7 surfaces** (Discover row, card panels, summary, Availability, tab badge, Manage sheet, '•••') | You tab badge · Right now row · `#downloads` page · progress line on Your library cards | **7 → 4** |
| Manage downloads (all transfers, O) | Library header | `#downloads` "Everyone" toggle + House → Everyone's downloads (same page) | 1 → 2 |
| Find torrents (+dl, torrents on) | Library header | `#downloads` header | 1 → 1 |
| Conversion banner | Library top | `#downloads` Preparing + Right now row; the player's "Can't play here" box links straight there | 1 → 3 (dead end fixed) |
| Download to phone (copies + list) | To phone, file ⋯, Season to phone, Library summary (only while copies exist), `?travel=1` | actions =; list: `#downloads` → On this phone (always there); `?travel=1` | 5 → 5 (list gets a permanent home) |
| Planned watch parties | Library shelf (only while one exists) | You → Your list → Plans + Right now on the day | 1 → 2 |
| Source notices (scan / download errors) | Library | `#library` (scan) / `#downloads` (downloads) | 1 → 1 |

### 5.4 Playback, rooms, TV (2.4)

| Feature | Today | B: new home | Entries |
| --- | --- | --- | --- |
| Player | `#player` | = | 5 → 5 |
| Play now | player | = | = |
| Skip intro / Up next / Play next | player; Settings → Intros | = | = |
| Bedtime, subtitle look | player menus | = | = |
| Quality, Audio, Subtitles | player menus | = | = |
| AirPlay / PiP / fullscreen guide / iPhone PiP | player | = | = |
| Stats for nerds | `I` / right-click only | + player ⋯ menu item, so touch gets an entry and the one-item ⋯ menu gets a second | 2 → 3 |
| Watch Together rooms | pill, `/c/w/`, notification, Library parties shelf, Pick match | parties shelf → Your list → Plans; rest = | 5 → 5 |
| Moments (make one) | player ⋯ → Clip a moment | = | 1 → 1 |
| Play on TV + nowbar + remote | library chip, file ⋯, nowbar | title page "yours", episode ⋯, nowbar | 3 → 3 |
| Live guide + tuning + channel strip | Live tab; channel numbers | = + "Open Lilin on: Live" | 2 → 3 |
| Live chat | channel strip | = | = |
| Channel editor + SEELE TV picks (O) | Live → Your channels | = + House → Channels | 1 → 2 |

### 5.5 People, social, personal (2.5)

| Feature | Today | B: new home | Entries |
| --- | --- | --- | --- |
| Profile (own) | header face; Settings → Your profile; `/#@handle` | You → identity / View profile; `/#@handle` | 3 → 2 (+ tab icon) |
| Profile editor | profile → Edit profile | = + You → Edit profile | 1 → 2 |
| Others' profiles | Friends list, review author, `/#@handle` | + Activity faces, Liked by, room roster, Live chat names, Pick faces, search People | 3 → 9 (dead ends fixed; rules =) |
| Friends (search, requests, list, remove) | Settings → Friends; profile Add/Accept; popup; `?friends=1` | You → Friends page; profile =; popup =; `?friends=1` → Friends page; search People | 4 → 5 |
| Friend-request popup | automatic | = + You tab dot + Friends row count | 1 → 1 |
| Moments inbox | Settings → Moments (hidden until one exists); `?moment=` | You → Moments (always listed, empty state teaches); `?moment=` → there; **H gets it** | 2 → 2 |
| Activity | Activity tab (O; +act read-only) | You → Activity; owner admin parts → House → People | 1 → 1 (owner bar −1 tab) |
| Wrapped | Discover banner (Dec–Jan); Settings → You button; `?wrapped=` | billboard slide (Dec–Jan); You → Wrapped card (all year); `?wrapped=` | 3 → 3 |
| What's new | header pill/bulb; auto popup; `?update=` | You → What's new row + tab dot; auto popup =; `?update=` = | 3 → 3 |
| Idea box (M, H, R) | Settings → You; `?ideas=1` | You → Ideas and bugs; `?ideas=1` → there | 2 → 2 |
| Ideas inbox + scout (O) | Settings → Ideas; `?ideas=1` | House → Ideas + Needs-you row; `?ideas=1` → there | 2 → 3 |
| Invite people (+inv) | Settings → Invite people | You → Friends → Invite someone to Lilin | 1 → 1 |
| Owner invites + who may sign in | Activity → Invite tile / person panel | House → People (Invite button, access list, person panel) | 1 → 1 (merged with permissions) |

### 5.6 Settings and owner tools (2.6), header items

| Feature | Today | B: new home | Entries |
| --- | --- | --- | --- |
| You card + Your profile button | Settings → You | You hub identity card (sign-in line + tags → Settings → Account) | 1 → 1 |
| Account (sign out, password) | Settings → You | Settings → Account (first group) | 1 → 1 |
| Language, Appearance | Settings | = | = |
| Watching (7 rows) | Settings → Watching | Watching (Subtitles, Intros, Open Lilin on) + **Devices** (Sign in a TV, Android TV, Jellyfin); Library order → `#library` Sort | 1 group → 2 groups + 1 page control |
| Notifications | Settings group 5–7 | Settings group 4 | 1 → 1 |
| Download preferences (+dl) | Settings → Downloads | = + "Download settings" link on `#downloads` | 1 → 2 |
| Your library card | Settings → Your library | `#library` storage footer | 1 → 1 |
| Server rules (O) | Settings → Server | House → Server rules | 1 → 1 |
| People (O) | Settings → People | House → People | 1 → 1 |
| House overview + Screen Time (O) | House tab, 2 segments | House status strip + Machines and power + Screen Time rows | 1 → 1 |
| Clips (O game clips) | Clips tab; `/c/<token>` | House → Game clips; `/c/` = | 2 → 2 |
| Notes (O + Notes) | Notes tab; `?note=`; `/c/n/` | You → Notes (first row); deep links = | 3 → 3 |
| Preview pill | fixed pill | = | = |
| Wordmark | header (= Discover home) | = | = |
| Profile face button | header | becomes the You tab's icon | — |
| Browse ▾ (phones) | header on Discover | replaced by the Search tab | — |
| Settings tab | tab | You → ⚙ and You → Settings row | 1 → 2 |
| Library tab + download badge | tab | You tab (badge moves with it) | — |

**Taps from a tab, before → after** (the criteria list): Pick together scroll → 2 · Friends scroll → 2 · Moments
scroll (hidden) → 2 · your ratings/reviews/likes 2+scroll (H: impossible) → 2 · Wrapped outside Dec–Jan
tab+scroll → 2 · phone copies conditional → 2 · Library order scroll → 2 · TV/Android/Jellyfin row 4–6 → 2 ·
owner Ideas/People/Server rules bottom of 5.7k px → 2 · owner invite (Activity) → 2 · Screen Time 2 → 2 · full library
grid **1 → 2** · Notes, Game clips, Activity, House tools **1 → 2** (but from labelled tabs instead of an
icon-only scrolling bar). Nothing is deeper than 2 taps from a tab.

## 6. Old URLs and deep links

The trick that keeps this cheap: **old hash names become page names.** `#library` doesn't redirect anywhere. It's
still the library grid, now shown as a page under You. Today `linkedView()` checks `.tab[data-view]`. B replaces
that with a page table `{ page → { tab, allowed() } }`, so an unknown or forbidden page falls back exactly as
today (to the start view).

| Link (who sends it) | Today | B |
| --- | --- | --- |
| `#discover`, `#live` | tab | = |
| `#library` (download-ready push `/#library`, reloads, bookmarks) | Library tab | You › Your library page |
| `#downloads` | Library + "On the way" filter | You › Downloads page |
| `#settings` | Settings tab | You › Settings page |
| `#activity` | Activity tab | You › Activity (if allowed, else start view as today) |
| `#notes` | Notes tab | You › Notes |
| `#house` | House tab | House hub (status strip on top; the full overview is `#machines`) |
| `#clips` | Clips tab | House › Game clips |
| `/?travel=1#library` (push) | Library + phone-copies sheet | You › Downloads, On this phone, sheet open |
| `/?friends=1#settings` (push) | Settings scrolled to Friends | You › Friends |
| `/?ideas=1#settings` (push) | Settings scrolled to idea box / inbox | member: You › Ideas and bugs; owner: House › Ideas |
| `?moment=<id>` (push) | Settings → Moments, plays it | You › Moments, plays it |
| `?note=<id>`, `/c/n/<token>` | Notes | You › Notes, opens it |
| `/#@handle`, `?watch=`, `/c/w/`, `?pick=`, `?update=`, `?wrapped=`, `?play=` | overlays | = |
| `/c/*`, `/signin`, `/android`, `/preview`, `/c/oidc/*`, `/c/jf/*` | stand-alone pages | = |
| Saved "Open Lilin on" = `library` / `downloads` (src/accounts.js `START_VIEWS`) | Library | Your library / Downloads (old values stay valid; `live` and `you` are added) |
| New pages | — | `#you`, `#search`, `#list`, `#friends`, `#moments`, `#history`, `#reviews`, `#liked`, `#ideas`, `#people`, `#machines`, `#screentime`, `#rules`, `#channels` |

Server push URLs don't *need* to change, because every old one still lands right. An optional tidy-up in
src/server.js: `/?travel=1#downloads`, `/?friends=1#friends`, `/?ideas=1#ideas`. TV apps (public/tv, Samsung, Rust)
only use the API, and no API route changes.

## 7. How future features slot in

| If the new thing is… | It goes to | Budget rule |
| --- | --- | --- |
| a way to *find* something | Search landing tile or result group | — |
| personalised discovery ("From friends", "co-owner loved it") | a Discover row | only by replacing one: cap 14 blocks |
| something *yours* (a list, history, a thing you made) | You: a row in one of the three groups, or a section of Your list / Downloads | hub: 3 groups, ≤ 12 rows |
| time-bound and about you | You → Right now + the tab dot | 3 rows shown at most |
| social between people | You → People row; the action itself on the title page or in the player | — |
| live / happening now | Live | — |
| about running the server | House row (+ Needs you if it needs action) | — |
| a preference | Settings | Settings never holds content |
| about one title | title page, in the state it belongs to, or More details | one lit button per page |
| during playback | player ⋯ menu (now a real menu) | — |

The fleet review's next features land without new tabs. **Watch privately** → Settings → a Privacy row + profile
visibility (the hub's private History keeps everything). **Up next for the room** → room panel. **Lock-screen
controls** → player. **Season tabs** → already in 4.6. **On-Lilin-first search** → already in 4.2. **Send to a
friend** → title-page Share + a "Sent to you" section in Your list. **Collection strip** → title page.
**After-credits chip** → player.

## 8. Rules B commits to

1. At most 5 tabs, always labelled, never scrolling. The bar has no overflow CSS.
2. One home per feature. A second entry point is allowed only as a *shortcut to the same page* (e.g. Channels in
   Live and House), never as a second rendering.
3. Discover ≤ 14 blocks; hub ≤ 8 blocks; Settings = preferences only; House = owner only.
4. Time-bound personal things go to Right now (hub) or Needs you (House), never as banners on other screens.
5. One lit button per screen, and Play is it whenever you have the title.

## 9. Risks and weaknesses (honest)

1. **"Library" is the word everyone knows.** Plex, Jellyfin, Apple TV and Lilin itself all use it, and "You" is
   abstract. About 35 people (family included) have to relearn where their films are, and the TV-first relatives
   will feel it most if they ever open the web app. Mitigations: the first shelf in You is literally titled
   **Your library** (Ditt bibliotek), a What's new entry explains the move, and `#library` keeps working. The
   relearning cost is still real, and A doesn't pay it.
2. **The full grid goes from 1 tap to 2.** Anyone who browses their own collection pays a tap every time. People
   whose start view is Library land on `#library` directly, but everyone else pays.
3. **The hub can become Settings 2.0**, a junk drawer that gets longer every week. The 8-block / 12-row cap is a
   promise, not a mechanism. If it's broken twice, B ends up with the same problem in a new place.
4. **Two "me" surfaces.** The hub and the public profile both show ratings, reviews and liked titles (as private
   lists versus public sections). The shared list component limits the code duplication, but users still see
   "Ratings" in two places. That's a duplicate the inventory would flag.
5. **"You" for the shared Home network account** is semantically off: it's the whole household, with no face and
   no profile. The label stays "You" for consistency, and the card says "shared by everyone at home". It's still
   awkward. Giving H History/Ratings/Moments also needs the profile list endpoints to answer for an email-less
   account in self-only mode, which is a small server change.
6. **Owners lose one-tap access** to Notes, Game clips, Activity and the House tools (2 taps). Owner's Notes and
   clip-trimming habits are the likeliest to feel slower, even though the bar becomes readable.
7. **Desktop browse gets one click deeper.** Today Films is one click on the segmented control. In B it's field →
   Films (2). On desktop the Search page doesn't have a tab of its own, so it's less discoverable than the control
   sitting above Discover.
8. **Downloads and the watchlist leave Discover.** Netflix keeps My List on Home for a reason: the list is a source
   of what to watch tonight. Usage of Saved/Follow could drop. Right now and the tab badge make up for downloads,
   but not for the watchlist as inspiration.
9. **Social ends up scattered** across Search (Pick together), You (Friends, Moments, Activity), the player (rooms)
   and Your list (plans). C's "Together" will score better on social discoverability, and B is weakest there.
10. **Implementation risk.** app.js is 10.5k lines. The live-updating library cards (`libraryCards`, transfer
    patches, focus anchoring) are delicate, and moving transfer panels off the cards touches them. The router
    change touches every deep link. The title-page merge (4.6) is the biggest single job and should be its own
    phase. Tests that reference tabs or `#library` need updating (library-refresh, library-downloads-ui,
    download-ui, live, push, auth, smart-download, player-next).
11. **Restricted/permission leaks.** The hub puts many role-gated rows on one page (Friends, Activity, Ideas, Notes,
    reviews). Every row needs its gate copied exactly from where it lives today. That's easy to get wrong once.

## 10. Scope

**Web files (public/):**
- `index.html`: tab markup (Discover · Live · Search · You; House added at runtime), `#view-you` + page container
  instead of `#view-library`/`#view-settings`, header loses browse-btn, search-toggle/cancel, news-btn, me-btn.
- `app.js`: page table + pushState for sub-pages; new `renderYou` (~250 lines), `renderSearch` landing + grouped
  results (~150, reusing the existing TMDB/SVT/friend searches), `renderHouseHub` (~120); `renderLibrary` mounts in
  the `#library` page minus shelves/summaries/transfer panels; transfer details → Downloads page; `renderSettings`
  loses the You, Friends, Moments, Invite, Your library and owner groups and gains Devices; `renderDiscover` drops 6
  blocks and gains the type-mode chip; `addAdminTab`/`enableActivityTab`/`enableClipsTab`/`enableNotesTab` become page
  registrations; one meaning for the search input; `wrappedBanner` → billboard slide; the convert box links to
  Downloads; Open Lilin on options. Estimate: ~+550 / −400 lines.
- `billboard.js` (Wrapped slide), `vibes.js/.css` (Today's mood row; MOODS join the set), `match.js` (entry moves),
  `friends.js`, `moments.js` (render as pages, H gate), `social.js` (parties → Your list; faces → profiles),
  `profiles.js` (openMine from the hub; shared list component), `people.js` + `scout.js` (House pages),
  `library-downloads.js`, `travel.js` (Downloads page), `notes-view.js` (mount), `i18n-sv.js` (~60 new strings,
  ~40 dropped; "You" = "Du", "Your list" = "Din lista", "House" = "Huset").
- **Server (small):** `src/accounts.js` `START_VIEWS` + `live`, `you`; the profile list endpoints answer H in
  self-only mode; push URLs optional (section 6).

**CSS, expected to go down.** Measured in style.css today and removable: tab overflow rules 961 B, Browse
button/sheet ~600 B (the tiles are reused), Discover filters 1,336 B, library transfer panels/summary/'•••'
2,722 B, Wrapped banner 1,651 B, Settings wrapped-open + You card 1,637 B, What's new pill 720 B, search
toggle/cancel 610 B, `.me-btn` (profiles.css) ~600 B, for **≈ 10.8 KB out**. In: hub identity, list rows, Right now,
tab face/dot, Search landing, House strip, built on `.set-stack`, `.shelf`, `.vibe-tile` and `.chip`: **≈ 4–5 KB**.
Net **≈ −6 KB (−1.6 % of 364,654 B)**, with fewer `@media`/`:has()` rules, no new blur, no new keyframes and no
infinite animations. The mockups' `B/mock.css` is 8 KB because it's mock scaffolding; production reuses
`.set-row`/`.set-stack`.

**Phasing:** (1) tabs + You hub + Search + House + Settings split + routing; (2) title-page merge; (3) the
optional server push-URL tidy-up.

## 11. Mockups

Static HTML in `B/` that loads `public/style.css` + `public/vibes.css` (tokens, cards, shelves, `.set-stack`, tabs)
plus `B/mock.css` for the new pieces. Rendered with headless Chromium through DevTools device metrics (mobile
emulation for phones). Poster art is cropped from the before-shots (`B/img/`).

| File | Shows |
| --- | --- |
| `B/phone-you.png` (390×844) | member's You hub, first screen: identity, Right now, Your library, 4-tab bar with the face tab |
| `B/phone-you-full.png` (390×1880) | the whole member hub (all 8 blocks) |
| `B/phone-search.png` (390×844) | owner's Search tab landing: Pick together, Browse tiles, Moods, Genres, **5 labelled tabs** |
| `B/phone-house.png` (390×844) | owner hub: status strip, Needs you, Run the house, System |
| `B/desktop-you.png` (1440×900) | owner hub on desktop: header Discover · Live · You · House + search, shelves left, lists right |
