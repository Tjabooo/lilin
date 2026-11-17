# Lilin web UI: design-system coherence audit (round 1)

Scope: every stylesheet in `public/` (style.css 4007 lines/262 KB, details, friends, notes, reviews, vibes, coming-soon, pages),
inline styles in `public/*.js` + `index.html`, the theme engine (`app.js:332-378`), with token copies in `public/tv/tv.css`
and `src/clips.js` noted. Method: scripted counts over comment-stripped CSS (scripts in `/tmp/lilin-fleet/scratch-system/`:
`props.py`, `colors.py`, `space.py`, `contrast.py`), WCAG maths for all 9 Appearance presets, and screenshots from the live
server: Ember + Paper themes (`/tmp/lilin-fleet/shots-system/{ember,paper}`), Swedish (`.../sv`), plus a patched copy of
`shoot.mjs` that measures every on-screen control under 44 px and every ellipsis/clamp truncation (`.../tt`, `.../tt2`, `.../trunc`).
Contact sheets: `shots-system/ember-sheet.jpg`, `paper-sheet.jpg`, `sv-sheet.jpg`, `desk-grid.jpg`, `crop-season.jpg`, `crop-head.png`.

## TL;DR

1. **Broken:** in the **Ember and Synthwave** themes every primary button (Play, Add to library, Resume) is white on orange/pink at
   **2.59:1 / 2.83:1** (AA needs 4.5). Cause: `--on-bulb` uses a luminance threshold instead of picking the better contrast (`app.js:370`).
2. **Broken (light themes):** the hard-coded status greens/blues (`#6fcf8f`, `#7fb2ff`, `#2fbf71`) come out at **1.9:1** on Paper/Daylight.
   That covers Activity, House, the room "live" dot and the SVT chip.
3. `--text-3` (captions) fails AA on surfaces in **all 9 themes** (3.3–4.2:1). It's used for 12–13 px text in 28 places.
4. The token system from the revamp exists but adoption is low. Only **~5 % of font sizes**, **12 % of spacing**, **20 % of shadows** and
   **~25 % of radii** use tokens. There are 42 distinct font sizes, 44 radii, 93 shadows and 120 literal colours, and **57 % of
   literal spacing is off the 4 px grid**.
5. Components that do the same job look different: 11 secondary-button heights (34–52 px) and 4 bottom-sheet implementations.
   There are 5 focus-ring idioms, 13 press-scale values and 6 segmented-control heights. The season page lights the bulb colour
   on 3 kinds of thing at once.
6. Touch targets under 44 px show up on every phone screen. The header controls are 36/40/33 px, the billboard dots 22 px, the
   Continue ⋯ button 32 px, thumbs 40 px, "Keep 30 more days" 20 px tall, segmented 28–34 px and the seek bar's hit area 28 px.
7. Reduced motion has a solid global reset (`style.css:2017`), but it makes ~20 per-component guards dead code and freezes the loaders.
8. Swedish holds up on phones: no overflow and no label truncation in 10 measured scenes. But there's no `hyphens:auto` anywhere,
   so long compounds (`webbplatsinställningarna`, `Undertextförskjutning`) can only hard-wrap.

---

## 1. Map of the system as it is

| Area | Defined (style.css `:root`, lines 18–104) | Real use | Drift |
|---|---|---|---|
| Base colours | 9 per theme + `--on-bulb`, `--on-image`, `--bulb-dim` | ok | Copies of the palette in `pages.css:10`, `tv/tv.css:10`, `src/clips.js:819` (PAGE_CSS). pages.css hairlines are `.1/.18` vs `9%/16%` in style.css |
| Semantic colours | `--text/-2/-3`, `--surface-1/-2/-glass/-solid-glass`, `--hairline/-2` | `--surface-2` 44× but raw `--seat` 33×; `--surface-1` 36× vs raw `--curtain` 25× | semantic layer bypassed ~40 % of the time |
| Status colours | only `--alert`; `--live: #ff5a4e` defined mid-file (`style.css:3733`) | green `#6fcf8f` ×6, `#2fbf71` ×1, blue `#7fb2ff`, Screen Time `--st-*` | no `--ok/--info/--warn`; none are theme-aware |
| Literal colours | n/a | **409 literal values, 120 distinct** (style.css 319) | white alphas in 14 steps (.06–.35), black alphas in 18 steps (.18–.94), 6 "dark glass" recipes (see B3) |
| Type | 7 fluid `--t-*` + 2 families | font-size: **409 decls, 42 distinct, 12 via token**; `font:` shorthand 116, ~20 via token | 13px ×130, 14px ×84, 12px ×59; half-pixel steps 10.5/11.5/12.5/13.5/14.5 (24 uses) |
| Weights | revamp spec: 700/800 for display | 600 ×76, 700 ×62, **650 ×13**, 800 ×12, 500 ×9, **750 ×2**, 400 ×2 | 650/750 one-offs |
| Line-height | none | 14 values (1, 1.1, 1.15, 1.2, 1.25, 1.28, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 18px, 22px) | |
| Letter-spacing | spec: kicker +0.14 em | 31 distinct; kickers use .04/.06/.08/.1/.12/.14 em | |
| Space | `--s1..--s8` (4 px grid) | **205 token uses vs 1437 literal px**; 822 literal values are off-grid (6px ×198, 10 ×148, 14 ×126, 2 ×97, 18 ×49, 3, 7, 5, 22, 11, 9, 13…) | |
| Radii | `--r-xs 6 / sm 10 / md 14 / lg 22`, pills 999 | 44 distinct | literal copies of tokens: 10px ×16, 6px ×9, 14px ×9, 22px ×3; off-scale: 8px ×14, 3px ×10, 12px ×8, 7px ×8, 16px ×7, 18/9/11/26/24/5px |
| Elevation | `--e1/e2/e3`, `--glow`, `--ring` | box-shadow: **137 decls, 93 distinct, 27 token** | bulb glows `0 0 8px` / `0 0 10px` / `0 0 14px -3px`; halo `3px` vs `4px bulb-dim` |
| Motion | `--d-1..4`, `--ease-out/in-out/pop` | 184 transition/animation decls; 119 use `--d-*` | `0.15s`/`.15s` ×37 (a near-duplicate of `--d-1` 120 ms), plain `ease` ×33, four hand-written beziers ≈ `--ease-out` (`style.css:3143`, `3850`…) |
| Press/hover | spec: press .97, hover lift 4 % | press scales: **13 values** .88–.985; hover lifts −1/−2/−3/−4 px, scales 1.035–1.12, brightness 1.06/1.08/1.12 | |
| z-index | none | 20 values | header/tabs 30, nowbar 31, preview-pill 35, sheet 40/41, peek 44/45 **and** picker 44/45, remote 55, player 60 **and** wrapped 60, toast 70, signed-out 90 **and** note-viewer 90, password-gate 10000 |
| Breakpoints | spec: 600 / 900 / 1600 | **22 distinct widths** | 420 ×8, 1100/1099.98, 700/699.98/699, 560/559.98, 480/479, 520, 640, 720, 400, 359, 340; `max-width:599px` vs `599.98` vs `notes.css:111 max-width:600px` (overlaps `min-width:600px` at exactly 600) |
| Focus | global `:focus-visible` 2px bulb (`style.css:134`), thicker ≥1600 (`:2010`) | 5 idioms (see C4) | |
| Icons | one 24-grid inline-SVG set (`app.js:65`), stroke 2 (`style.css:132`) | good: one set, no icon font | rendered at 17/18/19/20/22/23/24/25/28/30/36 px with a fixed stroke 2 → 1.4–3 px visual weight; `.stroke-icon` 2.2 (`:2792`) vs 2.4 (`:153`, `:1711`, `:3342`); ★ and ♥ are text glyphs next to SVG icons (`reviews.js:70`, `social.js:139`) |
| Inline styles | — | clean: JS only sets geometry (`width:%`, `left`, `--p`, `--val`) and theme swatch vars | one exception: `app.js:6282` sets the quality badge to **6 px** text when it reads `"1080p"` etc. |
| `!important` | — | 24 (17 in style.css) | |

---

## 2. Findings

### A. Contrast and themes

**A1. Primary buttons fail in Ember and Synthwave. Broken.**
Where: every `.play-btn`/`.btn-primary` (`style.css:142`): billboard Play, Add to library, Resume, Keep all, episode play.
Seen in `shots-system/ember-sheet.jpg` and `crop-disc.jpg`. What: `applyTheme` sets `--on-bulb` to `#FFFFFF` whenever accent luminance ≤ 0.4
(`app.js:370`). Ember `#FF7A3D` gives white-on-orange **2.59:1** and Synth `#FF5FA2` gives **2.83:1**; `#141414` would give 7.1 and 6.5.
Fix: choose the candidate with the higher contrast:
`onAccent = ratio(dark, accent) >= ratio(light, accent) ? dark : light` with `dark = bg if bg is dark else #141414`,
`light = bg if bg is light else #FFFFFF`. Also run the custom-theme warning (`app.js:7665`) on `on-bulb/accent` and on
`accent/bg` (accent is used as link/label text). It currently only checks text against bg and surface.

**A2. `--text-3` captions fail AA everywhere. Inconsistent, borders on broken for small text.**
`--text-3` is `dust 70 % into velvet` (80 % on light themes). On surfaces it measures:

| theme | on bg | on surface-1 | on surface-2 |
|---|---|---|---|
| Lilin | 4.26 | 3.91 | 3.41 |
| Midnight | 4.17 | 3.78 | 3.29 |
| Noir | 4.10 | 3.74 | 3.28 |
| Paper | 3.56 | 3.90 | 3.23 |
| Daylight | 3.59 | 3.92 | 3.27 |

It's used on 11–13 px text in 28 places: `details.css:16,28,33,90,94,95,114`, `reviews.css:46,80`, `style.css:2153` (activity times), `:3919`, `:3933`, `:3946`, `:3979-3991` (Scout), `coming-soon.css:39`, `friends.css:7`.
Fix: make `--text-3` dust 85 % (dark) / 92 % (light) and verify ≥ 4.5 on surface-2 for every preset. Or keep it for ≥ 18 px and icons
only and move captions to `--text-2` (dust passes everywhere: 4.9–8.3).

**A3. Hard-coded status colours vanish on light themes. Broken on Paper/Daylight (owner screens, Watch Together).**
`#6fcf8f` on the Paper surface is **1.88:1** and `#7fb2ff` about 2:1. Locations: `style.css:2060` (activity dot), `:2067`, `:2147-2148` (activity icons),
`:2187` (House status bar), `:3472` (room "live" dot), `:562` (SVT chip `#2fbf71`). Fix: add theme-aware `--ok`, `--info` and `--warn`
tokens (dark: current values; light: `#1E7A45`, `#1F5FBF`, `#9A5B00`, all ≥ 4.5 on `#FFFDF9`), set them in the
`:root[data-scheme="light"]` block, and replace the literals. Move `--live` (`:3733`) into the token block too.

**A4. The light-theme player keeps the light theme's accent on dark glass. Polish.**
`:root[data-scheme="light"] .player` (`style.css:2641`) re-darkens velvet, curtain, paper and dust but not `--bulb`. Results: chat-float names
(`style.css:3160`, 12 px, `var(--bulb)`), the `.cc-item` chosen-item mark and the seek fill use Paper's `#C2410C` / Daylight's `#2563EB` on
near-black at **3.6:1**. Fix: in that block set `--bulb: color-mix(in srgb, <accent> 60%, white)` or a light-safe accent per theme
(Paper `#F08A4B`, Daylight `#7FA8FF`).

**A5. Input boundaries are under 3:1 (WCAG 1.4.11). Polish.**
`--line`, `--hairline` and `--hairline-2` measure 1.3–1.7:1 against their background in every theme. That's fine for dividers. But text fields
whose only boundary is that border fail: `.idea-text`, `.sub-select`, `.hex-input`, `.dl-num`, `.search input`, `.chat-form`. Fix: give
an `--field-border` token (`dust 45 %`) to inputs only.

**A6. `--ring` is overloaded. Latent bug.**
`--ring` is the global focus-ring box-shadow (`style.css:45`), but it's reassigned to a *plain colour* for avatar rings in local scopes:
`style.css:3269` (`#picker, .rate-row, .party-card, .row, .profile { --ring: var(--curtain) }`), `:3417`, `:3420`, `:3451`, `:3611`,
`:3848`, `:3171` (`#1d1017`). Inside those scopes any `box-shadow: var(--ring)` focus style (title cards `:470`, cast faces
`:1082`, vibe tiles, `.cs-save`, guide cells) turns into an invalid shadow, and the focus ring silently disappears. Fix: rename the avatar
one `--face-ring`.

### B. Token drift (inconsistent, mostly invisible one at a time, visible in aggregate)

**B1. Type doesn't use the fluid scale, so desktop/TV text doesn't grow.** The revamp (`docs/design/revamp.md` §Type) says sizes are fluid from
phone to TV. In practice 397 of 409 `font-size` declarations are fixed px (13 px ×130, 14 px ×84, 12 px ×59). Meta lines, episode
facts, chip labels and settings hints are the same 12–14 px on a 1920 px TV as on a phone. Only `.ep-*` gets a manual bump
(`style.css:2013`). It's visible in `shots-live/small/library-season--tv--en.jpg`. Fix: add three UI steps to the scale and
migrate: `--t-micro: clamp(11px, 10.5px + .1vw, 12px)` (badges, kickers), `--t-caption: clamp(12px, 11.5px + .14vw, 14px)`,
`--t-ui: clamp(14px, 13px + .2vw, 16px)` (chips, buttons, list rows). Map 10.5–12.5→micro/caption, 13–14.5→ui/small, and 15–17→body.

**B2. Spacing is mostly literal and off-grid.** 1437 literal px vs 205 `--s*`; 6/10/14 px are the three most common values after 8.
Fix: half-steps are clearly wanted (6, 10, 14), so add `--s1h: 6px; --s2h: 10px; --s3h: 14px` rather than fight it. Then
codemod: 2→s1/0, 3→s1, 5→s1, 7→s2, 9→s2, 11→s3, 13→s3, 18→s4, 22→s5.

**B3. Six "dark glass over pictures" recipes.** Over-picture surfaces should use `--picture-dark` (12 7 10) and `--glass-dark`. Instead
there's `rgb(24 16 21 / .72–.9)` (`style.css:1185`, `:1195`, `:1236`, `:1732`, `:1807`), `rgba(20,10,16,.78)` (`:3154`), `#141014`
(`:691`, `:701`, `vibes.css:68`), `#1d1017` (`:3171`), `#140a10` (`pages.css:22`), plus `rgba(0,0,0,.45-.9)` ×77. Text over
pictures: `--on-image` ×12, while `#fff/white` ×26 and the literal paper `rgba(246,234,223,…)/#f6eadf` ×19 (e.g. `.part-popup*`
`:1219-1228`, `.up-next-dismiss :1257`, seek `:1289-1294`, volume `:1000/:1372`). Fix: `--glass-dark` (.62), `--glass-dark-strong` (.86),
`--on-image-2` (`on-image 72 %`), `--on-image-line` (`on-image 20 %`); replace all of them.

**B4. Radii.** Swap the literal duplicates for tokens (10px→`--r-sm` ×16, 6px→`--r-xs` ×9, 14px→`--r-md` ×9, 22px→`--r-lg` ×3).
Snap the off-scale values: 8/7/9px → `--r-xs`/`--r-sm`, 12/16/18 px → `--r-md`, 24/26 px → `--r-lg`, 2–3 px → a new `--r-hair: 3px` for bars.
`--r-md` changes to 16 px ≥ 1600 px (`style.css:110`) while the literal 14 px copies don't follow.

**B5. Shadows.** Add `--glow-sm: 0 0 8px var(--bulb)` (lit bulbs, 9 uses of 8/10 px), `--halo: 0 0 0 3px var(--bulb-dim)` (input/focus
halos, used with 3 px and 4 px) and `--e-up: 0 -18px 50px rgb(0 0 0/.5)` (bottom sheets: `.room :3586`, `.live-chat :3850`). Put
everything else on `--e1/2/3`.

**B6. Motion.** `.15s` ×37 → `--d-1`; `.25s/.26s` → `--d-2`; `.4s/.6s` → `--d-3`. Plain `ease` ×33 → `--ease-out`; the 4 hand-made beziers
→ tokens. Press feedback: one `--press: .96` (and `.92` for round icon buttons) instead of 13 values.

**B7. z-index has no scale.** Define it: `--z-raise:1 --z-sticky:20 --z-chrome:30 --z-sheet:40 --z-popover:45 --z-remote:55 --z-player:60
--z-toast:70 --z-alert:90 --z-gate:100`. Today peek and picker share 44/45 (a picker opened from a peek can sit under the peek's
shade at the same z, so DOM order decides). Wrapped and player share 60. `password-gate` 10000 is arbitrary.

**B8. Breakpoints.** 22 widths. Keep 600/900/1100/1600 as tokens in comments, and move the phone-narrow tweaks (420 ×8, 400, 359, 340)
to container queries on the component (there are 3 already: `@container people`, `(max-width:132px)`, `(max-width:299px)`). Use
`.98` consistently: `notes.css:111 max-width:600px` and `style.css:2215 max-width:640px` are one-offs.

**B9. The semantic layer is bypassed, with near-duplicate borders.** `--line` (theme base, opaque) and `--hairline-2` (paper 16 %) render
almost identically (Lilin `#4B2C3F` vs `#4B3942`, Noir `#333` vs `#3D3D3D`) and are used 60× and 44× for the same job. Fix: keep
`--hairline` (dividers) and `--hairline-2` (control borders), and alias `--line` to `--hairline-2` for components. Replace raw
`--seat/--curtain/--velvet` in components with `--surface-2/-1/--bg`.

**B10. Four copies of the palette and base styles.** `style.css`, `pages.css` (server pages, a hand-copied subset with its own hairlines and
a shorter font unicode-range: no latin-ext, so names like "Łukasz" fall back on share pages), `tv/tv.css`, and `src/clips.js:819`
PAGE_CSS. Fix: a `public/tokens.css` (palette + scale only, no selectors) that style.css, pages.css and the server pages import.
The TV app can inline it at build time.

**B11. Dead CSS. Polish.** These selectors are referenced nowhere in `public/*.js`, `index.html` or `src/` (dynamic prefixes like `act-${}`,
`scout-status-${}`, `st-c-${}`, `seeds-${}` and `sub-${}` were excluded): `.activity-list :2046`, `.activity-row/-face/-time/-text :2055-2058`,
`.activity-location-note :2723`, `.find-btn :1674-1680`, `.ep-actions :1104-1105`, `.clip-video :2287`, `.season-head/.season-poster
:2451-2452`, `.lib-section/-head/.lib-count :2458-2462`, `.title-transfers :2757-2759`, `.people-rows :3295-3296`,
`.party-invite-when :3136`. That's about 35 lines, left over from the pre-revamp library and activity screens.

### C. Components that do the same job but look different

**C1. Secondary buttons: 11 sizes and 5 recipes. Inconsistent.**

| class | height | fill / border | where |
|---|---|---|---|
| `.segmented button` | 34 (28/30/32 in `st-card-head :2970`, `load-head :2212`, `st-controls :2959`, `house-tabs :2956`) | none / pill | filters |
| `.browse-btn` | 36 | glass | header (phone) |
| `.news-btn` | 36 (33 wide on phones) | — | header |
| `.trailer-btn` | 38 | glass | title hero |
| `.chip`, `.head-btn`, `.rate-review`, `.thumb` | 40 | surface-2 + hairline / surface-1 + hairline-2 | everywhere |
| `.search-toggle` | 40 | velvet 55 % | header |
| `.retry` | 44 | surface-2 + hairline-2 | errors |
| `.btn-glass`, `.load-more` | 48 | white 16 % / surface-1 | billboard, grids |
| `.del-confirm/.del-cancel` | 50 | alert / seat, no border | delete sheet |
| `.action-btn` | 52 | bulb | title page |

Fix: one `.btn` with `--btn-h` sizes `sm 36 (desktop-only, pointer:fine) / md 44 / lg 52`, and variants `primary` (bulb), `secondary`
(surface-2 + hairline-2), `glass` (over pictures), `quiet` (text), `danger` (alert), `danger-quiet` (alert outline). `.chip` and
`.segmented` become `md` on coarse pointers. The old class names can stay as aliases during migration.

**C2. Bottom sheets: 4 implementations.**
- `.sheet` (`style.css:901`): `--r-lg` top corners, `--e3`, `--d-3 --ease-out`, handle.
- `.peek.is-sheet` (`:777`): `--r-lg`, 40 px slide.
- `.room` phone/tablet (`:3584`): `22px` literal, `0 -24px 60px rgba(0,0,0,.55)`, `room-up` keyframes, no handle.
- `.live-chat` (`:3849`): **20 px**, `0 -18px 50px`, `.26s cubic-bezier(.2,.8,.2,1)`, no handle.

Fix: a `.sheet-surface` primitive (radius, shadow `--e-up`, handle, enter motion, safe-area padding) that the 4 share.

**C3. The bulb ("one lit action per surface") is overused on the season page. Inconsistent.** In `crop-season.jpg` and
`shots-live/small/library-season--desktop--en.jpg`, one viewport shows a bulb-filled "Keep all 4 · 30 more days" pill, a bulb-filled round
play button on *every* episode row, and bulb-coloured "Keep 30 more days" links on every row. The film page adds a bulb "Keep 30 more
days" pill under the primary Resume. Fix: the episode play becomes `secondary` round (bulb only on the next-up episode), Keep all
becomes `secondary`, and the keep links use `--text-2` with a bulb hover. This repeats the old audit's "nothing stands out" in a new place.

**C4. Five focus idioms.**
1. Global outline bulb (`:134`).
2. `--ring` box-shadow: cards, vibe tiles, guide.
3. A 3–4 px `bulb-dim` halo: search, act-invite, password gate, note composer.
4. **Border-colour only**: `.sub-select :1855`, `.hex-input :2611`, `.dl-num :2820`, `.chat-form :3566`. A 1 px colour change fails
   WCAG 2.4.11 focus appearance.
5. **Background only**: `.row-menu-item :1126` (`surface-2`), `.cc-item :1752` (`white .09` on dark glass, about 1.2:1 change).
   Keyboard users in the player menus can't see where they are.

`pages.css:70` uses a *paper* outline. Fix: two idioms only, the outline for controls and the `--halo` + border for text fields, applied
through one `:focus-visible` mixin selector list.

**C5. The header row has three control heights and a mystery button. Ugly.** `crop-head.png`: Browse 36 px (`:345`), search 40 px (`:313`),
What's new 33×36 px (`:277`, `:364`). On phones with no news it shows only a small unlit bulb in a circle, with no label and no
obvious meaning. Fix: all header controls `md` 44 px. When there's nothing new, show What's new as an icon-only 44 px button
with a real icon (e.g. a sparkle/marquee), or move it into the avatar menu.

**C6. Disabled state: 9 opacities** (.3, .35, .4, .45, .5, .55, .6, .7, .85). Fix: `--disabled: .5` everywhere, `.6` for over-picture.

**C7. Danger actions: three unrelated recipes.** `.del-confirm` (alert fill + velvet text, `:1878`), `.del-confirm.del-secondary`
(alert outline, `:1879`), `.row-menu-item.is-danger` (alert text, `:1129`), and `.del-btn` (dust → alert on hover, `:1870`). That's fine as a
family, but name them `.btn.danger` / `.btn.danger-quiet` so new screens (Clips, Notes trash) reuse them.

### D. Touch targets under 44 px (measured on live phone scenes, 390×844)

| control | size | scene | file |
|---|---|---|---|
| billboard slide dots `.bb-bulb` | **22×22** ×6 | discover | `style.css:678` |
| season "Keep 30 more days" `.keep-btn` | 121×**20** | library-season | `:2476` |
| Continue ⋯ `.continue-more` | **32×32** | discover, library | `:2899` |
| seek bar hit area `.seek` / time `.pc-time` | 267×**28** / 33×28 | player | `:1280` |
| See all `.see-all` | 59×32 | discover rows, title | `:211` |
| Idea box kinds `.idea-kind` | 55–127×32 | settings | `:3925` |
| What's new `.news-btn` | **33**×36 | everywhere | `:277` |
| Browse `.browse-btn` | 93×36 | everywhere | `:345` |
| Trailer `.trailer-btn` | 98×38 | title | `:1013` |
| Watch together `.watch-start` | 39×38 | player | — |
| search toggle, thumbs, chips, rate-review | 40 | header, title | `:313`, `:3104`, `:174`, `reviews.css:5` |
| player buttons `.pc-btn` | 40×44 | player | — |
| idea send `.idea-send` | 91×38 | settings | — |

Fix: on `(pointer: coarse)`, give a 44 px minimum *hit area* without changing the look. Use a `::before { inset: -6px }` hit-slop on
dots, ⋯, keep links, see-all and seek (seek: a 44 px tall transparent track), and make `--btn-md` 44 for chips, thumbs and the
header. The billboard dots can be visual 8 px inside 44 px targets: there are only 6, and they fit.

### E. Hover on touch devices. Inconsistent.
115 `:hover` rules, only 11 inside `@media (hover: hover)`. On the iPhone PWA a tapped chip/icon-btn/load-more keeps its hover
background until the next tap elsewhere (`.chip:hover :183`, `.icon-btn:hover :195`, `.load-more:hover :224`, `.btn-glass:hover :171`,
`.see-all:hover :218`). Fix: wrap all hover-only colour changes in `@media (hover: hover)`, which is a mechanical change.

### F. Reduced motion
- Good: `style.css:2017` kills all animation and transition under `prefers-reduced-motion`. JS respects it for the billboard, peek
  and smooth scrolls (`billboard.js:18,72,87,175`, `peek.js:83`, `app.js:912,1967,7832,10080`).
- Dead code: the ~20 per-component guards (`:642`, `:1231`, `:1245`, `:1352`, `:1833`, `:2054`, `:2124`, `:2397`, `:2890`, `:3237`, `:3343`, `:3385`,
  `:3604`, `:3659`, `:3886`, `vibes.css:39,74`, `details.css:123`, `pages.css:98`) are now redundant. `:3180` is overridden:
  `.reaction-float { animation-duration: 1.2s }` loses to the global `animation:none !important`. So Watch Together reactions appear
  as static emoji sitting at the bottom of the reaction lane for their lifetime, instead of the intended short rise. Polish.
- Gap: loaders freeze (`spin :1454`, `chase :820`, `.bulb-loader`, `pn-sweep`). Reduced-motion users see a still spinner and can't tell
  "working" from "stuck". Fix: exempt loaders from the reset and give them a slow opacity pulse (`animation: bulb-breathe 2s`), which is
  allowed under reduced motion.

### G. Swedish
- Overflow and truncation probe on phone (title-show, title-film, library, library-film, library-season, picker, delete, travel, player,
  player-quality, settings): **no label overflow or truncation**. Only titles (by design) and episode overviews (line clamp) truncate.
  The old audit's "Download to phone in English" and the player row overflow are fixed (`sv-sheet.jpg`).
- Swedish runs long: +9 to +14 characters on short labels: "No TVs found" → "Inga TV-apparater hittades", "Add to library" →
  "Lägg till i biblioteket", "Move to trash" → "Flytta till papperskorgen", "Open remote" → "Öppna fjärrkontrollen". It
  fits now because buttons are flexible. The fixed-width risks are `.action-btn` (`min-width:150px` + ellipsis span `:2787`), `.quality-rail`
  (5 equal columns, already shrunk to 12 px at ≤359 px `:2725`), `.segmented` on 30 px variants, and `.idea-kind`.
- `<html lang>` is switched to `sv` (`i18n.js:43`), but no rule uses `hyphens: auto`. 30 Swedish words are ≥ 17 characters
  (`webbplatsinställningarna`, `Undertextförskjutning`, `Nedladdningskvalitet`). Fix: `:lang(sv) :is(h1,h2,h3,.set-label,.chip,
  .sheet-content p) { hyphens: auto; }`. Safari and Chrome both hyphenate Swedish.

### H. Old audit (`docs/design/audit.md`), re-checked
Fixed: self-hosted fonts and SVG favicon; desktop full-width layout; player phone row overflow; Swedish Download-to-phone strings;
`/signin` and share pages have Lilin's look (`pages.css`).
Partly fixed: "Segmented controls, selects and code inputs all look different". Segmented still comes in 6 heights (28–34 px) and inputs in
4 focus styles. "No hierarchy of light" has crept back on the season page (C3).

---

## 3. Cleanup plan

**Phase 0: the bugs (S, a day).** These are independent and safe:
1. `--on-bulb` by best contrast (`app.js:370`), and add accent checks to the custom-theme warning (A1).
2. Raise `--text-3` (A2).
3. `--ok/--info/--warn/--live` theme-aware tokens, replacing 9 literals (A3).
4. `--bulb` in the light-theme player block (A4).
5. Rename the avatar `--ring` to `--face-ring` (A6).
6. Hit-slop on the 8 small controls (D).
7. `@media (hover:hover)` wrap (E).
8. Loader exemption in reduced motion (F).
9. Delete the dead CSS (B11).

**Phase 1: tokens (S–M).** Add to `:root` (and move to `public/tokens.css`, imported by style.css and pages.css):
```css
--t-micro: clamp(11px, 10.5px + .1vw, 12px);  --t-caption: clamp(12px, 11.5px + .14vw, 14px);  --t-ui: clamp(14px, 13px + .2vw, 16px);
--w-regular: 400; --w-medium: 600; --w-bold: 700; --w-black: 800;     /* 500→400/600, 650→600/700, 750→700/800 */
--lh-tight: 1.15; --lh-snug: 1.3; --lh-body: 1.5;  --track-kicker: .12em;
--s1h: 6px; --s2h: 10px; --s3h: 14px;  --r-hair: 3px;
--ok; --info; --warn; --live;  --field-border;  --disabled: .5;
--glass-dark-strong: rgb(var(--picture-dark) / .86); --on-image-2; --on-image-line;
--glow-sm; --halo; --e-up;  --press: .96; --press-round: .92;
--z-raise … --z-gate (B7);  --btn-sm: 36px; --btn-md: 44px; --btn-lg: 52px;
```
Then codemod literal → token in place. This is mostly mechanical, one property family per commit. Snap rules: font sizes as in B1,
spacing B2, radii B4, durations B6. Screenshot every scene before/after with `tools/ui-shots` (`--theme lilin,paper,ember`). Half-pixel
snaps move things by ≤ 1 px, so contact-sheet diffs should be quiet. Anything louder is a real regression.

**Phase 2: components (M).**
1. `.btn` family with size × variant (C1). Old names (`.play-btn`, `.chip`, `.head-btn`, `.retry`, `.load-more`, `.del-*`) stay as aliases
   until the JS is migrated.
2. `.sheet-surface` primitive for sheet, peek, room and live-chat (C2).
3. Two focus idioms (C4).
4. Header controls at 44 (C5).
5. Season-page light hierarchy (C3).

**Phase 3: keep it clean (S).** Put the audit scripts into `tools/css-audit.mjs` (Node, no dependencies). Count literal colours, off-scale
font sizes/radii/spacing, z-index values and breakpoints outside `:root`/`tokens.css`. Commit the current numbers as a budget
(`tools/css-audit.budget.json`) and have CI fail when a number goes *up*. This is the cheapest way to stop drift coming back with every new feature.
Add the patched probes to `shoot.mjs` proper: `--probe targets` (controls under 44 px) and `--probe truncation`.

---

## Ideas

1. **Text size setting (Appearance → "Text size: Normal / Large / Larger").**
   - Pitch: one slider that scales every `--t-*` and `--btn-*` token through a `--ui-scale` multiplier.
   - Who: Pappa, Anita and the parents on the TV, plus anyone on a phone at arm's length in bed.
   - Why Lilin: the family audience is explicit in the brief, and the fluid type tokens already exist. Phase 1 (B1) makes it a ~20-line change.
   - Effort: S after Phase 1 (M before).
   - Exists? No. Appearance only has colour themes.

2. **Auto theme: follow the device or the clock.**
   - Pitch: an "Automatic" swatch that uses Paper/Daylight when the OS is light (`prefers-color-scheme`) and the chosen dark theme
     otherwise, or by sunset.
   - Who: daytime phone users who now pick Paper and are then blinded at night.
   - Why Lilin: the light themes and the `data-scheme` switch are already in place, and `index.html` already paints the cached theme before load.
   - Effort: S.
   - Exists? No. There are 9 fixed presets plus custom.

3. **Contrast guard for every theme, built in.**
   - Pitch: the theme engine computes `--on-bulb`, `--text-3` and status colours *per theme* to hit 4.5:1, and the custom-theme editor
     shows live pass/fail chips for "Buttons", "Captions" and "Links" instead of one text warning.
   - Who: everyone who picks Ember or Synthwave today (A1), and ebi or Oliver when they make a custom theme.
   - Why Lilin: the custom theme editor and the `luminance()` helper already exist (`app.js:347`).
   - Effort: S.
   - Exists? Partly: a text/bg warning only (`app.js:7665`).

4. **Owner-only living style guide (`/preview` or a Settings → Labs page) + a ui-shots scene.**
   - Pitch: every button size/variant, chip, segmented, sheet, card, badge, toast and focus state on one page, switchable through the 9
     themes and EN/SV. A new `styleguide` scene screenshots it per theme into a contact sheet.
   - Who: Oliver and the agents building features. New screens copy from it instead of inventing a 12th button.
   - Why Lilin: the preview dir and the ui-shots harness exist, and the drift found here is exactly what a reference page prevents.
   - Effort: M.
   - Exists? No. The closest are `e2e-preview` and `docs/design/revamp.md`, which is prose.

5. **CSS drift budget in CI** (Phase 3 as a feature).
   - Pitch: `npm`-free `tools/css-audit.mjs` that prints the table in §1 and fails a PR that adds literal colours or off-scale sizes.
   - Who: the agent fleet. Most CSS is now written by agents in parallel, which is how 42 font sizes happened.
   - Why Lilin: CI already exists on the repo, and the scripts already exist in scratch.
   - Effort: S.
   - Exists? No.

6. **The TV app follows your theme.**
   - Pitch: the Samsung/Android TV apps read the signed-in person's Appearance theme (same 9 base colours) instead of the hard-coded Lilin
     palette in `tv/tv.css:10`.
   - Who: the parents (Samsung TV) and anyone who set Midnight/Forest on their phone and expects the same room on the TV.
   - Why Lilin: the themes are 9 colours and everything is mixed from them by design, so the TV CSS only needs those 9 variables set at pairing.
   - Effort: S–M.
   - Exists? No.

7. **High-visibility focus mode for TVs and keyboards.**
   - Pitch: at ≥ 1600 px, or when the last input was a D-pad/keyboard, swap the 2–3 px outline for a thick bulb frame plus a slight lift
     on every focusable thing (one idiom, C4).
   - Who: anyone using the web UI on a TV browser or a keyboard, and the parents reading from the sofa.
   - Why Lilin: the revamp promised "focus rings thicker so a remote's D-pad focus is easy to follow"; today it's only 3 px (`style.css:2010`) and inconsistent.
   - Effort: S.
   - Exists? Partly.
