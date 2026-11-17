# r2 · Skeptic engineer: truth and cost

Lens: is it real, what does it cost, what breaks. Checked against `~/Projects/lilin` HEAD `803907f`. I didn't edit anything.
Two things to know about the line numbers:
- **app.js numbers moved by about +18 during round 1.** Commits `2636f39` (04:08) and `803907f` (04:15) landed while the audits ran. The numbers below are current.
- **Another session's uncommitted work:** `src/profiles.js` (untracked) and `src/server.js` (+54 lines). It's a **Letterboxd-style profile with a public diary built from `logWatch`**, with visibility defaulting to `friends`. That changes the privacy maths in §3 and makes the "Diary" idea (research-design #10) a duplicate.

---

## 0. Things nobody reported that matter more than most of round 1

**E1. Static files go out uncompressed, with no validators, on every load. Broken (perf).** `serveStatic` (`src/server.js:4891-4905`)
sends `Cache-Control: no-cache` with **no ETag and no Last-Modified**, and never compresses. `no-cache` without a validator means
the browser re-downloads everything on every cold open. I checked the live server: `curl -I /app.js` returns 626,522 bytes, no `Content-Encoding`, no `ETag`.
- Payload: `public/*.js + *.css + index.html` is **1.48 MB raw** (app.js 620 KB, style.css 269 KB, i18n-sv.js 130 KB).
- With brotli: app.js 141 KB, style 44 KB, sv 36 KB.
- With an ETag it drops to **0 bytes on a repeat open**.
- Cloudflare compresses remote traffic but still refetches every time. LAN clients (the parents, the TV shell pages) get the full 1.5 MB every time.

Fix (S, zero deps, `node:zlib` is core):
- Keep an in-memory map `path → {mtime, etag(sha1), raw, br, gz}` and answer `If-None-Match` with 304.
- Keep `no-cache`: validators keep updates instant, so it doesn't conflict with "updates arrive right away".
- This is the single best perf fix on the table for the iPhone PWA. It costs less than any CSS item.

**E2. The Live TV "Restrict" privacy rule is cosmetic only. Broken (privacy).** Player B3 is right, but it understates the problem.
- `src/watch.js:252-253` builds **one** room state for everyone, with every member's `name` + `avatar`. Restricted members only get a `quiet: true` flag.
- Every restricted viewer receives everyone's names over SSE.
- Every viewer receives restricted people's names and faces.
- The hiding happens only in `renderLiveStrip` (`app.js:4661-4663`). `live-chat.js:107-113` ignores it, and DevTools shows everything.

Fix (S–M): project the member list per recipient at SSE send time (`viewer.restricted ? [] : members.filter(!quiet || self)`) and keep the client helper too. This has to happen before the profiles/diary work ships, because it's the same "who can see me" rule.

**E3. The shipping rate is the root cause of the drift.** `whats-new.json` has **82 entries in the last 7 days** (24 on 11-14 alone). That's how we got 42 font sizes, 8 owner tabs, 4 sheet implementations, two title pages and three expiry formatters. Every feature the other panelists add costs:
- more app.js (one 10.3k-line, 620 KB module with no build step),
- more i18n strings (the sv catalogue is already 130 KB, loaded on every Swedish start),
- more surface for the next audit.

My standing objection to any long list: **ship the fix batch below, add the CSS budget gate, then add features at a lower rate.**

---

## 1. Verification table (top findings, checked in code)

✅ confirmed · ⚠️ partly / overstated · ❌ wrong · 🔁 already fixed

| # | Claim (source) | Verdict | Evidence (current file:line) |
|---|---|---|---|
| 1 | Audio button hidden in every WT room (player B1) | ✅ | `app.js:4481` `audioBtn.hidden = true` after `renderAudioControls()` at 4460. The comment at `app.js:5617` says rooms *should* allow own pick |
| 2 | Player menus stack, each closes a different subset (B2) | ✅ | CC closes Audio only (`5356-5360`), Audio closes CC only (`5658-5661`), Bedtime/Quality close 3 (`6203`, `6350`), nothing closes ⋯ (`moments.js:66` closes the others) |
| 3 | Live chat header shows quiet/restricted faces (B3) | ✅ **worse** | `live-chat.js:107-113` vs `app.js:4661-4663`. The server leaks it too, see E2 |
| 4 | Roster status goes stale (B4) | ✅ | `app.js:4414` key `[id,name,avatar,tone,host]` leaves out the text |
| 5 | English words in Swedish: sub shift / stats party (B10) | ✅ | `app.js:5393` `'earlier'/'later'` without `T()`; `app.js:6920` `'host'/'guest'/'connected'/'reconnecting'` |
| 6 | No Up next / autoplay in rooms (player idea 1) | ✅ | `app.js:7266` `!party`, `7328`, `7342` |
| 7 | Keyboard help lacks live keys (D5) | ⚠️ not re-read | `SHORTCUTS` is now at `app.js:6880` |
| 8 | `--on-bulb` fails on Ember/Synthwave (system A1, settings B5) | ✅ exact | `app.js:370`. I recomputed: Ember white-on-`#FF7A3D` **2.59:1**, Synth **2.83:1**, dark ink would give 7.1 / 6.6. Paper/Daylight pass at 4.65/4.73 |
| 9 | Status greens/blues are literals and fail on light themes (A3, I18) | ✅ | `style.css:562, 2060, 2067, 2147, 2148, 2187, 3472` |
| 10 | `--ring` reassigned to a colour kills focus rings (A6) | ⚠️ latent | Real at `style.css:3171/3269/3417/3451/3611/3848`, but I found no current `box-shadow: var(--ring)` focus target inside those scopes (title cards, vibe tiles and guide cells sit outside). Rename it anyway: it's cheap and it's a trap |
| 11 | Quality badge set to 6 px (system §1) | ⚠️ overstated | `app.js:6309` applies only when the phone-stream label is longer than 3 chars, as a micro-badge inside an icon. It's ugly but deliberate. Low |
| 12 | Dead CSS (`.find-btn`, `.activity-row`, `.title-transfers`…) (B11) | ✅ | No references in `public/*.js`, `index.html` or `src/` |
| 13 | Global reduced-motion reset makes per-component guards dead (F) | ✅ | e.g. `style.css:642, 1231, 1245` are redundant under the global rule |
| 14 | Offline screen titled "Trending this week" (discover S1) | ✅ | `index.html:95`, catch at `app.js:10237` |
| 15 | Offline copy talks about `server.js` (S2) | ✅ | `app.js:10237` |
| 16 | Raw `Failed to fetch` leaks, no online/offline listeners (S3) | ✅ | `api()` rethrows at `app.js:123-131`. `grep "'online'"` finds nothing in `public/` |
| 17 | Billboard duplicates the first 6 of the Trending row (D2) | ✅ | `src/server.js:738` featured = `lists[0]` = `trending-all`, the first row |
| 18 | Parallax runs on phones (D18) | ✅ | `billboard.js:175` checks only `reduced()`, not `wide()`. It also calls `getBoundingClientRect` on every scroll frame |
| 19 | SVT sheet: title on raw art, no mask (T1) | ✅ | `documentaries.js:177` uses an inline `background-image`, while the TMDB page uses `app.js:2577` |
| 20 | Show page with no top action for people without download rights (T6) | ✅ | `app.js:2795` `tv = isTv && canGet() && …` |
| 21 | Billboard kicker hard-coded "Trending" on Documentaries (D17) | ✅ | `billboard.js:43` |
| 22 | Facts row wraps with a leading dot (T2 / library B3) | ✅ | `style.css:1047` `li + li::before` |
| 23 | "You're all caught up" on a show with nothing downloaded (library C2) | ✅ | `app.js:1961` returns that whenever `nextUp` is null |
| 24 | Library film page has no version picker (B1) | ✅ | `filmVersionPick` is used only in `renderDetails` (`app.js:2809`), never in `renderFilm` (`1829`) |
| 25 | Missing episodes ignore air dates (C4) | ✅ | `src/shows.js:116-117` caches only `name` + `still` |
| 26 | "Season to phone" turns red (uses `.delete-many`) (C7) | ✅ | `app.js:2018` |
| 27 | `openTravelList` prints "false" when emptied (D4) | ✅ | `app.js:771+22`: `items.length > 0 && h(…)` passed to native `replaceChildren` |
| 28 | Swedish travel subtitle via `.replace(' for your phone')` (D4) | ✅ | `app.js:776`. It's a no-op in Swedish |
| 29 | Convert banner shown to every user, family included (library A2) | ⚠️ overstated | `convertStatusFor` (`src/server.js:2881`) already filters to jobs **in that user's library that their browser can't play**, and the failures list too. Family only sees their own titles' jobs. The raw-filename and loudness points still stand |
| 30 | Settings index reads "ServerOwner" (settings B2) | ✅ | `app.js:7892` `node.textContent.trim()` |
| 31 | Phone tab bar sized for ≤7 tabs, owners have 8 (B3) | ✅ | `style.css:2646` comment + `:has(.tab:nth-child(7))` |
| 32 | Invite / watch link pages not translated, `en-GB` dates (B6) | ✅ | No `translateHtml` in `invites.js` or `watch-page.js`; `watch-page.js:37` `'en-GB'` |
| 33 | Media Session only has the PiP handler (design G1) | ✅ | The single use is `app.js:6804`. No `MediaMetadata` anywhere |
| 34 | No Wake Lock / app badge (G2, idea 5) | ✅ | `grep wakeLock\|setAppBadge` finds nothing |
| 35 | TV subs fixed at 52 px, no options (G3) | ✅ | `tv/tv.css:131-132` |
| 36 | `logWatch` has no opt-out (social gap 1) | ✅ **and growing** | `src/social.js:95`, `server.js:3675`. Uncommitted `profiles.js` now reads this log into a friends-visible diary |
| 37 | Post-credits scenes only *avoided* (competitors #1) | ✅ | `src/credits.js:20`. TMDB keywords are **already fetched** for the title page (`src/details.js:152, 388`), so the stinger data is free |
| 38 | Collection only shown as text (competitors #5) | ✅ | `src/details.js:135` |
| 39 | `GET /api/convert` starts conversions (player heads-up) | ❌ | `src/server.js:4155` → `convertStatusFor` is read-only. Only `/audio` has the side effect, see §1b |
| 40 | Native `confirm()` is "the only native dialog" (library A11) | ⚠️ | There are three: `app.js:4958` (party), `8152` (idea delete), `8357` (remove picture) |

Old-audit "fixed" claims I spot-checked hold up: the `false` in `openTravel` is fixed (its sibling isn't), and `/signin` is themed. The pc-row overflow I didn't re-measure.

### 1b. The screenshot harness bug: side-effecting GETs. Real, moderate, fix both ends

`GET /api/media/(lib|dl)/:id/audio?plays=…` (`src/server.js:4724-4768`) is a **probe that also schedules work**. When the reported `plays` can't decode the file:
- An HEVC file in a browser without `hevc` gets `converter.requestBrowserVideo` → `runFirst` (`src/convert.js:488`). This **jumps the job to the front of the queue with `force: true`** and starts an H.264 encode immediately.
- Otherwise `requestBrowserAudio` does the same.
- On top of that, `prepareNextEpisodes` (`server.js:3196`) queues the next 2 episodes (`PREPARE_NEXT_EPISODES`).

Headless Playwright Chromium has no H.264/HEVC, so `extraPlayable()` reports nothing. Every player scene on an HEVC title therefore:
1. preempts real users' queue order,
2. burns geofront GPU/CPU (S03E04 went 0→93 % during round 1),
3. writes H.264 copies that stay on disk up to `BROWSER_H264_DAYS` (14).

That's tolerable for one run. With a fleet of agents shooting the player in a loop, it becomes a self-inflicted DoS on the encode lane, which Play now and Moments share.

The harness's "refuse non-GET" guard gives false confidence. It assumes GET is safe, and Lilin breaks that assumption.

**Fix, harness side (S, do it first):** in `tools/ui-shots/shoot.mjs` `Fetch.requestPaused`, when `--base` isn't localhost:
- fulfil `/api/media/*/audio` with a canned `{known:false}` (or a recorded fixture),
- also stub `/api/media/*/play-link`-style endpoints that can start remux/Tizen fixes,
- document it in the README.

**Fix, server side (S–M):**
- Make the GET pure. Return `fixable/job` state as today, but move the enqueue (`requestBrowser*`, `prepareNextEpisodes`) to `POST /api/media/:kind/:id/prepare`, which the player calls right after (3 call sites: `app.js:5799, 5927, 6065`).
- Only the web player uses this endpoint (the TV apps don't), so the blast radius is small.
- Bonus: the CSRF protection (eafacd2) covers POSTs, so a LAN web page can no longer trigger encodes with an `<img src>` under home-network IP auth. That one's low risk, since ids are opaque.
- Update `tests/audio-tracks-api.test.mjs`.

---

## 2. Cheapest high-value batch (one agent, one pass, safe)

Rules for this batch:
- Every item is local, has an obvious test or screenshot, and needs no product or design decision.
- One agent can ship it in about 3–4 h.
- Stage per area, one commit each, add a whats-new entry only for user-visible items.

**A. Correctness / privacy (do first)**
1. E2: per-recipient member projection in `watch.js` state fan-out, plus a shared `visibleWatchers()` used by the strip and the chat header (`live-chat.js:107`).
2. Delete `audioBtn.hidden = true` at `app.js:4481`. Keep the AirPlay one.
3. `closePlayerMenus(except)` called by CC, Audio, Quality, Bedtime, ⋯ and Escape (B2).
4. Roster key adds `r.text` (B4).
5. `openTravelList`: `items.length > 0 ? h(…) : null` (`app.js:793`), and a real `T('{0} copies')` key instead of `.replace` (`776`). `T(item.label)` too.
6. `showPlayButton`: "caught up" only when the show has files (C2).
7. "Season to phone" gets its own class, not `.delete-many` (C7).
8. Settings index uses the h3's first text node (`app.js:7892`).
9. `T()` the strings at `app.js:5393` and `6920` (+ sv entries).
10. `--on-bulb` picks the higher-contrast candidate (`app.js:370`), one line. Also add the accent check to the custom-theme warning.

**B. Server and perf**
11. E1: ETag + 304 + brotli/gzip in `serveStatic`, cached per mtime. Add a test for 304 and `Content-Encoding`.
12. Parallax only when `wide()` (`billboard.js:175`).
13. Billboard ids skipped in the Trending row (`server.js:738`: drop featured ids from `rows[0].items`).
14. Harness stub for `/audio` (§1b).

**C. Copy and empty states (strings only)**
15. Offline: static heading `Discover` sr-only, family-readable copy, and map fetch `TypeError` → `T('No connection to Lilin…')` in `api()` (S1–S3).
16. Billboard `kicker` option for Documentaries (D17).
17. Invite and watch link pages through `translateHtml` + `sv-SE` dates (settings B6).
18. HEVC jargon note (player D6). Room footer copy (D9).

**D. Mechanical CSS (low risk, screenshot before/after)**
19. `--ok/--info/--warn/--live` tokens replacing the 7 literals (A3).
20. `.segmented button { flex: none }` in scrolling containers (settings B1, the Swedish chip overlap).
21. `.facts` separator fix (T2/B3), `a.chip { text-decoration: none }`.
22. Delete the dead CSS (B11), rename the avatar `--ring` to `--face-ring` (A6).

**Out of this batch on purpose:**
- The token codemod (system Phase 1–2), the room/live-chat layout rework (B5–B7), one-title-page (library B1/idea 4) and the owner tab hub. They need design decisions or touch hot code.
- The token codemod in particular is a **merge-conflict machine** while agents keep editing the 4,093-line style.css in parallel. Instead: land the CSS budget gate (shortlist #12) and migrate a file when an agent touches it.

---

## 3. Feature shortlist (max 12), honest cost and risk

Costs assume one agent and include the sv strings, tests and a whats-new entry. "3 clients" = web + Tizen JS + Android TV (+ the Rust WebGL TV app, a 4th surface that doubles the work on any TV feature).

| # | Feature | Cost | Risk / what bites | Verdict |
|---|---|---|---|---|
| 1 | **Lock-screen / headphone controls** (Media Session: metadata + play/pause/seek ±10 + next) | S | iOS PWA artwork is flaky (first entry only), so ship a 512 px poster. **In a WT room, handlers must route through `party.control` and guests get no seek/next**, otherwise AirPods desync the room. Set `playbackState` / `setPositionState` on timeupdate (throttled) | **Yes, first** |
| 2 | **Phone remote stays awake** (Wake Lock while the remote sheet is open and the TV is playing) | S | iOS Home Screen apps only since 18.4 (older phones: no-op, feature-detect). Re-acquire on `visibilitychange`. Battery is fine because it's scoped to the sheet | **Yes** |
| 3 | **"Scene after the credits" chip** from TMDB keywords `aftercreditsstinger`/`duringcreditsstinger` | S | Data is crowd-sourced: decent for big films, absent elsewhere. **Positive-only: never say "no scene"**. Keywords are already fetched (`details.js:388`); the player needs `tmdbId` → keywords (cached 12 h). Films have no Up next, so it only affects the "credits → close" path | **Yes** |
| 4 | **Watch privately** (per title/session; optional per-person default) | S–M | `logWatch` feeds Activity, Popular on Lilin, Wrapped, `watch_company` and now the uncommitted **profiles diary**. A flag on the log row and a filter in each consumer: 5 call sites, each needs a test. **Must land before or with profiles**, which exposes watch history to friends by default | **Yes, urgent** |
| 5 | **Up next for the whole room** (host's Up next switches room media) | M | `room.switch` exists (Play now swap guard), but this is sync code: guests mid-buffer, a host leaving during the countdown, Live rooms (must stay off). Needs a 2-client test like `watch-sync` has. Highest value for Oliver + ebi bingeing | **Yes** |
| 6 | **"Ask for it"** for people without download rights (T6 dead end) | M | Server: request store + owner push + a one-tap Add in the owner inbox (the ideas inbox just got revamped, so reuse it). Low tech risk. Product risk: the owner becomes a request queue | **Yes** |
| 7 | **Send a title to a friend** (+ closing the loop when they thumb it) | S–M | Reuses the Moments send panel, friends and push kinds. Small surface. Needs a "From friends" shelf, which is one more Discover row (see E3) | **Yes** |
| 8 | **Collection strip on the title page** | S–M | One extra TMDB call `/collection/:id` (cached 24 h), matched with `serverMatchesFor`. No new client surface beyond one row | **Yes** |
| 9 | **Season tabs** (revamp promise, library idea 1) | M | Touches `renderShow`, which has 2 implementations (library vs Discover episode lists, see C4). Do it **together with** porting air dates (C4) or it'll drift a third time | **Yes, as one item** |
| 10 | **Skip recap** via TheIntroDB | M | API is real (`api.theintrodb.org` v4, optional key, keyless 30 req/10 s, 5k/day; prefers TVDB ids, TMDB fallback). Risks: **(a) wrong cut**: torrent releases differ from the submitter's (recap trimmed, different intro length), so a wrong skip on a recap is worse than none. **(b) Anime numbering**: TMDB vs TVDB absolute order. **(c) Privacy**: lookups at play time tell a third party what you watch, so fetch per show at download time instead. Mitigation: button only, never auto-skip, and validate against Lilin's own fingerprint/silence where possible. Also no published API terms | **Maybe, after 1–9** |
| 11 | **Caption options on the TV** (size/box at least) | S on Tizen JS, M overall | CSS on `.subs` is cheap on Tizen (Chrome 69: no blur, just size/background). The Rust WebGL app needs its own renderer change. Ship Tizen JS + Android TV, document the Rust gap | **Yes, TV JS first** |
| 12 | **CSS drift budget in CI** (`tools/css-audit.mjs`, fails when counts rise) | S | Zero-dep Node script, and the scratch scripts exist. False positives when a token is legitimately added: allow edits to the budget file in the same PR. This is what makes the system audit stick | **Yes** |

Deliberately left off the 12 but cheap if someone wants them: spoiler guard for unwatched episode stills (S, pure CSS + one setting), Shuffle a show (S), Loved it long-press (S).

### Traps (ideas that look cheap and aren't, or shouldn't be built)
- **Ask Lilin (LLM search) / "Previously on" AI recaps.**
  - The LLM runs on **magi, Oliver's gaming PC**: asleep, in CS2, or `magi-gpu-busy`. Interactive search can't depend on it.
  - Recaps would need to be precomputed per episode × stopping point, and a hallucinated recap *is* a spoiler.
  - Many files have no proofread subs.
  - If anything, do a **deterministic** phrase parser ("under 2 hours", "comedy", "not seen") onto existing Moods filters. No LLM.
- **Vertical Moments/trailer reel.**
  - Autoplaying video in a scroll-snap feed on the iPhone PWA means memory pressure and decoder contention, plus the HEVC/H.264 per-browser maths (§1b) for every clip.
  - Supply is a handful of Moments.
  - The social researcher already argued it doesn't fit a 5-person server. I agree.
- **Ambient glow.**
  - `drawImage` from `<video>` every 500 ms is fine on Chrome, but on Safari it can return black for HLS sources, and HDR/DV readback is slow.
  - Firefox is excluded anyway. Low value per risk.
- **Poster → title page View Transition morph.**
  - The title page is a `#sheet` overlay whose art loads async, so the snapshot fires before the target exists.
  - Expect jank on iPhone and a flash on Firefox 144.
  - Nice later, not a priority.
- **Who's watching on the TV.**
  - Real value for the parents, but it's **server auth (TV token → several users) + 3–4 TV clients**. The Rust WebGL app, the Tizen JS overlay and Android TV each need a picker.
  - The parents' TV is a shared account today, so retro-splitting history is impossible.
  - Do it only if the product lead confirms two people actually watch separately on that TV. Ship JS Tizen first.
- **Home row editor (Emby-style).**
  - Needs a row registry plus a per-user layout, synced to the TV.
  - At 82 changes a week, every new row needs a "new: keep it?" migration path, or it rots like Plex.
  - Do this **after** the rate drops.
- **DoesTheDogDie integration.** Keyed, tiered, paid API with unknown terms, for a household with no stated need.
- **Shared Lists, Diary, follow people.** The uncommitted `profiles.js` already does diary, favourites and friends sections. Don't start a parallel social model. Coordinate with that session.
- **Text size setting.** Blocked on the type-token migration (397 of 409 font sizes are px). It isn't S until Phase 1 lands, and Phase 1 is the conflict machine above.
- **TV follows your theme.** Rust WebGL needs palette plumbing, and the value is low.

---

## 4. Questions and challenges

**For the product lead**
1. **Who uses what?** Give me a rough split of iPhone PWA / Firefox desktop / Chrome / Samsung TV / Android TV sessions (Activity has user agents). Several "broken" items only matter on one client: no-glass is Firefox-only, the room layout is 700–1099 px tablets only. I'd rank by that, not by severity labels.
2. **Do Pappa and Anita ever use the web app,** or only the Samsung TV? If TV only, half of the family-wording fixes in round 1 have no audience, and TV caption options plus TV type size move up.
3. **Profiles/diary is being built right now with `friends` as the default visibility**, on history people logged before it existed. Do you sign off on retroactive exposure? I'd ship Watch privately first and default the diary to "starts from today", or require opt-in.
4. Will you accept **a one-week polish freeze** (fix batch + CSS budget) before new features? If not, which of your features is worth a guaranteed new drift finding?
5. Requests ("Ask for it") turn Oliver and ebi into a queue. Is that wanted, or should requesters just get download rights with a size cap?

**For the design director**
1. **Big-bang token codemod vs migrate-on-touch with a CI budget.** I'm against the codemod while 5+ agents edit style.css in parallel. Can you live with "budget can't go up" plus migrating each file as it's touched?
2. **One title page (L) vs parity patches (S each).** `filmVersionPick` in `renderFilm` plus shared facts get 80 % of library B1. Is the full merge worth a week of regression risk on the most-used screen?
3. **8 owner tabs:** an owner hub tab vs a fix to the ≤7 CSS assumption. The hub is S–M but changes muscle memory for 2 people. Your call, but pick one; don't let a 9th tab arrive first.
4. **One overlay-panel recipe (player C1) and one sheet primitive (system C2):** fine, but the player overlays sit on the hottest code path (`app.js` 4.4k–7.3k). Will you accept doing these after the room/up-next work, so the player isn't touched twice?
5. **Bulb hierarchy on the season page (C3):** demoting per-episode Play changes what the family taps every evening. Can you prove with a screenshot that the next-up episode is still obvious at 390 px before we ship it?
