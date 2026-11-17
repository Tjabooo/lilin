# Lilin revamp round 2: inventory (phase 1)

Read-only inventory of the web UI (`public/`, not `public/tv`) on 2026-11-17. Code read at master `bf257d9`; master
moved to `b85d964` during the run (profiles fixes only), and the sizes in section 4 are from `b85d964`. This file only
records what exists today. Redesign proposals belong to the design panel.

**Screenshots:** a local screenshots folder on the desktop (phone 390×844, tablet 820×1180, desktop
1440×900, English). Contact sheets are in `sheets/`. Each folder's `report.json` holds the structural probes quoted
below (block, button and control counts and page heights).

| Folder | Account | Server |
| --- | --- | --- |
| `member/` | Home network shared account (no email, so no profile button, friends or Moments) | the live server, read-only (guard.mjs: non-GET refused, no encodes) |
| `owner/` | owner with Notes (= Owner's tab set) | throwaway local server (no TMDB, no qBittorrent: Discover empty, no Downloads group, 3 test people, 1 test film, 2 fake clips) |
| `member-email/` | member with email, Can invite + Can see activity, one friend | same local server |
| `restricted/` | restricted member | same local server |

Gaps: the tablet set is incomplete for `restricted/`, and the TMDB-backed screens are missing for local accounts. The
player shots say "Can't play here" because headless Chromium has no H.264/HEVC (a harness artifact). CS2 started
mid-run. The runs were stopped and later resumed after CS2 closed.

---

## 1. Navigation today

### 1.1 Sections (tabs) per role

`index.html` holds only Discover, Library and Settings. Everything else is added at runtime: `addAdminTab` inserts
before Settings, and Notes and Live are then moved in front of Library (app.js "Live TV" and "clips" sections, boot code
in `init()`).

| Role | Sections, in order | Phone/tablet tab bar (<900 px) |
| --- | --- | --- |
| Home network shared account, member, restricted | Discover · Live · Library · Settings | 4, labelled |
| member with **Can see activity** | Discover · Live · Library · Activity · Settings | 5, labelled (11 px labels from 6 tabs) |
| owner without Notes (co-owner) | Discover · Live · Library · Activity · House · Clips · Settings | 7, **icon-only** (`.tabs:has(.tab:nth-child(7))`) |
| owner with Notes (Owner) | Discover · Notes · Live · Library · Activity · House · Clips · Settings | 8, icon-only, scrolls sideways. Discover and Clips use near-identical icons; on Clips, Discover is off-screen |

Clips needs `CLIPS_DIR`, Notes needs `NOTES_EMAILS`/`canSeeNotes`, and Live shows for everyone, restricted included.
The Library tab has a download badge (`#dl-badge`). `#downloads` is not a tab: it redirects to Library with the
availability filter set to "On the way".

### 1.2 Header

| Width | Contents (left → right) |
| --- | --- |
| ≥900 px | wordmark (= Discover home; also resets the type, genre and mood filters) · section links · search field (always open) · What's new pill (label only while updates are unseen) · profile face (only for accounts with email) |
| <900 px | wordmark · **Browse ▾** (only on Discover: type + genres sheet) · search icon (opens a full-width field + Cancel) · What's new bulb (no label <600 px) · profile face. Sections live in the bottom tab bar (glass) |

The Settings index (a sticky side nav of group names) exists only at ≥900 px. On phones Settings is one long scroll.

### 1.3 The one search box changes meaning per tab

Discover: TMDB search, plus a "Free on SVT Play" row · Library: "Filter your library" · Activity: filter by person or
title · House: filter machines · Clips: filter clips · Notes: searches notes (server). Typing on Settings or Live
**switches to Discover**. Live and Profile have no search of their own.

### 1.4 Overlays, sheets and menus

| Surface | Implementation | Used for |
| --- | --- | --- |
| Title page | `#sheet` (`showSheet`, 5 callers): full-screen on phones, ≤1180 px panel on desktop | Discover titles (`renderDetails`), library films (`renderFilm`), library shows (`renderShow`), "entry" pages for downloads, SVT titles (documentaries.js) |
| Small sheet | `#picker` (`showSheet`, 17 callers): bottom sheet with handle on phones, centred ≤520 px dialog on desktop | Play on TV, Delete, Download to phone, Browse, What's new + All updates, friend-request popup, Rate/review sheet + See all reviews, picture editor, profile editor (opens over the profile), Live channel editor, transfer/download details, torrents, Identify film |
| Profile page | `.pf` (profiles.js): its own full-screen dialog, with a "nested" variant over title pages | own and others' profiles |
| Pick together | `.pick` full-screen dialog + 3 `.pick-pop` popups (match, matches list, invite) | match.js |
| Wrapped | `.wrapped` full-screen story | app.js `openWrapped` |
| Peek | `.peek`: floating card on hover (desktop), `.is-sheet` on long press (touch) | peek.js |
| TV remote | `#remote` + `#nowbar` pill | casting |
| Watch Together room | `#watch-bar` `.room`: docked right on wide/landscape screens, a sheet under the picture on portrait | rooms + Live TV |
| Live chat | live-chat.js panel: same placement rules as the room, collapsed into the channel strip | Live TV |
| Player menus | `.cc-menu` ×5 (More ⋯, Bedtime, Quality, Subtitles, Audio) + `.fs-guide` + `.player-help` + Stats for nerds panel | player |
| Row menus | `rowMenu` ⋯ on file rows; '•••' text button on library cards (download details); ⋯ on Continue cards (hide) | lists |
| Others | `.moment-panel` (clip editor in the player), `.note-viewer` (Notes), `.act-panel` (Activity person), `.part-popup` (Play now buffering), `#password-gate`, `.edit-video` clip trim (Clips) | — |

### 1.5 Deep links and notifications (where they land)

| Link | Lands on |
| --- | --- |
| `#discover`, `#library`, `#settings`, `#live`, `#activity`, `#house`, `#clips`, `#notes` | that tab (only if the tab exists for the account) |
| `/#@handle` | profile page |
| `?watch=<token>`, `/c/w/<token>` | room offer → player |
| `?pick=<id>` | Pick together |
| `?moment=<id>` | **Settings** → Moments (plays it) |
| `?friends=1` | **Settings** scrolled to Friends |
| `?ideas=1` | **Settings** scrolled to the idea box (member) or Ideas inbox (owner) |
| `?travel=1` | **Library** + the phone-copies sheet |
| `?update=<id>` | What's new sheet |
| `?wrapped=<year>` | Wrapped story |
| `?note=<id>`, `/c/n/<token>` | Notes (owner) |
| `?play=<id>&t=` | player (iPhone PiP hand-off to Safari) |
| `/c/<token>` clip, `/c/m/<token>` moment, `/c/i/<token>` invite, `/c/oidc/*`, `/c/jf/*`, `/android`, `/signin`, `/preview` | stand-alone pages (pages.css) |

---

## 2. Feature table

Who: **O** owner (ADMIN_EMAILS; Owner and co-owner) · **M** signed-in member with email · **H** Home network shared
account (no email) · **R** restricted (People → Restrict) · permission switches: **+dl** Can download, **+inv** Can
invite people, **+act** Can see activity, **Notes** NOTES_EMAILS. "All" = O, M, H, R.

### 2.1 Discover and browsing

| Feature | Lives in | Entry points | Who | Phone vs desktop | Files |
| --- | --- | --- | --- | --- | --- |
| Billboard (trending, logo art, bulbs) | Discover top | Discover home | All | phones swipe a 4:5 crop; desktop advances every 9 s and plays a muted trailer | billboard.js, app.js `renderDiscover` |
| TMDB rows: Trending this week, Popular films, Popular shows, In cinemas now, New episodes this week, Coming soon, Top rated films, Top rated shows (Films/Shows types use their own sets) | Discover | Discover; See all → paged grid | All | same | app.js "Discover", src/server.js `HOME_ROWS` |
| Personal rows: Continue watching, On its way, Saved for later, Popular on Lilin, Because you watched X, New in your library, Top picks for you | Discover (between the TMDB rows) | Discover | All (Popular on Lilin = social.js) | same | app.js "Discover: rows of your own", social.js |
| Mood **genre** rows (2 a day from 10: "Laugh out loud", "Edge of your seat"…) | Discover | Discover; See all → genre grid | All | same | app.js `MOODS` |
| **Moods** (28 vibe tiles) + mood page (Shuffle, type filter) | Discover row after Trending | Discover row → tile | All | same | vibes.js/css |
| Type filter All/Films/Shows/Documentaries + Genres | Discover | desktop: segmented control + Genres chip above the rows; <900 px: **Browse ▾** in the header → sheet | All | **different control per width** (the segmented control and genre chips aren't shown <900 px) | app.js `discoverFilters`, `openBrowse` |
| Documentaries + SVT Play | Discover → Documentaries type | type filter / Browse sheet; SVT hits in search ("Free on SVT Play"); SVT title sheet | All (Add needs `canAdd`) | same | documentaries.js, app.js |
| Coming soon (row + page grouped by week/month, one-tap Save/Follow) | Discover | Coming soon row → See all | All | same | coming-soon.js/css |
| Search | header | search field/icon | All | icon + full-width field <900 px | app.js "search box + tabs" |
| Peek | over any poster card | hover 0.5 s (desktop), long press (touch) | All | hover card vs sheet | peek.js |
| Pick together (swipe, match, invite, plan) | full-screen `.pick` | **one quiet line** on Discover (block 7 of 18); `?pick=` links; notifications | All (invitee lists skip R) | same | match.js/css |
| Wrapped teaser | Discover under the billboard | only from release day (status.wrapped) to end of January; can be hidden ("still in Settings") | All | same | app.js `wrappedBanner` |

### 2.2 Title pages

| Feature | Lives in | Entry points | Who | Phone vs desktop | Files |
| --- | --- | --- | --- | --- | --- |
| Title page (Discover variant) | `#sheet` | any title card, billboard More info, peek, search, More like this, Coming soon, Moods, Pick cards, profile posters | All | full-screen on phones, wide panel on desktop | app.js `renderDetails` |
| Title page (library film) | `#sheet` | Library card, Continue card, On its way, New in your library | All | same | app.js `renderFilm` |
| Title page (library show) | `#sheet` | Library card, Continue/Up next | All | same | app.js `renderShow` |
| Trailer | title page hero | Trailer button | All | stage scaled to fit; own controls | trailer-controls.js, trailer-size.js |
| Add to library / Download / Advanced options (exact quality, browse releases) / Dubbed (anime) | title page actions | Discover title page; show: Download → season panel | +dl (others: "Already on the server" Add / Add season) | same | app.js "Download: you choose what…" (smart-download) |
| Already on the server (Add, Add & play, Add season) | title page | Discover title page | members without +dl | same | app.js `serverOffer` |
| Save for later / Follow (+ auto-download switch) | title page `page-extras` | Discover title page; Coming soon cards (one-tap) | All | same | app.js `watchBox`, watchlist.js |
| Thumbs + "Liked by" faces | title page `page-extras` | all 3 title-page variants | All | same | social.js `rateRow` |
| Reviews (Review button beside the thumbs, section, See all sheet, composer) | title page | Review button; Reviews section → See all; "Write the first" | All except R (H can write) | same | reviews.js/css |
| Cast rail | title page | — | All | same | app.js |
| Episodes | title page | Discover show: episode browser (season tabs); Library show: season grid → episode rows with ⋯ | All | same | app.js `episodeBrowser` vs `renderShow` |
| Versions (4K/1080p picker, "Your versions") | title page | Discover film page + library film page | All | same | app.js "versions" |
| More like this | title page | in-place navigation (Back returns) | All | same | app.js `moreLike` |
| More details (crew, music, facts, links; episode Credits fold) | bottom of title pages | closed disclosure | All | same | details.js/css |
| Keep longer / Leaving soon countdown | library title pages (keep bar), card badges, Library "Leaving soon" shelf, Settings → Your library card | — | All (rules O) | same | app.js "auto-delete countdown" |
| Play on TV / To phone / Delete | library film page chips; file row ⋯ menu | — | All | same | app.js "casting", "library deletion", travel.js |
| Identify film | library film page | chip | O | same | app.js `openFilmIdentity` |

### 2.3 Library and downloads

| Feature | Lives in | Entry points | Who | Phone vs desktop | Files |
| --- | --- | --- | --- | --- | --- |
| Library grid (Films / Shows / Unidentified) + All/Films/Shows filter + Availability select | Library | Library tab | All | same | app.js "Library", library-downloads.js |
| Shared-library note | Library (top) | — | people sharing a library (People → Library) | same | app.js |
| Continue watching (+ Up next cards, hide with ⋯) | **Discover and Library** (same `continueItems`) | both tabs | All | same | app.js |
| Coming up (saved films' releases, followed shows' next episodes) | Library shelf | — | All | same | app.js `comingUpShelf`, watchlist.js |
| Leaving soon (<48 h) | Library shelf | — | All | same | app.js |
| Downloads in progress | Library cards (transfer panel, '•••' details), "N downloading" summary, Availability = On the way, Discover "On its way" row, tab badge | 5 places | All (+dl to start) | same | app.js "Downloads" |
| Manage downloads (all transfers) | sheet | Library header button | O | same | app.js `openTransferDetails(null)` |
| Find torrents | sheet | Library header button | +dl and TORRENTS on | same | app.js "torrent search" |
| Conversion banner ("Preparing playback") | Library top | — | All | same | app.js `renderConvertBanner` |
| Download to phone (copies, list) | `#picker` | film page "To phone"; file row ⋯; season "Season to phone"; Library "for your phone" summary (only while copies exist); `?travel=1` | All | aimed at phones | travel.js, app.js |
| Planned watch parties (join / copy / cancel) | Library shelf (`parties-slot`) | shown only while one exists | All | same | social.js `partiesShelf` |

### 2.4 Playback, rooms, TV

| Feature | Lives in | Entry points | Who | Phone vs desktop | Files |
| --- | --- | --- | --- | --- | --- |
| Player | `#player` | Play on title pages, Continue cards, episode rows, Live channels, room links | All | phone bar: 7–8 controls (no ±10 s/volume; big centre buttons instead); desktop: 11–12 | app.js "player" |
| Play now (watch while downloading) | player + buffering popup | Play on a downloading title | All | same | player-partial.js |
| Skip intro / Up next / Play next episode | player overlays | automatic; Settings → Intros | All | same | player-next.js, app.js |
| Bedtime (night mode, sleep timer), subtitle look | player menus | moon button, `N`; subtitle menu | All | same | player-comfort.js |
| Quality / phone quality, Audio tracks + sync, Subtitles (incl. AI subs) | player menus | HD, Audio and CC buttons | All | same | app.js, player-audio.js |
| AirPlay / PiP / fullscreen guide / iPhone PiP hand-off | player | buttons; `?play=` | All | iPhone Home Screen app opens Safari | app.js |
| Stats for nerds | player panel | **`I` key or right-click only** | All | no touch entry | player-stats.js |
| Watch Together rooms (host, join, notify, copy link, chat, reactions, leave) | player room panel | player "Watch together" pill; `/c/w/` link; notification; Library parties shelf; Pick together match | All (R: link only, never offered as invitee) | docked panel vs sheet under the picture | app.js, watch-sync.js, social.js |
| Moments (clip a moment, send/copy link) | player ⋯ → Clip a moment (`.moment-panel`) | player ⋯ (the only item in that menu) | All (R and H: link only) | same | moments.js |
| Play on TV (DLNA/Apple TV/Chromecast) + now-playing pill + remote | `#picker`, `#nowbar`, `#remote` | library film chip, file ⋯; nowbar | All (CAST_WHEN_AWAY rules) | same | app.js "casting" |
| Live TV guide + tuning + channel strip | Live tab | Live tab; channel numbers in the player | All | guide scrolls sideways | live.js, app.js "Live TV" |
| Live chat | channel panel/sheet | Chat button in the channel strip | All except R | panel vs sheet | live-chat.js |
| Channel editor + SEELE TV picks | `#picker` | Live → "Your channels" chip | O | same | live.js `openEditor` |

### 2.5 People, social, personal

| Feature | Lives in | Entry points | Who | Phone vs desktop | Files |
| --- | --- | --- | --- | --- | --- |
| Profile (own): favourites, numbers, recent activity/diary, ratings, reviews, liked, friends; share; visibility | `.pf` page | header face; Settings → "Your profile"; `/#@handle` | M, O, R (R: no Friends section). **H: none** (no face, no button) | same | profiles.js/css |
| Profile editor (picture, name, @handle, bio, accent, banner, font, layout, sections, visibility) | `#picker` over the profile | profile → Edit profile | M, O, R | same | profiles.js, people.js |
| Others' profiles | `.pf` (nested over title pages) | Friends list; review author; `/#@handle`. **Not** from Activity, Liked by, Live guide, room roster or Pick faces | M, O | same | profiles.js |
| Friends (search by name, requests, list, remove) | **Settings → Friends** | Settings; profile "Add friend"/"Accept"; friend-request popup on open; `?friends=1` | M, O (not R, not H) | same | friends.js/css |
| Friend-request popup | `#picker` | automatic on open / when one arrives (not on Settings) | M, O | same | app.js `maybeAskFriends` |
| Moments inbox (shared with you, your moments) | **Settings → Moments** (hidden until one exists) | Settings; `?moment=` | M, O, R. **H can make moments but never gets the list** | same | moments.js |
| Activity (stats tiles, people strip, filters, feed; owner: Invite tile, access list, person panel) | Activity tab | tab | O; read-only for +act | owner phone: icon-only tab | app.js "activity", "access" |
| Wrapped (story, share card) | `.wrapped` | Discover banner (Dec–Jan); Settings → You button; `?wrapped=` | All | same | app.js `openWrapped`, social.js |
| What's new (unseen popup, full history) | `#picker` | header pill/bulb; automatic after updates; `?update=` | All | label hidden <600 px | app.js "what's new", whats-new.json |
| Idea box (send idea/bug, see answers) | Settings → You group | Settings; `?ideas=1` | M, H, R (not O) | same | app.js `ideaBox` |
| Ideas inbox + idea scout cards | **Settings → Ideas** (owner group 9 of 10) | Settings; `?ideas=1` | O | same | app.js `ideaInbox`, scout.js |
| Invite people (member links) | Settings → Invite people | Settings | +inv (not O) | same | app.js `memberInviteSettings` |
| Owner invites + who may sign in (Zero Trust list, password links) | **Activity** → Invite tile / person panel | Activity | O | same | app.js "access" |

### 2.6 Settings and owner tools

| Feature | Lives in | Entry points | Who | Phone vs desktop | Files |
| --- | --- | --- | --- | --- | --- |
| You card (face, sign-in line, tags) + Your profile button | Settings → You | — | All (button needs email) | same | app.js `renderSettings` |
| Account: sign out, change password | Settings → You | — | Lilin sign-in / password users | same | app.js `accountSection` |
| Language, Appearance (9 themes + own colours) | Settings | — | All | same | app.js `appearanceSection` |
| Watching: subtitles, intros, Open Lilin on (Discover/Library), **Sign in a TV, Android TV, Jellyfin**, Library order | Settings → Watching (7 rows) | — | All | same | app.js |
| Notifications (this device, kinds) | Settings → Notifications | — | All (iOS: Home Screen only) | same | notifications.js, app.js |
| Download preferences (quality, largest size, audio language) | Settings → Downloads | — | +dl | same | app.js |
| Your library card (count, size, next to go, retention text) | Settings → Your library | — | All | same | app.js |
| Server rules (retention, keep longer, new people can download, default colours, staying signed in) | Settings → Server | — | O | same | app.js `ownerSettings` |
| People (pictures, Can download, Can invite, Restrict, Can see activity, Never auto-delete, Library sharing) | **Settings → People** (last group) | — | O | same | app.js `ownerSettings`, people.js |
| House: Overview (status, Server, VPN, Sharing, Power, Machines) + Screen Time | House tab (2 segments) | tab | O | owner phone: icon-only tab | app.js "house*" |
| Clips (summary, Latest, per-game galleries, trim/rename/share/delete) | Clips tab | tab; `/c/<token>` public page | O (CLIPS_DIR) | same | app.js "clips", "clip editor", clip-share.js |
| Notes (chat-like notes with media, share links) | Notes tab | tab; `?note=`; `/c/n/` | O + Notes | same | notes-view.js, notes-import.js, note-stills.js, notes.css |
| Preview pill | fixed pill | `/preview` cookie | anyone in preview | same | app.js |

---

## 3. Problems

### 3.1 Duplicates (one job, several places)

| What | Places |
| --- | --- |
| Continue watching | Discover row 1 **and** Library shelf (same function `continueItems`) |
| Downloads in progress | Discover "On its way" · Library card transfer panels · "N downloading" summary button · Availability = "On the way" · tab badge · Manage downloads sheet (owner) · '•••' details on each card: **7 surfaces** |
| Your watchlist | "Saved for later" row on **Discover** · "Coming up" shelf in **Library** · Save/Follow box on title pages · one-tap Save/Follow on Coming soon cards. There is no single list of everything saved/followed |
| Leaving soon / keep longer | Library "Leaving soon" shelf · card "Xd left" badges · keep bar on library title pages · Settings → Your library "Next to go" text, which points back to "Keep … in the Library" without a link |
| "New" library content | Discover "New in your library" · Library default order "Newest" · New badges on cards |
| Moods | **Two systems**: "Moods" vibe tiles (vibes.js, 28 vibes) **and** 2 daily genre "mood rows" from app.js `MOODS` ("Laugh out loud"…) on the same page |
| Title pages | 3 variants of the same title (Discover / library film / library show) with different action sets (2.2): Save/Follow, Advanced options and Dubbed are only on the Discover variant; Play on TV, To phone, Delete, Keep and Identify are only on the library variant; episodes come as a tabbed browser vs a season grid → rows |
| Viewing history | profile "Recent activity" + diary · Activity tab feed (owner/+act) · Wrapped · profile "Numbers" (films/episodes/hours this year) vs Wrapped's totals |
| People admin (owner) | permissions in Settings → People · invites, access list and per-person panel in **Activity** · faces/last seen in both |
| Invite flows (5 meanings) | owner access invite (Activity) · member invite links (Settings → Invite people) · room "Notify someone"/"Copy link" · Pick together invite · profile "Share profile" |
| Watch-party planning | removed from title pages and the player on 11-10, but still in the Pick together match popup ("Plan for later") and in the Library parties shelf |
| Wrapped entry | Discover banner (seasonal) + Settings → You button |
| Search box | 6 meanings across tabs (1.3) |

### 3.2 Dead ends and cross-tab hops

- **Home network account** (shared at home) can make Moments (player ⋯), but Settings → Moments needs an email, so
  it never sees, re-copies or deletes them. It also has no profile, friends or face, yet it can write reviews
  (shown under the shared name).
- The player's "Can't play here" box says to follow the copy's progress "in the Library tab" (convert banner): you
  have to leave the player and hop tabs.
- Settings → Your library tells you to use "Keep N more days in the Library" with no link there.
- Notifications for Moments, friend requests and ideas land in **Settings**, a long scroll page (3.4k–5.7k px on
  phones), scrolled to an anchor.
- "Open Lilin on" offers only Discover/Library (not Live, which every account has).
- Typing in search on Settings or Live throws you to Discover.
- Faces open profiles only from the Friends list, reviews and other profiles. Activity, Liked by, the Live guide,
  the room roster and Pick together show faces that lead nowhere (or, in owner Activity, to a filter).
- Planned parties can be cancelled from Library but not created there (only via Pick together).

### 3.3 Overcrowded screens (measured, `report.json`)

| Screen | Count | Height |
| --- | --- | --- |
| Discover home (H account, type All) | **18 blocks**: billboard, Continue watching, Popular on Lilin, Because you watched…, Trending this week, Moods, Pick together line, Popular films, mood row, New in your library, Popular shows, In cinemas now, Top picks for you, mood row, New episodes this week, Coming soon, Top rated films, Top rated shows. With Wrapped banner, On its way and Saved for later present: up to **21** | 5,669 px phone (6.7 screens) · 7,145 px desktop |
| Discover show title page | 11 blocks, **257 buttons** (episode browser) | 5,709 px phone sheet |
| Discover film title page | 10 blocks, 32–34 buttons, 1 lit | 1,853 px |
| Library show page | 12 blocks, 71–73 buttons, **7 lit (gold) buttons** (Keep all, each Play, each Keep link) | 3,786 px phone |
| Library film page | 11 blocks, 44–48 buttons, 2 lit | 2,107 px |
| Settings, Home network account | 7 groups: You 3 items · Language · Appearance · Watching **7 rows/13 controls** · Notifications · Downloads 3 · Your library | 3,929 px phone |
| Settings, member with email (+inv) | 8 groups (+Friends, Invite people; Moments and Account when they apply) | 3,832 px phone (without Downloads) |
| Settings, owner | 10 groups: You, Friends, Language, Appearance, Watching, Notifications, Your library, Server 6 rows, Ideas (filters + inbox), People (3 test people = 20 controls; live has ~35 accounts × ~7 controls) | **5,657 px phone** on the test server (live: + Downloads group + ~35 people cards) |
| Player control bar | desktop 11–12 controls + Watch together pill; phone 7–8 | — |
| Live guide (live data) | 53 buttons on one screen (channel heads + programme cells) | 1,571 px phone |
| Owner Activity | 4 stat tiles + people strip (live: every account + Invite tile) + 5–6 filter segments + feed | — |
| Owner phone tab bar | 8 (7 for co-owner) icon-only tabs | — |

### 3.4 Hard to find (more than 2 taps, deep scroll, or no visible entry)

| Feature | Path today |
| --- | --- |
| Pick together | Discover → scroll to block 7 of 18 → one quiet text line (no tab, header or title-page entry) |
| Friend search / add friend | Settings → scroll to Friends (profiles only show Add friend for someone you've already found) |
| Moments you received | Settings → scroll to Moments (hidden until one exists); making one = title → Play → ⋯ → Clip a moment (4 taps) |
| Your ratings, reviews, likes, diary | face → profile → scroll; **H: impossible** |
| Wrapped outside Dec–Jan | Settings → You (the button sits second in the page) |
| Phone copies list | only via the Library summary line while copies exist, or a notification |
| Library order | Settings → Watching (not in Library) |
| Sign in a TV, Android TV, Jellyfin | Settings → Watching rows 4–6 (device setup inside "Watching") |
| Notifications switch | Settings → group 5–7 |
| Documentaries on phones | Browse ▾ → Documentaries (2 taps; desktop has it in the segmented control) |
| Stats for nerds | `I` key / right-click only |
| Owner: Ideas inbox, People permissions, Server rules | Settings groups 8–10, the bottom of a ~5.7k px page; no index on phones |
| Owner: invite someone | Activity → Invite tile (not in Settings → People, where the permission switches are) |
| Owner: channel editor | Live → "Your channels" chip |
| Owner: Screen Time | House → second segment |
| Owner phone: any owner tab | icon-only, scrolling tab bar: Discover or Settings off-screen depending on position |

### 3.5 Inconsistent patterns

- **Surfaces for the same job:** title pages in `#sheet` but profiles in their own `.pf` page; small dialogs in
  `#picker` but Pick together, Wrapped, Peek-on-touch, the room, live chat and the moment editor each have their own
  container (1.4). Fleet audit: 4 bottom-sheet implementations.
- **"More" buttons:** ⋯ SVG (file rows, player, Continue cards) vs '•••' text (library cards = download details,
  not "more"). The player ⋯ menu holds a single item (Clip a moment).
- **Section controls:** Discover type = segmented control (desktop) or Browse sheet (phones); Library type =
  segmented control + an Availability `<select>`; Activity = segmented control; House = segmented control; Ideas inbox
  = its own filter pills with counts; Live = none.
- **Naming:** "Clips" (owner game clips tab) vs "Clip a moment"/"Moments" (everyone); "Your library" is both the
  Library tab heading and a Settings group; "Moods" vs mood genre rows; "Coming soon" (TMDB) vs "Coming up"
  (your watchlist).
- **Gold bulb:** 1 lit button on the Discover title page, 2 on the library film page, 7 on the library show page
  (fleet open item: one lit thing per screen).
- **Owner tools spread over 6 places:** Settings (Server, Ideas, People), Activity (invites, access list), Live
  (channels), House, Clips, Notes tabs (fleet open item: one owner hub tab).
- **Per-device vs per-account settings mixed in one page:** Appearance/Language/subtitles are account settings;
  notifications are per device; the player's Bedtime/subtitle look are per device and live only in the player.
- **Cards:** poster cards (2:3), landscape Continue cards, wide SVT cards, vibe tiles, Coming soon dated cards, Pick
  cards and library cards with transfer panels. Library cards carry 4 overlays (New, expiry, progress, transfer
  pill) that Discover cards don't.

### 3.6 The Library tab today, and what overlaps

In order (`renderLibrary`, live H account = 8 blocks, 1,259 px phone):

1. Header: "Your library" + **Find torrents** (+dl, torrents on) + **Manage downloads** (owner)
2. Conversion banner (only while preparing or failed)
3. Toolbar: All/Films/Shows segmented control + Availability (All titles / Ready to watch / On the way / Needs attention)
4. Shared-library note ("Shared library with Robin and Alex…")
5. "N downloading · M need attention" summary button
6. "For your phone" summary button (phone copies)
7. Source notices (scan/download errors)
8. Watch parties shelf (planned parties)
9. Shelves: Continue watching · Coming up · Leaving soon
10. Grids: Films · Shows · Unidentified (cards with progress, New, expiry, transfer panel, '•••')
11. Empty state

| Library block | Also lives in |
| --- | --- |
| Continue watching | Discover row (identical) |
| Downloads (summary, Availability "On the way", card panels, Manage downloads) | Discover "On its way", tab badge, Activity (owner: download events), House (owner: sharing/encodes) |
| Coming up | Discover "Saved for later" (same watchlist, different slice), title-page Save/Follow, Coming soon cards |
| Leaving soon | card badges, title-page keep bar, Settings → Your library |
| Watch parties | Pick together (only place to plan), player room panel |
| For your phone | file ⋯ menus, film page "To phone" (Library only, but the list has no permanent entry) |
| Grid order | set in Settings → Watching → Library order |
| Library sharing | set by the owner in Settings → People; the note shows here |
| Your stats (count, size) | Settings → Your library; profile Numbers (watch counts); Wrapped |
| Watched history | not in Library; profile Recent activity/diary, Activity (owner/+act) |

What only Library has: the full grid of owned titles with filters, transfer management per title, the Unidentified
group, Find torrents, Manage downloads, the phone-copies summary and the planned-parties shelf. Everything else in it
appears somewhere else too.

---

## 4. Size baseline (master `b85d964`, bytes)

App CSS (the 9 files `index.html` loads): **364,654 B** (80,564 B gzip -9). pages.css (sign-in and `/c/` pages):
5,773 B. JS in `public/*.js`: **1,199,798 B** (371,077 B gzip). index.html: 20,590 B.

CSS drift counters over the 9 app CSS files (baseline for a "must not grow" check): 3,284 rule blocks · 42 distinct
`font-size` values · 48 `border-radius` · 113 `box-shadow` · 51 `backdrop-filter` declarations · 29 `@keyframes` ·
10 `infinite` · 24 `!important` · 118 `@media` · 177 hex colour literals. No CSS budget test exists in `tests/` yet.

| CSS file | Bytes | gzip | Lines |
| --- | ---: | ---: | ---: |
| `style.css` | 273,983 | 56,430 | 4,147 |
| `profiles.css` | 28,621 | 6,991 | 323 |
| `match.css` | 16,785 | 4,152 | 264 |
| `notes.css` | 14,476 | 3,589 | 153 |
| `friends.css` | 9,035 | 2,452 | 122 |
| `details.css` | 8,091 | 2,244 | 125 |
| `reviews.css` | 6,214 | 1,865 | 93 |
| `pages.css` (not loaded by the app) | 5,773 | 2,145 | 98 |
| `vibes.css` | 4,935 | 1,688 | 75 |
| `coming-soon.css` | 2,514 | 1,153 | 42 |

| JS file | Bytes | gzip | Lines |
| --- | ---: | ---: | ---: |
| `app.js` | 629,287 | 178,803 | 10,493 |
| `i18n-sv.js` | 141,137 | 45,823 | 2,400 |
| `profiles.js` | 38,217 | 10,907 | 565 |
| `match.js` | 37,883 | 10,739 | 648 |
| `notes-view.js` | 34,324 | 10,237 | 477 |
| `player-stats.js` | 29,136 | 9,885 | 479 |
| `social.js` | 26,133 | 9,267 | 425 |
| `moments.js` | 19,522 | 6,165 | 344 |
| `player-partial.js` | 16,345 | 5,251 | 330 |
| `reviews.js` | 16,091 | 5,213 | 283 |
| `details.js` | 15,467 | 5,553 | 230 |
| `live.js` | 15,258 | 5,350 | 214 |
| `clip-share.js` | 14,881 | 4,821 | 310 |
| `watch-sync.js` | 13,025 | 4,194 | 250 |
| `billboard.js` | 12,745 | 4,649 | 205 |
| `documentaries.js` | 11,884 | 3,984 | 203 |
| `trailer-controls.js` | 11,057 | 3,799 | 209 |
| `vibes.js` | 10,543 | 4,424 | 156 |
| `people.js` | 10,418 | 4,109 | 197 |
| `friends.js` | 9,947 | 3,287 | 165 |
| `coming-soon.js` | 8,871 | 3,403 | 167 |
| `live-chat.js` | 8,698 | 3,422 | 159 |
| `seek-preview.js` | 7,938 | 3,042 | 214 |
| `peek.js` | 7,915 | 2,892 | 146 |
| `scout.js` | 7,719 | 2,697 | 121 |
| `library-downloads.js` | 7,172 | 2,643 | 87 |
| `player-comfort.js` | 6,869 | 2,978 | 140 |
| `player-audio.js` | 4,329 | 1,662 | 69 |
| `watchlist.js` | 4,223 | 1,778 | 74 |
| `notes-import.js` | 4,094 | 1,642 | 66 |
| `notifications.js` | 3,979 | 1,693 | 69 |
| `player-next.js` | 3,623 | 1,474 | 59 |
| `i18n.js` | 2,655 | 1,324 | 52 |
| `sw.js` | 2,528 | 1,162 | 51 |
| `note-stills.js` | 2,246 | 974 | 46 |
| `travel.js` | 2,123 | 992 | 44 |
| `trailer-size.js` | 1,516 | 839 | 29 |

Context: whats-new.json has 100 entries dated 2026-11-10 or later (164 in all). That is how many changes landed on
the 11-10 layout.
