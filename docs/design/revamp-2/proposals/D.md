# Proposal D (wildcard): Watch / Find, one search box, one title page

Designer D, Lilin revamp round 2. Ground truth: [inventory.md](../inventory.md). Mockups: [D/](D/) (static HTML on
the real `public/style.css` tokens, rendered with headless Chromium; see section 9).

## 1. Thesis

Lilin has **two homes and no catalogue**. Discover is half storefront (TMDB rows) and half home (Continue, On its
way, Saved, New in your library, Popular on Lilin). Library is half home (Continue, Coming up, Leaving soon, parties)
and half a catalogue of what you own. Settings is half settings, half social inbox and half owner console. The
"Open Lilin on: Discover / Library" setting exists because the app never decided which one is home. D stops
splitting by where the data comes from and splits by intent instead. **Watch** holds everything that is yours or
ready to play: the Library *becomes the home*, with the billboard on top. **Find** holds everything you don't have
yet: the world's catalogue, moods, Coming soon, Pick together, and one search box that means one thing everywhere
and also finds every *place* in Lilin by name. **Live** is what's on right now. **You** is people and preferences;
owners get **House** for every owner tool. The tab bar is capped at 4 (5 for owners) for good, and a title is
**one page** whose actions follow the title's state, not the tab you came from. New features get a home from a
fixed slot table plus one search entry, so they never need a new tab or another row on the front page.

What D deliberately does not do: it doesn't add a social space (C) and doesn't move your titles into a profile hub
(B). People features stay where the person is (faces, You, the room panel), and titles stay with titles.

## 2. Sitemap

```
Watch  (Titta)            wordmark, default start, #watch, #library, #downloads, ?travel=1
├─ Billboard: up to 5 playable picks (new episode of a followed show, saved title now ready, new on Lilin,
│  popular on Lilin, a "because you watched" hit that's on Lilin). Dec–Jan: a Wrapped slide
├─ Keep watching            Continue + Up next (⋯ hide), the only copy
├─ On its way*              downloads + "Preparing playback"; head: "2 on the way · 1 needs a look ›"
├─ Ready for you*           new in your library + saved titles now ready + followed episodes that arrived
├─ Your list                Saved + Following (dated); See all → Your list page (Saved · Following · Dates)
├─ Leaving soon*            < 48 h, Keep
├─ On this phone*           phone copies, only while copies exist
├─ Popular on Lilin
└─ Your library             caption (shared with …) · sticky toolbar: All/Films/Shows/Unidentified* ·
                            Ready/On the way/Needs a look/Leaving soon · Order ▾ · Filter · grid · footer line
                            (count · size · retention · next to go → Keep)
Find  (Hitta)             #find, #discover, the search box
├─ Search field (phones: top of the page; desktop: the header field)
├─ Chip bar, same at every width: All · Films · Shows · Documentaries · Genres ▾
├─ Trending this week · Moods (28 vibes; today's 2 first) · Pick together (card)
├─ Top picks for you · Because you watched X · Coming soon (→ page)
└─ Popular now · In cinemas now · New episodes this week · Top rated   (Films/Shows chips: their own sets)
Live                      #live
├─ On now (channel cards → guide) · tuning, channel strip, chat as today
├─ Planned watch parties*   moved from Library
└─ Your channels (O chip) → editor + SEELE TV picks
You  (Du)                 desktop: the face; phones: the tab (your face is its icon). #you, #settings
├─ You card: face, name, @handle, Profile → profile page (H: "Home network" card, no profile)
├─ People: Friends (requests) · Moments (new) · Activity (+act) · Invite to Lilin (+inv)
├─ Yours: Wrapped · Ideas (send an idea, see answers; not O)
└─ Settings: Account · Appearance & language · Playback & subtitles · Notifications · Devices & TVs · Downloads (+dl)
House  (Huset), owners    #house, #notes, #clips, #activity (O)
├─ Status card (needs a look) + one line of server numbers  = today's Overview, condensed
└─ Tiles: Notes (Notes) · Clips · People · Activity · Ideas · Downloads · Channels · Server rules · Screen Time
Unchanged containers: title page (#sheet), small sheets (#picker), profile (.pf), Pick together, Wrapped, Peek,
player + room + chat + moment panel, remote, What's new sheet, /c/ pages.
```

`*` = only while it has something. You sub-pages and House tools are **views with their own routes**
(`#you/friends`, `#house/people`), not sheets, so Back and deep links work and no new container is added.

### 2.1 Navigation per width

| Width | Navigation |
| --- | --- |
| Phone < 600 | Bottom bar, always labelled: **Watch · Find · Live · You** (owners: Watch · Find · Live · House · You). Header: wordmark (→ top of Watch) and the What's new bulb only. No Browse ▾, no search icon, no face in the header. Second tap on Find focuses its search field. Badges: Watch = downloads (today's Library badge), You = a dot for friend requests / new moments / idea answers, House = a dot when status needs a look |
| Tablet 600–899 | Same bar and pages; wider grids. You and House show list + page side by side in landscape |
| Desktop ≥ 900 | Header: wordmark · Watch · Find · Live · (House) … search field ("Search Lilin", Ctrl K or `/`, results drop down in place) · What's new · face (→ You). You and House are two-pane (list or tiles on the left, the open page on the right), reusing today's Settings side-index layout |

### 2.2 Variants by role

| Role | Tabs (phone) | You contains | House |
| --- | --- | --- | --- |
| Home network shared account (H) | Watch · Find · Live · You | "Home network" card (no profile), Moments\*\*, Wrapped, Ideas, Settings | — |
| Member (M) | Watch · Find · Live · You | You card, Friends, Moments, Wrapped, Ideas, Settings; +act: Activity; +inv: Invite to Lilin; +dl: Downloads settings | — |
| Restricted (R) | Watch · Find · Live · You | You card (no Friends section on the profile, as today), Moments, Wrapped, Ideas, Settings. No Friends, Activity, Invite rows. Reviews and live chat stay hidden exactly as today | — |
| Owner without Notes (co-owner) | Watch · Find · Live · House · You | You card, Friends, Moments, Wrapped, Settings (owners have no idea box today) | 8 tiles (no Notes) |
| Owner with Notes (Owner) | Watch · Find · Live · House · You | same | 9 tiles, Notes first |

\*\* H makes moments today but never sees them. The server already lists them (`src/moments.js` `list()` keys on
`user.id`); only the client gate in `public/moments.js` (`if (!me()?.email) return []`) hides them, so lifting it is
a UI move with no rule change. (Corrected in critique round 1; the first version called it a server question.)

Tab counts: owner phone 8 icon-only, scrolling → **5 labelled**; co-owner 7 → 5; +act member 5 → 4; everyone else 4 → 4.

## 3. Every feature, placed

Counts are entry points as listed in the inventory (taps in the UI, links and notifications that land there).
"+⌕" means the feature is also a result in the one search box (section 4); that is not counted as an entry point.

### 3.1 Discover and browsing

| Feature | New home | Entries before → after | Move |
| --- | --- | --- | --- |
| Billboard | Watch, top. Slides are playable picks (Play/Resume, or Add & play for shared titles); Trending moves to Find row 1 | 1 → 1 | moved, re-aimed |
| TMDB rows (8) | Find. All view merges Popular films + shows → "Popular now" and Top rated films + shows → "Top rated"; Films/Shows chips keep each set | 2 → 2 (row, See all) +⌕ | 8 rows → 6 |
| Personal rows (7) | Continue → Watch "Keep watching"; On its way → Watch; Saved for later → Watch "Your list"; Popular on Lilin → Watch; New in your library → Watch "Ready for you"; Because you watched + Top picks → Find | Continue 2 → 1; the rest 1 → 1 | split by intent |
| Mood genre rows (app.js `MOODS`) | Folded into vibes: missing `MOODS` entries become vibes; today's two lead the Moods row instead of being 2 separate rows | 2 rows a day → 0 extra rows | merged |
| Moods (28 vibes) | Find, row 2 | 1 → 1 +⌕ (each vibe by name) | stays |
| Type filter + Genres | One chip bar on Find at every width; Browse ▾ header button and its sheet go | 2 different controls → 1 | merged |
| Documentaries + SVT Play | Find → Documentaries chip (visible on phones); "Free on SVT Play" search group; SVT titles open the one title page (state "Free on SVT Play") | 3 → 3 +⌕ (phones: hidden in a sheet → visible chip) | promoted |
| Coming soon | Find row → page; its one-tap Save/Follow feeds Your list | 2 → 2 +⌕ | stays |
| Search | One box, one meaning (section 4). Phones: top of Find; desktop: header field + Ctrl K | 1 box with 6 meanings → 1 box, 1 meaning | merged |
| Peek | unchanged | 2 → 2 | — |
| Pick together | Find card, block 5 (was a quiet line, block 7 of 18); `?pick=`; notifications | 3 → 3 +⌕ | promoted |
| Wrapped teaser | A Watch billboard slide, Dec–Jan (no extra block); its Hide still works ("still in You") | 1 → 1 | merged into billboard |

### 3.2 Title pages

| Feature | New home | Entries before → after | Move |
| --- | --- | --- | --- |
| Title page, 3 variants | **One** title page; the hero's actions follow the state (section 6.3) | every card → same page; 3 renderers → 1 | merged |
| Trailer | secondary row | 1 → 1 | — |
| Add / Download / Advanced options / Dubbed | Primary when not on Lilin (+dl); Advanced options + Dubbed in More ⋯, also on owned titles ("Get another version") | Discover variant only → every title | merged |
| Already on the server (Add, Add & play, Add season) | Primary for "On Lilin, not in your library" (members without +dl, as today) | 1 → 1 | — |
| Save for later / Follow (+ auto-download) | Secondary row (primary when unreleased); Coming soon one-tap; Your list page | 2 → 3, and now one list exists | merged list |
| Thumbs + Liked by | Merged with reviews: one **Rate** button (thumb, optional stars and words in one sheet) and one **What people think** block (Liked by faces + reviews) | 1 → 1 | merged |
| Reviews | Rate → sheet; block → See all. R hidden, H can write: unchanged | 4 → 3 | merged |
| Cast rail | unchanged | — | — |
| Episodes | One list: season chips ("All seasons" sheet above 8), rows with still, progress, ⋯ on owned episodes, Get on missing ones | 2 implementations → 1 | merged |
| Versions | One Versions block, only when there's more than one | 2 → 1 | merged |
| More like this, More details | unchanged | — | — |
| Keep longer / Leaving soon | State line "Leaves in 2 days · Keep" (quiet, not lit); card badge; Watch "Leaving soon" row; library footer line now **links** to it | 4 → 4, no dead end | relinked |
| Play on TV / To phone / Delete | Play on TV in the secondary row (owned titles); To phone + Delete in More ⋯; episode ⋯ | 2 → 2 | demoted 2 of 3 |
| Identify film (O) | More ⋯ | 1 → 1 | demoted |

### 3.3 Library and downloads

| Feature | New home | Entries before → after | Move |
| --- | --- | --- | --- |
| Library grid + type filter + Availability select | Watch → **Your library**: type chips, state chips replace the `<select>`, Order moves in from Settings, an inline Filter replaces the header box. `#library` scrolls here | 1 → 1 (Watch tab) | Library tab merged into Watch |
| Shared-library note | caption under "Your library" | — | — |
| Continue watching | Watch only | 2 → 1 | deduped |
| Coming up | Your list (Watch row → page: Saved · Following · Dates) | 1 → 1 | merged with Saved |
| Leaving soon | Watch row (< 48 h) | 1 → 1 | — |
| Downloads in progress | Card pill + title state line; Watch "On its way" row whose head filters the grid; Watch tab badge; Downloads sheet (owner sees all) | **7 → 4** | merged |
| Manage downloads (O) | House → Downloads | 1 → 1 | moved |
| Find torrents | Search footer "Search torrents for …" (+dl, torrents on); House → Downloads (O) | 1 → 1 (O: 2) | moved |
| Conversion banner | "Preparing playback" state on the card and the title; the player's "Can't play here" box links straight to it | 1 → 2, both in context | dead end fixed |
| Download to phone | More ⋯; episode/season ⋯; Watch "On this phone" (while copies exist); You → Devices & TVs → On this phone (permanent); `?travel=1` | 5 → 6 | gains a permanent home |
| Planned watch parties | Live → Planned (while one exists) | 1 → 1 | moved to where rooms live |

### 3.4 Playback, rooms, TV

| Feature | New home | Entries before → after | Move |
| --- | --- | --- | --- |
| Player, Play now, Skip intro / Up next, Bedtime, Quality / Audio / Subtitles, AirPlay / PiP / iPhone hand-off | unchanged (the Intros setting moves to You → Playback) | unchanged | — |
| Stats for nerds | + an item in the player's More ⋯ | 2 → 3 (first touch entry) | promoted |
| Watch Together rooms | Library parties shelf → Live Planned; the rest unchanged | 5 → 5 | moved |
| Moments (make) | Player More ⋯, which now holds Clip a moment + Stats for nerds instead of one lonely item | 1 → 1 | — |
| Play on TV + now-playing pill + remote | title secondary row, episode ⋯, nowbar | 2 → 2 | — |
| Live guide + tuning | unchanged | 2 → 2 | — |
| Live chat | unchanged (R still excluded) | — | — |
| Channel editor + SEELE TV picks (O) | Live "Your channels" chip + House → Channels | 1 → 2 | owner hub copy |

### 3.5 People, social, personal

| Feature | New home | Entries before → after | Move |
| --- | --- | --- | --- |
| Own profile | You card → Profile (phones: You tab; desktop: face → You); `/#@handle` | 3 → 2 | merged |
| Profile editor | profile → Edit profile | 1 → 1 | — |
| Others' profiles | **Every face is a link**, within today's visibility rules: Friends, review authors, `/#@handle`, plus Activity, Liked by, Live viewers, room roster, Pick together faces | 3 → 8, with no new UI | dead ends fixed |
| Friends | You → Friends (first row, request count); profile Add/Accept; popup; `?friends=1` | 4 → 4, now 2 taps, no scroll | moved |
| Friend-request popup | unchanged | — | — |
| Moments inbox | You → Moments (count + You tab dot); `?moment=` | 2 → 2 (H: see 2.2) | moved |
| Activity | O: House → Activity; +act: You → Activity | 1 → 1 | moved |
| Wrapped | Watch billboard slide (Dec–Jan); You → Wrapped; `?wrapped=` | 3 → 3 | — |
| What's new | unchanged: header bulb, popup after updates, `?update=` | 3 → 3 | — |
| Idea box | You → Ideas; `?ideas=1` | 2 → 2 | moved |
| Ideas inbox + scout (O) | House → Ideas (count); `?ideas=1` | 2 → 2 | moved |
| Invite people (+inv) | You → Invite to Lilin | 1 → 1 | moved |
| Owner invites + who may sign in | House → People: one page per person with permissions, invite, access and library sharing | 1 → 1 (and joined to permissions) | merged |

### 3.6 Settings and owner tools

| Feature | New home | Move |
| --- | --- | --- |
| You card + Your profile button | You card | merged |
| Account (sign out, password) | You → Account | moved |
| Language, Appearance | You → Appearance & language | merged |
| Watching (7 rows) | Split: **Playback & subtitles** (subtitles, intros, Start on: Watch / Find / Live, which fixes "no Live"); **Devices & TVs** (Sign in a TV, Android TV, Jellyfin, On this phone); Library order → Your library toolbar | split |
| Notifications | You → Notifications | moved |
| Download preferences (+dl) | You → Downloads | moved |
| Your library card | Your library footer line, next to the grid it describes (ends the "Your library" name clash) | moved |
| Server rules (O) | House → Server rules | moved |
| People (O) | House → People | merged with invites/access |
| House Overview + Screen Time | House landing (status + one line) + Screen Time tile | condensed |
| Clips (O) | House → Clips; `/c/` pages unchanged | demoted 1 level |
| Notes (O + Notes) | House → Notes (first tile); `?note=`, `/c/n/` unchanged | demoted 1 level |
| Preview pill | unchanged | — |

### 3.7 The duplicate list from the inventory, after D

| Job | Before | After |
| --- | --- | --- |
| Continue watching | 2 | 1 |
| Downloads in progress | 7 | 4 |
| Your watchlist | 4, no single list | 3, one list |
| Leaving soon / keep | 4, one dead end | 4, all linked |
| "New" library content | 3 | 2 (Ready for you row, New badge) |
| Moods | 2 systems | 1 |
| Title pages | 3 variants | 1 |
| People admin (owner) | 2 places | 1 |
| Invite flows | 5 meanings | 3 verbs: Invite to Lilin · Invite to watch · Share profile |
| Watch-party planning | 2 | 2 (Pick together, Live) |
| Wrapped entry | 2 | 2 |
| Search box | 6 meanings | 1 |
| Viewing history | 4 | 4 (profile, Activity, Wrapped, Numbers: kept, they answer different questions) |

## 4. The one search box

Today the box means six things and sometimes throws you to Discover. In D it always means **"find anything in
Lilin"**, and page-local filtering moves into the page.

| Today's meaning | After |
| --- | --- |
| Discover: TMDB search (+ Free on SVT Play) | Search groups, in order: **On Lilin** (playable now, marked) · Films & shows · Free on SVT Play · **Live** (channels and programmes now/tonight) · **People** (not for H/R) · Moments · Clips (O) · Notes (Notes) · **Go to** (places and settings) |
| Library: filter your library | inline Filter chip in the Your library toolbar (and the On Lilin group) |
| Activity: filter by person/title | inline filter inside Activity |
| House: filter machines | inline filter inside House → status |
| Clips: filter clips | inline filter inside House → Clips (+ Clips group) |
| Notes: server search | inline field inside House → Notes (+ Notes group) |
| Typing on Settings/Live jumps to Discover | Desktop: results drop down in place, nothing navigates until you pick or press Shift+Enter. Phones: the field lives on Find |

**Go to** is a small registry (~45 entries: label through `T()`, Swedish, a few synonyms, who sees it, route), e.g.
"Sign in a TV → You › Devices & TVs", "Wrapped", "Friends", "Pick together", every vibe, every channel, "Who may
sign in → House › People". Empty field = recent searches + the 6 places your role uses most. Scope chips (Everything ·
On Lilin · Films & shows · Live · People · Notes · Clips) narrow it. +dl with torrents on: a footer action "Search
torrents for …". Mockup: [find-desktop.png](D/find-desktop.png).

A unit test walks the route table and fails if a route has no registry entry or no Swedish label, so search can't
silently drift from the sitemap.

## 5. Reaching things (the inventory's "hard to find" list)

| Feature | Today | D |
| --- | --- | --- |
| Pick together | Discover → block 7 of 18, a quiet line | Find → card (block 5) +⌕ |
| Friend search / add | Settings → scroll | You → Friends (2 taps) |
| Moments you received | Settings → scroll, hidden until one exists | You → Moments (2 taps, dot on the tab) |
| Ratings, reviews, likes, diary | face → profile → scroll | You → Profile (2 taps); H: still none |
| Wrapped outside Dec–Jan | Settings → You, second in the page | You → Wrapped (2 taps) +⌕ |
| Phone copies | only while the Library summary shows | Watch row while copies exist; You → Devices & TVs |
| Library order | Settings → Watching | Your library toolbar |
| Sign in a TV, Android TV, Jellyfin | Settings → Watching rows 4–6 | You → Devices & TVs (2 taps) +⌕ |
| Notifications switch | Settings group 5–7 | You → Notifications (2 taps) |
| Documentaries on phones | Browse ▾ → sheet | Find → Documentaries chip |
| Stats for nerds | `I` / right-click only | + player More ⋯ |
| Owner: Ideas, People, Server rules | Settings groups 8–10, bottom of ~5.7k px | House → tile (2 taps) |
| Owner: invite someone | Activity → Invite tile | House → People (2 taps) |
| Owner: channel editor | Live → chip | Live → chip, or House → Channels |
| Owner: Screen Time | House → second segment | House → tile |
| Owner phone: any owner tab | icon-only, scrolling, Discover or Settings off-screen | 5 labelled tabs, nothing off-screen |

Every place is ≤ 2 taps from any tab; a single setting is ≤ 2 taps to its page, as in Settings apps on phones.

## 6. What changes per screen

### 6.1 Discover → Find

| | Before (Discover, H account, All) | After (Find) |
| --- | --- | --- |
| Blocks | **18** (up to **21** with Wrapped, On its way, Saved) | **12**: search · chip bar · Trending · Moods · Pick together · Top picks · Because you watched · Coming soon · Popular now · In cinemas · New episodes this week · Top rated |
| Phone height | 5,669 px (6.7 screens) | ≈ 3,500 px (rows ≈ 300 px each) |
| Filters | segmented + Genres (desktop) vs Browse ▾ sheet (< 900 px) | one chip bar everywhere |
| Billboard | Trending | none; it moved to Watch. Trending is row 1 |
| Personal rows | 7 | 2 (recommendations only); the rest moved to Watch |

### 6.2 Library → Watch (the Library tab is merged, not deleted)

The word "Library" survives as the **Your library** section heading, `#library` lands on it, and the grid keeps
every feature the inventory lists as Library-only: the full grid with filters, per-title transfer state, the
Unidentified group, the phone-copies list, planned parties (now in Live), Find torrents and Manage downloads (now
in search and House).

| | Before | After |
| --- | --- | --- |
| Tabs that act as a home | 2 (Discover, Library), 26–32 blocks between them | 1 (Watch), **7 typical / 10 max** blocks: billboard · Keep watching · (On its way) · (Ready for you) · Your list · (Leaving soon) · (On this phone) · Popular on Lilin · Your library heading + toolbar · grid |
| Library header and toolbar | header with 2 buttons, segmented control, Availability `<select>`, 2 summary buttons, notices | one sticky chip toolbar + a caption + a footer line |
| Shelves | Continue, Coming up, Leaving soon, parties | merged into Watch rows; parties → Live |
| Lit buttons | — | the billboard's Play is the one lit button on the page |

Empty or nearly empty libraries (new members without a shared library): Watch falls back to Popular on Lilin (with
Add & play) and opens on Find when there is nothing yours yet. See risk 2.

### 6.3 Title pages: one page, state-driven

| State | Primary (the one lit button) | State line |
| --- | --- | --- |
| Not on Lilin, released | Download / Add (+dl); Save for members without +dl | "Not on Lilin" |
| On Lilin, not in your library | Add & play (today's "Already on the server") | "On Lilin · 4K, 1080p" |
| On its way | Play now when streamable, else none | "43 % · about 20 min" / "Preparing playback" |
| Ready | Play / Resume S2 E4 | "4K · 2 h 52 m" |
| Leaving soon | Play | "Leaves in 2 days · Keep" (quiet button) |
| Unreleased | Save / Follow | "In cinemas 21 Nov" |
| SVT Play | Play on SVT Play / Add (canAdd) | "Free on SVT Play" |

Secondary row (icon + label, at most 4 + More ⋯): Trailer · Save/Follow · Rate · Play on TV (owned). More ⋯: Advanced
download options, Dubbed, Get another version, To phone, Delete, Identify (O). Blocks: hero (art, logo, meta, state
line, actions) · overview · episodes (shows) · versions (if > 1) · What people think · cast · More like this · More
details.

| Page | Before | After (estimate) |
| --- | --- | --- |
| Discover film | 10 blocks, 32–34 buttons, 1 lit | 7 blocks, ~26 buttons, 1 lit |
| Library film | 11 blocks, 44–48 buttons, 2 lit | same page: 7–8 blocks, ~30 buttons, 1 lit |
| Discover show | 11 blocks, **257** buttons | 8 blocks, ~60 buttons (one season's rows at a time) |
| Library show | 12 blocks, 71–73 buttons, **7 lit** | 8 blocks, ~60 buttons, **1 lit** |

### 6.4 Settings → You

| | Before | After |
| --- | --- | --- |
| H account | 7 groups, 3,929 px phone | You card + 3 short groups of rows ≈ 1,150 px; each row opens a page of 300–900 px |
| Member | 8 groups, 3,832 px | ≈ 1,250 px list (mockup: [you-phone.png](D/you-phone.png)) |
| Owner | 10 groups, **5,657 px** on the test server (live: + ~35 people cards) | ≈ 1,100 px list; Server, Ideas and People left for House |
| Phone index | none | the list *is* the index |
| Where notifications land | Settings, scrolled to an anchor | the matching You page (`#you/moments`, `#you/friends`, `#you/ideas`) |

### 6.5 Owner tools → House

| | Before | After |
| --- | --- | --- |
| Places | 6: Settings (Server, Ideas, People), Activity (invites, access), Live (channels), House, Clips, Notes tabs | 1 tab with 9 tiles (8 for co-owner) + 2 in-context shortcuts (Live → Your channels, title ⋯ → Identify) |
| Owner phone tabs | 8 icon-only (Owner), 7 (co-owner) | 5 labelled |
| House landing | 2 segments, long Overview page | status card + one numbers line + tiles (mockup: [house-phone.png](D/house-phone.png)); the full Overview is behind the status card |
| People admin | permissions in Settings, invites/access in Activity | one House → People page per person |

Tabs keep their own stack: if Owner was in House → Notes, tapping House brings him back to Notes, and a second tap
goes to the tiles. That keeps Notes at one tap for the way he uses it.

### 6.6 Deep links (all old links keep working)

| Link | Lands on |
| --- | --- |
| `#discover` | Find |
| `#library` | Watch, scrolled to Your library |
| `#downloads` | Watch → Your library, On the way chip |
| `#settings` | You |
| `#live` | Live |
| `#activity` | House → Activity (O) / You → Activity (+act) |
| `#house`, `#clips`, `#notes` | House, House → Clips, House → Notes |
| `?moment=<id>` | You → Moments, plays it |
| `?friends=1` | You → Friends |
| `?ideas=1` | You → Ideas (member) / House → Ideas (owner) |
| `?travel=1` | Watch + the phone-copies sheet |
| saved "Open Lilin on" `discover` / `library` / `downloads` | Watch (Discover was the default, so it can't tell an explicit choice apart); the setting now offers Watch / Find / Live |
| `/#@handle`, `?watch=`, `/c/w/`, `?pick=`, `?update=`, `?wrapped=`, `?note=`, `/c/n/`, `?play=`, `/c/*`, `/signin`, `/preview` | unchanged |

## 7. How future features slot in

| If the new thing is … | It goes … | It never gets … |
| --- | --- | --- |
| yours or playable now | a conditional Watch row (Watch is capped at 10 blocks) or a state on cards and the title page | a new tab |
| a way to discover titles | a Find row or tile (budget: 10 rows; adding one merges or retires one) or a search group | a one-off line between rows |
| happening now or together | a Live block or the player's room panel | — |
| about one title | the title page: the secondary row only if most people use it on most titles, else More ⋯ or a block above More details | a fourth lit button |
| about you, other people or preferences | a row in a You group | a new Settings group on one long page |
| owner-only | a House tile | an owner tab |
| anything | one search registry entry (label, Swedish, synonyms) | — |

The fleet review's queue, placed: Watch privately → You → Profile visibility + player More ⋯ · Up next for the
whole room → room panel · Season tabs with air dates → the one episode list · "Search shows what's on Lilin
first" → already the first search group · lock-screen controls / Wake Lock → no UI · Send to a friend + "From
friends" → title More ⋯ + a conditional Watch row · after-credits chip → state line + player · collection strip
→ title block · personal billboard with "co-owner loved it" → the Watch billboard already is one.

## 8. Risks and weaknesses (honest)

1. **The front door changes for all 35 people.** Everyone has opened on Discover since day one. The billboard keeps
   the first screen familiar, but Trending is no longer the first thing, and "where did Library go" will be asked.
   Needs one plain What's new entry, and the Start on setting.
2. **Empty Watch for people with their own, empty library.** A new member's Watch has no rows of their own. The
   fallback (Popular on Lilin, open on Find) has to be right, or the first impression is an empty page.
3. **Search can become a crutch.** "Go to" only helps people who type, and the Swedish synonyms are a maintenance
   job. If a feature's visible home is wrong, search hides the problem instead of fixing it.
4. **Search is one tap further on phones** (Find, then the field) than today's header icon on every tab.
   Mitigation: a second tap on Find focuses the field.
5. **Notes and Clips drop one level for Owner.** The tab stack memory helps, but he moved Notes to the front for a
   reason, and he may simply prefer a Notes tab.
6. **Activity has two homes by role** (House for owners, You for +act). Each role sees one, but the app has two.
7. **Merging the three title-page renderers is the riskiest code change** (casting, delete, keep, versions,
   episodes with download state, SVT, Play now). It should ship last, as its own step, with the e2e harness.
8. **Watch is long with a big library.** Rows plus the full grid in one scroll, with a sticky toolbar; it needs
   `content-visibility` on the grid and lazy images, and a scrollperf run before it ships.
9. **Names.** Watch/Find are less familiar than Discover/Library, and the Swedish pair **Titta / Hitta** differs by
   one letter: catchy, but easy to misread at a glance. Fallback: "Sök" for Find.
10. **Find loses the spectacle.** Without the billboard the catalogue page is rows only.
11. **Settings hides behind a face.** People looking for a gear find "You". The Settings heading inside You and the
    search registry ("settings", "inställningar") are the only answer.
12. **Not solved by D:** the H account still has no profile and still writes reviews under the shared name;
    viewing history still lives in 4 places; Pick together isn't reachable from Live, where the "with people"
    intent lives.

## 9. Mockups

Static HTML in [D/](D/) on `public/style.css` (+ `vibes.css`, `match.css` for Find), extra rules in `D/mock.css`,
art cropped from the before-shots into `D/img/`. Rendered with headless Chromium (`chromium-1194`, muted) through
CDP at exact device sizes (`/tmp`-only helper, not committed). Add `#a` to the phone Watch page URL to see where
each block came from.

| File | Shows |
| --- | --- |
| [watch-phone.png](D/watch-phone.png) | Watch, owner, 390×844: personal billboard, 5 labelled tabs, You tab = your face |
| [watch-phone-scrolled.png](D/watch-phone-scrolled.png) | Keep watching, On its way (with the needs-a-look summary), Ready for you |
| [watch-phone-full-annotated.png](D/watch-phone-full-annotated.png) | the whole Watch page down to Your library, each block labelled with its origin |
| [you-phone.png](D/you-phone.png) | You, member with +inv/+act, 390×844 |
| [house-phone.png](D/house-phone.png) | House, Owner, 390×844 |
| [find-desktop.png](D/find-desktop.png) | Find + the one search box at 1440×900, query "sign": a title on Lilin, TMDB titles, SVT, a channel, a friend, and three places |

## 10. Scope

**public/ files that change**

| File | Change |
| --- | --- |
| `index.html` | static tabs Watch/Find/Live/You (House added for owners); remove `browse-btn`, `search-toggle`, `search-cancel`; header search becomes desktop-only; You tab face |
| `app.js` | router + deep-link map; `renderDiscover` split into `renderWatch` + `renderFind`; `renderLibrary` becomes Watch's Your library section; `renderSettings` → You list + sub-page views; `ownerSettings` Server/People/Ideas + activity/access → House tools; one search with groups + registry; `renderDetails` + `renderFilm` + `renderShow` + `episodeBrowser` → one title page (last step); player More ⋯ gets Stats; `wrappedBanner` → billboard slide; Start on options |
| `billboard.js` | personal, playable slides |
| `live.js`, `social.js` | Planned parties block in Live; `rateRow` merges with reviews |
| `reviews.js` / `reviews.css` | Rate sheet holds thumb + stars + words |
| `vibes.js` | absorbs `MOODS` |
| `watchlist.js`, `coming-soon.js` | Your list page |
| `library-downloads.js` | state chips |
| `friends.js`, `moments.js`, `people.js`, `profiles.js` | You pages; faces link to profiles everywhere |
| `scout.js`, `notes-view.js`, `player-stats.js`, `match.js`, `travel.js`, `documentaries.js` | mount in House / player menu / Find card / Devices / unified title page |
| `i18n-sv.js` | ~60 new strings + registry synonyms |
| `sw.js` | cache version |

**CSS (budget: must not grow).** Goes: Browse button and sheet (~1.5 KB), icon-only and scrolling tab bar rules
(~0.9 KB), phone search toggle/cancel/`body.searching` (~0.7 KB), Library header, Availability select, summaries and
keep variants (~3.5 KB), Wrapped banner (~1.0 KB), the second episode layout (~1.1 KB), server-offer (~0.6 KB),
Discover filters floating over the billboard (~0.8 KB), Activity invite/access tiles folded into the People page's
rows (~1.5 KB), thumbs/reviews overlap (~1 KB): about **12 KB out**. Comes in: You list rows (~1.2 KB, built on
`.set-stack`), House tiles (~1.3 KB), search groups (~2 KB, solid surface, no `backdrop-filter`), the Your library
toolbar (~0.8 KB), the state line (~0.4 KB): about **6 KB in**. Net **−5 to −10 KB** of the 364,654 B app CSS
(−1.5 to −3 %, ~2 KB gzip), no new blur, keyframes or `infinite`. D's real saving is in `app.js`: one title page
instead of three renderers, an estimated −15 to −30 KB, minus ~4 KB for the registry.

**Build order** (each step shippable): 1) tabs, routes, deep-link map, moving existing renderers as-is; 2) You and
House pages; 3) Watch rows merged and Your list; 4) the one search box and registry; 5) the unified title page.
