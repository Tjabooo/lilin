# Competitor research: what the big players changed in 2025–2026, and what Lilin should take

Round 1, product research. I read the sources below on 2026-11-17 and checked them against Lilin's `whats-new.json`
(158 entries) and the code (`public/app.js`, `public/tv/tv.js`, `public/details.js`, `src/credits.js`) so I don't
re-propose things Lilin already has. Many sources are press coverage and forum threads; where a claim rests on one
outlet or on vendor marketing, I say so.

## 0. TL;DR

- **The industry spent 2025–26 on four things:** (1) bigger, "more context" TV home screens: Netflix in May 2025, Plex's
  New Experience, tvOS 26 poster art. (2) Vertical short-clip feeds on phones: Netflix Clips (Apr 2026), Disney+ Verts
  (Mar 2026), HBO Max Shorts (Jul 2026). (3) AI discovery and recaps: Prime X-Ray/Video Recaps, Ask HBO Max, Netflix AI
  search, YouTube "Ask" on TVs. (4) Social layers: Plex Lists/Discussions/Reactions/Match Score (Jun 2026).
- **What users hated, every time:** losing density and clicks (Netflix and Plex TV redesigns), forced promo rows they
  can't hide (Plex Discover/On-Demand/Live TV), offline downloads regressing (Plex mobile rewrite), and social
  features on by default (Plex "Discover Together" emails).
- **What users praised:** a sharp player and title pages that pull everything in (Infuse extras/skip on the title page,
  Channels 7 "browse by cast/franchise"), a home screen they can edit (Emby 4.10 section editor, Channels Personal
  Sections, Infuse Favorites), real per-person profiles on shared TVs (Infuse 8.2, tvOS 26 profile-on-wake), and
  community skip data (TheIntroDB/IntroDB covering intro, recap, credits and preview).
- **Lilin is already ahead** on: watch-while-downloading, Watch Together with chat and faces, Wrapped, Moments (Netflix's
  feature, but with friends), Moods (≈ Prime "AI Topics"), Live TV channels (HBO Max only shipped "curated channels" in
  Dec 2025), the bedtime/night mode, and a "fell asleep" rule that beats Jellyfin 12's "Are you still watching?" nag.
- **The gaps worth closing:** recap and post-credits awareness, spoiler-safe recaps on resume, smarter phone
  downloads, a "Who's watching" picker on the shared family TV, collections/franchise strips, an editable home, and
  natural-language "Ask Lilin" search.

---

## 1. What changed, service by service (2025–2026)

### Plex
- **"New Experience" app (mobile from Mar/Apr 2025, then TVs):** bottom bar Home / Library / Live TV / On-Demand / Discover.
  Forums filled with complaints: Discover and On-Demand forced back after users hid them, FAST content cluttering
  Home, Continue Watching disappearing, no way to trigger a library scan from the app.
  https://www.macrumors.com/2025/04/02/new-plex-mobile-app-now-rolling-out/ ·
  https://forums.plex.tv/t/new-experience-public-release-feedback/910904?page=44 ·
  https://mobilesyrup.com/2025/04/01/plex-update-rolls-out-for-mobile-reviews-are-mixed/
- **TV redesign (2026, Fire TV etc.):** the pinned-library sidebar became a top menu with overlays. Users: switching
  libraries went from ~2 to ~6 clicks, "built for mouse not remote", lag scrolling posters, 30 s+ to start local
  play. Workarounds: sideload an old APK, third-party Plezy. Plex brought the left nav back on Apple TV/Roku/Android TV
  after the backlash. https://piunikaweb.com/2026/05/04/plex-fire-tv-redesign-unusable-users-slam-navigation/ ·
  https://neowin.net/news/plex-reverts-tv-app-layout-after-intense-user-backlash/
- **Downloads regressed in the rewrite:** episodes download one at a time, show up offline as a flat list (no browsing
  by show or season), playlist and "sync unwatched" are gone, failures are common. Some users moved to Infuse for
  offline. https://forums.plex.tv/t/downloads-not-able-to-sync-entire-shows-or-syncing-with-watch-state/915231 ·
  https://forums.plex.tv/t/major-ios-app-regression-2025-14-0-download-failures-no-grouping-playback-bugs-missing-controls/915651
- **Pro Week, Sep 2025:** Common Sense Media age and quality ratings on title pages; public OpenAPI docs for the server.
  https://www.finanzen.net/nachricht/aktien/plex-s-5th-annual-pro-week-launches-new-product-features-and-a-sale-on-annual-plex-pass-subscription-upgrades-14872849
- **Social platform, Jun 2026:** shareable Lists (import from other platforms; friends can react and comment), public
  per-title/season/episode **Discussions**, emoji **Reactions**, a personal **Match Score**, **Follow Anything**
  (alerts for titles, lists, cast and crew), images in reviews. Lifetime Pass went from $250 to $750.
  https://thedesk.net/2026/06/plex-launches-social-discovery-features/ · https://thestreamable.com/new-social-features-launching-on-plex
- **Earlier lesson (2023, still cited):** "Discover Together" shared watch history and sent weekly emails that people
  felt were opt-out. Heavy privacy backlash.
  https://pcgamer.com/plex-says-controversial-service-that-emails-your-anime-habits-to-your-mates-is-opt-in-actually-pointing-at-a-screen-where-you-still-have-to-turn-it-off
- **Credits detection (2023, still the bar):** the Skip Credits button can also jump straight to a **mid- or post-credits
  scene**. https://www.macrumors.com/2023/02/16/plex-adds-credit-detection/ · https://support.plex.tv/articles/credits-detection/
- Remote playback of personal media now needs Plex Pass or a Remote Watch Pass, which is pushing families to
  Jellyfin. https://serverside.com/blog/jellyfin-vs-plex-vs-emby

### Jellyfin (10.11 → 12.0)
- **10.11 (2025):** big EF Core database migration, backup/restore, the new web layout default on non-TV, a Branding
  page with splash screen, Play All/Shuffle in more places, media-segment providers per library, alphabet picker.
  https://newreleases.io/project/github/jellyfin/jellyfin-web/release/v10.11.0 · https://github.com/jellyfin/jellyfin/releases/tag/v10.11.0
- **12.0 (released 2026-09-07):** the "Modern" layout is default on desktop and mobile. Library toolbar merged into a
  sticky app bar. Collections and Playlists tabs on every library, and **collections shown on item pages**. Filters
  for **audio and subtitle language** plus Reset filters. **Play All + Shuffle on series libraries.** Better Upcoming
  view. Frame stepping with `,` and `.`. **Chapter names in the seek-bar preview bubble.** A "still watching"
  prompt. Alternate versions for episodes, with resume following the version. Per-library subtitle settings.
  Low-res posters shown at true size instead of stretched. https://jellyfin.org/posts/jellyfin-release-12.0/
- **Clients people praise:** Streamyfin (iOS/Android; in-app **Seerr requests**, admins approve requests in the app,
  background downloads), Findroid (Android, offline that actually works), Wholphin (Android TV, "Plex-like UI", picks
  MPV or ExoPlayer), Swiftfin. Common complaint: the official clients feel utilitarian, and offline is still
  "experimental". https://github.com/a-dubs/streamyfin ·
  https://forum.jellyfin.org/t-wholphin-is-an-open-source-android-tv-client-for-jellyfin-written-from-scratch ·
  https://jellywatch.app/blog/findroid-vs-jellyfin-official-android-app-comparison-2026 (vendor blog, treat with care)
- **Family sentiment:** "Plex just works for my folks"; Jellyfin "lacks a user-friendly logon screen". Families manage
  fine once an admin sets each person up. https://news.ycombinator.com/item?id=50187261 ·
  https://lr.in.psf.lt/r/jellyfin/comments/zza8i5/how_has_the_experience_been_for_your_nontech

### Emby (4.9 → 4.10 beta)
- 4.9: playback speed and "up next" in the player overlay, an in-browser ebook reader, maintenance mode, a "TV mode"
  setting. https://newreleases.io/project/github/MediaBrowser/Emby.Releases/release/4.9.0.17
- **4.10 beta, the home-screen section editor:** any number of sections of any type (Continue Watching optionally
  including Next Up, Latest, Collections, **Dynamic Media** with sort, filters and played-state filters, Recently
  Released, On Now). Per section: custom title, library include/exclude, horizontal or vertical scroll, image type,
  "show only in TV mode", and **Cards or Spotlight** (big poster, title hidden when it's the first section). Plus a home
  banner. https://emby.media/support/articles/apps/common/User-Prefs-HomeScreen.html ·
  https://newreleases.io/project/github/MediaBrowser/Emby.Releases/release/4.10.0.30

### Infuse (8.1 → 8.5)
- 8.1: alphabet scrollbar for jumping through sections. 8.2 (Jul 2025): **per-person profiles on Apple TV**, each with
  its own home layout, watch history, ratings, parental controls and Trakt. Profile bugs reported after tvOS 26.4.
  https://alternativeto.net/news/2025/7/infuse-8-2-adds-multi-user-profiles-icloud-drive-streaming-and-ai-upscaling ·
  https://community.firecore.com/t/broken-profiles/59485.md
- **8.4 (Mar 2026):** **extras (deleted scenes, featurettes, trailers) inline on the title page**; **skip intros, credits
  and recaps** (automatic or a button) from the community databases IntroDB.app and TheIntroDB.org; a home-screen
  **Favorites row** of pinned folders and categories (shown by default; move it or hide it).
  https://firecore.com/blog/infuse-84-extras-intros-and-favorites
- **8.5 (Jul 2026):** Play still means the original file. **Long-press Play opens a Transcoding/Version list** for a
  lighter stream, or set it to prompt every time. Search results are grouped into movies, shows, episodes, collections
  and people. https://firecore.com/blog/infuse-85-smarter-streaming

### Channels (DVR) 6.2 → 7.0
- **7.0 (Oct 2025):** richer title pages (backdrops, logos, cast and crew). **Browse other films by the same cast,
  director or writer.** Jump between **franchise** films. Library Collections. The next unwatched episode shown
  prominently. "Manage Artwork". An **Extras row** with its own trailer button. **Multiview** of up to four live
  channels. Intro and credits detection that also drives autoplay timing.
  https://getchannels.com/2025/10/29/channels-7/
- **Personal Sections:** build your own sidebar sections from smart rules, with Multi-Row, Flow or List layouts and
  buttons linking to other sections. Suggested as "a section for each household member".
  https://getchannels.com/personal-sections/
- Virtual Channels: your library as personal live channels with bumpers between airings (Lilin's Live TV is this idea).
  https://getchannels.com/2021/10/26/channels-5/

### Apple TV app / tvOS 26 (Sep 2025) and 26.4 (Feb 2026)
- Liquid Glass redesign; the TV app uses **poster art** (portrait) with more recommendations; **an option to show the
  profile picker every time the Apple TV wakes**; karaoke with the iPhone as a mic and friends adding songs from their
  phones. https://9to5mac.com/2025/06/09/tvos-26-is-coming-this-fall-with-a-new-visual-design/ ·
  https://www.neowin.net/amp/tvos-26-arrives-with-karaoke-mode-updated-profile-switcher-liquid-glass-and-more/
- 26.4 adds "Genius Browse" recommendations. Commenters: "only show what I can actually watch", "it's advertising",
  "fix Continue Watching and the Watchlist first", "it suggested shows I already watched and disliked".
  https://forums.macrumors.com/threads/apple-adds-genius-browse-movie-and-tv-recommendations-to-apple-tv-in-tvos-26-4.2479520/
- Long-running pain: hard to remove items from Up Next / Continue Watching.
  https://discussions.apple.com/thread/255807260

### Netflix
- **TV homepage (May 2025, first big redesign since 2013):** Search / Shows / Movies / Games / My Netflix pinned at
  the top. Focused tiles show synopsis, runtime, **award wins, Top 10 history, key cast**. Rows react in real time to
  what you browse. **My Netflix** gathers Continue Watching, My List and Remind Me.
  https://www.netflix.com/tudum/articles/netflix-new-tv-layout
- **Backlash:** fewer posters per row, tiles that auto-expand and auto-preview, "10x slower to scroll", the
  New & Popular tab and **upcoming/Remind Me view gone** ("can't put a reminder on anything"), **can't see what you
  already rated**, Home and My Netflix nearly identical, Games given a whole tab.
  https://www.whats-on-netflix.com/news/netflixs-new-ui-update-sparks-backlash-as-global-rollout-continues/ ·
  https://www.techradar.com/streaming/netflix/as-netflix-users-rage-against-absolute-trash-ui-redesign-the-streaming-giant-claims-people-actually-like-it
- **Kids profiles (Oct 2025):** simpler home, a "My Netflix" hub of watched, saved and loved, Character rows, Mystery
  Box. https://techcrunch.com/2025/10/28/netflix-launches-redesigned-profiles-for-kids
- **Moments (Oct 2024; start/end picking added Sep 2025):** clip a scene and share it as a deep link. Phone only.
  https://www.macrumors.com/2025/09/03/netflix-moments-update-scene-sharing-ios/ (Lilin's Moments already go further.)
- **Mobile overhaul with a "Clips" vertical feed (30 Apr 2026):** add to My List from the feed, share, themed clip
  collections; live and podcasts planned. AI search tested on iOS.
  https://pulse2.com/netflix-launches-vertical-video-feed-and-redesigned-mobile-experience-for-members/
- **Smart Downloads (long-standing):** "Download Next Episode" deletes the episode you just watched and fetches the
  next one; "Downloads for You" fills a storage budget with picks. https://help.netflix.com/en/node/113296

### Max / HBO Max
- **Curated channels (Dec 2025):** themed always-on playlists (Friends, The Sopranos, True Crime, Middle-earth) in a
  Channels row on Home; you join mid-episode and can skip around. https://www.csimagazine.com/csi/HBOMax-curated-channels.php
- **Shorts + "Ask HBO Max" (Jul 2026):** a Shorts tab in the bottom bar (moments picked by AI, checked by editors;
  tap goes to the full title). Conversational search like "something funny under two hours" or "a show to binge
  this weekend". https://www.androidauthority.com/hbo-max-shorts-3692319/

### Disney+
- **Verts (US, Mar 2026):** a vertical feed tab in the mobile nav with scenes from Disney+ titles, Add to Watchlist or
  jump into playback. Critics: "I'm not happy". https://thewaltdisneycompany.com/news/verts-disney-plus/ ·
  https://www.whathifi.com/streaming-entertainment/one-of-the-biggest-streaming-services-is-adding-vertical-video-and-im-not-happy

### Prime Video / YouTube
- **X-Ray Recaps (Nov 2024 → wider):** AI text recaps of the current episode, the season so far or earlier seasons,
  personalised to the minute you've reached and kept spoiler-free; opened from the title page or the player.
  **Video Recaps (beta, Nov 2025):** narrated recap videos between seasons. **AI Topics (Dec 2024):** themed categories,
  the same idea as Lilin's Moods. https://techcrunch.com/2024/11/04/amazon-brings-generative-ai-powered-recaps-to-prime-video ·
  https://www.tvtechnology.com/news/prime-video-debuts-ai-powered-video-recaps ·
  https://getcoai.com/news/amazon-introduces-ai-topics-to-make-prime-video-recommendations-via-ai
- **YouTube "Ask" on TVs (Feb 2026 test):** press up or down during playback for suggested prompts ("who is this",
  "where was this filmed") without pausing. https://techcrunch.com/2026/02/19/youtubes-latest-experiment-brings-its-conversational-ai-tool-to-tvs/

### Stremio 5
- A Board of recommendations from your library, and (Sep 2026) a **live TV guide** with each channel's day schedule.
  **Interface zoom** scales the whole UI. Player: **subtitle and audio language carried between episodes**, hover
  timestamp on the seek bar, a speed slider with an on-screen speed badge, subtitle delay in 100 ms steps
  (hold to repeat), and a fit/fill/stretch key that remembers your choice.
  https://alternativeto.net/news/2026/9/stremio-brings-live-tv-guide-interface-zoom-enhanced-video-player-and-windows-vlc-option/ ·
  https://alternativeto.net/news/2026/4/stremio-v5-adds-media-key-support-subtitle-options-and-hdr-improvements/

### Skip databases (useful to Lilin directly)
- **TheIntroDB.org:** keyed by **TMDB id**, covers **intro, recap, credits, preview**, has a Jellyfin plugin that
  writes media segments, and is reportedly ~49k timestamps vs IntroDB's ~8.5k (a forum user's count).
  **IntroDB.app:** keyed by IMDb id, has a free API (`GET /segments`, intro/recap/outro). Infuse uses both.
  https://github.com/TheIntroDB/jellyfin-plugin · https://introdb.app/docs ·
  https://community.firecore.com/t/support-for-theintrodb-org/58939.md

---

## 2. Patterns by area, and where Lilin stands

| Area | What the field did | Loved / hated | Lilin today |
|---|---|---|---|
| Home / discovery | Bigger tiles with context (awards, Top 10, cast); real-time rows; vertical clip feeds; AI topics and moods; editable sections (Emby, Channels, Infuse) | Hated: lower density, autoplaying previews, forced promo rows, upcoming view removed. Loved: home screens you can edit | Billboard + trailer autoplay, Moods, Coming soon, Popular on Lilin. **No row editor or pinning.** Check the Netflix lesson: is the billboard costing density on TV/desktop? |
| Library browsing | Jellyfin 12: sticky toolbar, audio/subtitle language filters, Play All/Shuffle, collections tabs; Infuse alphabet scrubber | Loved: fast scrubbing, filters that reset | Type filter + availability + sort. **No collections, language filters, shuffle or A–Z scrubber.** |
| Title page | Extras inline (Infuse, Channels), browse by cast/director/franchise (Channels 7), collections on item pages (Jellyfin 12), next unwatched episode up front | Loved by everyone who mentions it | Cast + people pages, More details, reviews, More like this, the big Resume/Play next button (≈ Channels). Collection appears only as text ("Part of" in `public/details.js:98`). **No collection strip, no post-credits note.** |
| Player | Skip recap/credits/preview (Infuse 8.4), skip to mid/post-credits scene (Plex), chapter names in the scrub bubble (Jellyfin 12), frame step, speed badge, zoom modes, language carried between episodes (Stremio), X-Ray/Ask | Loved: skips; hated: "are you still watching" nags | Skip intro, credits-aware Up next, stats, night mode, second subtitle, PiP, sleep timer. **No recap skip, post-credits awareness, chapter names in the seek preview, or zoom/fill mode.** |
| Multi-user | Per-person profiles on shared TVs (Infuse 8.2), profile picker on wake (tvOS 26), kids profiles (Netflix) | Families: "my parents need it to just work"; login friction is Jellyfin's top family complaint | Per-person accounts, shared libraries, Restrict, faces. TV has "Switch account" (`public/tv/tv.js:648`), but no picker with faces for two people on one TV. |
| TV apps | Plex left nav restored after backlash; Netflix top bar; multiview (Channels) | Hated: more clicks for anything, mouse-first navigation | Samsung + Android TV with Live TV. Keep the TV flat and remote-first. |
| Offline | Netflix Smart Downloads; Plex regressed (flat list, no next-episode sync) | Loved: offline that just works and is grouped by show | "To phone" + "Season to phone" (480p/720p). **No automatic next episode, no budget, no auto-delete after watching.** |
| Social | Plex Lists, Discussions, Reactions, Match Score, Follow Anything (Jun 2026); Netflix Moments | Hated: anything shared by default (Plex 2023) | Likes, reviews, friends, Moments, Watch Together, Activity, Restrict. **No shared Lists, per-episode talk, or following people.** |
| AI | Recaps (Prime), Ask search (HBO Max, Netflix), Ask about the video (YouTube) | Mixed: useful for recaps; "AI slop" worries about feeds | Moods, LLM subtitle proofreading on magi's GPU (night/idle only), an idea scout. **No recaps, no natural-language search.** |

---

## 3. Anti-patterns to keep out of Lilin (from the 2025–26 backlashes)

1. **Don't trade density for spectacle.** Netflix's TV redesign drew most of its anger for "10x slower scrolling" and
   tiles that expand and autoplay. Lilin's billboard and hover trailers are similar: keep rows at full density on TV,
   and stop previews on focus if the remote is moving fast.
2. **Never force a row users have hidden or ignore** (Plex Discover/On-Demand). If Lilin adds a row editor, a hidden
   row must stay hidden, including when new features ship.
3. **Don't remove "upcoming" or "what did I rate?"** Netflix lost both and users noticed at once. Lilin has Coming soon
   and Coming up; consider a small thumb mark on cards you've rated.
4. **Social stays opt-in and visible.** Plex's 2023 email backlash. Lilin's Restrict switch is the right shape; any new
   sharing (Lists, following people) should default to friends-only.
5. **Offline must group by show and survive app updates** (the Plex regression). Lilin's "For your phone" list is
   already per-item; group it by show as it grows.
6. **Don't push things people can't play** (Genius Browse: "only show what I can watch"). Lilin's Discover is
   TMDB-wide by design, but cards could say clearly whether a title is in Lilin, downloadable now, or "no good copy yet".

---

## 4. Ideas

Ordered by value for Lilin's actual household (Oliver, ebi, Pappa + Anita on a Samsung TV, phones as PWAs).

### 1. Skip recap, plus "there's a scene after the credits"
- **Pitch:** two player additions. (a) A **Skip recap** button ("Previously on…"), shaped like Skip intro, with the
  timestamps taken from TheIntroDB.org (keyed by TMDB id, which Lilin already stores; it covers intro, recap,
  credits and preview) and kept beside Lilin's own fingerprinting. (b) For films, when the credits start, Lilin's
  autoplay/close logic shows a small chip, **"Stay: there's a scene after the credits"**, and a **Jump to it** button
  (Plex's credits detection does this). The data comes from TMDB keywords `duringcreditsstinger` and
  `aftercreditsstinger`, and the title page's facts line gets a matching "after-credits scene" note.
- **Who:** everyone; anime and drama bingers most.
- **Why Lilin:** it already has Skip intro, credits detection (`src/credits.js`) and TMDB ids. TheIntroDB also fills in
  episodes where fingerprinting fails (shows with few episodes on disk).
- **Effort:** S (stinger chip) + M (TheIntroDB fetch, cache, merge with own segments).
- **Exists?** Partly: Skip intro and credits-timed Up next. No recap skip; post-credits scenes are only *avoided*
  as a label in `src/credits.js:20`, never surfaced.

### 2. "Previously on Lilin": a spoiler-safe recap when you come back
- **Pitch:** when you open a show you haven't touched in 2+ weeks, the big Resume button gets a small **"Catch me
  up"** line above it. It opens a sheet with a 5–8 sentence recap of *everything up to the exact minute you
  stopped*, then "Resume S02E05 at 23:10". Generated from the subtitle files Lilin already has (cleaned and proofread)
  by the local LLM on magi, at night or when idle (the same `magi-gpu-busy` rule as subtitle proofreading), then
  cached per episode and per minute bucket. Also in the player's ⋯ menu ("What happened so far").
- **Who:** Pappa and Anita (long gaps between sessions), ebi (many shows in parallel).
- **Why Lilin:** Prime's X-Ray Recaps is the template, and Lilin has every input locally (subtitles, its own LLM
  pipeline, progress to the second). No other self-hosted server does it.
- **Effort:** M. **Exists?** No.

### 3. Smart "To phone": the next episodes are always ready
- **Pitch:** a per-show switch on the To phone sheet: **"Keep the next 3 episodes on my phone"**. When you finish a
  phone copy (or watch the episode anywhere: progress syncs), Lilin deletes that copy and makes the next one, inside a
  budget you set ("Use up to 5 GB"). The "For your phone" list becomes **grouped by show**, with "2 ready · 1 being
  made" per show. Push: "S01E04–06 are ready for your trip".
- **Who:** Oliver and ebi on phones; anyone travelling.
- **Why Lilin:** Netflix's Download Next Episode is a loved feature, and Plex lost exactly this in its 2025 rewrite.
  Lilin already makes travel copies one at a time on the GPU with a 7-day cache (`TRAVEL_KEEP_DAYS`), so it's only
  missing the "keep N ahead" rule.
- **Effort:** M. **Exists?** Partly (To phone, Season to phone).

### 4. "Who's watching?" on the family TV
- **Pitch:** a TV can belong to several people. When the TV app opens (or after the TV's been idle for 4 h+), it
  shows the **faces** (profile pictures Lilin already has) of everyone linked to this TV plus "Someone else". OK on a
  face goes straight in: no code, no re-pairing. The current person's face sits top right; pressing it brings the
  picker back. The owner links people to a TV in Settings → People → "TVs".
- **Who:** Pappa and Anita on the Samsung TV, so progress, Continue watching and likes stop mixing.
- **Why Lilin:** tvOS 26 added "profiles on wake" and Infuse 8.2 made per-person profiles its headline feature,
  because shared TVs mix up histories. "Switch account" on Lilin's TV (`public/tv/tv.js:648`) is the heavy version.
- **Effort:** M (server: TV token → allowed users; TV: picker screen in tizen/android/rust). **Exists?** Partly.

### 5. Collection and franchise strip on the title page
- **Pitch:** under the episode list or More like this, a row: **"The Dune collection · 2 of 3 in Lilin"** with every
  film in release order, a lit check on the ones you've watched, "In your library" or **Add** on the rest, and
  **"Add the missing one"** as one button. Watched in the wrong order? It notes "Part 1 comes first".
- **Who:** everyone; it's the classic "what's the next Mission Impossible" moment.
- **Why Lilin:** TMDB already gives `belongs_to_collection` (`src/details.js:135`), but it only shows as text under
  More details. Channels 7 (franchises) and Jellyfin 12 (collections on item pages) both put it on the page. Lilin's
  one-press add makes the strip more useful than theirs.
- **Effort:** S–M. **Exists?** Only the "Part of …" text in More details.

### 6. Your own home: pin, hide and reorder rows
- **Pitch:** an **Edit** button at the bottom of Discover. Each row gets a drag handle, an eye (hide), and "Pin to
  top". Any Mood, genre, person ("Films with Florence Pugh") or a friend's likes ("What ebi liked") can be added as a
  row. Hidden rows never come back on their own; a new feature row appears once with "New: keep it?". The same
  setting syncs to the TV (TV-only rows like Live TV can be marked TV-only, as in Emby).
- **Who:** ebi and Oliver (power users); Pappa and Anita get a simpler home that someone else can set up for them.
- **Why Lilin:** Emby 4.10's section editor, Channels' Personal Sections and Infuse's Favorites row are the praised
  side; Plex forcing rows back is the hated side. Lilin's row count is growing fast (Moods, Coming soon, Fresh,
  Popular on Lilin, Live…), so this is the release valve.
- **Effort:** M. **Exists?** No (no row editing in `public/app.js`).

### 7. Ask Lilin: search in plain words
- **Pitch:** the search box takes sentences: "something funny under 2 hours none of us have seen", "a cosy show for
  Anita", "the film with the guy from Severance in space". The local LLM turns the sentence into TMDB discover filters
  plus Lilin facts (watched by whom, in library, runtime), shows "I looked for: comedy · < 120 min · not watched by
  you", and the results come back as normal cards with a one-tap Add. Falls back to normal search instantly.
- **Who:** everyone; it's the family's "what do we watch tonight" problem.
- **Why Lilin:** HBO Max (Jul 2026), Netflix (testing) and Prime (AI Topics) all moved here. Lilin has Moods (the same
  filter recipes in `src/vibes.js`) and an LLM on magi; "not watched by any of us" is something only Lilin can answer.
- **Effort:** M. **Exists?** Partly (Moods, normal search).

### 8. Lists you can share
- **Pitch:** "New list" from any card's ⋯ menu ("Halloween 2026", "Anime for beginners for ebi"). Lists have a cover
  collage, an order, and a note per title, and are friends-only or private by default. Friends can 👍/❤️ a list and
  **Add all** to their library in one press. Import a Letterboxd/IMDb list by URL. A list can become a Live TV
  channel (Lilin's channel editor already takes shows and genres).
- **Who:** Oliver ↔ ebi recommending things; family movie nights.
- **Why Lilin:** Plex's June 2026 social launch led with Lists. Lilin already has friends, reviews and Saved, so Lists
  are the missing middle between "I liked it" and "watch this together".
- **Effort:** M. **Exists?** No (Saved for later is a single private list).

### 9. Follow a person
- **Pitch:** on an actor or director page, a **Follow** button. When a new film or show with them is announced, it
  appears in Coming soon with a "Because you follow Denis Villeneuve" kicker; when a good copy exists, you get the
  same "Download it when a good copy is out" option Saved films have.
- **Who:** Oliver and ebi.
- **Why Lilin:** Plex's "Follow Anything" (2026). Lilin already has Follow for shows, auto-download for saved films and
  people pages, so this links pieces it already has.
- **Effort:** S–M. **Exists?** No (Follow exists for shows only).

### 10. Spoiler guard for episodes you haven't seen
- **Pitch:** a Settings switch, "Hide spoilers in episode lists", on by default for anime. Unwatched episodes show a
  softly blurred still and only the first sentence of the description, with "Show" on long-press. Episode titles that
  give the plot away ("The Death of…") are optional to hide.
- **Who:** ebi (anime), anyone binging a mystery.
- **Why Lilin:** Lilin's revamp made episode stills large on every show page. Plex users have voted for this
  repeatedly (the request to disable auto-thumbnails because of sports spoilers is in their top votes:
  https://forums.plex.tv/c/feature-suggestions/8/l/votes?page=5).
- **Effort:** S. **Exists?** No (spoiler handling exists for reviews only).

### 11. Pause card (a light X-Ray)
- **Pitch:** after 4 s paused (controls hidden), the picture dims and a quiet card appears bottom-left: title, S·E and
  episode name, a two-line synopsis, **"Ends at 22:41"**, and the episode's **guest cast with faces** (TMDB episode
  credits). Tap a face to open the person sheet in a side panel; playback state is kept.
- **Who:** everyone, especially "who is that?" moments on the TV.
- **Why Lilin:** Prime X-Ray and YouTube "Ask" both target "who is that". Lilin has the cast and face data already, and
  the player chrome already keeps hints out of the way.
- **Effort:** S. **Exists?** No (cast only on title pages).

### 12. Player polish borrowed from Jellyfin 12 and Stremio
- **Chapter names in the seek preview bubble** when the file has chapters (Lilin already reads chapters in
  `src/credits.js`).
- **Fit / Fill / Zoom** key (Z) that remembers per title, for 2.39:1 films on phones held sideways.
- **Speed badge** on screen while not 1×, and **subtitle delay in 100 ms steps with hold-to-repeat** (if the current
  step is coarser).
- **Carry subtitle and audio language choices through a binge** (Stremio), if Lilin doesn't already: verify in
  `public/player-audio.js`.
- **Who:** desktop and phone viewers. **Effort:** S each. **Exists?** Partly (speed and subtitle tools exist; check
  each item).

### 13. Shuffle an episode
- **Pitch:** on a show page next to the big Resume button, a small **Shuffle** icon: plays a random watched-before
  episode (sitcoms, The Office-style comfort rewatch) and keeps going randomly. It never touches Continue watching
  progress.
- **Who:** Anita and Pappa (comfort rewatches); background TV.
- **Why Lilin:** Jellyfin 12 added Play All/Shuffle to series. Lilin's Sitcoms Live TV channel already proves the
  demand, but you can't pick the show.
- **Effort:** S. **Exists?** Only via Live TV channels (shuffle in `public/live.js`).

### 14. A Moments + trailers feed on phones (careful version of "Shorts")
- **Pitch:** a "Reel" entry in the phone tab bar or a Discover row: a full-screen vertical swipe through **friends'
  Moments** (already made by real people on Lilin) and **HD trailers of Coming soon and Trending**, each with Save /
  Add / Watch. No autoplay sound until tapped; it stops after 20 items ("That's everything new").
- **Who:** Oliver and ebi on phones.
- **Why Lilin:** Netflix Clips, Disney+ Verts and HBO Max Shorts all launched in 2026, but critics dislike endless
  feeds. Lilin's version is human-made and finite, which turns that criticism into a feature.
- **Effort:** M. **Exists?** Partly (Moments, trailers).

### 15. Cards that answer "can I watch this now?"
- **Pitch:** a one-glyph status on every Discover card: ● in your library · ↓ ready in about 10 min (Play now
  possible) · ○ no good copy yet · ⏳ not out. Plus a tiny thumb if *you* rated it (Netflix users missed seeing their
  own ratings).
- **Who:** everyone browsing Discover.
- **Why Lilin:** the Genius Browse lesson ("only show what I can watch") and the Netflix rating complaint. Lilin knows
  all four states better than any streamer.
- **Effort:** S–M. **Exists?** Partly (some states show on title pages; check the cards).
