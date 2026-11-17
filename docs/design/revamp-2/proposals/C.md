# Proposal C: Together (social-first)

Designer C, revamp round 2 panel, 2026-11-17. Source of truth: [inventory.md](../inventory.md) (master `b85d964`).
Mockups: [C/](C/) (`together-phone.png`, `together-phone-full.png`, `library-phone.png`, `together-desktop.png`; HTML
next to them, built on `public/style.css` tokens and components).

## Thesis

Lilin is a server for about 35 friends and family, not a catalogue. Netflix and Jellyfin already do browsing and a
library grid well. What they can't do is put you on the same channel as your dad, have co-owner send you a moment, or let
three people swipe until they agree on a film. Lilin has built all of that in the past week, but none of it has a
home. The social layer is spread over **seven places**: a Live tab, a line in block 7 of Discover, a Library shelf,
three Settings groups, an Activity tab, the player and profile pages. On top of that there are five separate invite
UIs and a popup that interrupts you when you open the app. That scatter is the clutter. Each social feature got
bolted onto whichever screen was nearest, and every one of those screens became more crowded and harder to scan.
Proposal C gives the social layer one home, a **Together** tab in the slot where Live sits today. Together holds
SEELE TV, watch parties, Pick together, friends and requests, Moments, Activity and the one invite sheet. Once those
are gone, the other tabs can each have one job again. **Discover** is for finding something. **Library** shrinks to
"what's yours and what's coming": your titles, your saved list and your downloads. **Settings** holds only
preferences. Owners get one **Owner** tab for running the server. No tab is added for members, and owners go from 8
icon-only tabs to 5 labelled ones.

## 1. Structure at a glance

### 1.1 Sitemap

```
Header: wordmark · (phones, Discover only: Browse ▾) · search (always "find a title") · What's new · face → profile

Discover  #discover                                   all accounts
├─ Billboard
├─ 12 rows on type All (see 4.1), See all → grids, Moods → mood page, Coming soon → page
└─ Title page (#sheet, ONE variant)  → Rate/Review sheets, Play on TV, To phone, Versions, More details, More like this

Together  #together                                   all accounts; blocks depend on role (1.3)
├─ Friend requests card                (M, O)          was: friend-request popup, ?friends=1
├─ Friends strip: You · friends · + Add (M, O)         was: Settings → Friends
├─ On SEELE TV now  → tune (player)    (all)           was: Live tab
│   └─ Full guide  #together/guide                     was: Live tab guide (#live redirects here)
├─ Watch with someone                  (all)
│   ├─ Pick together (full-screen .pick)               was: Discover line, block 7 of 18
│   ├─ Watch party: start now / plan a time            was: player pill only + Pick "Plan for later"
│   └─ planned parties: join / copy / cancel           was: Library parties shelf
├─ Moments: shared with you · yours    (M, O, R, H)    was: Settings → Moments (hidden until one existed)
├─ Activity (latest 3) → #together/activity (O, +act)  was: Activity tab
└─ [phase 2] From friends: reviews + ratings (M, O)    new read-only feed, only after "Watch privately" ships

Library  #library                                     all accounts
├─ Yours      type chips · sort · filter · shared note · Leaving soon (<48 h) · Films/Shows/Unidentified · summary
├─ Saved      Ready to watch · Coming up · Saved (one list of every saved film and followed show)
└─ Downloads  In progress · Needs attention · Preparing · On this phone · Find torrents (+dl) · All server downloads (O)

Owner  #owner                                         owners only (ADMIN_EMAILS)
├─ Overview (House: status, server, VPN, sharing, power, machines)   #house redirects
├─ Screen Time
├─ People: one list → person panel (permissions, library sharing, sign-in access, invites, password links)
├─ Ideas: inbox + scout cards        ?ideas=1 (owner) lands here
├─ Channels: Live TV channels + SEELE TV picks
├─ Server rules
├─ Game clips (CLIPS_DIR)            #clips redirects
└─ Notes (NOTES_EMAILS)              #notes, ?note= redirect

Settings  #settings                                   all accounts; phones: an index, each group its own page
├─ You & account      (face → profile, sign-in line, tags, sign out, password; H only: Your year)
├─ Look & language    (Language + Appearance)
├─ Watching           (subtitles, intros, Open Lilin on: Discover / Together / Library)
├─ Devices & notifications (this device's notifications, Sign in a TV, Android TV, Jellyfin)
├─ Downloads          (+dl: quality, largest size, audio language)
└─ Help & ideas       (idea box M/H/R, ?ideas=1 for members; about)

Overlays (unchanged containers): profile .pf · Pick together .pick · Wrapped · player (+ room panel, live chat,
moment editor) · #picker sheets, plus ONE new shared Invite sheet (2.4)
```

### 1.2 Navigation per width

| Width | Navigation |
| --- | --- |
| Phone < 600 px | Bottom tab bar, labelled, **max 5**: Discover · Together · Library · (Owner) · Settings. Together has a count badge for things waiting on you (friend requests, unseen moments shared with you, Pick invites). Library keeps the download badge. Header: wordmark, Browse ▾ (Discover only), search icon, What's new bulb, face. |
| Tablet 600–899 px | Same tab bar. Together goes two-column (On now + Watch with someone on the left, requests + friends + Moments on the right). Settings shows index and group side by side at ≥ 760 px. |
| Desktop ≥ 900 px | Header links: Discover · Together · Library · (Owner) · Settings, then the search field, What's new and face. Together: main column + 380 px rail (mockup). Owner: section rail on the left. Settings: the existing sticky group nav. |
| ≥ 1600 px | Same layout, scaled by the existing fluid tokens. |

### 1.3 Role variants (nothing anyone is excluded from today shows up)

| Account | Tabs (phone and desktop) | Together contains |
| --- | --- | --- |
| **H** Home network shared account (no email) | Discover · Together · Library · Settings (4, as today) | On SEELE TV now (with faces), Full guide, live chat in the player, Watch with someone, **Moments: its own list** (fixes the inventory dead end: the server already returns them, only the client gate on email is lifted). No friends, requests or Invite (no email, as today). |
| **M** member with email | 4, as today (Live → Together) | Requests, friends strip, On now, Watch with someone, Moments, Invite sheet (Add a friend, Share your profile, and the member invite link with +inv). |
| **M + Can see activity** | **4 (was 5)**: the Activity tab folds into Together | Same as M, plus the read-only Activity block → full page. |
| **R** restricted | 4, as today | On now **with head counts only, no faces** (as live-tv.js sends today), Full guide, **no chat**, Watch with someone (Pick together and watch parties by **copy-link only**, never listed as an invitee, as today), their own Moments (copy-link only). **No** friends strip, requests, Invite sheet, Activity (unless the owner gives +act, the same rule as today) or From friends. Reviews stay off. |
| **Owner without Notes (co-owner)** | **5 labelled (was 7 icon-only)**: Discover · Together · Library · Owner · Settings | Everything M has, plus the full Activity block. Invite sheet adds "Invite to Lilin" (access invite, password link). Owner hub without Notes. co-owner uses Firefox: Together uses no blur at all (solid `--surface-1` panels), so the no-glass path costs nothing. |
| **Owner with Notes (Owner)** | **5 labelled (was 8 icon-only, scrolling)** | Same as co-owner; the Owner hub adds Notes. The hub reopens on the last section used, so Notes stays one tap away when it's what he last had open. |

Permission rules are unchanged throughout (+dl, +inv, +act, Restrict, NOTES_EMAILS, CLIPS_DIR, CAST_WHEN_AWAY). The
proposal changes where things are, never who can see them. The hard rule for v1: **Together shows no data that the
same account can't already see today.** Channel faces come from the Live guide, parties from `/api/watch/parties`,
friends from `/api/friends`, Moments from `/api/moments`, Activity from `/api/activity` for O/+act only. There is no
new presence like "last seen" or "watching X" for friends. The only presence shown is the SEELE TV faces that
everyone except R already sees in the guide.

## 2. Together in detail

### 2.1 Blocks, in order (phone)

Order is by "what's alive right now", so the page never opens on an empty block:

1. **Friend requests card** (only while one is waiting): face, name, @handle, **Accept** (the screen's one lit
   button) and ✕ (Not now). It replaces the automatic popup. The Together tab badge plus the existing push do the
   telling, so the app no longer interrupts on open.
2. **Friends strip:** You (opens your profile) · friends (a red dot plus "TV · 3" when they're visible on a SEELE TV
   channel, the same data as the guide's faces) · **+ Add** (Invite sheet, Add a friend). Every face opens the
   profile.
3. **On SEELE TV now:** a horizontal rail of channel tiles (16:9 still, channel kicker, title, progress, faces).
   Channels with people on them come first. Tap = tune in (2 taps from anywhere, as today). "Guide ›" opens the full
   guide page (the current Live view, unchanged). Hidden if the server has no channels.
4. **Watch with someone:** two tiles, **Pick together** (opens `.pick`) and **Watch party** (pick a title from your
   library, then *Start now*, which opens the player with the room panel open, or *Plan a time*, which uses the
   existing `POST /api/watch/plan`). Planned parties are listed under the tiles as compact rows: time, title, host,
   Join/Open, plus copy and cancel in the row's ⋯.
5. **Moments:** stills, unseen ones first (bulb dot), "All" → full list (shared with you / yours, re-copy, delete).
   Shown once any exist. Before that there's one quiet line: "Clip a moment from the player's ⋯ menu."
6. **Activity** (O, +act): the latest 3 events with faces → "See all" → the full Activity page (stat tiles, filters
   and feed as today; the owner's Invite tile, access list and person panel moved to Owner → People).
7. *(phase 2)* **From friends:** friends' new reviews and ratings, as poster cards with a face and the stars. This
   needs one read-only endpoint that applies profile visibility and Restrict. It ships only after the fleet's
   "Watch privately" item. Together works without it.

Budget: **max 7 blocks**. New social features join an existing block (a new card kind in Moments or From friends, a
new tile in Watch with someone) and don't get an 8th.

Measured on the mockup: member page 1,240 px on a phone (the Live tab today is 1,571 px with live data), and the
first screen shows the request, friends, two channels and both Watch-with-someone tiles.

### 2.2 Desktop and tablet

Main column: On now as the existing `.nownext` cards (3 across at 1440 px), Watch with someone (2 tiles + planned
party in one row), Activity. Right rail (380 px): Friends panel with the request card on top and a list with status
lines, then Moments. See `C/together-desktop.png` (owner view).

### 2.3 Live updates and cost

The page reuses the SSE topics that exist today (`friends`, `moments`, `parties`, `match`, `social`, `avatars`,
`people`). On now asks `/api/live` for a short `from`/`to` window and refreshes on live.js's existing minute tick.
The full guide (53 buttons) only renders on the guide page. Below-the-fold blocks use `content-visibility: auto` like
the home rows. There is no blur, no per-card glow and no new animation: the live mark is a static glow, as it is
now.

### 2.4 One Invite sheet (was 5 flows)

There's one `#picker` sheet component with one layout: **people** (faces with an action button) · **Copy link** ·
**Share…** (`navigator.share`). It opens in five contexts:

| Context | Opened from | People list | Link |
| --- | --- | --- | --- |
| Lilin | Together → Invite; Owner → People → Invite | — | owner: access invite / password link; +inv member: member invite link |
| Friend | Together → + Add, Invite → Add a friend | search by name (friends.js search) | Share your profile (/#@handle) |
| Room | player → Watch together pill → Invite | friends to notify (as "Notify someone") | room link (/c/w/) |
| Pick | Pick together setup and match | friends (skips R, as today) | pick link |
| Moment | moment editor → Share | friends to send to | moment link (/c/m/) |

Restricted accounts get the sheet with the link part only (Room, Pick, Moment), the same as today.

## 3. Every feature, its new home and entry points

"Entries" counts the distinct UI doors to a feature (deep links and notifications in brackets when relevant). Who can
use what is unchanged unless the row says so.

### 3.1 Discover and browsing

| Feature | Today | Proposal C | Entries before → after |
| --- | --- | --- | --- |
| Billboard | Discover top | unchanged | 1 → 1 |
| TMDB rows | 8 on type All | All: Trending, New episodes this week, In cinemas now, Coming soon, **Top rated** (films + shows in one row; See all has a Films/Shows switch). **Popular films / Popular shows** become the first rows of the Films and Shows types (which already use their own sets) | 2 (row, See all) → 2 |
| Continue watching (+ Up next) | Discover row 1 **and** Library shelf | Discover row 1 only; Library cards keep their progress bars and the sort gets "In progress" | 2 → 1 |
| On its way | Discover row | Library → Downloads (+ tab badge, the title's own page) | see Downloads |
| Saved for later | Discover row (+ Library "Coming up") | Discover **"Your list"** row (only titles ready to watch, hidden when empty) + the full list in Library → Saved | 2 partial lists → 1 slice + 1 full list |
| Popular on Lilin | Discover | Discover; moves up as the one social row on Discover; its faces open profiles | 1 → 1 |
| Because you watched X + Top picks for you | 2 rows | one **"Picked for you"** row, each card carrying its reason ("Because you watched X") | 2 → 1 |
| New in your library | Discover | unchanged (+ Library sort "Newest") | 1 → 1 |
| Mood genre rows (app.js `MOODS`, 2 a day) | 2 rows | folded into Moods: the `MOODS` entries become vibes in vibes.js, and Discover shows **one "vibe of the day" row** | 2 rows → 1 row |
| Moods (28 vibe tiles) + mood page | Discover row → tile | unchanged | 1 → 1 |
| Type filter + Genres | desktop segmented + Genres chip; phones Browse ▾ | unchanged | 1 per width → same |
| Documentaries + SVT Play | type filter / Browse; SVT hits in search; SVT sheet | unchanged | 3 → 3 |
| Coming soon (row + page) | Discover | unchanged | 1 → 1 |
| Search | header, **6 meanings** by tab | header, **1 meaning everywhere**: find a title (matches already on Lilin first, then TMDB, then "Free on SVT Play"). Long lists get their own in-page filter field: Library → Yours, Activity, Owner → People, Game clips, Notes (server search) | 1 box / 6 meanings → 1 box / 1 meaning + 5 in-page filters |
| Peek | hover / long press | unchanged | 2 → 2 |
| Pick together | Discover line (block 7 of 18) [+ ?pick=, notification] | **Together → Watch with someone** tile [+ ?pick=, notification] | 1 (deep scroll) → 1 (2 taps) |
| Wrapped teaser | Discover banner Dec–Jan | unchanged | see Wrapped |

### 3.2 Title pages

| Feature | Today | Proposal C | Entries before → after |
| --- | --- | --- | --- |
| Title page (Discover / library film / library show) | 3 renderers, different action sets | **one title page**: actions and sections follow state (on the server or not, film or show). Every action that existed on any variant is still there | 3 variants → 1 (entries unchanged: every card, billboard, peek, search…) |
| Trailer | hero | unchanged | 1 → 1 |
| Add / Download / Advanced options / Dubbed | Discover variant | the one title page while not on the server; Advanced options and Dubbed move into the action row's ⋯ | 1 → 1 |
| Already on the server (Add, Add & play, Add season) | Discover variant, no +dl | same page, same state rule | 1 → 1 |
| Save for later / Follow (+ auto-download) | `page-extras` box; Coming soon one-tap | a chip in the action row; Coming soon one-tap; managed in Library → Saved | 2 → 3 (adds the list) |
| Thumbs + Liked by | `page-extras` | **one social strip** under the actions: thumbs · Liked-by faces (open profiles) · Review | 1 → 1 |
| Reviews (button, section, See all, composer) | title page | Review sits in the social strip; section and See all unchanged; R still gets none | 3 → 3 |
| Cast rail · Versions · More like this · More details | title page | unchanged, on the one page | 1 → 1 each |
| Episodes | tabbed browser (Discover) vs season grid → rows (Library) | one episode list with season chips (an "All seasons" sheet above 8 seasons), one season rendered at a time | 2 patterns → 1 |
| Keep longer / Leaving soon | keep bar, card badges, Library shelf, Settings → Your library text | meta line "Leaves in 3 d · Keep longer", card badges, Library → Yours "Leaving soon"; the Settings text moves into the Library footer | 4 → 3 |
| Play on TV / To phone / Delete | library film chips; file ⋯ | Play on TV in the action row; To phone and Delete in the action ⋯; file ⋯ unchanged | 2 → 2 |
| Identify film (O) | chip | action ⋯ (O) | 1 → 1 (demoted) |

### 3.3 Library and downloads

| Feature | Today | Proposal C | Entries before → after |
| --- | --- | --- | --- |
| Library grid + type filter + Availability select | Library | Library → **Yours**: type chips, sort (moved from Settings → Library order), filter field; Availability's "On the way / Needs attention" become the Downloads segment | 1 → 1 |
| Shared-library note | Library top | Yours, one line | 1 → 1 |
| Coming up (saved releases, followed shows' next episodes) | Library shelf | Library → **Saved**, "Coming up" group | 1 → 1 |
| Leaving soon (< 48 h) | Library shelf | Yours, only while something is leaving | 1 → 1 |
| Downloads in progress | **7 surfaces** (Discover row, card panels, summary button, Availability, tab badge, Manage sheet, card '•••') | Library → **Downloads** (in progress + needs attention), the tab/segment badge, the title's own page | 7 → 3 |
| Manage downloads (O) | Library header button | Downloads → "All server downloads" | 1 → 1 |
| Find torrents (+dl, torrents on) | Library header button | Downloads header | 1 → 1 |
| Conversion banner ("Preparing playback") | Library top; the player's error text points at it | Downloads → Preparing; the player's "Can't play here" box **links straight to it** | 1 + dead end → 2 linked |
| Download to phone + list | 5 doors; the list only shows while copies exist | same 5 actions; the list lives permanently in Downloads → **On this phone** (?travel=1 lands there) | 5 → 5 (list gets a home) |
| Planned watch parties | Library shelf (while one exists) | **Together → Watch with someone** (create, join, copy, cancel) | 1 → 1 (and now creatable there) |
| Your library card (count, size, next to go, retention) | Settings → Your library | Library → Yours footer line | 1 → 1 (next to what it describes) |

### 3.4 Playback, rooms, TV

| Feature | Today | Proposal C | Entries before → after |
| --- | --- | --- | --- |
| Player · Play now · Skip intro / Up next / Play next · Bedtime + subtitle look · Quality / Audio / Subtitles · AirPlay / PiP / fullscreen guide / iPhone hand-off | player | unchanged | unchanged |
| Stats for nerds | `I` key / right-click only | + player ⋯ → Stats for nerds (first touch entry; the ⋯ menu stops holding a single item) | 2 → 3 |
| Watch Together rooms | player pill, /c/w/, notification, Library parties shelf, Pick match | player pill, /c/w/, notification, **Together → Watch party** (start or plan), Pick match | 5 → 5 (Library shelf → Together) |
| Moments: clip a moment | player ⋯ | player ⋯; sharing uses the Invite sheet (Moment context) | 1 → 1 |
| Play on TV + now-playing pill + remote | chips, file ⋯, nowbar | unchanged | unchanged |
| Live TV guide + tuning + channel strip | Live tab; channel numbers in the player | **Together → On SEELE TV now** (tune from the tab) + **Full guide** page (#live redirects); channel numbers unchanged | 2 → 3 |
| Live chat | channel strip Chat (not R) | unchanged | 1 → 1 |
| Channel editor + SEELE TV picks (O) | Live → "Your channels" chip | **Owner → Channels** | 1 → 1 |

### 3.5 People, social, personal

| Feature | Today | Proposal C | Entries before → after |
| --- | --- | --- | --- |
| Own profile | header face, Settings → Your profile, /#@handle | header face, Together → "You", Settings → You & account face, /#@handle | 3 → 3 |
| Profile editor | profile → Edit profile | unchanged | 1 → 1 |
| Others' profiles | Friends list, review authors, /#@handle | **every face opens the profile**: friends strip, request card, Liked by, reviews, Activity, guide faces, room roster, Pick faces. Visibility rules unchanged; restricted people's faces are never shown anyway. Owners also get "Manage" on a profile → Owner → People → that person | 3 → 8 (one rule instead of a list) |
| Friends (search, requests, list, remove) | **Settings → Friends**, profile Add/Accept, popup [?friends=1] | Together friends strip + Add (Invite sheet, Friend context), profile Add/Accept [?friends=1 → Together] | 3 → 2 |
| Friend-request popup | auto popup on open | **demoted**: request card at the top of Together + Together tab badge (+ push, unchanged) | popup → card + badge |
| Moments inbox | **Settings → Moments**, hidden until one exists [?moment=] | **Together → Moments** (+ All page) [?moment= → Together, plays it]. H gets its own list | 1 → 1 |
| Activity (O; +act read-only) | **Activity tab** | **Together → Activity** block → full page (#activity redirects). Owner admin parts → Owner → People | 1 tab → 1 block |
| Wrapped | Discover banner (Dec–Jan), Settings → You button [?wrapped=] | Discover banner (Dec–Jan), **profile "Your year" card** (H, which has no profile: Settings → You & account row) [?wrapped=] | 2 → 2 |
| What's new | header pill/bulb, automatic after updates [?update=] | unchanged | 3 → 3 |
| Idea box (M, H, R) | Settings → You group [?ideas=1] | Settings → **Help & ideas** [?ideas=1] | 1 → 1 |
| Ideas inbox + scout (O) | Settings → Ideas (group 9 of 10) [?ideas=1] | **Owner → Ideas** [?ideas=1] | 1 → 1 (2 taps, not a 5.7k px scroll) |
| Invite people (member links, +inv) | Settings → Invite people | Together → Invite (Lilin context) | 1 → 1 |
| Owner invites + who may sign in | Activity → Invite tile, person panel | Invite: Together → Invite (owner gets the access options), Owner → People → Invite (same sheet); the sign-in list → Owner → People | 2 → 2 |
| *All invite flows* | 5 different UIs (access, member link, room, Pick, profile share) | **1 Invite sheet, 5 contexts** (2.4) | 5 → 1 component |

### 3.6 Settings and owner tools

| Feature | Today | Proposal C | Entries before → after |
| --- | --- | --- | --- |
| You card + Your profile button | Settings → You | Settings → You & account (the face opens the profile) | 1 → 1 |
| Account: sign out, change password | Settings → You | Settings → You & account | 1 → 1 |
| Language, Appearance | 2 groups | **Look & language**, 1 group | 2 groups → 1 |
| Watching (7 rows / 13 controls) | Settings → Watching | Watching keeps subtitles, intros and Open Lilin on (now **Discover / Together / Library**: adds `together` to `START_VIEWS` in src/accounts.js). Sign in a TV, Android TV, Jellyfin → Devices & notifications. Library order → Library toolbar | 7 rows → 3 |
| Notifications (this device, kinds) | Settings → Notifications | Settings → **Devices & notifications** | 1 → 1 |
| Download preferences (+dl) | Settings → Downloads | unchanged + a "Download settings" link at the foot of Library → Downloads | 1 → 2 |
| Your library card | Settings → Your library | Library → Yours footer | 1 → 1 |
| Server rules (O) | Settings → Server | **Owner → Server rules** | 1 → 1 |
| People (O) | Settings → People (last group, ~35 inline cards × ~7 controls) | **Owner → People**: one list of names and faces, tap → person panel (permissions, library sharing, sign-in access, invites, password links, a link to their activity) | 2 places (Settings + Activity) → 1 |
| House: Overview + Screen Time (O) | House tab, 2 segments | **Owner → Overview**, **Owner → Screen Time** (#house redirects) | 1 → 1 |
| Clips (O, CLIPS_DIR) | Clips tab; /c/ page | **Owner → Game clips** (renamed so it can't be confused with Moments); /c/ unchanged | 1 → 1 |
| Notes (O + Notes) | Notes tab [?note=, /c/n/] | **Owner → Notes** (the hub reopens the last section); links unchanged | 1 → 1 |
| Preview pill | fixed pill | unchanged | 1 → 1 |

Nothing is deleted. The only demotions are the friend-request popup (now a card plus a badge), Identify film (into
⋯) and Advanced options / Dubbed (into ⋯). The only true merges are the two recommendation rows, the two mood systems,
the three title-page variants, the five invite UIs and the two owner people-admin places.

### 3.7 Deep links

| Link | Today | Proposal C |
| --- | --- | --- |
| `#live` | Live tab | `#together` (On now at the top); `#together/guide` = full guide |
| `#activity` | Activity tab | `#together/activity` |
| `#house`, `#clips`, `#notes` | owner tabs | `#owner/house`, `#owner/clips`, `#owner/notes` |
| `#downloads` | Library + "On the way" | `#library/downloads` |
| `?friends=1` | Settings, scrolled | Together (request card; Add sheet if none waiting) |
| `?moment=<id>` | Settings → Moments | Together → plays the moment |
| `?ideas=1` | Settings, scrolled | members: Settings → Help & ideas · owner: Owner → Ideas |
| `?travel=1` | Library + phone sheet | Library → Downloads → On this phone |
| `?watch=`, `/c/w/`, `?pick=`, `?update=`, `?wrapped=`, `?note=`, `/c/n/`, `?play=`, `/#@handle`, all `/c/…` pages | — | unchanged |

Old hashes keep working through a small alias map in the router. A hash for a tab the account doesn't have falls
back to Discover, as it does today.

## 4. How each screen changes (block counts)

### 4.1 Discover

Type All, H account, in order: billboard · Continue watching · *Your list* · Trending this week · Popular on Lilin ·
Moods · Picked for you · New in your library · Vibe of the day · Coming soon · New episodes this week · In cinemas
now · Top rated.

| | Before | After |
| --- | --- | --- |
| Blocks (typical) | 18 | **12** (13 with Your list) |
| Blocks (max) | 21 | **14** (with the seasonal Wrapped banner) |
| Phone height | 5,669 px | ≈ 3,900 px (6 fewer rows of ≈ 300 px) |
| Social pieces | Pick line, Popular on Lilin | Popular on Lilin only (Pick moved to Together) |

Gone from Discover but not from Lilin: Pick line → Together; On its way → Library → Downloads; Popular films/shows →
the Films/Shows types; the second mood row → vibe of the day; Because you watched → Picked for you.

### 4.2 Title pages

| Page | Blocks before → after | Buttons | Lit (gold) |
| --- | --- | --- | --- |
| Film, not on the server | 10 → 8 | 32–34 → ≈ 28 | 1 → 1 |
| Show, not on the server | 11 → 9 | **257 → ≈ 60** (one season rendered) | 1 → 1 |
| Film, on the server | 11 → 8 | 44–48 → ≈ 30 | 2 → 1 |
| Show, on the server | 12 → 9 | 71–73 → ≈ 55 | **7 → 1** |

Merges: the Save/Follow box → an action chip; thumbs + Liked by + Review → one social strip; the keep bar → the meta
line; library and Discover variants → one page.

### 4.3 Together (new; replaces the Live tab)

| Account | Blocks | Phone height |
| --- | --- | --- |
| Member with email | 5 (requests, friends, On now, Watch with someone, Moments) | ≈ 1,240 px (mockup) |
| Owner / +act | 6 (+ Activity) | ≈ 1,500 px |
| H | 3 (On now, Watch with someone, Moments) | ≈ 900 px |
| R | 3 (On now with counts, Watch with someone by link, own Moments) | ≈ 900 px |

Today the Live tab is 1 block plus the guide (1,571 px), and the social features are spread over 7 places.

### 4.4 Library

| | Before | After |
| --- | --- | --- |
| Blocks (live H account) | 8 | Yours: **5** (segments, toolbar, shared note, grids, summary line); 6 while something is leaving |
| Blocks (max) | 11 (header buttons, convert banner, toolbar, note, download summary, phone summary, notices, parties, 3 shelves, grids) | Yours 6 · Saved 3 groups · Downloads 6 groups |
| What left | — | Continue (Discover), parties (Together) |
| What arrived | — | the one saved/followed list (from Discover + Library halves), Library order (from Settings), library summary (from Settings), a permanent phone-copies list |

### 4.5 Settings

| Account | Groups before → after | Phone height before → after |
| --- | --- | --- |
| H | 7 → 6 | 3,929 px → index ≈ 700 px; each group a sub-page of ≤ 1.5 screens (Look & language is the tallest: 9 theme tiles) |
| Member with email (+inv) | 8 → 6 | 3,832 px → same pattern |
| Owner | 10 (live: + Downloads + ~35 people cards) → 6 | **5,657 px+ → ≈ 700 px index**; Server, Ideas and People live in Owner |

The phone index is the main structural fix here: today Settings is one long scroll with no index under 900 px.

### 4.6 Owner tools

| | Before | After |
| --- | --- | --- |
| Places | 6 (Settings Server/Ideas/People, Activity invites/access, Live chip, House, Clips, Notes tabs) | **1 tab**, 8 sections (7 for co-owner; fewer without CLIPS_DIR) |
| Phone tab bar | 8 icon-only, scrolling (7 for co-owner) | 5 labelled |
| People admin | Settings cards (~35 × 7 controls inline) + Activity panel | one list → person panel |
| Section control | House segments, Ideas pills with counts, none elsewhere | one `.segmented` / rail pattern for every section |

Hub landing (phone): one row per section with a live status line ("2 new ideas", "Server OK · VPN on", "3 new
clips"), tap → section; desktop: left rail plus content. The landing remembers the last section.

### 4.7 Duplicates and dead ends from the inventory, resolved

| Inventory problem (3.1–3.4) | Outcome in C |
| --- | --- |
| Continue watching in 2 tabs | Discover only |
| Downloads on 7 surfaces | 3 (Downloads segment, badge, title page) |
| Watchlist in 4 slices, no full list | Library → Saved is the full list; Discover "Your list" is a ready-to-watch slice |
| Leaving soon in 4 places | 3, and the Settings text moved next to the titles |
| Two mood systems | one (vibes) |
| 3 title-page variants | 1 |
| People admin in 2 places | 1 (Owner → People) |
| 5 invite flows | 1 sheet |
| Party planning only via Pick; cancel-only in Library | create / join / cancel in Together |
| Search with 6 meanings | 1 meaning + in-page filters |
| H makes moments it can never see | H gets its list in Together |
| "Can't play here" → hop to the Library tab | direct link to Downloads → Preparing |
| Notifications land in a 5k px Settings scroll | they land where the thing lives (Together, Owner → Ideas, Help & ideas) |
| "Open Lilin on" lacks Live | gains Together |
| Faces that lead nowhere | every face opens a profile |
| Pick together hidden in block 7 | Together, 2 taps |
| Friend search buried in Settings | Together → Add, 2 taps |
| Owner tools at the bottom of Settings / icon-only tabs | Owner tab, 2 taps, labelled |
| **Not solved by C** (left for A/D or a later pass) | 4 bottom-sheet implementations; card variants; per-device vs per-account settings in the player; H can write reviews under the shared name; viewing history still exists in profile + Activity + Wrapped (each for a different audience) |

## 5. How future features slot in

One routing question per feature, asked in this order:

| If the feature… | It goes to | Budget |
| --- | --- | --- |
| involves another person (send, share, invite, watch with, react, see what someone did) | **Together** (a block or a card kind in one), the Invite sheet for any "send to someone" | max 7 blocks |
| helps choose something to watch | **Discover** as a row; one row in means one row out | 12 rows on type All |
| is about your titles, plans or downloads | a **Library** segment's group | 3 segments |
| happens during playback | the player ⋯ menu | max 6 items |
| is a preference | a **Settings** group | 6 groups, each ≤ 1.5 phone screens |
| runs the server | an **Owner** section | rail, no limit, labelled |

Worked examples from the fleet backlog: **Watch privately** → a switch in Settings → You & account and a "Watching
privately" tag on your own face in Together; **Up next for the whole room** and **"pause please"** → the room panel;
**Send a title to a friend** → title page ⋯ → Invite sheet (Title context), arriving in Together → From friends;
**"From friends" shelf** → Together block 7; **collection strip**, **after-credits chip**, **season tabs** → title
page and player; **search shows what's on Lilin first** → already part of the one-meaning search; **personal billboard
reasons ("co-owner loved it")** → Discover billboard; **Wrapped v3** → profile card.

## 6. Risks and weaknesses (my own plan)

1. **Social density is low for half the accounts.** H, R and family members without friends get a Together tab
   that is mostly SEELE TV plus two tiles. With friends offline and nobody on a channel, it reads as a renamed Live
   tab. Mitigation: blocks order by liveness, and SEELE TV is always on. But the "social-first" pitch is only really
   true for perhaps a dozen accounts.
2. **"Live" disappears from the tab bar.** Robin and Alex (if they use the web app at all, which is an open fleet
   question) learned "Live". A word like "Together" is less concrete than "Live", and the couch icon is new.
   Mitigation: SEELE TV is the first big heading, the live dot sits on the tab while friends are on a channel, and
   `#live` still works. It is still a relearning cost, and the Swedish label "Tillsammans" (11 characters) fits a
   78 px tab only just (fallback "Ihop").
3. **Concentrated presence.** No new data is exposed, but putting "Owner · TV 3" on a front page makes existing
   visibility more noticeable than it was in a guide. The phase-2 friends feed must wait for Watch privately, and the
   panel may decide even the TV dot belongs only in the guide.
4. **The owner's Together is different.** Activity carries admin events (permission changes, downloads, ideas) into
   a "social" space, so help texts and screenshots differ between the owner and a member. An alternative is to put
   Activity in Owner for O and in Together only for +act. That splits one feature across two homes by role, which I
   rejected, but it's a fair counter.
5. **Owner tools get one tap further.** Notes, Clips and House were 1 tap; now they're 2 (1 if last used). Owner
   uses Notes a lot.
6. **The Pick together line leaves Discover.** It was the discovery-time nudge ("Can't agree?"). Pick could get
   used less by people who never open Together.
7. **Badge instead of popup.** Friend requests might sit unanswered longer. Push still fires.
8. **H's moments become visible to everyone on the shared account.** That's consistent with how H works, but it's a
   visible change. The lead should confirm it.
9. **Build size.** This is likely the biggest of the four plans: a new view, a hub, a Settings index, Library
   segments, an Invite sheet that replaces 5 flows, router aliases and one title-page renderer. app.js is 629 KB in
   one file, so regressions in `renderLibrary`/`renderSettings`/activity are the main danger. It needs deep-link tests.
10. **It doesn't fix everything.** Card variants, the 4 sheet implementations and the font-size drift are untouched
    (4.7). C is an IA plan; the fleet's drift batch is still needed.

## 7. Scope estimate

**Phase 1 (structure; no new server data):**

| File | Change |
| --- | --- |
| `public/index.html` | static tabs Discover · Together · Library · Settings (+ Owner via `addAdminTab`), `#view-together`, `#view-owner`; drop the tab re-ordering hack |
| `public/app.js` | router aliases (3.7); `renderTogether` composed from existing renderers; `renderOwner` hub shell; `renderLibrary` → 3 segments; `renderSettings` → index + group pages; Activity admin parts → People panel; Discover row list (On its way, Pick line, Popular split, MOODS, Picked for you); one title-page renderer; player ⋯ gets Stats; convert-banner link; search with one meaning; `maybeAskFriends` → badge. Expect to carve out `together.js` (~250 lines) and `owner.js` (~150 lines) so app.js shrinks |
| `public/live.js` | On-now tiles for Together; guide as its own page; editor mounted in Owner → Channels |
| `public/friends.js`, `moments.js`, `match.js`, `social.js` | Settings groups → Together blocks; request card; H moments; Pick tile; parties rows; Liked-by faces → profiles |
| `public/profiles.js`, `people.js`, `scout.js`, `notes-view.js` | Your year card, owner "Manage" link; mount points in the hub |
| `public/watchlist.js`, `library-downloads.js`, `travel.js` | Saved and Downloads segments, permanent phone list |
| `public/vibes.js` | absorbs `MOODS` as vibes, vibe-of-the-day row |
| `public/player-stats.js` | ⋯ menu entry |
| `public/i18n-sv.js` | ≈ 60 new strings (Together/Tillsammans, Owner/Ägare, segment and group names, Invite sheet) |
| `src/accounts.js` | add `together` to `START_VIEWS` (the only server change) |
| tests | deep-link alias test; role/tab matrix test (H, M, +act, R, co-owner, Owner); CSS budget counter test (the fleet open item) |

**Phase 2:** one read-only `GET /api/together/feed` (friends' reviews and ratings; profile visibility + Restrict
applied server-side), after Watch privately.

**CSS** (baseline 364,654 B, must not grow):

| Goes away | ≈ bytes |
| --- | ---: |
| icon-only / scrolling owner tab-bar rules (`.tabs:has(.tab:nth-child(6/7))`) | −830 |
| Activity Invite tile, people strip and person panel restyled as the shared person row | −2,500 |
| friends.css rows + moment share rows → one Invite sheet row style | −2,800 |
| Pick entry line (match.css `.pick-entry*`) | −1,200 |
| Library shelves, parties shelf, Availability select | −1,900 |
| House segments, Ideas pills → `.segmented` | −600 |
| **Removed total** | **≈ −9,800** |

| Comes in | ≈ bytes |
| --- | ---: |
| Together layout (channel tiles, friends strip, request card, tiles, party row, rail) | +2,800 |
| Owner hub landing + rail | +1,500 |
| Invite sheet | +900 |
| Settings phone index | +700 |
| Library segments + toolbar | +400 |
| **Added total** | **≈ +6,300** |

**Net ≈ −3.5 KB (≈ −1 %), 364.7 → ≈ 361 KB.** That's honest but modest: IA moves mostly relocate CSS rather than
delete it. The real structural gain is fewer one-off patterns: 3 people-row styles → 1, 3 section-control styles → 1,
5 invite UIs → 1. Counters that should fall: segmented-control variants 4 → 1, `!important` 24 → ≤ 22 (the tab-bar
overrides), `@media` blocks −4.

## 8. Mockups

| File | What it shows |
| --- | --- |
| `C/together-phone.png` (390×844) | Member with email: request card (the one lit button), friends strip with Owner on channel 3, On SEELE TV now rail with faces, Watch with someone tiles; tab bar Discover · Together (badge) · Library · Settings |
| `C/together-phone-full.png` (390×1240) | The same page to the end: planned party row, Moments (unseen dot) |
| `C/library-phone.png` (390×844) | Owner tab bar (5 labelled); Library → Yours with segments Yours · Saved · Downloads (badge), type chips + sort + filter, shared note, Leaving soon, grids |
| `C/together-desktop.png` (1440×900) | Owner: header Discover · Together · Library · Owner · Settings; On now as the existing `.nownext` cards, Watch with someone + planned party, Activity preview; Friends rail with request and Moments |

Rendered with Playwright's Chromium headless shell (`chromium_headless_shell-1194`; the full `chrome --headless`
binary enforces a 500 px minimum window width, which broke the 390 px renders), muted, CS2 not running. Stand-in art
is cropped from the before-shots.
