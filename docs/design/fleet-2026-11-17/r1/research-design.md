# Media UI state of the art (2025–2026), applied to Lilin

Design research, round 1. I read the brief, `docs/design/revamp.md`, and the live screenshots (Discover, rows, peek,
title page, Moods, Browse sheet on phone/desktop/tv sizes), then checked the code where a pattern touches Lilin
(`public/`, `public/tv/`). Lilin already does more than most streaming apps: a colour wash per title, logo art,
peek cards, VT cross-fades, skeletons, reduced-motion handling, Firefox no-glass, subtitle size/look/position,
iOS PiP, Play on TV remote. The gaps below are what's left once you compare it with 2025–2026 work from
Apple, Google, Netflix and the specialist film apps.

---

## 1. Findings from the field (with sources)

### 1.1 Apple: Liquid Glass, tvOS 26, HIG for media
- **Liquid Glass goes on the control layer only.** HIG Materials: Liquid Glass forms "a distinct functional layer for
  controls and navigation… that floats above the content layer"; "Don't use Liquid Glass in the content layer";
  "Use Liquid Glass effects sparingly". Use the *clear* variant only over rich media, and **"if the underlying content
  is bright, consider adding a dark dimming layer of 35% opacity"**. On tvOS, buttons and image views "adopt Liquid
  Glass when they gain focus". https://developer.apple.com/design/human-interface-guidelines/materials
  → **Lilin:** revamp.md already limits glass to the header, tab bar and menus ("only on small fixed areas"). That
  matches. What's missing is Apple's *conditional dimming*: Lilin's scrims are fixed gradients and don't react to how
  bright the art is (see Idea 9).
- **Legibility backlash.** NN/g's Oct 2025 piece "Liquid Glass Is Cracked, and Usability Suffers in iOS 26" called the
  UI less legible and less predictable. Apple made Reduce Transparency stronger in later betas.
  https://anderegg.ca/2025/10/12/nielsen-norman-group-on-ios-26-usability ·
  https://uxdesign.cc/did-apple-abandoned-its-own-design-heuristics-accessibility-principles-2d616ed7ace5
  → Glass should be an enhancement that the system's accessibility settings can turn off (Lilin only does this for
  Firefox, keyed on the user agent).
- **Apple TV app (iOS 26 / tvOS 26):** vertical, "theatrical" poster art throughout, more titles on screen at once,
  and transparent glass player controls that float over the video.
  https://9to5mac.com/2025/07/16/apples-tv-app-gets-fresh-design-in-ios-26-and-tvos-26-heres-whats-new/ ·
  https://www.apple.com/newsroom/2025/06/apple-tv-brings-a-beautiful-redesign-and-enhanced-home-entertainment-experience/ ·
  https://www.techradar.com/televisions/the-5-new-apple-tv-4k-features-coming-in-tvos-26-you-need-to-know-about
  → Lilin already uses 2:3 posters, so this is just confirmation.
- **HIG, Playing video:** keep the original aspect ratio; "Avoid asking people if they want to resume playback… do so
  automatically"; if loading takes >2 s show "a black loading screen with a centered activity spinner and no
  surrounding content"; when playback ends, show the detail page for what was just watched with a resume option;
  Space toggles play; on TV, "some devices are prone to image retention… prefer translucent graphics in SDR to bright,
  opaque content"; interactive overlays need a ≥0.5 s pause first and a clear way to dismiss.
  https://developer.apple.com/design/human-interface-guidelines/playing-video
- **HIG, Focus (tvOS):** five distinct states (unfocused, focused, highlighted/pressed, selected, unavailable). Focus
  works by "elevation to the foreground, illumination, and animation", and "Avoid changing focus without people's
  interaction". https://developer.apple.com/design/human-interface-guidelines/focus-and-selection
  → Lilin's TV `.focus` is scale 1.06 + gold ring + glow (`public/tv/tv.css:84`), which is good. It has no separate
  **pressed/highlighted** state: Amazon also asks for "briefly change to a selected state" when Select is pressed (§1.10).

### 1.2 Google: Material 3 Expressive (I/O 2025, Android 16 QPR1)
- Built on 46 studies with 18k+ participants. Reported results: key elements spotted up to 4× faster, and users 45+
  performed on par with younger users thanks to bigger targets and high-contrast containment. Treat these as press
  figures, since the blog post was pulled.
  https://www.androidcentral.com/apps-software/android-os/google-leaked-its-own-design-process-for-material-3-expressive ·
  https://chromeunboxed.com/google-leaks-the-reason-and-process-behind-their-new-material-3-expressive-design-language/
- **Motion = springs**, split into *spatial* (position/size, may overshoot) and *effects* (colour/opacity, never
  overshoot), each in fast/default/slow. Effects use damping 1 at stiffness 3800/1600/800. Standard spatial springs are
  damping 0.9 at stiffness 1400/700/300. Expressive spatial springs are bouncier (around 0.6–0.8 damping); community docs
  disagree on the exact values.
  https://raw.githubusercontent.com/material-components/material-components-android/master/docs/theming/Motion.md ·
  https://pub.dev/documentation/m3e_slider/0.0.2/common_m3e_common/M3EMotion-class.html ·
  https://www.androidauthority.com/google-material-3-expressive-features-changes-availability-supported-devices-3556392/
  → **Lilin:** `--ease-pop: cubic-bezier(.34,1.4,.64,1)` is a one-overshoot imitation of a spring. CSS `linear()`
  (Chrome/Edge 113, Firefox 112, Safari 17.2) can encode a real spring curve, and it's still just an easing string
  (https://developer.chrome.com/docs/css-ui/css-linear-easing-function). The useful idea from M3E is the split: only
  *spatial* things (bulbs, cards lifting, sheets landing) get overshoot; colour/opacity never do. That also fits
  revamp.md's "a curtain, not a slot machine".

### 1.3 Netflix
- **TV homepage, rolled out globally from 19 May 2025.** The nav moved from a left rail to an always-visible top bar
  (Search, Shows, Movies, Games, My Netflix). Rows refresh in real time as you browse. Focused tiles **expand in place**
  into a box with synopsis, year, genre and badges ("Top 10 for 13 weeks", "highly rewatched"). "My Netflix" collects
  Continue Watching, My List and Remind Me.
  https://www.netflix.com/tudum/articles/netflix-new-tv-layout ·
  https://www.engadget.com/entertainment/streaming/netflix-overhauls-its-tv-app-with-a-fresh-ui-and-responsive-recommendations-121511958.html ·
  https://bgr.com/entertainment/netflix-just-got-its-biggest-redesign-in-years-heres-what-it-looks-like/ ·
  https://www.iphoneincanada.ca/2024/06/07/netflix-tv-app-new-dynamic-tiles/
  → Lilin web already has the *peek* card (desktop hover / phone long-press), and the TV hero updates with focus. The
  piece Lilin doesn't use is the **evidence badge** ("Top 10 for 13 weeks"). Lilin has its own social signal for this
  (likes, "2 people watched", friends), and it's richer than Netflix's (Idea 6).
- **Mobile "Clips" vertical feed (30 Apr 2026).** Tabs are now Home / Clips / Search / My Netflix. Clips are 30–60 s+
  vertical scenes with Watch / My List / Share. An earlier version was "Fast Laughs".
  https://www.whats-on-netflix.com/news/netflix-mobile-updates-clips-new-navigation/ ·
  https://www.neowin.net/news/netflix-rolls-out-vertical-video-feed-for-mobile-users/
  → Lilin's **Moments** (user-cut clips sent to friends, 2026-11-17) is the social half of this. There's no feed yet (Idea 7).
- **Netflix timed-text guide:** 42 characters per line max, 2 lines, and 17 cps (adult) in most language guides.
  https://backlothelp.netflix.com/hc/en-us/articles/219375728 ·
  https://backlothelp.netflix.com/hc/en-us/articles/215600497-Portuguese-Brazil-Timed-Text-Style-Guide

### 1.4 Prime Video
- Top content bar (Home, Movies, TV Shows, Sports, Live TV), a hero rotator whose content follows the selected
  section, autoplaying hero video on living-room devices, new animations, and a Top 10 row.
  https://www.engadget.com/prime-video-gets-a-much-needed-ui-overhaul-with-a-new-content-bar-and-ai-recommendations-120019397.html ·
  https://www.creativebloq.com/news/amazon-prime-redesign
  → Lilin's billboard already follows the All/Films/Shows/Documentaries chips (screenshot `discover-films`).

### 1.5 Film-culture apps: MUBI, Criterion Channel, Letterboxd
- **MUBI:** black/white alternating canvases, "film stills supply the only colour", one typeface (Riforma), light
  weights, and a fixed symbol while colour changes per film.
  https://www.shadcn.io/design/mubi/raw · https://the-brandidentity.com/feed/mubi-by-spin/
  → Lilin's per-title `--wash` is the same idea, warmer.
- **Criterion Channel:** curated collections ("Starring Toshiro Mifune", "New York Stories"), each with a written
  editorial introduction, plus 2024's linear "24/7" channel.
  https://desirabilitylab.com/backfill/backfill-2025-266-criterion-channel-app ·
  https://gizmodo.com/criterion-channel-adds-a-curated-tv-like-experience-to-1851401235 ·
  https://fyc.nextbestpicture.net/one-week-with-the-criterion-channel
  → Lilin's **Moods** (with a one-line blurb) and **SEELE TV channels** cover this already. The missing piece is
  *people-written* collections (Idea 8).
- **Letterboxd:** dark slate UI, a diary laid out as a chronological poster grid (date + stars + rewatch), stars in a
  bright accent right above the review box, and short reviews encouraged. Its UI is shared as screenshots a lot.
  https://ixd.prattsi.org/2026/09/design-critique-letterboxd-ios-app/ ·
  https://www.wix.com/studio/blog/letterboxd-ui-is-changing-movie-reviews
  → Lilin has Reviews (1–5 stars, spoilers), likes, Wrapped. There's no **diary** view yet (Idea 10).

### 1.6 Type and colour for dark media UIs
- Material dark theme: don't use pure black (#121212 base), desaturate accents so they keep ≥4.5:1, and make higher
  surfaces lighter. https://m2.material.io/design/color/dark-theme
- Halation: light text on dark reads heavier, so pull back a little (variable weight down, +0.01–0.03 em tracking,
  +5–10 % line-height). Adobe has an explanation; the numbers are rules of thumb.
  https://adobe.design/ideas/keeping-type-consistent-in-changing-conditions ·
  https://nerdy.dev/adjust-perceived-typepace-weight-for-dark-mode-without-layout-shift
  → Lilin uses system body + Bricolage display. The body is the OS font, so tracking is the only lever there. Bricolage
  is variable (`font-weight 200 800`, `font-stretch 75–100%`), so display weight could drop around 30 units on dark
  themes at no cost. Low priority.
- Safari 26: the tab-bar tint comes from the **html/body background**, and `theme-color` is reportedly ignored.
  https://developer.apple.com/forums/thread/801239 ·
  https://benfrain.com/ios26-safari-theme-color-tab-tinting-with-fixed-position-elements/
  → Lilin is fine: `html { background: var(--velvet) }` (`style.css:114`) follows the theme. No action.
- New colour/CSS in Safari 26: `contrast-color()`, `progress()`, `text-wrap: pretty`, anchor positioning,
  scroll-driven animations, `dynamic-range-limit`. https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
  Interop 2026 includes cross-document VT, scroll-driven animations, contrast-color, anchor positioning, `shape()`,
  `:playing`, and WebVTT (as an investigation). https://hacks.mozilla.org/2026/02/launching-interop-2026/

### 1.7 Motion on the web
- **View Transitions (same-document)** work in Chrome/Edge 111, Safari 18 and **Firefox 144 (Oct 2025)**, so they are
  Baseline now. `view-transition-class` and `match-element` are in Chrome 137 and Safari 18.4.
  `document.activeViewTransition` is Chrome 142 / Safari 26.2 / Firefox 147. Nested groups and scoped transitions are
  Chrome-only. https://developer.chrome.com/blog/view-transitions-in-2025 · https://caniuse.com/cross-document-view-transitions
  → Lilin uses VT only for a `main` cross-fade (`style.css:782-785`, `app.js:10080-10112`). Since every target browser
  supports VT now, **poster → title page shared-element morphs** are possible (Idea 1).
- **Scroll-driven animations:** Chrome 115 and Safari 26 (Sept 2025). Firefox has them behind a flag. They're in
  Interop 2026. https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/ ·
  https://developer.chrome.com/docs/css-ui/scroll-driven-animations
  → Lilin toggles `html.scrolled` from a rAF scroll listener (`app.js:10105`) and runs a billboard scroll listener
  (`billboard.js:176`). Both could move to the compositor (Idea 12).

### 1.8 Player UX and captions
- **FCC 47 CFR 79.103(c)**: users can change caption **colour** (8+ colours), **text opacity**, **size 50 %–200 %**,
  **font** (8 styles), **background colour + opacity** (opaque/semi/transparent), **edge** (none, raised, depressed,
  uniform, drop shadow) and **window colour**, with a **preview**, and settings persist. Under 79.103(e) settings must
  be "readily accessible" (proximity, discoverability, previewability, persistence).
  https://www.customsmobile.com/regulations/47/79.103 · https://www.fcc.gov/node/212200
- WCAG doesn't set formatting rules. Industry practice is 32–42 characters per line, 2 lines, ~15–20 cps, and a solid or
  semi-opaque box. https://www.3playmedia.com/blog/closed-caption-styling-formatting-best-practices-you-need-to-know/ ·
  https://www.unimelb.edu.au/accessibility/video-captioning/style-guide
- Ambient glow behind the player (YouTube): sample the frame at very low resolution and blur it behind the video.
  https://www.smashingmagazine.com/2023/07/recreating-youtube-ambient-mode-glow-effect/

### 1.9 iOS Home Screen web apps in 2026 (firt.dev, updated 13 Oct 2026)
- Web Push (16.4+, installed only), **Declarative Web Push** (18.4, no service worker needed), **App Badging** (16.4,
  installed + notification permission), **Screen Wake Lock** (18.4 for installed apps), Media Session (15+), Web Share,
  Screen Orientation API (partial). iOS 26: every site added to the Home Screen opens as a web app, and SVG icons
  work. Not supported: share target, background sync/fetch, install prompt, `fullscreen` display mode, and **element
  fullscreen on iPhone** (video only; WWDC26/Safari 27 had nothing). https://firt.dev/notes/pwa-ios/ ·
  https://bugs.webkit.org/show_bug.cgi?id=206854
- Media Session artwork on iOS has been unreliable: iOS uses the first artwork entry only, and it also shows blurred
  in Control Center. https://dbushell.com/2023/03/20/ios-pwa-media-session-api/ · https://web.dev/articles/media-session

### 1.10 10-foot UI
- Margins: Google uses 5 % (48 × 27 dp on a 960 × 540 canvas, so about 96 × 54 px at 1080p). Apple uses 60 pt
  top/bottom and 80 pt sides. Let background art bleed past the safe area.
  https://developer.android.com/design/ui/tv/guides/styles/layouts ·
  https://www.smashingmagazine.com/2025/09/designing-tv-principles-patterns-practical-guidance/
- Type: Amazon says body ≥14 sp, **about 28 px at 1080p**. Smashing says start at 24 px, keep a 5–6 step scale, and
  "when in doubt, go larger". Avoid pure-white fields. TVs boost saturation, so use **less saturated colours** and keep
  high contrast for focus. Pressing Select should show a brief selected state.
  https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html
- Text entry costs about 38 presses on a remote vs about 9 on a phone, so use the phone as the keyboard (Smashing,
  above). Lilin's pairing already uses the phone; TV search uses an on-screen keyboard.

### 1.11 Performance-friendly effects
- `backdrop-filter` over scrolling content or moving video is the classic jank source in Firefox. There are open
  bugs where the whole screen gets invalidated on every scroll, and without a GPU it's much worse.
  https://bugzilla.mozilla.org/show_bug.cgi?id=1732817 · https://bugzilla.mozilla.org/show_bug.cgi?id=1988728
  → Lilin's Firefox `no-glass` (`index.html:19-20`, `style.css:126-128`) is the right call.
- `prefers-reduced-transparency`: Chrome/Edge 118+ only, not Baseline.
  https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency
- Tizen: animate only `transform`/`opacity` on their own layers. Scale animations with accelerated 2D canvas have
  frozen apps. https://docs.tizen.org/application/web/guides/w3c/perf-opt/performance-guide ·
  https://forum.developer.samsung.com/t/tizen-web-app-css-transitions-transforms-lag-after-opening-and-closing-another-app/14046
  → `tv.css:1-4` already enforces this (Chrome 69, no blur, transform/opacity only).

---

## 2. Gaps found in Lilin (compared with the above)

| # | Where | What's wrong | Why it matters | Fix | Severity |
|---|---|---|---|---|---|
| G1 | Web player, `public/app.js:6737` (only `mediaSession` use) | No `MediaMetadata` (title, show/episode, artwork) and no play/pause/seek/next-track handlers. The only one is `enterpictureinpicture`. | iPhone lock screen, Control Center, AirPods, Android notification, Chrome's media hub and keyboard media keys show the page title or nothing, and "next" does nothing. Every native streaming app fills these. | On play: `navigator.mediaSession.metadata = new MediaMetadata({title, artist: show + ' · S1E2', album: 'Lilin', artwork:[{src: w300 still/poster, sizes, type}]})`. Add handlers for play, pause, seekbackward/forward (10 s), seekto, nexttrack (= Up next), and `setPositionState` on timeupdate (throttled). Put the largest artwork **first** (iOS uses entry 0). | broken (missing platform integration) |
| G2 | Phone TV remote (Play on TV), whats-new `2026-11-05-tv-skip-next`: "Keep the remote open… a locked phone can't start the next one" | No Screen Wake Lock anywhere (`grep wakeLock` → 0). | The countdown and Skip intro on the phone remote die when the phone auto-locks. Wake Lock works in installed iOS apps since 18.4 and in Chrome/Firefox. | `navigator.wakeLock?.request('screen')` while the remote sheet is open and the TV is playing; re-acquire on `visibilitychange`; release on close. | polish (but fixes a documented limitation) |
| G3 | TV app subtitles, `public/tv/tv.css:131-132` | Fixed 52 px bold white with a text shadow. No size, box or position choice on TV. (Web has S/M/L/XL, box/shadow/outline, low/mid/high in `player-comfort.js:7-11`, stored per device in localStorage.) | Family on the Samsung TV (the people who most need bigger or boxed captions) can't change them. FCC 79.103 treats size/background/edge as baseline, and a shadow-only caption fails over bright snow or white shirts. | Add a Subtitles look menu to the TV OSD (Right → subtitles already exists): Size 75/100/125/150 %, Background None/Shadow/Box 60 %/Box 100 %, Position Low/High, with a **live preview line** behind the menu. Store per TV. | inconsistent |
| G4 | Web caption options, `public/player-comfort.js:7-11` | Size range 80–155 % (FCC: 50–200 %). No text colour (yellow is a common low-vision pick), no background opacity, no font choice, edges only shadow/outline. No preview line when nothing is being spoken. | Accessibility parity with every TV and streaming app; ebi and family watch with subs a lot (AI subs, translations). | Extend `subLook`: `color` (white, yellow, cyan, green), `boxOpacity` (0/50/75/100), `font` (system / serif / mono / a high-legibility face like Atkinson Hyperlegible, self-hosted), sizes 0.6–2.0. Show a sample cue ("This is how subtitles look") while the menu is open. | polish |
| G5 | TV app secondary text, `public/tv/tv.css:143,157,173,208,229,295,333,335,338,352,362` | 20–22 px labels (tile subtitles 21 px, guide times/shows 20 px, menu heads, hints) on the fixed 1920 × 1080 canvas. | Below Amazon's ~28 px floor and Smashing's 24 px start; parents read from the sofa. Uppercase + letter-spacing at 22 px makes it worse. | Raise the floor to 24 px (hints/kickers) and 26 px (anything with information: guide show names, tile subs). Shorten text instead of shrinking it. | polish |
| G6 | `index.html:19-20`, `style.css:126-128` | Glass is removed only for Firefox (UA sniff). There's no `@media (prefers-reduced-transparency: reduce)` or `(prefers-contrast: more)` path. | iOS/macOS "Reduce Transparency" and "Increase Contrast" are what low-vision users turn on. Apple made those settings stronger after the Liquid Glass criticism. | Reuse the `.no-glass` rules: add `@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { … }` with the same solid tinted panels. Under `prefers-contrast: more` also raise `--text-2`/`--text-3` toward paper. | polish |
| G7 | TV focus, `public/tv/tv.css:84` etc. | Focus covers unfocused vs focused, but there's no *pressed* state. Select gives no visual acknowledgement until the next screen draws, and the Tizen TV is slow. | Apple and Amazon both ask for a brief "selected" flash. On a slow TV CPU, the missing ack leads to double presses. | On keydown Enter: add `.press` (scale .97 + ring brightens) for 120 ms, transform/opacity only. | polish |
| G8 | Billboard, `public/billboard.js:2-3, 87-95` | Auto-advance (9 s) pauses on mouse hover or focus only. Wide touch screens (iPad landscape ≥ 900 px) have neither, and there's no visible pause control. | WCAG 2.2.2 Pause, Stop, Hide (auto-moving content > 5 s needs a pause mechanism). https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html | Pause on any `pointerdown` inside the billboard, and make the bulb row a real control (pressing the current bulb toggles pause; `aria-label`). | polish |

Checked and fine (no action): Safari 26 tab tint (html background follows theme); `text-wrap: balance` on headings
(`style.css:138`) and `pretty` on cues (`style.css:1472`); `content-visibility` on shelves (`style.css:746`); TV safe
margin 96 px = 5 % (`tv.css:11`); TV focus scale 1.06 + gold ring + glow matches platform practice.

---

## 3. Ideas

Each idea lists: the pitch · who it's for · why it fits Lilin · effort · whether something like it already exists.

1. **Poster → title page morph (shared-element View Transition).** When you open a title, the tapped poster grows into
   the title page's backdrop/logo slot, and closing reverses it. Give the poster `view-transition-name: hero` right
   before `startViewTransition`, give the page's art the same name, and style
   `::view-transition-group(hero) { animation-duration: var(--d-3); animation-timing-function: var(--ease-out) }`.
   It's skipped under reduced motion (Lilin already checks). Who: everyone; it's the most-repeated action in the app.
   Why Lilin: VT is Baseline since Firefox 144, so Firefox users get it too, and revamp.md's "curtain" motion already
   expects it. Cost: about 40 lines JS/CSS, and one GPU snapshot per open, which is cheap. Watch the 2:3 → 16:9 aspect
   change: crossfade `::view-transition-old/new(hero)` with `object-fit: cover`. **M.** Exists: only the `main`
   cross-fade.
2. **Lock-screen and headphone controls (G1).** Title + episode + poster on the iPhone lock screen and Control Center,
   AirPods double-tap = next episode, keyboard media keys on desktop. Who: phone watchers in bed, desktop users.
   Why Lilin: the iPhone PWA is a main client, and nothing else makes it feel this native. **S.** Exists: only the PiP
   handler.
3. **Caption studio (G3 + G4).** One "Subtitles look" sheet shared by web and TV: size 60–200 %, colour, box opacity,
   font (incl. a high-legibility face), edge, position, a live sample, and "Reset". Saved per device (as now) and
   offered to the account, so the Samsung TV can start from the same choice. Who: Pappa/Anita on the TV, ebi with AI
   subs. Why Lilin: Lilin renders its own cues (`.sub-cue`), so every option is just CSS on a span. Effort is mainly the
   TV menu. **M.** Exists: web size/box/position only; TV has nothing.
4. **Remote stays awake (G2).** Wake Lock while the phone remote controls a playing TV, so Skip intro and the Next-episode
   countdown keep working. Show a small "Screen stays on while the TV plays" line, plus an off switch in Settings.
   Who: anyone casting. Why Lilin: it fixes the limitation that whats-new itself documents. **S.** Exists: no.
5. **Home Screen badge.** `navigator.setAppBadge(n)` for "new episodes of shows you follow + downloads ready since
   you last opened", cleared on open (`clearAppBadge`). It can also be set from the push handler, and Declarative Web
   Push on iOS 18.4+ carries `app_badge`. Who: iPhone users with notifications on. Why Lilin: notifications
   (library-only, per kind) are already built, and the badge is a quieter version of them. **S.** Exists: no.
6. **Evidence chips on cards and peek.** Netflix-style "why this" chips drawn from Lilin's own data instead of an
   algorithm: "ebi loved it", "3 friends watched", "New episode Fri", "On server in 4K", "Finished by 2 people". At most one
   chip per card (revamp rule: one status badge), and the peek card shows two or three. Who: browsing family/friends.
   Why Lilin: a small, known audience makes social proof meaningful in a way Netflix's Top 10 can't be. **S–M.**
   Exists: avatar likes under posters and "2 people watched" in Popular on Lilin (screenshot `discover-rows`). This idea
   extends that to every row and the peek.
7. **Moments reel (vertical feed, phones).** Netflix Clips, but made of Lilin Moments that friends cut and shared, plus
   the opening minutes of new arrivals. Full-screen vertical scroll-snap, muted autoplay of the visible clip only,
   with Watch / Add / Send buttons. Who: Oliver, ebi, friends on phones. Why Lilin: Moments exist, but they're buried in
   Settings → Moments. A feed makes them a habit and turns every Moment into a pointer to the full title. Cost:
   the server already has the clips; the UI is one scroll-snap page and one `IntersectionObserver` that plays one video
   at a time. Respect Save-Data and reduced motion. **M.** Exists: Moments (send/receive), no feed. Don't use YouTube
   trailers for this: embeds are heavy and Lilin had to fight their quality before.
8. **"Presented by" collections (Criterion-style).** Owners (and invited friends) can write a collection: a title, a
   3–4 sentence introduction, an ordered list, and a cover built from the first four posters. It shows as a Moods-style
   tile with the author's face. Who: Oliver/ebi curating for family ("Pappa's Sunday westerns"). Why Lilin: Lilin is a
   house cinema run by people, and the audit/revamp direction ("picture palace") fits editorial programming. Moods
   proves the tile and page layout already work. **M.** Exists: Moods (agent-curated), Save for later, Reviews. Nothing
   person-curated.
9. **Smart scrim (Apple's 35 % rule).** Lilin already reads a 32 px canvas of each backdrop for `--wash`. Also compute
   the mean luminance of the region under the text (bottom-left third). If it's bright, deepen `--scrim-*` up to +35 %;
   if it's dark, lighten it so more picture shows. Apply the same check to **TMDB logo art**: if the logo's contrast
   against the sampled backdrop is under ~3:1 (e.g. The Odyssey's blue-grey logo on a dark scene in the live
   `discover--desktop` shot), add a soft dark halo or render it white with `filter: brightness(0) invert(1)`, as Apple
   TV does. Who: everyone; it's the first thing on screen. Why Lilin: it's built on the existing sampling, so there's
   no new request. **S.** Exists: colour wash only.
10. **Diary (Letterboxd-style).** A "Diary" view in Library: month headers, poster grid with the date watched, your
    stars, a rewatch mark, and a "with ebi" face when it was Watch Together. Tapping a poster opens your review.
    Who: Oliver and ebi, who watch a lot together. Why Lilin: the data is already there (watch history for Wrapped,
    Reviews, Watch Together rooms). Wrapped shows it once a year; a diary shows it all year. **M.** Exists: Wrapped,
    Reviews, Continue watching. No chronological log.
11. **Ambient glow in windowed playback.** On desktop and TV-size web, when the video doesn't fill the window
    (letterboxed 2.39:1 films, or the Watch Together docked layout), sample the frame into a 16 × 9 canvas every 500 ms
    and cross-fade it, blurred, behind the video. YouTube's Ambient mode, tuned to Lilin's dim house lights. Stops
    paused, off in fullscreen, Firefox and reduced motion, and switchable under Player comfort. Who: desktop watchers.
    Why Lilin: it extends the title-page wash into the player. **S–M.** Cost: one `drawImage` per 500 ms (negligible),
    but test with HDR/DV copies, where canvas readback can be slow.
12. **Scroll effects on the compositor.** Replace the `html.scrolled` rAF listener (`app.js:10105`) and the billboard
    page-scroll listener (`billboard.js:176`) with `animation-timeline: scroll()`: header glass fades in over the
    first 24 px, and the billboard art dims and drifts on scroll (no parallax on phones, per revamp). Wrap it in
    `@supports (animation-timeline: scroll())` and keep the JS path for Firefox. Who: everyone, mainly Safari 26 and
    Chrome. Why Lilin: it removes main-thread work during the scrolls that already got a "Smoother scrolling" fix.
    **S.** Exists: JS versions.
13. **Real springs.** Swap `--ease-pop` for a `linear()` spring (e.g. a damping 0.6 / stiffness 800 curve generated
    once), used only for spatial "arrivals": bulbs lighting, the new-episode dot, a card landing in My library. Keep
    `--ease-out` for everything else, and never bounce colour/opacity (M3E split). Who: everyone. Why Lilin: the
    bulbs are Lilin's signature, and a real spring makes them feel physical. **S** (one token).
14. **Pressed state + long-press on TV (G7 + Smashing).** A 120 ms press flash on Select. Holding Select on a card
    opens a context menu (Add / Save / Mark watched / Play from start), like long-press in Prime Video. Who: family on
    the TV. Why Lilin: those actions currently need the title page, which is several presses away. **S–M.** Exists: no.
15. **Contrast and transparency settings respected (G6).** **S.** Covered above.
16. **TV readable type pass (G5).** **S.** Covered above.

Skipped on purpose: a full Liquid Glass look (wrong fit for the "velvet room" direction and costly on Firefox/Tizen), and
element fullscreen on iPhone (still video-only in 2026; Lilin's Add-to-Home-Screen route is the right workaround).
