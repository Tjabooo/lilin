# Critique round 2: designer C on the hybrid draft, plus the build spec for Live, Invite, For you and friend requests

Read: `hybrid-draft.md` and `critique/r1-{A,B,C,D}.md`. Code checked at master `e6a9236` (versioned asset URLs:
a new module like `invite.js` gets its `?v=` from the import map, so no extra wiring is needed).

## 1. Holes in the hybrid (5)

| # | Hole (concrete) | Fix |
| --- | --- | --- |
| H1 | **Two inboxes plus a stacked interrupt.** A moment sent to you lands in What's new › For you *and* in You → Moments. A friend request lands in the popup (shipped today, 803907f), For you *and* You → Friends. The bulb starts meaning "release notes **or** someone wants you" (B and D's r1 attack on A). On a cold open after a deploy, the What's new popup → closes → the friend popup opens: two sheets in a row. | **For you lives at the top of the You tab**, not in What's new. The bulb stays release notes only. The You tab dot = the For you count. The What's new sheet gets at most one quiet line, "2 things for you ›", which jumps to You. One interrupt per open: see 2.4. |
| H2 | **Pick together still fails ≤ 2 taps.** As the first Moods tile it sits about 900 px down on a 390 px phone (A admits it; every r1 table shows "+ scroll"). | Add a **Pick together chip** to the top of Live (2 taps, above the fold), next to Watch party (2.1). Keep the Moods tile. Both open the same `.pick` overlay. |
| H3 | **Activity has no stated home for owners.** "You … Activity (if Can see activity)" doesn't say where Owner and co-owner get it, or where its owner-only half (Invite tile, access list, person panel) goes. Every r1 critique flagged "Activity in two homes by role". | **You → Activity** for O and +act alike (one home). Invite tile → Invite sheet, Lilin context (2.2). Access list + person panel → House → People. `#activity` → You → Activity. |
| H4 | **"Right now on top" of Discover collides with the billboard.** The billboard is full-bleed under a transparent header (`body.has-billboard`), so a strip *above* it breaks both. *Below* it, it's at ≈ 740 px on a 1440×900 desktop, so not "on top". | Make it **block 2: under the billboard, above Continue watching**: ≤ 3 one-line rows × 56 px, hidden when empty, never above the billboard. No copy of it in Library (Library keeps its segment counts). The "party today" row is a shortcut to the party's row in Live. |
| H5 | **Server changes the hybrid doesn't list,** without which promised behaviour breaks: (a) A's merged Popular / Top rated rows change `HOME_ROWS`, which the TV apps also read; (b) "every face opens a profile" is impossible, because face payloads carry only `{name, avatar}` (`src/live-tv.js:113`, `src/watch.js` `faces()`), and `profiles.open()` needs `id` or `handle`; (c) `START_VIEWS` in `src/accounts.js` lacks `you`/`live`. | (a) New keys `popular-all` / `top-all`; old keys stay for TV. (b) Add `id: m.userId` to face objects in `live-tv.js` (non-blind viewers only, as now) and `watch.js` `faces()`; restricted people stay filtered server-side. (c) Add `live` and `you` to `START_VIEWS`. All three are small and additive. |

## 2. Build spec: my areas

Roles: **O** owner (Owner; **co-owner** is O without Notes, on Firefox's no-glass path) · **M** member with email (+inv,
+act switches) · **R** restricted · **H** Home network shared account (no email). Rule carried over from C.md:
**nothing shows that the same account can't already see today.**

### 2.1 Live tab (name, icon and `#live` unchanged)

Layout top → bottom (phone; desktop uses the same order with `.live-nownext` at 3–4 across):

| # | Block | O / co-owner | M | R | H | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Heading ● {SEELE TV} | ✓ | ✓ | ✓ | ✓ | unchanged (`#live-heading`) |
| 2 | **Tools row** (`.live-tools`, chips, one line): **Pick together** · **Watch party** · (O only) **Edit channels** | 3 chips | 2 | 2 (link-only inside) | 2 | `.live-tools` today holds only the owner chip |
| 3 | **Watch parties** (only while any are planned; max 3 + "All"): host face, title, countdown, Join / Wait in room (`.chip.primary`), **Invite** → Invite sheet (Room), Cancel (mine) | ✓ | ✓ | ✓ (Invite = link only) | ✓ | `social.partiesShelf` moved from Library; `/api/watch/parties` |
| 4 | On now (`.live-nownext`, ≤ 12 cards) | ✓ | ✓ | ✓ | ✓ | unchanged |
| 5 | Guide | faces → profile | faces → profile | **head count only** (as now) | faces → profile | unchanged except faces become buttons (needs H5b) |
| — | Live chat in the player | ✓ + delete | ✓ | **none** (as now) | ✓ | `live-chat.js` unchanged |

**Watch party chip** opens a `#picker` sheet, "Watch party":
- **Start now:** up to 8 rows (Continue watching first, then the newest library titles) plus a filter field over
  `state.library`. Tap → `openPlayer(file, { host: true })`. Once playback is ready, call `hostWatchRoom()` +
  `setWatchPanel(true)`. Channels are excluded.
- **Plan for later:** the same picker → `social.planPartyBody({ file, title, onPlanned })` → `plannedBody(...)`.
  Both functions exist and are unused today (dead since 11-10), so this revives them. Change its "waits for you in
  Library" string to "in Live" (T() + sv).
- R: identical, but the room's Invite shows the link part only.

**Empty states:** no channels → tools row + the existing "No channels yet" (the owner still sees Edit channels). No
parties → block 3 is absent.

**Files and functions:**

| File | Change |
| --- | --- |
| `live.js` `render(body)` | the tools row builds 3 chips (new deps `openPick`, `openWatchParty`); a `partiesSlot` element before On now; guide faces → `<button>` calling `openProfile(face)` when `face.id` is present; **return `openEditor`** so House → Channels can call it |
| `app.js` `enableLiveTab` / `renderLive` | pass the new deps; `loadParties()` targets the Live view's slot instead of `libraryUI.parties` |
| `app.js` lines 1503–1507 (`renderLibrary`) | drop `parties: h('div', {class:'parties-slot'})` and the `loadParties()` call |
| `app.js` SSE jobs (lines 2484–2485) | `has('parties') / has('avatars') && view === 'live'` (was `'library'`) |
| `app.js` new `openWatchPartySheet(opener)` | ~60 lines, as above |
| `app.js` `openPlayer(f, opts)` | honour `opts.host` (call `hostWatchRoom` after `ready`) |
| `match.js` | expose `openSetup()` (the handler behind `pickUi.entry`) for the Live chip |
| `social.js` | `partiesShelf`: Invite button → `invite.open({ kind: 'room', token })` (was copy link); `faces()` renders buttons when `id` is present |
| server | H5b (face ids), `START_VIEWS` + `live` |

**CSS:** `.parties-shelf`/`.party-*` (1.7 KB) move as they are, with no change. `.live-tools` is reused. `.party-quick`
and `.party-when` come back into use (today they're dead with `planPartyBody`). Added: ≈ 0.4 KB (picker rows reuse
`.rows .row`; a `.guide-faces button` reset).

### 2.2 One Invite sheet (5 contexts)

One component, **`public/invite.js`**: `createInvite({ h, api, jsonPost, toast, icon, people, me, copyWithToast,
friendsUI })` → `{ open(ctx, opener), mount(container, ctx) }`. **The container depends on the context:** `#picker`
for Lilin and Friend, but **inside the player** for Room and Moment. A `#picker` sheet outside `#player` is invisible
in element fullscreen, so Room and Moment must mount in place. Pick mounts inside `.pick-pop`.

Every context has the same order: **title (its own verb) → people grid (`.room-invitee-grid` tiles: face, name,
state Invite/Sending…/Invited/Not reached) → Copy link + Share… (`navigator.share` when present) → one hint line.**
The verbs follow A's rule: "Invite" means bring someone into Lilin, and nothing else.

| Context | Title (en / sv) | People: source → action | Link | Mounted in | O / co-owner | M | R | H |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Lilin** | Invite someone to Lilin / Bjud in någon till Lilin | none. Note field + **Make link** (O: `POST /api/access/invite`; M +inv: `POST /api/invites`, max open) + open links with Copy / Cancel | per created link (`/c/i/<token>`) | `#picker` | ✓ (CF hint if not configured) | +inv only | — | — |
| **Friend** | Add a friend / Lägg till en vän | incoming requests (Accept / Decline) on top, then `friendsUI.searchBox()` → Add | Share your profile (`/#@handle`) | `#picker` | ✓ | ✓ | — | — |
| **Room** | Ask people to join / Be fler att titta med | `GET /api/watch/<t>/invitees` (non-R with push, friends first) → `POST …/invite` per tap | `/c/w/<token>` | room panel (`#watch-invite-list`) | ✓ | ✓ | link only (server refuses invitees) | ✓ |
| **Pick** | Ask people to pick / Be fler att välja | `GET /api/match/<id>/invitees` → `POST …/invite`; **select mode** in setup (toggle before create) | `/?pick=<id>` | `.pick-pop` / setup section | ✓ | ✓ (`canInvite`) | link only | as server allows |
| **Moment** | Send this moment / Skicka ögonblicket | `friendsUI.friendList()` in **select mode** → "Send to N" | `/c/m/<token>` (created on Copy) | moment panel share step | ✓ | ✓ | link only | link only (no friends) |

Live-channel rooms keep the server's 409 ("everyone can tune in"), so Room hides its people grid when
`room.live`.

**Entry points:**
- Lilin: You → "Invite someone to Lilin" row (+inv or O), and House → People → Invite (O). Same sheet.
- Friend: You → Friends → Add a friend. Profile Add/Accept is unchanged.
- Room: player room panel pill, and the Live party row's Invite.
- Pick: the pick header button, plus the setup section.
- Moment: the moment panel's Share step.

**Files and functions replaced:**

| Today | Becomes |
| --- | --- |
| `app.js` `#watch-invite` listener (lines 5055–5087) | `invite.mount(inviteList, { kind: 'room', token })` |
| `app.js` `memberInviteSettings` (8598–8640), `activityInvite` (8692–8720), `makeInvite`, Activity's Invite tile (`act-invite-tile`, line 8918) | the Lilin context (`/api/invites` or `/api/access/invite`, chosen by `me.isOwner`) |
| `match.js` `openInvite` (566–596) + setup invite section (147–160) | Pick context (select mode in setup) |
| `moments.js` `share()` `pickFace` grid | Moment context (select mode); the note and subtitles toggle stay in the moment panel above it |
| `friends.js` `settings()` search block | Friend context (reuses `searchBox` / `resultNodes`) |
| `index.html` room section label "Invite" | "Ask people" (T() + sv); `#watch-copy` folds into the component's link row |

**CSS deleted:**

| Rules | Bytes |
| --- | ---: |
| `.act-invite*` (incl. tile / plus / count) | 2,423 |
| `.invite-new`, `.invite-hint`, `.invite-rows`, `.invite-note` | 385 |
| friends.css `.moment-friend(s)`, `.moment-hint` | 380 |
| match.css `.pick-pop-list`, `.pick-invitees` | 256 |
| **Total** | **≈ 3.4 KB** |

`.room-invitee*` (974 B) stays as *the* people grid. Added: `.invite` head, link row and hint ≈ 0.6 KB. **Net
≈ −2.8 KB.**

### 2.3 "For you" (placed at the top of You, per H1)

A list of ≤ 5 rows, newest first, hidden when empty, built from existing endpoints. There's no new server state.

| Item | O / co-owner | M | R | H | Source | Row action | Clears when |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Friend request | ✓ | ✓ | — | — | `/api/friends` `incoming` | inline **Accept** / Decline (`friendsUI.askRow`) | answered |
| Moment sent to you | ✓ | ✓ | — (no friends) | — | `/api/moments` `shared` with `!seen` | tap → plays it (`/seen`) | seen |
| Answer to your idea | — (owners have no idea box) | ✓ | ✓ | ✓ | `/api/ideas` mine with `answered >` per-device `localStorage['lilin:ideas-seen']` | tap → You → Ideas | opened |
| Pick together invite | ✓ | ✓ | — (never invited) | if invited | `/api/match` picks with `invited` | tap → `pickUi.openPick(id)` | joined or ended |

- **Dot:** the You tab dot = the For you count (`.tab-badge`, existing style). The What's new bulb doesn't change.
- **Live:** re-render on SSE topics `friends`, `moments`, `ideas`, `match` (all exist).
- **What's new sheet:** one `chip` line "{n} things for you ›" at the bottom when n > 0; closing it changes nothing.
- **Fallback if the lead keeps For you inside What's new:** render the same list as the sheet's first section,
  and the bulb lights for `updates.unseen + forYou.count`. That's worse, for the H1 reasons.

**Files:**
- `app.js`: new `forYou()` (~50 lines) in the You view, and the tab dot.
- `friends.js`: factor `askRow(p)` out of `askSheet`, so the popup and For you share one row.
- `moments.js`: export `unseenShared()`; drop the `!me()?.email` gate (line 300) so H sees its own moments list.
- `match.js`: export `invitedPicks()` from `listCache`.

CSS: reuses `.rows .row` + faces, ≈ +0.2 KB.

### 2.4 Friend requests: **keep the popup (803907f) and add persistent places; no badge-only replacement**

C.md proposed replacing the popup with a card and badge. **I withdraw that.** It shipped this morning on purpose,
and it's already polite: it waits behind What's new, other sheets and video, and "Later" hides a request for 20 h per
device. What it lacked is a permanent place, which the hybrid now has.

| Surface | Behaviour | O / co-owner / M | R / H |
| --- | --- | --- | --- |
| Popup (`friendsUI.askSheet`, `app.js` `maybeAskFriends`) | unchanged, except the guard changes `state.view === 'settings'` → `state.view === 'you'` (requests are on screen there). **One interrupt per open:** if the What's new popup was shown in this page load, the friend popup waits until the next `visibilitychange` or live arrival instead of chaining straight after it | ✓ | none (boot gate `email && !restricted` unchanged, line 10492) |
| For you row | inline Accept / Decline (2.3) | ✓ | — |
| You → Friends | requests on top, count on the row | ✓ | row absent |
| You tab dot | counts the requests too (via For you) | ✓ | — |
| Push → `/?friends=1#settings` | lands on **You → Friends** | ✓ | — |

Answering anywhere publishes `friends` (user audience), so all of these update at once.

### 2.5 Old hashes and links for these areas

| Link | Today | After |
| --- | --- | --- |
| `#live` | Live | Live (unchanged) |
| `#activity` | Activity tab | You → Activity (O, +act); others → start view (as today) |
| `#settings` | Settings | You (Settings list). Pushes `/?friends=1#settings` → You → Friends; `/?ideas=1#settings` → You → Ideas (M/H/R) or House → Ideas (O) |
| `?moment=<id>` | Settings → Moments, plays it | plays over the current tab, marks it seen (the For you row clears) |
| `?watch=`, `/c/w/` | room offer | unchanged (`offerWatchRoom`) |
| `?pick=` | Pick together | unchanged (`pickUi.openPick`) |
| `/c/i/<token>`, `/c/m/<token>` | stand-alone pages | unchanged |
| Library parties shelf | Library | Live block 3 (no URL ever pointed at it) |

The server push URLs need no change, because every one still lands correctly.

### 2.6 New strings (T() + Swedish), about 20

Pick together · Watch party · Edit channels · Start now · Plan for later · Watch parties · Ask people to join · Ask
people to pick · Send this moment · Add a friend · Invite someone to Lilin · Share… · For you · {n} things for you ·
"{0} answered your idea" · "{0} wants to pick with you" · "the party also waits for you in Live" (replaces the
Library string) · "Ask people" (room pill).

### 2.7 Totals and tests

- **CSS for these areas:** −3.4 KB deleted, +1.2 KB added → **net ≈ −2.2 KB**. No new blur (co-owner's Firefox is
  unaffected), no keyframes, no `infinite`.
- **New JS:** `invite.js` ≈ 4 KB. The code it replaces in `app.js`, `match.js` and `moments.js` is ≈ 5 KB, so the
  net is slightly negative.
- **Tests:**
  - Role matrix for the Invite sheet: R and H never get a people grid or the Lilin/Friend contexts. M without +inv
    has no Lilin context.
  - The Live tools row per role: Edit channels only for O.
  - Face payloads: no `id` for blind (R) viewers, and restricted users never appear.
  - Deep links: `/?friends=1#settings` → You → Friends; `#activity` → You → Activity.
  - `maybeAskFriends` never opens on `view === 'you'`, nor in the same load as the What's new popup.
