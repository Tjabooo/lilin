# r3: Design director, rebuttal and final vote

Net: I concede on sequencing and the morph. I hold the line on light discipline and one dedicated type pass.

## Answers

**Codemod vs touch-as-you-go (both).** I concede: no big-bang. I'm dropping the spacing/radius/shadow codemods for good. They migrate
when a file is touched, and the CI budget can't go up (fails on increases; the budget file is editable in the same PR). **One exception
I'm keeping:** font sizes → fluid `--t-*` steps, as its own short batch *after* the fix batch, done file by file in small
commits (details/vibes/reviews/friends/coming-soon first, then `style.css` section by section). That one is user-visible:
it's the only thing that makes the web UI scale to a TV, and Text size depends on it. Text size waits for it (engineer is right
that it isn't S before that).

**Season tabs at 20+ seasons (product).** Phone layout at 390 px:
- One horizontal chip row under the facts. Scroll-snap, the `.tabs` edge-fade mask, auto-scrolled to your current season.
  Chips read `1 2 3 … 21`, with the word "Season" once as a label at the left. Specials/season 0 go last as "Extras".
  The current chip is paper-filled, never bulb.
- More than 8 seasons: the row starts with a "All seasons ⌄" chip that opens a sheet with a 1-column list ("Season 14 · 24 ep · 18 watched", with a slim progress bar).
  That's the One Piece path.
- Anime: TMDB season on the chip, absolute range ("Ep 892–916") as the sheet row's subtitle. TV app: its `Säsong 3` pill cycles with Left/Right.

**Does demoting per-episode Play keep the next episode obvious at 390 px? (engineer).** I'll make that the ship gate, not a
promise. The design:
- The page's one lit thing is the top primary "Resume S3 E2" / "Play S3 E2".
- In the list, the next-up row gets an `UP NEXT` kicker in bulb text, a `surface-2` fill with a 3 px bulb left edge, and its progress bar.
- Every row's round Play becomes secondary (paper glyph on surface-2, 44 px). The still stays a play target.

Acceptance: a ui-shots before/after of `library-season--phone` at 390 px in EN+SV, with the next-up row in the first viewport
without scrolling past the top button. If it fails, the next-up row's Play stays lit and the top button goes secondary. One lit thing either way.

**What's the one lit thing on the season page (product Q5).** Play next. The keep bar only becomes loud when deletion is under 24 h,
and then in `--warn`, not the bulb: it's a warning, not an invitation.

**Owner hub vs fixing the ≤7 CSS (both).** Hub. Five labelled tabs max for everyone: Discover · Live · Library · Owner · Settings.
The Owner tab carries a summed badge, and the page is four tiles with their own badges. Decide it now, before a 9th tab arrives.

**One title page vs parity patches (engineer).** Concede the full merge. Do the parity patches (version picker in `renderFilm`,
Delete/Identify/Remove behind ⋯, SVT through `pageHero`). The **one** structural piece I still want is a single
`episodeList()` used by both paths, built as part of season tabs + air dates, so the list can't drift a third time.

**Overlay/sheet primitives after room work (engineer).** Agreed on not touching the player twice, so I'd **bundle** them:
the room stage-push layout (B5–B7) *is* where `.side-panel` and the `--over-*` tokens get born. One player pass, not two.

**Billboard (product Q4).** It earns its height on phone and desktop. Cap it at ~70 vh at ≥1600 so the first row peeks.
Yes to the mixed personal billboard with per-slide kickers: it's the best idea of theirs I didn't have.

**Q6:** retire the MOODS rows into vibe tiles. **Q7:** keep the phone peek as an accelerator, and add the handle + swipe-close.

## Concessions
- **Curtain-up morph: dropped.** The engineer is right that the art loads async into a `#sheet` overlay, so the snapshot fires before the target exists.
  It'd ship as jank on iPhone. Not on the vote.
- **Who's watching (TV): deferred** until Oliver confirms two people watch separately on the parents' TV.
- **Text size:** behind the type batch.
- **Static ETag/brotli (E1)** beats every CSS item for perceived speed on the PWA. It goes in the fix list.
- **Watch privately** has to land before profiles ships. Privacy beats polish.

## Disagreements
- **Product cuts smart scrim as "users won't name it."** Users won't name it, but they will fail to read the first title on screen
  (The Odyssey logo, the SVT hero). It's S and reuses the existing wash sampling. I'm keeping it as a rider on the SVT/pageHero fix, not as a feature.
- **Bulb discipline isn't polish.** Both lists file it under "expiry vocabulary". It's the identity rule. Without it the
  next 80 changes a week re-light everything. The budget gets a warn-only "lit bulbs per viewport" probe.
- **"Needs design decisions" (engineer):** made above (hub, tabs, one lit thing, side panel). Nothing is blocked on design now.

## FINAL VOTE

### Top 10 fix-now (in order)
1. **Player correctness + privacy:** room Audio button, server-side per-recipient member projection + `visibleWatchers()`,
   `closePlayerMenus()`, roster key, the stray English strings.
2. **Contrast + freeze:** on-bulb by best ratio (+ custom-theme accent check), `--text-3` to AA, `--ok/--info/--warn/--live`,
   light-player bulb + warm dark (not grey), Paper header over the billboard, billboard fade via mask. `tools/css-audit.mjs` budget in CI the same day.
3. **ETag + 304 + brotli in `serveStatic`**, and harness stubs for the side-effecting `/audio` GET.
4. **Light discipline on title/show/season pages** behind the 390 px gate above. Also: Browse `is-set` → pressed chip, Save/Follow
   in one secondary row, What's new without a gold Close, Delete behind ⋯.
5. **Calm states:** offline heading + family copy + mapped fetch errors + a reconnect pill. The player error becomes a card with buttons.
   Toast tones + length-based timing, and one `stateCard` with the lilin sign, lit once.
6. **Room/player layout pass:** stage-push room sheet on phones, a narrower dock at 700–1099 px, overlays follow docked panels,
   and the `.side-panel` + `--over-*` tokens born here. Chasing-bulb spinner.
7. **Owner hub tab + phone header:** 5 labelled tabs, one header control height, What's new hidden when there's nothing new.
8. **Library diet + parity:** convert banner → card pill + an owner line with titles, not file names. Status pills in one chip row,
   a View menu (Availability + Sort). Film version picker, shows tell the truth (no false "caught up"), SVT via `pageHero` + smart scrim.
9. **TV readability (served, no reinstall):** a 24/26 px floor, guide lane `flex:1`, aired cells dimmed, a 120 ms pressed state, the account as a quiet profile pill.
10. **Micro-typography + vocabulary:** facts separator, rating kept in grid captions, check/house badge glyphs,
    `expiryLabel`/`fmtRating`/`fmtTime`, Swedish segmented no-shrink, Trending row minus the billboard items.

*Then:* the fluid type batch (file by file), which unlocks Text size.

### Top 6 features (in order)
1. **Watch privately**, before profiles ships.
2. **Lock screen, AirPods and media keys + remote stays awake.** Media Session routed through `party.control` in rooms.
3. **Up next for the whole room** (+ ✋ ask for a pause).
4. **Season tabs + one shared `episodeList()`** with air dates and "Next to go" once.
5. **Caption look on the TV** (Tizen JS first: size, box, position, live sample) + colour/box opacity on the web.
6. **Search that knows the server**, together with the card status glyphs (On Lilin → Can be added → SVT; a no-match with a way forward).

Next in line: the personal billboard + people as the reason, then the collection strip.
