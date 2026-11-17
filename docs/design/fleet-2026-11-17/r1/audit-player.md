# Audit: web player, Watch Together, Live TV, Moments (round 1)

Scope: `public/index.html:145-303` (player markup), `public/app.js` (player, room, live strip, menus, keys),
`player-*.js`, `watch-sync.js`, `live-chat.js`, `live.js`, `moments.js`, `seek-preview.js`, `style.css:1142-1906`,
`style.css:3102-3180` / `3407-3632` / `3732-3890`, `friends.css:30-100`.

Screenshots (my own scratch harness, `/tmp/lilin-fleet/scratch-player/ui-shots/`, a copy of tools/ui-shots with
mocked room/live endpoints: nothing was written to the server):
- `/tmp/lilin-fleet/shots-player2/` menus, stats, help, seek, OSD (phone/tablet/desktop)
- `/tmp/lilin-fleet/shots-player4/` Watch Together host/guest/invite/countdown/closed (phone/tablet/desktop)
- `/tmp/lilin-fleet/shots-player6/` Live TV player + live chat (phone/tablet/desktop)
- `/tmp/lilin-fleet/shots-player5/` forced states: two menus at once, chat floats + reactions + Skip intro, Play now popup
- `/tmp/lilin-fleet/shots-player7/` Swedish phone

Caveats: headless Playwright Chromium has **no H.264 or HEVC**, so nothing actually plays in any fleet shot (every
player shot shows the "Making a version that plays here" note or the "can't play" error). Real playback states
(seek frames with a duration, Up next, true subtitle layout) were reviewed from code. The room shows
"Reconnecting…" in shots because a mocked event stream closes; that one's not a bug.

**Heads-up for the fleet:** `GET /api/media/lib/<id>/audio?plays=…` and `/api/convert` start real conversions on
the live server when a browser can't decode the file. During this run the S03E04 conversion went 0 → 93 %, so
fleet screenshots (headless Chromium can't decode anything) may be queueing H.264 copies on geofront.

Previous audit (`docs/design/audit.md` "Player"): the phone row overflow, the tiny desktop controls and the missing title scrim
are all **fixed** (pc-row fits at 390 px in EN+SV, `clamp()` sizes ≥900 px, `.player-bar` gradient).

---

## Broken

**B1. The Audio button disappears in every Watch Together room.** `app.js:4463` (`renderParty`): `audioBtn.hidden = true`
runs after `renderAudioControls()` on every room state. It dates from 4b602f4 (11-03). db5c5a8 (11-11, What's new
"Audio language in Watch Together") meant to show it in rooms but never removed this line. Result: the button is
gone, or it flickers back until the next state arrives. Guests can't make their "own pick" (`a.ownPick`, `app.js:5722`).
*Fix:* delete the line; `renderAudioControls()` already decides. Same check for `airplayBtn` (intended there).
Severity: broken.

**B2. Player menus stack on top of each other.** Each button closes a different subset: CC closes only Audio
(`app.js:5338`), Audio closes only CC (`5640`), Quality/Bedtime close three, ⋯ closes four (`moments.js:64`
`closeOthers`), and nothing closes ⋯. All handlers `stopPropagation()`, so the document "click outside" listeners
never fire. Shot: `shots-player5/small/force-two-menus--desktop--en.jpg` (Bedtime and Audio open at once, overlapping
at `right:4px`). *Fix:* one `closePlayerMenus(except)` called by all six buttons (CC, Audio, Quality, Bedtime, ⋯,
fs-guide) plus Escape. Severity: broken.

**B3. The Live chat header shows people the strip deliberately hides.** `live-chat.js:107-113` draws every member's
face, including `quiet` viewers, and it does so for restricted users too. `renderLiveStrip` (`app.js:4636-4641`) hides both
("Restricted viewers see how many are watching, not who"). It also counts you and shows your face, while the strip
shows others + 1. *Fix:* one shared `visibleWatchers(state, me)` helper for strip, chat header and guide.
Severity: broken (privacy rule bypassed).

**B4. Roster status text goes stale.** `app.js:4396`: the redraw key is `[id, name, avatar, tone, host]` and leaves out
the text. "Loading…", "Getting ready" and "Needs to press Play" all share tone `wait`, so a member stays "Loading…"
after they need a tap. *Fix:* add `text` to the key. Severity: broken (small).

**B5. Tablets and small laptops (700-1099 px): the floating room card covers the controls.** `style.css:3601`
`.room { right:16px; bottom:16px; width:420px }`, but nothing moves `.player-controls` / `.player-center`. Shot
`shots-player4/small/room-host--tablet--en.jpg`: CC, Audio, PiP, fullscreen, the Room button itself and the play/+10
centre buttons sit under the card. Only the volume is reachable. *Fix:* dock from 700 px with a narrower
`--room-w` (300-340 px) and move the stage over, or make it a bottom sheet that pushes the picture up (see I1).
Severity: broken.

**B6. On phones the room sheet hides the whole picture.** `style.css:3591` `.room { height: min(82dvh, 700px) }`.
On a 390×844 screen the 16:9 picture (y≈312-531) is completely covered (`room-host--phone--en.jpg`), so chatting means
not watching. Live chat already solves this (`style.css:3874`: the stage moves above a `--lc-h` sheet).
*Fix:* same model: `.player.room-sheet .player-stage { bottom: var(--room-h) }` with `--room-h: min(58dvh, 520px)`
and the picture on top; the roster collapses to the faces row. Severity: broken (core use case).

**B7. Overlays ignore docked panels.** With the room docked (≥1100) or live chat open, `.player-note`, `.player-error`,
`.part-popup`, `.player-help`, `.stats-panel`, `.party-countdown` and the toast are still centred on the full player width
(`style.css:1803, 1181, 1201, 1491, 1506, 3164`). Only stage/bar/controls/centre/skip/up-next move (`3445-3446`, `3878`).
Shot `room-waiting--desktop--en.jpg`: the note is centred ~100 px right of the picture. At 1100-1300 px a 560 px
note or error runs into the 330 px panel. *Fix:* add them to the docked `right:` rules, or wrap all picture overlays in
one `.player-picture` box that the panels shrink. Severity: broken at 1100-1300 px, ugly above.

**B8. The toast lands on the player note.** `body.in-player .toast { top: safe+72px }` (`style.css:1554`) and
`.player-note { top: safe+70px }` (`1803`). Shot `shots-player2/small/ep-moment--phone--en.jpg`: "Wait until the
video has loaded" covers the "Making a version" card. *Fix:* while `#player-note` is visible, put the toast under it
(`top: calc(note bottom + 8px)`) or above the control row. Severity: broken (unreadable).

**B9. The error box sits on the play button and offers no way out.** `.player-error` is `top:45%`, z-index 3, over
`.player-center` (z 2). The play and ±10 buttons poke out around it (`shots-player3/small/live-chat--tablet--en.jpg`),
and it ignores the live chat sheet. Every error is plain text (`app.js:7083, 7097, 7116, 7363, 7380`), e.g. "Close the
player and open it again in a minute." On a channel the server's "This watch room has ended. Ask someone to start a
new one." (`src/watch.js:94`) makes no sense either. *Fix:* hide `.player-center` and the spinner while an error shows.
Make the error a card (icon, title, text) with buttons: Try again / Back / Open Library, and a live wording
("This channel dropped out. Tune in again"). Severity: broken.

**B10. English words inside Swedish.** `app.js:5375` `fmtSubShift` adds `'earlier'/'later'` without `T()` inside
"Timing fixed: lines moved {0}". `app.js:6246` `source || 'original'` doesn't go through `T()` either. Stats party line
`'host'/'guest'/'connected'/'reconnecting'` (`app.js:6908`). *Fix:* `T()` them and add the Swedish. Severity: broken (i18n).

## Inconsistent

**C1. Nine panel recipes over the picture.** Menus `rgb(24 16 21/.86)` blur 22 `--r-lg`; Up next `.88` blur 20;
player note `.86` blur 16 `--r-md`; Play now popup `rgba(31,16,25,.97)` gold border, `16px`, no blur; error `.9` blur 16
alert border; Skip intro `.72` blur 6 (no `-webkit-`); help `var(--curtain)` no blur `16px`; stats
`color-mix(var(--velvet) 88%)` blur 10 `12px`; countdown and chat floats `rgba(20,10,16,.84/.78)` `24px/19px`. Text is
`#f6eadf`, `var(--paper)` or `var(--on-image)` depending on the panel. In shots, help and stats read purple next to the
near-black menus (`ep-help--desktop`, `ep-stats--phone`). Revamp spec: "Menu: glass panel". *Fix:* tokens
`--over-bg / --over-line / --over-radius / --over-blur / --over-shadow` and one `.over-panel` class. The Play now
popup keeps its marquee lights as an accent, not a different body. Severity: inconsistent.

**C2. Two social panels, two systems.** Watch Together room vs Live chat: widths `clamp(330,28vw,400)` vs
`clamp(300,26vw,380)`. Breakpoints: docked ≥1100 / floating card / covering sheet vs docked ≥1100 or landscape ≥560 /
sheet that pushes the picture. Headers: bulb sign + kicker vs plain "Chat". Openers: a pill in the control row vs a
chip in the strip. Neither phone sheet has the handle the revamp spec gives sheets ("bottom sheet with a handle on
phones", `revamp.md:118`) or swipe-to-close. *Fix:* one `.side-panel` component (live chat's layout rules, room's
header style), shared by both. Severity: inconsistent.

**C3. The menus don't match each other.** The CC menu has no title (Audio, Bedtime, Quality and More all start with
an uppercase header, `style.css:1738`). CC rows have no roving `tabindex=-1` and no Arrow/Home/End handler (Audio
`5650`, Bedtime `6197` and Quality `6344` have one; ⋯ has only Escape, `moments.js:72`). `#cc-btn` has no
`aria-controls` (`index.html:212`). `#quality-menu` borrows class `night-menu`. *Fix:* one `menuKeys(menu, btn)`
helper, a "Subtitles" title, aria-controls. Severity: inconsistent.

**C4. The Night mode toggle looks like a radio.** `.night-item[role=menuitemcheckbox]` gets the same 8 px dot as the
sleep-timer radios directly under it (`ep-bedtime--phone--en.jpg`), so "Night mode" and "Off" read as one group.
*Fix:* a small switch for `menuitemcheckbox` rows. Severity: inconsistent.

**C5. "Keep watching" means four different things.** Up next: stay on this episode (`app.js:7270`). Play now
buffering: keep waiting (`player-partial.js:151`). Full quality ready: stay on the stream (`:169`). Live strip:
**leave the channel**, add the title to your library and switch to the normal player (`app.js:4670`). Plus the
"Continue watching" shelf. The live one is a trap. *Fix:* Live → "Watch on demand" (subtitle: "Leaves the
channel"). Play now → "Keep waiting" / secondary "Close, watch later" (now "Wait for the download", which closes the
player). Severity: inconsistent and confusing.

**C6. The room calls the title something else.** The room head uses `current.filmTitle || current.title` +
`episodeLabel` → "The Lord of the Rings - The Rings of Power · S03 E04" (file-name title, compact label), while the bar
says "The Lord of the Rings: The Rings of Power · Season 3, Episode 4: Gundabad" (`room-host--desktop--en.jpg`,
`app.js:4456`). With the room's media shaped like `roomLibraryMedia()` (`src/server.js:2701`, title from `parseFile`),
it's very likely the same live. *Fix:* reuse the player-title formatter (canonical title, episode name).
Severity: inconsistent.

**C7. The live strip uses odd controls and repeats itself.** Surf buttons are text glyphs `'▲' '▼'` (`app.js:4659`), not
Lilin SVG icons, and they sit at the strip's 760 px `max-width` edge, mid-screen on desktop
(`live-player--desktop--en.jpg`). The top bar repeats the programme the strip already shows, and the strip's
progress bar is red `--live` while every other bar is the bulb colour (fine, but nothing explains it). *Fix:*
chevron icons pinned to the right edge (`margin-left:auto` on a full-width row). On a channel, the title bar shows
"2 · Sitcoms" plus the LIVE pill. Severity: inconsistent.

**C8. Skip intro doesn't grow with the desktop/TV controls.** `.skip-intro` is a fixed 15 px / 48 px, while `.pc-row`
scales with `clamp()` ≥900 px. At 1440 and on TV it looks like a tooltip next to the big controls
(`force-skip-subs--desktop--en.jpg`). The same goes for `.up-next` (360 px). *Fix:* add both to the `min-width:900px`
block. Severity: polish.

**C9. The spinner is off-brand.** `.player-spinner` is a generic ring (`style.css:1446`). Elsewhere Lilin uses
"Chasing bulbs, instead of a spinner" (`813`, also in the Play now popup bar). *Fix:* a ring of 12 chasing bulbs
around the play button, same size. Severity: polish.

**C10. Light themes override the player to neutral greys.** `style.css:2641` sets `#111/#1C1C1C/#2A2A2A`, so the room,
help, stats and live chat turn cold grey, while the menus and popups (hard-coded `rgb(24 16 21)`) stay warm. *Fix:*
override with the dark Lilin values (`#120c10`-ish velvet), or solve it with C1 tokens. Severity: inconsistent.

## Cramped, confusing, missing affordances

**D1. The ⋯ menu holds one item.** "Clip a moment" (`moments.js:56`) costs a 40 px slot in the phone row (7 icons).
Meanwhile Stats for nerds and Keyboard shortcuts have no button at all (right-click / I / ? only, so phones can only
long-press), and PiP/AirPlay take their own slots. *Fix:* on phones, ⋯ = Clip a moment, Picture in picture, AirPlay,
Stats for nerds; on desktop also Keyboard shortcuts. The row drops to 5 icons. Severity: polish.

**D2. "Clip a moment" is offered before it can work.** If the video hasn't loaded, tapping it gives a toast "Wait until
the video has loaded." (`moments.js:83`). *Fix:* `aria-disabled` + the reason as the item's subtitle. Severity: polish.

**D3. The CC menu on phones is a 20-language wall.** `ep-subs--phone--en.jpg`: Off + ~20 languages fill 60 dvh. Second
language, size, style, position and timing only appear after you pick, under the whole list. *Fix:* order = Off,
saved/preferred languages, the active one; "More languages ›" expands the rest; the look settings get their own "Style
›" page in the same menu. Severity: cramped.

**D4. The sleep timer is seven 46 px rows.** In phone landscape (`max-height:60dvh` ≈ 230 px) it scrolls. *Fix:* one
chip row `15 · 30 · 45 · 60 · 90` + "End of episode" as one more row (`.cc-choices` already exists). Severity: cramped.

**D5. The keyboard help is incomplete.** `app.js:6861` `SHORTCUTS`: no Live TV keys (PgUp/PgDn or `[ ]`, digits,
Backspace, G, `liveKey` `4593`), no Home/End, no Esc. On a channel "0-9 Jump to %" is wrong, because digits pick
channels there. No close button; it only closes by clicking outside or `?`. *Fix:* a live variant of the list, a ✕,
Esc in the list. Severity: missing.

**D6. The conversion note is jargon.** "HEVC (hvc1) doesn't play in this browser. It starts by itself when ready."
(`app.js:6021`). Parents won't know what HEVC is, and "it" is vague. *Fix:* "This video's format doesn't play in this
browser. Lilin is making a copy that does, and the video starts by itself." Keep the codec in Stats. Severity: wording.

**D7. Reactions fly through Skip intro and Up next.** `.reaction-layer { right:max(24px,6vw); bottom:120px }` vs
`.skip-intro / .up-next { right: pad-x; bottom: --up-next-bottom }`. Emoji start right on the button
(`force-floats--phone--en.jpg`). *Fix:* when `.skip-intro` or `.up-next` shows, move the layer's `bottom` above them
(`calc(var(--up-next-bottom) + 64px)`). Severity: polish.

**D8. The reaction bar spreads out on wide sheets.** `justify-content: space-between` + `max-width:44px` → 8 emoji
with 50 px gaps across the tablet live chat (`live-chat--tablet--en.jpg`). *Fix:* `justify-content:center; gap:4px`.
Severity: polish.

**D9. The room footer is out of date.** "Subtitles and volume are just for you." Since 11-11 the audio language follows
the host unless you pick your own. *Fix:* "Subtitles, volume and your own audio pick are just for you." Severity: wording.

**D10. "Playing for all 4" counts people who aren't connected** (Anita "Connecting…", `app.js:4377`). *Fix:* count
`connected` members. Severity: polish.

**D11. The seek tip shows "0:00" on a frame before the duration is known** (`ep-seek--desktop--en.jpg`, a "Previously"
frame labelled 0:00 at 30 %). *Fix:* no tip until `isFinite(duration)`. Severity: polish.

---

## Ideas

1. **Rooms keep going: Next episode for everyone.** Up next is switched off in rooms (`app.js:7247 !party`, also
   autoplay `7309`), so a binge with ebi ends at every credits roll and someone has to start a new room. The host gets
   Up next, guests see "Next episode in 7 (ebi has the remote)", and the room switches media like Play now's
   `switchToFull` already does (`room.switch`). *For:* everyone watching shows together. *Why Lilin:* rooms are
   already resilient to media swaps (the swap guard). *Effort:* M. *Exists:* no.
2. **Ask for a pause.** Guests can't touch play/pause (`app.js:4469`, "The host controls playback"). Add a "✋ Pause?"
   button in the room. The host sees "Pappa asks for a pause" with a one-tap Pause; after 20 s unanswered it pauses
   by itself (opt-in). *For:* family rooms, the guest who has to get up. *Effort:* S. *Exists:* no (only chat).
3. **"What did they say?"** One tap or `R` rewinds 10 s and shows subtitles (in your sub language) just for those
   10 s, then turns them off again. *For:* Pappa/Anita on Swedish/English mixes, anyone with noisy kids. *Why Lilin:*
   it already has fast sub switching and per-viewer subs in rooms. *Effort:* S. *Exists:* no (C toggles fully).
4. **Reactions on the timeline.** Store room reactions/chat with media time, then show them as small marks on the seek
   bar next time (like the CS2 event markers in the clip editor). "Clip this" on a chat line opens Clip a moment
   around that time. *For:* friends rewatching, Moments. *Effort:* M. *Exists:* the marker UI exists for clips only.
5. **Mini guide inside the channel.** `G` and "Guide" leave the player for the Live tab. Instead, a slide-up strip of
   channel cards (now/next, faces) over the picture, ↑/↓ to surf with a preview of what's on. *For:* parents on
   the Samsung TV / desktop who channel-surf. *Effort:* M. *Exists:* the full guide view only.
6. **Bedtime: warm, dim picture.** Night mode only handles sound. Add "Dim the picture" (CSS `filter: brightness(.8)
   sepia(.15)`) as a second Bedtime toggle, and "End of next episode" as a sleep choice. *For:* late-night phone
   viewing. *Effort:* S. *Exists:* sound only.
7. **Seat lights on the seek bar.** In a room, each member's position shows as a small face dot on the host's seek
   bar, so you can see who is buffering or behind. That turns the room's "Loading…" text into something you can see
   at a glance. *For:* hosts. *Effort:* S-M (positions already flow in heartbeats/health). *Exists:* no.
