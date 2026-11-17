# r3 · Skeptic engineer: rebuttal + final vote

## Two facts that change both other lists
1. **Master CI has been red since about 2026-11-16 17:31.** 45 of the last 100 runs passed, and the last 5 pushes all failed.
   - `access-rename` UI tests fail: the stub event lacks `stopPropagation`.
   - "What's new has Swedish for every update" fails.
   - The `friends` API test fails on Windows.
   - A drift budget in a CI that's already red gates nothing. Getting CI green is fix #1.
2. **All 35 users have `can_download = 1`** (read-only query on geofront's `.lilin.db`). Pappa, Anita, Matilda and Mamma are `restricted` but *can* download.
   - **Kill "Ask for it"** (PL #7) and drop PL fix #15's premise.
   - The T6 "no action for non-downloaders" dead end has no user today.

## Answers
- **Which TV app do the parents run? The Rust WebGL app** (`tv/rust`, installed 2026-11-10, memory `lilin-tv-rust`).
  - `public/tv` (JS + `tv.css`) is only Android TV and the fallback. **Every TV item written against `tv.css` (G3, G5, T1–T3) doesn't reach the parents' TV.**
  - The Rust side draws subs at `body(52.0, 700)` with a shadow only (`tv/rust/src/screens/player.rs:613`), and has 98 literal 20–22 px sizes in `screens/*.rs`.
  - Good news: the wasm is served from `/tv-rs/`, so there's no reinstall. Bad news: it needs a Rust rebuild with the wasm sysroot (unit-01/magi), and it can't be tested by screenshot on the real TV.
  - Cost of "TV legibility": **S per constant change, M for a caption-options menu**, done twice while both apps live. The JS app should go maintenance-only (bugs only); the Rust app gets features.
- **TV tokens on Chrome 69:** don't generate. Add a test that parses the palette from `style.css :root`, `tv.css :root` and the Rust `ui.rs` constants, and fails on drift. CSS custom properties work on Chrome 69; only `clamp()`/`color-mix()` don't. A test means zero build step and one place to look.
- **CORS for adaptive scrims:**
  - **The wash is already CORS-clean on every client.** It loads through the same-origin `/api/art` proxy (`app.js` ~2612) and reads a 24×14 canvas.
  - **Logos are not.** `page.logo.url` is direct TMDB, so reading logo pixels would taint the canvas. You'd have to proxy logos through `/api/art` too: one extra small request per title.
  - A billboard scrim adds 6 more small `/api/art` fetches per Discover load.
  - Verdict: S, fine.
- **Phone room sheet: M (about a day), not L.**
  - Rooms already have the mechanism: `roomDocked()` (`app.js:4430`) toggles `.room-docked` → `right: var(--room-w)` (`style.css:3445`).
  - A `.room-sheet` mode copying live chat's three rules (`style.css:3874-3876`, `bottom: var(--lc-h)`), plus dock-from-700 with a narrower `--room-w`, plus a `layoutSubs()` call, is mostly CSS.
  - It becomes L only if you also merge room and live chat into one `.side-panel`. Do that later, separately.
- **Can Watch privately land before profiles? Yes, if it lands first and the profiles session rebases onto it.**
  - Server side:
    - Add a `private` column on `watch_log`.
    - Add a flag through `logWatch` (`server.js:3675`).
    - Skip `activity.record('play')` (`server.js:2646`) for private plays.
    - Filter `private = 0` in the readers that serve *other* people: Popular and companions in `social.js` (lines 144, 219, 257), and `profiles.js` lines 212 and 291 for non-self viewers. Your own Wrapped keeps counting it.
  - Client side: one ⋯ toggle, sent with progress and the play request.
  - About 10 query sites, S–M, about a day with tests.
  - Conflict surface: the other session's `server.js` hunks are around lines 1711 and 3952; ours are 2646 and 3675. Low.
- **Codemod rollback with parallel agents:**
  - Make the codemod a **committed script** (`tools/css-tokens.mjs`).
  - On conflict, **regenerate from the new HEAD, don't merge**.
  - Rollback = `git revert`, inside a short announced style.css freeze window (memory note).
  - One hard rule: **each clamp floor equals today's px value**. Otherwise `13px → clamp(12px, …)` shrinks phone text. With that rule, phone screenshots must diff to zero, which makes review mechanical.
  - Yes to font-size; no to spacing. Agreed with the design director.
- **style.css split:**
  - Not before ETag/brotli (r2 E1).
  - The LAN is **HTTP/1.1**: Node's `http` server, no h2. `index.html` already loads 8 stylesheets, all render-blocking.
  - Split the *source* files for merge peace, but serve them as one `/app.css` concatenated in `serveStatic` from a manifest, cached by mtime. That's about 20 lines and zero deps.
- **Curtain-up cost: not 40 lines.**
  - `showSheet` (`app.js:2482`) already runs its own slide transition after a rAF, and the VT would fight it.
  - Poster (2:3) and backdrop (16:9) are different images, so it's a cross-fade, not a morph.
  - Close has to reverse into a card that may be off-screen or under `content-visibility`.
  - It needs separate handling for the peek and More-like-this paths.
  - On the iPhone, two full-viewport snapshots at 3x DPR (about 12 MB each) are fine.
  - Verdict: **M, defer until after the over-picture work.**
- **Gold-element (bulb) probe: warn only.**
  - Count `button, a, [role=button]` whose computed `background-color` equals the resolved `--bulb` and whose area is over 400 px².
  - Exclude progress, dots and live (all allowed by the rule) and pseudo-elements.
  - Run it in all 3 themes.
  - Gate CI only after a week with no false positives.

## Disagreements / corrections
- **DD:** "One title page" (L) is the wrong first move; parity patches (`filmVersionPick` in `renderFilm`, shared facts, air dates) get ~80 % at S each. Who's watching (#4) targets the Rust app plus server auth, for a problem nobody has reported (the PL agrees): defer. Conceded: `--face-ring` is a one-line rename, do it.
- **PL:** `/api/convert` is read-only (`server.js:4155`); only `/audio` starts encodes. The offline pill's `online` re-render must skip while `#player` is open, or it tears down the player's own reconnect. Fix #23's `tv.css` edits don't reach the parents.
- **Conceded:** convert banner titles-not-filenames (PL), Wake Lock in the fix list (PL), budget first right after CI is green (DD).

## FINAL VOTE

**Fix now (in order)**
1. **CI green.** Fix the 3 failing tests, then commit the CSS drift budget (warn-only bulb probe).
2. **Harness stops encoding on geofront.** Stub `/api/media/*/audio` in `shoot.mjs`, then move the queueing to `POST …/prepare`.
3. **Restrict privacy at the source.** Per-recipient member list in `watch.js` state, plus one `visibleWatchers()` for the strip and chat.
4. **Player correctness.**
   - Room Audio button (`app.js:4481`).
   - `closePlayerMenus()`.
   - Roster key.
   - Error card that hides `.player-center`.
   - Toast clears the note.
   - "Watch on demand" wording.
5. **ETag + 304 + brotli for static files** (the iPhone PWA cold start).
6. **One contrast commit.** `--on-bulb` by best ratio, `--ok/--info/--warn/--live`, `--text-3`, light-player `--bulb`, `--face-ring`.
7. **Family-facing words and pages.**
   - Calm offline/reconnect, with fetch errors mapped to one translated string and no re-render in the player.
   - Swedish `/c/i` and `/c/w` pages, plus an HTML 404 card.
   - Plain HEVC note.
   - Titles instead of file names in the convert banner, and the banner off for non-owners.
   - SVT title sheet through `pageHero`.
8. **Room on phones and tablets.** Stage-push sheet plus dock from 700 px (M).
9. **Library/show truth.**
   - Travel `false` + Swedish strings.
   - "Caught up" only when the show has files.
   - Air dates, no Add on unaired episodes.
   - Season to phone class.
   - `filmVersionPick` in `renderFilm`.
10. **Owner phone hub tab** (5 labelled tabs) before anyone adds a 9th.

**Features (in order)**
1. **Next episode for the whole room** (+ ✋ ask-for-pause rider). M, with a 2-client sync test.
2. **Watch privately.** Lands before profiles; the profiles session rebases onto it.
3. **Phone feels native.** Media Session (room-aware handlers) + Wake Lock on the remote + the post-credits chip from the TMDB keywords Lilin already fetches. S.
4. **TV legibility in the Rust app** (the parents' real client). 24/26 px floor, a box option and 2 caption sizes. JS app maintenance-only. M.
5. **Season tabs + one episode list** (air dates, next-up season, 20+ season chips). M.
6. **Search that knows the server.** On Lilin → Can be added → SVT; type switch; no-match way forward. S–M.

Next in line: collection strip, send a title. **Killed: Ask for it (everyone can download), Who's watching (until someone reports it), VT morph (until after over-picture panels).**
