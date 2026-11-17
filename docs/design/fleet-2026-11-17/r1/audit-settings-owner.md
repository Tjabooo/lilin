# Audit: Settings, owner tabs, Wrapped, What's new, sign-in, /c/ share pages, TV app

Scope covered: Settings (every section, owner sections, Appearance, Notifications), Activity, House, Clips + trim
editor, Notes, Wrapped (real slides from live), What's new sheet, `/signin`, password gate, OIDC sign-in, `/c/`
clip / note / invite / watch pages incl. dead links, Samsung TV app (JS app in a shell overlay, plus the Rust
WebGL app). Themes checked: Lilin, Paper, Daylight, Noir, Synthwave (`synth`). English + Swedish.

How it was shot: a throwaway local server (`/tmp/lilin-fleet/scratch-owner/`, own DATA_DIR, fake clips made
with ffmpeg testsrc, notes seeded through the API, port 8091, stopped afterwards). The server ran in three modes:
shared home network, `HOME_NETWORK_ACCESS=signin` + OIDC (sign-in pages and password gate), and signin
without OIDC. Wrapped and the TV app were shot read-only against the live server (Home network account).
Extra scenes are in `/tmp/lilin-fleet/scratch-owner/tools/ui-shots/scenes.mjs` (the `x-*` ones).
Screenshots: `/tmp/lilin-fleet/shots-owner/{a,b,c,sv,tv,wr,t-paper,t-daylight,t-noir,t-synth}/`.

Severity: **broken** (wrong or unusable) · **inconsistent** (looks or behaves unlike the rest) · **ugly** · **polish**.

---

## Broken

### B1. Swedish Activity filter chips overlap each other
- Where: owner-activity, phone, sv (`shots-owner/sv/owner-activity--phone--sv.png`; the harness also flags OVERFLOW).
  `public/style.css:231-235` (`.segmented button { min-width: 0 }` with the default `flex-shrink: 1`) + `:2128`.
- What: "Uppspelning", "Nedladdningar" and "Bibliotek" run into each other ("UppspelningNedladdningarBibliotek")
  and "Annat" is cut off. The container is set to `overflow-x: auto`, but the buttons shrink below their text
  width, so it never scrolls. The labels just overflow onto each other.
- Fix: `.segmented button { flex: none; }` whenever the container scrolls (`.act-feed-head`, `.st-controls`,
  and probably everywhere), plus the same edge-fade mask `.tabs` uses (style.css:398) so people can tell the row scrolls.

### B2. The Settings side index says "ServerOwner" ("ServerÄgare" in Swedish)
- Where: owner-settings, desktop (left index). `public/app.js:7842` builds the index from `node.textContent` of the
  `h3`. `app.js:8276` puts the `Owner` tag inside that `h3`.
- Fix: give the h3 a `data-title` (or read only its first text node), e.g.
  `title: node.dataset.title || node.firstChild.textContent.trim()`.

### B3. The owner's phone tab bar holds 8 icon-only tabs, it scrolls, and Discover and Clips share one icon
- Where: every owner scene on a phone. `style.css:2646-2650` (comment: "Owners have up to seven tabs") hides
  labels at 7+ tabs. Owners now have 8: Discover, Notes, Live, Library, Activity, House, Clips, Settings.
  Discover's icon (`index.html:60`, a rectangle with a play triangle) is nearly the same as Clips' (`app.js:10050`).
- What: the bar scrolls sideways, so on the Clips tab Settings is off-screen and on Settings Discover is.
  With no labels you're left guessing which play-rectangle is which. Activity uses a "people" glyph, so it reads
  as Friends or People. It also goes against revamp.md ("icons with labels").
- Fix: keep at most 5 labelled tabs on phones: Discover · Live · Library · **Owner** (a sheet or page with Notes /
  Activity / House / Clips and their badges) · Settings. Short of that, give Clips its own icon (clapper, film
  strip or scissors) and fix the ≤7 assumption.

### B4. The Swedish "Intros" segmented control wraps onto two lines inside its pill
- Where: owner-settings phone sv ("Visa en knapp" / "Hoppa över automatiskt"). `style.css:2526`
  `.set-control .segmented { flex-wrap: wrap; }`.
- What: the second option drops under the first inside one rounded pill, which looks broken. Any long Swedish
  option will do the same.
- Fix: under 600 px, put the control below the label at full width, `flex-wrap: nowrap`, buttons
  `flex: 1 1 0; white-space: normal; height: auto; min-height: 34px`. Or use a select for two-option rows with long labels.

### B5. Synthwave and Ember fail contrast on every primary button
- Where: t-synth (`Save trimmed copy`, What's new `Close`, `4 new`). `app.js:370`:
  `onAccent = luminance(accent) > 0.4 ? dark : '#FFFFFF'`.
- What: Synthwave's accent `#FF5FA2` (L≈0.32) gets white text, about 2.8:1. Ember's `#FF7A3D` (L≈0.36) gets about 2.6:1.
  Dark text would give about 6.5:1 on both. The 0.4 threshold is too high.
- Fix: work out the contrast of both candidates and use the higher one:
  `onAccent = ratio(accent, darkInk) >= ratio(accent, '#FFF') ? darkInk : '#FFF'`. The custom-theme warning
  (app.js:7681) should check accent vs on-accent too, not only text vs background.

### B6. Invite and Watch Together link pages are English only
- Where: `/c/i/<token>` (`src/invites.js:135-200`) and `/c/w/<token>` (`src/watch-page.js`). Neither runs through
  `translateHtml`; clips (`clips.js:12`), notes and moments do. Watch-party dates are hard-coded to `'en-GB'` (watch-page.js:35).
  Verified: with `Accept-Language: sv` the clip page answers "Klippet delas inte längre", but the invite and
  watch pages stay English.
- Why: these are exactly the pages Swedish family members get sent (Pappa, Anita, parents).
- Fix: wrap both in `translateHtml`, add the strings to `src/i18n-sv.json`, and format `when` with `sv-SE` for sv.

### B7. The owner card "Staying signed in" is out of date and wrong
- Where: owner-settings → Server → "Staying signed in" (`app.js:8288-8295`).
- What: it says "Lilin has no login of its own: it uses the Cloudflare Access sign-in", but Lilin has had its own
  password sign-in for a while (changelog: "Sign in with your own password", OIDC 919ff15). "(it's 24 hours now)"
  claims a value Lilin can't know, and "it now tells them…" reads like changelog text. It's also the only `<details>`
  that uses the browser's ▸ marker (`.set-signin`, style.css:2560) instead of the custom chevron that `.set-details` has (2543-2555).
- Fix: show one version per setup: OIDC/session (show `SESSION_DAYS` and how to change it) or Access-only. Use the
  `.set-details` summary with the chevron.

---

## Inconsistent

### I1. The dead clip link page is missing the card everyone else has
- Where: `/c/<16 unknown chars>` → `src/clips.js:911`. Its body has no `<div class="card">`, so it shows
  left-aligned text with no lilin bulbs and no "Open Lilin". The invite and watch-room dead pages (`invites.js:151`,
  `watch-page.js:28`) both have the centred card (`shots-owner/c/x-*-bad--phone--en.png`).
- Fix: wrap it in the same card and add `<a class="brand" href="/">Open Lilin</a>`.

### I2. Malformed /c/ links show raw JSON
- Where: `/c/i/deadbeef`, `/c/w/x` and any token of the wrong length fall through to `server.js:5021` →
  `sendJson(404, {"error":"Not found."})`. A link that wraps or gets cut off in a chat app shows
  `{"error":"Not found."}` to a stranger.
- Fix: for GET `/c/*` with `Accept: text/html`, render the generic "This link doesn't work any more" card.

### I3. The owner's own People row has toggles that do nothing
- Where: owner-settings → People (`app.js:8315-8330`). "Can download / Can invite people / Can see activity" are
  live switches on the owner row, and flipping one just snaps it back with a toast ("The owner can always…").
- Fix: on owner rows, replace those switches with one static line: "Owner: can do everything". Keep only
  "Never auto-delete" and Library.

### I4. People rows: the switches don't line up and the page gets very long
- Where: People on desktop and phone (`.person-toggle`, style.css:2637). The label and switch sit inline and wrap,
  so each row's switches end up at a different x. With 7 people that's 42 switches on screen.
- Fix: a two-column grid (label left, switch right), or a compact table on desktop (one column per permission,
  one row per person). On phones, fold each person into a `<details>` that shows a summary
  ("Can download · Restricted").

### I5. "Show the steps" is underlined; every other chip isn't
- Where: Settings → Watching → Android TV (`app.js:7788`). It's an `<a class="chip">` and `.chip` (style.css:174)
  doesn't reset `text-decoration`.
- Fix: `a.chip { text-decoration: none; }`.

### I6. Three clock formats across the owner screens
- Activity forces 24 h (`app.js:8404` `hourCycle: 'h23'` → "03:57"). Notes use `timeStyle: 'short'`
  (`notes-view.js:14` → "3:57 AM"). Wrapped's prime time shows "4:00 PM" with a 12 h axis (`social.js:45, 256`).
  The English `locale` is `undefined` (`i18n.js:21`), so the browser picks the format.
- Why: it's a Swedish household. The same moment shows as "03:57" in one tab and "3:57 AM" in another.
- Fix: one shared `fmtTime()` with `hourCycle: 'h23'` (or `en-GB` for English), used everywhere.

### I7. Notes repeat the full date on every note
- Where: owner-notes. The day separator says "NOVEMBER 17, 2026" (`notes-view.js:455`), then every note under it
  says "Nov 17, 2026, 3:57 AM" (`:14`).
- Fix: under a day separator show only the time ("15:57"). Show the full date in the tooltip.

### I8. Notes sits in a centred column; every other owner tab is left-aligned
- Where: owner-notes desktop vs owner-activity / house / clips / settings. The "Notes" title starts about 180 px
  further right than every other view title, so switching tabs makes the page jump.
- Fix: keep the narrow reading column, but left-align it to the page gutter like Activity. Or centre all owner views.

### I9. Trim editor details
- Native checkbox for "Move the original to Deleted…" (`app.js:9793`, `.trim-del` style.css:2439). Everywhere else
  in Lilin uses switches.
- On desktop "Save trimmed copy" stretches about 1,060 px wide next to "Preview". Cap it (e.g. `max-width: 320px`, right-aligned).
- Keyboard hint `… ← → 1 s · , . one frame · R rename …` (`app.js:9528`): bare punctuation keys are unreadable.
  Render keys as `<kbd>` chips.
- Rename: phones get a bordered pencil, desktop has nothing visible until you hover (only the "R" hint).
  Show the pencil on desktop too.

### I10. What's new has two close buttons, and the gold primary is "Close"
- Where: x-whats-new (`app.js:7558`). The sheet has its ✕ plus a full-width gold "Close" (history mode). revamp.md:
  "one title, one primary action". Here the primary action is just closing.
- Fix: in history mode, drop the bottom button or make it quiet. Keep the gold "Got it" only for the unseen-updates mode.

### I11. On phones, the header's What's new button is a blank ring
- Where: every phone header (style.css:286, 364). With nothing new, the label is hidden and the bulb is unlit,
  so the button is a circle with a small "o" inside. It reads like an empty avatar or a radio button.
- Fix: hide it on phones when nothing is new (Settings → What's new already covers that). Or use a real icon
  (sparkle or megaphone) with the label available to screen readers.

### I12. Trimmed clips show "Trimmed" as their game, on the public page too
- Where: owner-clips + share-clip (`shots-owner/a/share-clip--*`): "ace on mirage · Trimmed". The game comes from
  the folder name (`Trimmed Clips/`), so a stranger sees "Trimmed" where the game should be.
- Fix: carry the source clip's game into the trimmed copy (the editor knows it; a `.events.json` sidecar already
  travels with clips). Failing that, drop the label when it's "Trimmed".

### I13. Clip names and dates
- Untitled clips show the raw file stem "2026-11-15 21-04-33" as their title (owner-clips, trim header). The date
  line shows the file mtime (`app.js:9966` → "Nov 17, 2026"), which can disagree with the recording time in the
  name after `ember-clip sync` copies the file.
- Fix: when the stem is a timestamp, display "Sat 15 Nov · 21:04" (with the game) and use that time as the clip date.

### I14. The "Watching" group in Settings is a grab-bag
- Where: `app.js:7768-7795`. Subtitles and Intros are watching settings. "Open Lilin on", "Sign in on a TV",
  "Android TV", "Jellyfin", "Library order" and the member invite rows aren't.
- Fix: add a **Devices** group (TV code, Android TV, Jellyfin, plus Notifications → This device). Move Library
  order and Open Lilin on into **Your library**.

### I15. On phones, Settings has no way to jump to a section
- Where: owner-settings phone is over 6,000 px tall (the harness caps it at 6,000). `.set-index { display: none }`
  under 900 px (style.css:2532). The old audit's "no way to jump between groups" was only fixed on desktop.
- Fix: a sticky, horizontally scrolling chip row of the same index under the "Settings" title on phones.

### I16. The Ideas filter row runs off the card on phones with no hint
- Where: Settings → Ideas, phone (harness OVERFLOW: "Planned 0 | Not now 0"). `.idea-filters` style.css:3996.
  "All 4" is cut at the card edge.
- Fix: the same edge mask as `.tabs`, or shorter labels (drop the zero counts, `New 4 · Planned · Added · Not now · All`).

### I17. The "Your library" card has no title row and awkward numbers
- Where: Settings → Your library (`app.js:7800`): "0 videos, 0 B." sits as a bare paragraph, while every other card is label + hint rows.
- Fix: a row "In your library: 12 videos · 84 GB" ("Nothing yet" when empty) and the retention hint under it.

### I18. Activity's live number uses a hard-coded green that fades out on light themes
- Where: `style.css:2067` `.act-stat.is-live strong { color: #6fcf8f }`. That's about 1.9:1 on Paper and Daylight
  (`t-paper/owner-activity`). revamp.md: "Nothing in a component uses a literal colour".
- Fix: an `--ok` token with a darker light-scheme value (e.g. `#1F8A4C`). Reuse it for `.room-status[data-tone=live]`.

### I19. A shared note opened by a non-owner silently drops them on Discover
- Where: `/c/n/<token>` redirects humans to `/?note=<id>` (`note-share.js:168`). `app.js:10256` only opens it for
  admins and does nothing for anyone else. The notes UI calls this "Share", then "Copy link".
- Fix: tell a non-owner "This note is private to the server's owners" with a toast. Rename the notes action to
  "Link (preview in chats)" or add a one-line hint, so owners know who can open it.

### I20. What's new points people to "Settings → Moments", which may not exist
- Where: the Moments entry in whats-new.json. `moments.js:303` hides the Moments section until someone has sent
  you one, so the path the copy describes isn't there for most people.
- Fix: always show a small Moments section ("Nothing yet. Moments friends send you land here.") or change the copy.

---

## Ugly / polish

- **P1. Password gate has no way out** (`app.js:8180-8227`). On a borrowed or shared device you can't sign out or
  say "not me". Add a quiet "Not you? Sign out" link under the button. `/signin` (`src/auth.js`) has no
  "Show password" even though the gate has one. Use the same toggle on both.
- **P2. The sign-in error page empties the email field** (`/signin?error=wrong`, `shots-owner/b/x-signin-error*`).
  Seen only with the GET error URL, so check the real POST flow. If it does the same, prefill the email.
- **P3. "No one can sign in yet. On the server, run `node setup.js user add …`"** (sign-in page with 0 users) wraps
  a code span awkwardly across three lines on a phone. Put the command on its own line in a `<code>` block.
- **P4. House copy talks about implementation** (`app.js:8920`, `:9060`): "Machine readings are starting (or only
  work on the Windows server)", "Set HOUSE_TOKEN in .env and run agents/lilin-house…". ebi is an owner too:
  link to the docs and say what you get instead.
- **P5. House section headings switch styles.** "Server / Sharing / Machines" are small labels outside the cards,
  "Streaming now / Encoding now" are headings inside cards. Pick one.
- **P6. Wrapped:** the empty state ("Nothing here yet") has no way forward. Add "Find something to watch" →
  Discover, as revamp.md's empty-state rule asks. "Your show of the year: Black Clover, 2 episodes, 13 minutes"
  undersells it: skip that slide below about an hour, or label it "Your only show this year". The back button is
  tiny on desktop (top-left, about 32 px). The progress bars and slide rhythm are good.
- **P7. Clip cards with a shared clip say "Shared" twice** (a "● Shared" badge on the thumbnail and "shared" in
  the meta line), and its first action becomes an unlabelled copy-link icon. Keep the badge and label the button "Copy link".
- **P8. Activity rows repeat "Unknown device · Location unavailable" under every person** when it's unknown
  (local test; check live). Leave the line out when both are unknown.
- **P9. Notification settings** look fine. The "Moments" and "Watch Together invites" rows only appear with push
  on, which is right.

### TV app (public/tv JS app; Rust app compared)
- **T1. The SEELE TV guide leaves about 280 px of the 1920 canvas empty on the right.** `tv.css:334`
  `.guide-lane { width: 1180px }` is fixed while `.guide` spans `left/right: var(--edge)`. Make the lane `flex: 1`
  and scale the time ruler with it.
- **T2. Guide text is small and dim for a TV across the room:** `.guide-watch` 20 px and `.guide-show small` 20 px in
  `--dust` (tv.css:333, 338). The ruler is 22 px. Use at least 24 px for anything people read. Programme cells that
  have already aired, left of the now-line, look the same as upcoming ones. Dim them.
- **T3. Guide channel numbers skip** (1, 2, 3, 5, 6…: the empty Documentaries channel is hidden). Fine for the
  number keys, but it looks like a missing channel. Show it greyed out ("Nothing yet") or renumber.
- **T4. The header row mixes button pills and plain text:** "Home network" (the account) and "Delas med Pappa och
  Anita" sit between nav pills as unboxed text, so it's unclear what can be focused. "Home network" is English in
  the Swedish app (it's the shared account's stored name). Move account + sharing to the right as a quiet
  "profile" pill, and translate the shared account's display name.
- **T5. The Rust (WebGL) app matches the JS app closely** (header, cards, focus ring). The posters stayed blank in
  headless Chromium because of TMDB CORS: a harness limit, not a TV bug.
- **T6. The pair screen leaves a big empty gap where the code goes** (the code didn't load in the harness because
  the POST was blocked). Check it with a real code. The "No account? Press Down" hint and the shared-account
  button sit far below the steps.

---

## Earlier audit (docs/design/audit.md) re-checked
- Settings "no way to jump between groups": **fixed on desktop** (side index, but see B2), **still open on phones** (I15).
- Settings "segmented controls, selects and code inputs all look different": mostly unified now (pill selects,
  pill segmented controls). The code inputs are still dark inset fields next to pill buttons, and the Android TV
  chip is underlined (I5).
- `/signin` "own grey/orange palette": **fixed** (Lilin card, bulbs, language switch). The OIDC page matches.
- Share pages "each have their own look": **mostly fixed** (invite, watch and clip player all use Lilin). The clip
  dead-link page (I1) and the raw-JSON 404s (I2) are the gaps left.

## Harness notes (for the fleet)
- `--theme synthwave` silently falls back to Lilin. The key is `synth` (app.js:340).
- `tvapp-discover` / `tvapp-title` now land in the SEELE TV guide (Up + OK opens SEELE TV first), so their names
  are misleading. tools/ui-shots/README.md says nothing about building `tv-shell.html`. Mine: tv/tizen/index.html with
  the `$WEBAPIS`/config.js lines replaced by `window.LILIN_SERVER=location.origin; localStorage['lilin:tv-engine']='js'`
  (`/tmp/lilin-fleet/scratch-owner/tvoverlay/`).
- `signin*`, `oidc-signin` and `password-gate` can't render from the LAN (home-network shared account). They need a local
  server with `HOME_NETWORK_ACCESS=signin` (+ `OIDC_CLIENT_ID/SECRET/REDIRECT_URIS` + `PUBLIC_URL` for OIDC). The
  password gate then shows for the `--as` owner too, so run owner scenes without OIDC.
- `share-invite`/`share-watch` default to token `x`, which hits raw JSON (I2) instead of the real pages. Invite
  tokens are 16 chars, watch tokens 24.
- The H.264 test clip renders black in the bundled Chromium (no proprietary codecs). That's expected, not a Lilin bug.

---

## Ideas

1. **Owner hub tab on phones.** Replace Notes/Activity/House/Clips in the phone tab bar with one "Owner" tab: a
   page with four big tiles and their live badges (unseen ideas, "2 things need a look", new clips, due notes).
   For: Oliver and ebi on iPhone. Fits Lilin: it fixes B3 and keeps the family's 4-tab bar unchanged. Effort S–M.
   Nothing like it exists (owner tabs are appended in `addAdminTab`).
2. **Theme safety net.** When anyone picks or makes a theme, check accent vs on-accent and the status colours
   (live green, alert) and nudge them to pass AA automatically. Also preview a primary button in each theme tile
   (the tiles only show bars and a dot now). For: everyone using Synthwave/Ember/custom. Effort S. Partly exists:
   the custom-theme text/background warning (app.js:7681).
3. **The TV follows your Appearance theme.** The TV code sign-in already ties a TV to a person: send their theme
   colours with the session so Pappa's TV can be Daylight and Oliver's Ember. For: family on the Samsung/Android
   TVs. Fits: the 9 themes are a signature Lilin feature that stops at the TV. Effort M (JS app = CSS vars; Rust app
   needs the palette passed into WebGL). Doesn't exist.
4. **Clip share page with the match story.** Show the CS2 event markers (kills, deaths, round wins from
   `<clip>.events.json`) on the public clip's seek bar plus a one-line caption ("3K on Mirage · round 14"), and a
   small "Shared from Lilin" footer. For: friends in Discord who get the link. Fits: the events already reach the
   editor (`clip-events`), and the share page is Lilin's own player. Effort M. Markers exist only in the editor.
5. **Watch-party link that fits a calendar.** On `/c/w/` for planned parties, show the poster/backdrop and the start
   time in the viewer's language, plus "Add to calendar" (.ics) and a live countdown. For: family invited to movie
   nights. Fits: planned parties and the link page already exist (watch-page.js), they just aren't translated (B6)
   or added to calendars. Effort S. No .ics anywhere in the codebase.
6. **Weekly owner digest.** A Sunday push / What's-new-style card: hours watched, who joined, top title, disk
   headroom ("library full in ~40 days at this rate"), ideas waiting. For: the two owners. Fits: Activity, House
   and Ideas already collect all of it, and push works. Effort M. Wrapped is yearly, and nothing weekly exists.
7. **Disk forecast in House.** Turn the Media/Clips bars into "14.8 GB free · about 9 days at this week's pace",
   with a warning when Kept clips + downloads will collide. For: the owners (the 3 TB SEELE TV cap, clips on the
   1 TB HDD). Effort S. Today House shows only current free space.
8. **Settings search.** A filter field at the top of Settings that narrows rows by label and hint (EN + SV). For
   anyone looking for "Jellyfin" or "subtitles" on a phone. Fits: Settings is now about 40 rows for owners, and
   rows are built through `settingsRow()` so indexing is cheap. Effort S. Doesn't exist (only the desktop index).
9. **"Not you?" on the password gate and sign-in remember-me.** Show which account is about to be set up, with a
   one-tap sign-out, and on `/signin` a "Keep me signed in on this device" choice that maps to the session length.
   For: family on shared iPads and the living-room laptop. Effort S. Partly exists (SESSION_DAYS is
   server-wide only).
