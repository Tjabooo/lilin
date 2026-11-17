# r2 — Design director: does Lilin feel like one crafted product?

Read: BRIEF, `docs/design/revamp.md`, all 8 r1 files. Screens eyeballed: `shots-live/small/{discover--tv, discover-rows--phone,
title-film--desktop, library-season--tv}`, `shots-system/crop-season.jpg`, `shots-discover-x/small/x-discover-paper--desktop`,
`shots-player4/small/room-host--tablet`, `shots-player5/small/force-skip-subs--desktop`, `shots-owner/tv/small/tvapp-{home,show}`,
`shots-owner/a/small/owner-clips--phone`. Also checked `public/tv/tv.css` header (Chrome 69: no clamp/color-mix) and `whats-new.json`.

**Verdict.** The *hero surfaces* are good: billboard, title panel with logo + wash, TV app episode list. They look like one
product. It falls apart in three places: (a) **the bulb is losing its meaning** because it's lit on everything, (b) **anything
over the picture** (player panels, rooms, sheets) is a pile of one-off recipes, and (c) **it doesn't scale to a TV**, which
the revamp promised and the family needs. Most of the 1437-literal-px drift in audit-system is invisible. These three
aren't, and they're what I'd spend on.

---

## 1. The 10 things that hurt Lilin's look most (merged, ranked by how visible × how often)

1. **Bulb inflation: "one lit thing per surface" is broken.** It's the identity rule (revamp §Colour: bulb = primary, focus,
   progress, new/live), and it's now spent on secondary things. Season page: bulb "Keep all 4" pill + a bulb round Play on *every*
   episode + bulb "Keep 30 more days" links on every row (system C3, library C1/C5; visible in `crop-season.jpg` and
   `library-season--tv`). Show page: Play + "More episodes" + Keep all are all yellow (library C1). Browse pill turns bulb when a
   filter is set (discover S8). The Save chip is bulb-tinted (T4). What's new's primary is a gold "Close" (owner I10).
   When everything glows, nothing is the next step. *Fix is cheap and it's the highest taste return on the list.*
2. **Themes are a signature feature that fails its own users.** On Ember/Synthwave every primary button is white-on-orange/pink
   at 2.6/2.8:1 (system A1 = owner B5, `app.js:370`). Status greens/blues are 1.9:1 on Paper/Daylight (A3, I18). `--text-3`
   captions fail AA in all 9 themes (A2). On Paper the current tab is dark-on-dark over the billboard (discover S10), and the
   billboard fades through a muddy grey band (D1; I saw it in `x-discover-paper--desktop`). The light-theme player turns cold
   grey while its menus stay warm (player C10, system A4). Nine themes is a promise. Right now three of them break it.
3. **Nothing grows on a TV.** 397 of 409 font sizes are fixed px (system B1). Chips, arrows, peek and toasts are phone parts at
   1920 (discover S9). The title panel caps at 1180 px (61 % of a TV) and leaves the right half empty (T8, visible in
   `library-season--tv`). Skip intro is a 15 px pill next to big controls (player C8; `force-skip-subs--desktop`). The TV *app*
   has 20–22 px secondary text in `--dust` (research-design G5, owner T2), and the guide leaves 280 px dead (T1). One-card rows
   leave 1000 px black holes (D8, library A10). revamp.md's "≥1600 the same layout scaled up" is mostly not true.
4. **Over-the-picture surfaces are nine recipes.** Player panels come in 9 bg/blur/radius/text combos; help and stats read
   purple next to near-black menus (player C1). Six "dark glass" recipes plus 77 `rgba(0,0,0,…)` (system B3). Four bottom-sheet
   implementations (C2), two social side panels (player C2), a generic ring spinner where everything else uses chasing bulbs
   (player C9). The player is where people spend 90 % of their time, so this is where the craft shows most.
5. **Two of everything, so the product looks assembled.** Two title pages for the same film: Discover `renderDetails` vs Library
   `renderFilm`/`renderShow`, with different facts, versions and actions (library B1). Two episode lists: Library's has no air
   dates and offers Add on unaired episodes (C4). A third, older SVT page prints the title on raw art (discover T1, DOC2). Two
   "more" buttons (A4), two Moods (D3), two "time left" vocabularies ×3 roundings (D7, A7), three clock formats (owner I6),
   "★ 8" vs "★ 8.0" (T3), a peek that says "Add" where the page says "Add to library" (T7).
6. **Phone chrome looks unfinished.** Header controls at 33/36/40/44 px don't line up (S6, C5). What's new with nothing new is
   an unlabelled hollow ring where people expect a face (S5 = I11 = C5: three auditors flagged it independently). The owner tab
   bar has 8 icon-only tabs that scroll, and Discover and Clips share an icon (owner B3; `owner-clips--phone`). Sub-44 px targets on
   every phone screen (system D). Sticky hover on iPhone (E).
7. **Library makes the family look at server chores.** Before the first poster: a convert banner with raw release names
   ("…1080p BluRay x265 Ghost.mp4") and ffmpeg failures, a filter row, an Availability select, a permanent shared-library
   sentence, two status pills and party cards. Continue watching starts at y≈1200 (library A1/A2, unchanged since the pre-revamp
   audit). The same jargon leaks elsewhere: "HEVC (hvc1) doesn't play…" (player D6), "Make sure server.js is running" to Pappa
   (S2), "Find torrents" in the Library header (A11).
8. **Watch Together, the social signature, covers the film.** On phones the room sheet hides the whole picture (player B6). On
   tablets and small laptops the floating card covers CC/Audio/fullscreen/play (B5; `room-host--tablet`, which I confirmed). Notes,
   errors and toasts ignore docked panels (B7/B8). Live chat already solved this layout. Rooms didn't copy it.
9. **States are designed as text, not as moments.** Errors are plain text on top of the play button with no way out (player B9).
   Toasts look the same for success and failure and vanish in 2.6 s (S4). Raw "Failed to fetch" shows up in English inside Swedish
   (S3). Dead ends: no-match search (X3), filtered-empty library (A8), a show page with no action for non-downloaders (T6), "You're
   all caught up" on a show that hasn't downloaded (C2). The "unlit lilin sign" empty state exists but flickers forever
   (D20) and isn't used for errors (X4).
10. **Micro-typography leaks.** Facts rows wrap with a leading "·" on every phone title page (T2 = library B3). The rating
    truncates to "★ …" in every 3-column grid (D4). Narrow-card status badges are unexplained yellow/dark squares (D5). The Swedish
    "Behöver åtgärd…" gets clipped (A3). Segmented chips overlap in Swedish Activity (owner B1), "ServerOwner" (B2). None of these is big
    alone, but together they're the difference between "crafted" and "generated".

Honourable mentions I'd fold into the above: the billboard seam on dark themes (D1), the TV app header mixing pills with bare
text (owner T4), and Popular on Lilin using ♥ where every other like is a thumb (D6).

---

## 2. Design-system plan I'd actually ship

### My reaction to audit-system's phases
- **Phase 0 (bugs): yes, all of it, first.** Add the Paper header/billboard fix (S10 + D1 mask) and the `--ring`→`--face-ring` rename
  (A6, invisible focus loss = a real bug). The "delete dead CSS" item is fine but trivial.
- **Phase 1 (tokens): split it. Migrate what users *see* and freeze the rest.**
  - **Do:** the fluid UI type steps (`--t-micro/--t-caption/--t-ui`) and the font-size migration. This one codemod changes the
    product, because it's what makes the TV scale (#3), and it's what makes a Text size setting nearly free. Do colour/status
    tokens (`--ok/--info/--warn/--live`, `--field-border`), over-picture tokens (B3), radii snaps (corners are visible
    side by side), weights (drop 650/750), the z-index scale (it has a real bug: peek and picker share 44/45), and glow/halo shadows.
  - **Don't:** the spacing codemod (1437 literals → `--s*` plus new `--s1h/--s2h/--s3h`). Adding half-steps just makes the drift
    official. Snapping 6→8 and 10→12 everywhere moves every component by a few px for no visible gain, and it collides with every
    parallel agent's feature branch in a 4093-line `style.css`. Spacing gets the boy-scout rule (tokenise when you touch a
    component) plus the budget, so it can't grow.
  - **Don't:** breakpoint consolidation beyond the actual overlap bug (`notes.css:111 max-width:600px`). 22 widths is ugly but invisible.
- **Phase 2 (components): right list, wrong order.** Lead with what sits *side by side on one screen*: over-picture panels and
  sheets, then the button family *with the bulb rule built in*, then focus. Header-at-44 goes into Phase 0 (it's a one-line rule).
- **Phase 3 (budget CI): move it to the front.** Freeze the current numbers the day Phase 0 lands, so cleanup never has to
  race new drift. Add one probe that matters more than any count: **a "lit bulbs per viewport" probe** in `shoot.mjs`. Count
  elements whose computed background is `--bulb` per scene and warn above 1 (2 with the billboard dots). That's the identity rule as a test.

### The order I'd ship (each step is independently shippable and screenshot-diffed with `tools/ui-shots --theme lilin,paper,ember`)

| # | Step | Scope | Effort |
|---|---|---|---|
| A | **Contrast + freeze** | on-bulb by best contrast + accent checks in the custom-theme warning (A1); `--text-3` up (A2); `--ok/--info/--warn/--live` (A3); light-player `--bulb` and warm-dark override instead of greys (A4, player C10); `--face-ring` (A6); Paper header text forced `--on-image` over the billboard (S10); billboard fade via `mask-image` (D1); header controls at one height (S6/C5); What's new: hide on phones when nothing is new, a real icon when there is (S5); `(hover:hover)` wrap; hit-slop; loaders breathe under reduced motion; `tools/css-audit.mjs` + budget committed. | S |
| B | **Light discipline** | `.btn` family (sm/md/lg × primary/secondary/glass/quiet/danger/danger-quiet), with `primary` the only bulb-filled variant. Then the bulb sweep: season page (only the next-up episode's Play is lit; Keep all → secondary; Keep links → `--text-2` and only on the row that's about to go, library C5/Idea 2), show page (More episodes secondary), Browse `is-set` → pressed paper chip, Save/Follow → secondary chips in one row (T4), What's new history mode with no gold Close (I10), Delete moved into ⋯ (B2), Transfer Cancel `danger-quiet` (D5). Bulb probe on. | S–M |
| C | **The 10-foot pass** | Fluid `--t-*` UI steps + font-size codemod (one property family per commit). ≥1600: title panel `min(1480px, 86vw)` with the two-column body (T8), chips/segmented/arrows/peek on `clamp()` (S9), Skip intro + Up next in the ≥900 block (C8), thicker focus + 120 ms pressed state on TV (system Idea 7, research G7). Single-item Continue watching → wide resume card (D8). Small library → one mixed grid (A10). **TV app:** 24 px floor for hints, 26 px for information (G5/T2), guide lane `flex:1` (T1), past programmes dimmed, header account/sharing → one quiet profile pill (T4). | M |
| D | **Over the picture** | One `.over-panel` (tokens `--over-bg/-line/-radius/-blur/-shadow`) for every player menu, note, error, help, stats, Up next, Skip intro, Play-now popup (it keeps its marquee lights as an *accent*). One `.sheet-surface` for sheet/peek/room/live-chat with handle + swipe-down. One `.side-panel` for room + live chat, using live chat's layout model (picture moves above the sheet on phones, docks ≥1100, narrower dock 700–1099), which fixes player B5/B6/B7. Picture overlays wrapped in one `.player-picture` box that panels shrink. The ring spinner → chasing-bulb ring (C9). The error becomes a state card with buttons (B9). | M |
| E | **One title page** | `renderFilm`/`renderShow`/SVT page render through `renderDetails` with a `library` mode: same facts, versions, Upgrade, cast, actions (⋯ holds Delete/Identify/To phone extras). **Season tabs** instead of the season poster grid (the revamp item that never landed). Air-date-aware episode rows. SVT gets `pageHero` + the shared episode rows. | L |
| F | **States as one component** | `stateCard({kind: empty/error/offline, title, text, actions})` with the lilin sign (lit once, then steady: D20). It replaces `notice()`, bare error text, the offline grey box, the "No matching titles" double sentence. Toast tones + length-based timing (S4). One `expiryLabel`, `fmtRating`, `fmtTime`, `Intl` numbers (D7/A7/T3/D19/I6). | S–M |

**Also in scope because they're cheap and visible:** `public/tokens.css` shared by style.css, pages.css and the clips PAGE_CSS
(fixes the "Łukasz" latin-ext gap on share pages). The TV app **can't** import it: Chrome 69 has no `clamp()` or `color-mix()`
(stated at the top of `tv.css`). It gets a tiny generated block of resolved 1920 values, or stays hand-synced with a comment
pointing at tokens.css. Plus a **style-guide scene** in ui-shots (system Idea 4), but as a hidden route only the harness renders,
not a Settings → Labs page. That's cheap, and it gives agents something to copy instead of inventing button #12.

**Leave alone:** the icon set (one set, good; just normalise stroke per render size), the theme engine's 9-base-colour
architecture, Bricolage + system body, the billboard itself, the global reduced-motion reset (just exempt loaders and
delete the dead per-component guards as you pass), `!important` count, Firefox no-glass (but also key it on
`prefers-reduced-transparency`/`prefers-contrast: more`, research G6, which is a two-selector change), and the TV app's own
look, which is the most coherent surface Lilin has (`tvapp-show` is genuinely nice).

### Signature moments (where Lilin should spend motion and craft, and nowhere else)
1. **Curtain up:** poster → title page shared-element View Transition (research-design Idea 1). It's the most repeated action and
   it's literally the revamp's "curtain, not a slot machine". The wash fades in *after* the morph lands.
2. **The bulbs are physical:** the one `linear()` spring token (research Idea 13) used only for bulbs lighting (billboard dots,
   new-episode dot, the lit check when something lands in your library). Never on colour/opacity. Chasing bulbs are the *only*
   loader everywhere, player included.
3. **The room tone:** the per-title wash plus the smart scrim (research Idea 9). The sampled luminance deepens the scrim and rescues low-contrast
   logo art. The Odyssey's blue-grey logo on a dark scene in `discover--tv` is the live example.
4. **Lights up on the sofa (TV):** a "Who's watching" face row on the TV (see §3), focus as elevation + bulb ring + press flash.
5. **The unlit sign:** empty/error/offline states all use the lilin sign, which lights once and then holds. Calm, recognisable,
   and the only screen family members see when something's wrong.

---

## 3. Ranked feature/UI shortlist (12), with what each should look like in Lilin

1. **One title page + season tabs** (library B1/C4/Idea 1/Idea 4, discover T6/T7, DOC2). *Look:* the Discover title panel everywhere.
   Under the facts, a segmented season row (`S1 S2 S3`, current season = paper-filled pill, no bulb). It opens on the season with
   your next episode. Episode rows: still · number · title · runtime · 2-line overview (reserved height, no jump), with the bulb only on
   the next-up row's Play. Unaired rows are muted, "Airs 3 Dec", with Follow's bell instead of Add. Non-downloaders get "Play S1 E1"/"Add to my
   library" as the primary when it's on the server. L, but it removes a whole class of drift for good.
2. **Poster → title "curtain up" morph** (research-design 1). *Look:* the tapped poster scales/moves into the backdrop slot over
   `--d-3 --ease-out` (old/new snapshots cross-fade with `object-fit: cover` for the 2:3→16:9 change), the logo fades in at 60 %,
   the wash last. Close reverses it into the card. Off under reduced motion and on the TV app. M (≈40 lines).
3. **Legibility pack: Text size + caption studio + TV captions** (system Idea 1, research G3/G4/Idea 3). *Look:* Appearance gets
   "Text size: Normal · Large · Larger", which drives a `--ui-scale` multiplier on the fluid tokens (free after Step C). CC menu gets a
   "Style ›" sub-page with a live sample cue over a dimmed frame: size 60–200 %, white/yellow, box 0/50/75/100, edge, position. The TV
   OSD gets the same four choices with the sample line behind the menu, stored per TV. This is for Pappa/Anita, the users who most need it. M.
4. **Who's watching on the TV** (competitors 4 = social 9). *Look:* on wake (after 4 h idle), the velvet room with the household's
   faces as large round portraits in a row. The focused face lifts with the bulb ring and the name sits below in Bricolage `--t-h2`.
   "Someone else" is an unlit ring. Default = last person, one OK to continue, so it never nags. The current face sits top-right on the TV
   home as the profile pill, which also fixes owner T4. M (server + TV).
5. **"Can I watch it now?" cards + search that knows the server** (competitors 15, discover D5/X1/X3/Idea 3, design Idea 6
   merged). *Look:* one status glyph on the art, top-left, from a fixed four-glyph vocabulary (✓ in your library · house = on
   Lilin · ↓ Play now possible · clock = not out yet), each with `aria-label`/title, and no unexplained squares. Search groups "On Lilin" first with Play, then
   "Can be added", then SVT, *after* the first results row unless it's an exact match. No-match offers "Search releases" (downloaders)
   + Coming soon. S–M.
6. **People as the reason** (social 10/13, design 6). *Look:* the card caption line swaps "2005 · Series · ★ 8.1" for a 16 px face +
   "ebi loved it" / "Saved by Pappa" when one exists. That's the only social line, under the art, never on it. The peek shows up to three.
   Names, never counts below 4 people, never dislikes. "Loved it" = a second tap on thumbs-up (the thumb fills and gets a small
   bulb spark). Popular on Lilin switches ♥ → thumb (D6). S.
7. **Send a title + "From friends" shelf** (social 1; Moments land here too instead of buried in Settings, owner I20).
   *Look:* a row of landscape cards with the sender's face in the corner and their note as a one-line quote under the art (`--t-body`,
   paper, curly quotes). Moments appear in the same shelf with a small clip glyph. When you thumb it, the sender gets a quiet "Pappa
   loved it". This is Lilin's answer to the vertical-feed trend: human-made and finite. S–M.
8. **Lock screen, AirPods and media keys + remote stays awake** (research G1/G2). *Look:* not a UI in Lilin, it's the OS's. Still
   design-relevant: artwork = episode still first (iOS takes entry 0), title = episode name, artist = "Show · S3 E4". Wake Lock while
   the phone remote drives a TV, with a one-line "Screen stays on while the TV plays". S. It's the cheapest "feels native" win available.
9. **Smart scrim + logo rescue** (research Idea 9). *Look:* invisible when it works. The scrim deepens up to +35 % over bright
   art, and low-contrast logo art gets a soft dark halo or goes white. Also apply it to the SVT hero (T1). S.
10. **Pick together (TV shows a QR, phones vote)** (social 2, discover Idea 4/research "Tonight" merged; it replaces a
    random button). *Look:* the TV shows a marquee: the 12–15 candidate posters in a row with an unlit bulb above each, and bulbs light as
    phones vote. The reveal is a curtain-up on the winner with its reason ("ebi saved it · ends 23:05") and one Play. Phones get a
    plain swipe deck in the PWA. It's the "house cinema" fantasy done right. M.
11. **Collection strip on the title page** (competitors 5). *Look:* a normal row titled "The Dune collection · 2 of 3 on Lilin",
    posters in release order with a small number kicker (1, 2, 3), a lit check bulb on watched ones, and "Add the missing one" as a
    secondary. S–M.
12. **Pause card + Skip recap / post-credits chip** (competitors 11 + 1). *Look:* after 4 s paused, the picture dims to 70 % and an
    `.over-panel` card sits bottom-left: S·E · episode name, two-line synopsis, "Ends at 22:41" (24 h), and guest-cast faces. Skip recap
    is the same component as Skip intro. "Stay: scene after the credits" is a kicker-styled chip with "Jump to it". S + M.

Not features but part of Step C/F, and I'd still call them out: the owner phone hub tab (owner Idea 1; 5 labelled tabs max), Mood tiles with a
3-poster fan (discover V4: it's the only pictureless row on Discover), the wide resume card (D8), and Library's chores moved
into one owner "Server" sheet (library A2/Idea 8).

### Kill (or not now), and why
- **Vertical Moments/trailer reel** (design 7, competitors 14). There's no supply at 5 people, and a swipe feed is the slot machine
  the revamp rules out. Social research agrees. Item 7 is the Lilin-shaped version.
- **Ambient glow behind the player** (design 11). The letterbox is meant to be the dark house. Glow dilutes the one rule that makes the
  picture the only light. It also brings canvas readback on HDR copies and a Firefox cost. Kill.
- **TV follows your Appearance theme** (system 6, owner 3). Light themes on a TV mean big bright fields (Amazon: avoid pure white;
  Apple: prefer dark translucent on TV), and the TV palette is tuned and desaturated for TVs. Item 4's face pill does the
  "it's *my* TV" job. Kill. At most, carry the accent colour of dark themes later.
- **Full home-row editor** (competitors 6). A drag/hide/pin editor is a lot of UI for 5 people. Fix the duplicate-trending row (D2) and
  give each row title a ⋯ "Hide this row" with a single "Hidden rows" list in Settings. That's 10 % of the cost.
- **Ask Lilin (LLM search)** (competitors 7). The GPU is night/idle only, the latency breaks search, and basic search grouping (item 5) isn't
  done yet. Not now.
- **Taste match %** (social 7). A number between friends is a leaderboard. Item 6 gets the value without the score.
- **Diary view** (design 10). Fine idea, but it's another top-level view in an app whose nav is already overfull. Wrapped covers the
  emotion. Not now.
- **Liquid Glass anything.** Already rejected by research. It's the wrong material for velvet, and it's expensive on Firefox/Tizen.
- **Spacing half-step tokens** (system B2). See §2.

---

## 4. Questions and challenges

**For the product lead**
1. Does anyone actually use the *web* UI at 1920 (a TV browser or a laptop on HDMI), or do the parents only use the Samsung app? If it's
   the app, I'd flip Step C to do the TV-app type floor + Who's watching first, and the web ≥1600 work after Step D.
2. Which themes are actually picked (owner settings know)? If nobody's on Ember/Synth/Paper, Step A is still a day's work, but I'd
   stop expanding theme features.
3. Auto-delete is Lilin's most surprising rule. I'm demoting the per-row Keep links. Do you agree it's enough to have **one** lit
   "Leaving soon" thing per surface (keep bar + the row about to go), or do the parents rely on those links?
4. Would you trade three new features for the one-title-page merge (L)? I think it's the single biggest "one product" fix, but
   it ships nothing new to users.
5. Is "Who's watching" a real problem today (two people on the parents' one paired account), or a hypothetical one?

**For the skeptic engineer**
1. Can you live with the **font-size codemod** (the visible one) while we skip the spacing codemod? I'm proposing one property family
   per commit, screenshot-diffed on 3 themes. What's your rollback story with parallel agents editing `style.css`?
2. Should Step D also **split style.css** (4093 lines) along the new components (`player.css`, `sheets.css`, `library.css`)? It cuts
   merge conflicts between agents, but it adds requests in a no-bundler app. Is HTTP/2 + immutable caching enough, or do you want a tiny
   concat at serve time?
3. The VT shared-element morph: any objection to ≈40 lines with a hard no-op fallback? Do you see snapshot cost on the iPhone PWA
   with big backdrops?
4. Is the "bulb per viewport" probe in `shoot.mjs` reliable enough to gate CI, or should it only warn?
5. Tokens for the TV app: generated resolved-values block vs hand-sync. Chrome 69 can't do `clamp()`/`color-mix()`. Which do you
   want to maintain?
6. Smart scrim: the wash already reads a 32 px canvas of TMDB art. Confirm it's CORS-clean on all clients, including Firefox and the iOS
   PWA, so the luminance read is free.
