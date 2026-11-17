# Social + discovery for a small group: research for Lilin (r1)

Researcher: social/discovery. Date 2026-11-17. Scope: what streaming services, trackers and group-decision apps
do socially, what the research says about choice and recommendation UX, and what of that fits a server shared by
3-10 people who know each other.

**What Lilin already has (checked in whats-new.json + code), so not re-proposed:** thumbs (dislikes private,
hide titles), 1-5 star reviews with spoiler flag (per title only), Liked by faces, Popular on Lilin, Top picks /
Because you watched (`public/app.js:1095-1129`), Moods (`public/vibes.js`), billboard, Saved for later + Follow
(per person, `src/watchlist.js:1`), Friends (requests/accept), Moments (clip + send to friends / link), Watch
Together rooms + planned parties + chat/reactions, Live TV channels with faces + chat, Wrapped (incl. "who you
watched with", `src/social.js:7`), Shared libraries, Restrict, Activity (owner + "Can see activity"), idea box,
idea scout. The scout's first run (memory `lilin-idea-scout-20261117.md`) already pitched **Pick a film together
(swipe to match)** and **Shuffle a show**; section H below is evidence and design detail for those, not a duplicate.

---

## Findings (with sources)

### A. Choice overload is real for "what do we watch tonight", and the evening is the worst case
- Browsing time keeps rising: Nielsen 2019 ~7 min per session, and people who know what they want are 3x as likely
  to end up watching (66 % vs 22 %) ([Axios/Nielsen](https://www.axios.com/2019/07/12/streamings-bounty-of-choices-overwhelms-consumers));
  Gracenote 2025 ~12 min, 16 min for 18-34, 46 % say it's getting harder ([informitv](https://informitv.com/2025/11/05/it-is-becoming-harder-to-decide-what-to-watch/));
  2026 US survey: 29 % spend 30+ min deciding ([NewscastStudio](https://www.newscaststudio.com/2026/05/20/u-s-viewers-report-growing-frustration-with-streaming-content-overload/)).
- Netflix's own estimate: members lose interest after 60-90 s, having looked at 10-20 titles, ~3 in detail
  (Gomez-Uribe & Hunt 2015, [PDF](https://gwern.net/doc/reinforcement-learning/exploration/2015-gomezuribe.pdf), [Quartz](https://qz.com/622316/netflix-knows-exactly-how-long-youll-look-for-something-to-watch-before-giving-up)).
- The academic picture is "it depends": Scheibehenne 2010 meta-analysis found a mean effect near zero; Chernev,
  Böckenholt & Goodman 2015 (99 observations) found it significant once you account for four moderators:
  **choice-set complexity, task difficulty, preference uncertainty, effort-minimising goal**
  ([Kellogg](https://www.kellogg.northwestern.edu/faculty/research/detail/2015/when-product-assortment-leads-to-choice-overload-a-conceptual)).
  A tired group on a sofa scores high on all four (unclear shared preference, wants zero effort). The phone at
  lunch scrolling Discover does not. So: Discover can stay rich; the **"press play together at 21:00" moment**
  is where Lilin should offer few, explained options.

### B. People trust people they know more than algorithms; explanations that show peers' opinions persuade best
- Sinha & Swearingen 2001: friends' recommendations beat six online recommenders on quality; system picks were
  more often "new and unexpected", friends' picks mostly reminders of known interests; users trusted a system
  more when it also showed items they'd already liked ([PDF](https://www.ercim.eu/publication/ws-proceedings/DelNoe02/RashmiSinha.pdf)).
- Herlocker, Konstan & Riedl 2000 tested 21 explanation styles; the most persuasive was a **histogram of
  neighbours' ratings grouped into good / neutral / bad**, beating 5-bar histograms and confidence/graph displays
  ([summary + secondary](https://datalab-old.csd.auth.gr/wp-content/uploads/publications/RecSys2009snp.pdf), [blog summary](https://overwhelmedandunderdone.blogspot.com/2008/01/explaining-why-recommendation-was-made.html), [DBLP](https://dblp.uni-trier.de/rec/conf/cscw/HerlockerKR00.html)).
- At Letterboxd scale the "neighbours" are strangers chosen by an algorithm; on Lilin they are **named people
  you know**. "Liked by ebi and Pappa" is a stronger explanation than anything Netflix can show. Lilin uses this
  only on Popular on Lilin and title pages, not on Top picks / Because you watched / Moods cards.

### C. Rating UX: binary gets volume, a "love" tier gets signal
- Netflix's 2017 A/B test: thumbs got ~200 % more ratings than 5 stars; stars also disagreed with behaviour (people
  5-starred worthy films and watched comedies) ([MacRumors](https://www.macrumors.com/2017/03/17/netflix-star-ratings-thumbs-up-down/), [Quartz](https://qz.com/935464/netflix-nflx-is-nixing-its-old-star-rating-system)).
- 2022: Netflix added "Two thumbs up" (love) to separate liked from loved; it beat a heart icon in tests
  ([TechCrunch](https://techcrunch.com/2022/04/11/netflix-adds-a-two-thumbs-up-button-in-effort-to-learn-what-users-love-not-just-like/)).
- Lilin's mix (thumbs everywhere + optional stars that map 4-5 → up) is in line with this. Gap: no cheap "loved it"
  tier for people who won't open the Review sheet; 5 stars is that tier but costs a sheet.

### D. Social features at scale vs among real friends: the Plex lesson
- Nov 2023 Plex "Discover Together": friends see your watch history, ratings, watchlist; a **weekly email of
  friends' viewing was on by default**. Backlash: users didn't know sharing was on; Plex "friends" are often server
  users, not friends; Plex had to exclude adult titles and add the email to Privacy settings
  ([The Register](https://www.theregister.com/2023/11/28/plex_privacy/), [PC Gamer](https://pcgamer.com/plex-says-controversial-service-that-emails-your-anime-habits-to-your-mates-is-opt-in-actually-pointing-at-a-screen-where-you-still-have-to-turn-it-off)).
- It didn't settle: 2025 threads still call the features "creepy", say opt-outs are buried, and ask that **server
  hosts can turn social off for their users**; a minority like seeing what friends watch ([Plex forum](https://forums.plex.tv/t/more-social-feature-integration-why/903240)).
- Plex reviews (Oct 2024) default to Friends with Private / Friends / Friends-of-friends, public profiles in Jan 2025
  ([TechCrunch](https://techcrunch.com/2024/10/09/streamer-plex-rolls-out-movie-and-tv-show-reviews/), [TechCrunch](https://techcrunch.com/2025/01/22/streaming-service-plex-gets-more-social-with-public-profiles-and-reviews)).
  Plex Lists (Mar 2026) have per-list visibility tiers, no co-editing ([Plex forum](https://forums.plex.tv/t/introducing-lists-on-plex/937170)).
- Lesson for Lilin: the audience problem is solved (everyone is known), but **power asymmetry isn't**: the owner
  sees everyone's viewing in Activity, others can be given "Can see activity", Popular on Lilin ranks by watching
  (`src/social.js:131-157`, `watchedBy`), Wrapped names companions. Nobody can watch something *off the record*.
  `logWatch` (`src/social.js:95`) logs every played second with no opt-out. In a family (parents, Pappa, Anita)
  that's exactly where Plex's "I didn't know" anger came from.

### E. Synchronous watch parties: dying at scale, alive in small groups (via third parties)
- Disney+ removed GroupWatch (Sep 2023) ([TechRadar](https://www.techradar.com/streaming/disney-plus-just-removed-one-of-its-best-friends-and-family-focused-features), [GamesRadar](https://www.gamesradar.com/Disney-plus-removed-groupwatch-feature)),
  Prime Video's Watch Party vanished in Apr 2024 without notice ([EarlyGame](https://earlygame.com/news/entertainment/amazon-prime-removed-watchparties-weeks-before-fallout-show-airs)),
  Plex's new apps dropped Watch Together (web only) ([Android Authority](https://www.androidauthority.com/plex-watch-together-removed-3529939/)).
- Meanwhile Teleparty reports ~10 M Chrome installs ([Chrome Web Store](https://chromewebstore.google.com/detail/netflix-party-is-now-tele/oocalimimngaihdkbihfgmpkcpnmlaoa)) and Discord screen-share / Watch Together is "the most popular workaround" for friend groups ([Discord blog](https://discord.com/blog/server-activities-games-voice-watch-together), [TechPP](https://techpp.com/2024/02/05/how-to-host-a-watch-party-on-discord/)).
- Most viewing is solo or in the same room: YouGov UK 2024: 48 % stream alone in a typical week, 38 % with family,
  32 % partner, **10 % with friends** ([YouGov](https://yougov.com/en-gb/articles/49079-nearly-half-of-britons-typically-stream-content-alone)).
- Takeaway: Lilin's WT + Live TV cover sync well. The bigger, cheaper win among friends is **async** social
  (what did ebi think, who's ahead of me, send her this), plus **same-room** decision help.

### F. Async social: logging, diaries, "now watching", episode reactions
- Letterboxd: follow-based activity feed of people whose taste you trust, diary, watchlist, a film page section
  showing whether your friends reviewed it; the shareable Year in Review drives growth; members ~13 M+ and
  half under 35 ([Letterboxd About](https://letterboxd.com/about/), [Android Authority](https://androidauthority.com/what-is-letterboxd-3216354), [YPulse](https://www.ypulse.com/newsfeed/2024/03/06/letterboxd-successfully-used-virality-to-gain-a-huge-loyal-gen-z-userbase/)).
  A popular unofficial add-on shows the **average rating of only the people you follow** on each film page
  ([Letterboxd Toolkit](https://addons.mozilla.org/en-CA/android/addon/letterboxd-toolkit/)): even at scale, people want the friends-only number.
- Trakt: "Now Watching" check-ins, friends' recent activity, Year in Review (VIP) ([App Store](https://apps.apple.com/us/app/trakt/id1514873602?l=en)).
- Serializd: rate/review **episodes and seasons**, not just shows ([Gizmodo](https://gizmodo.com/download/serializd)); TV Time / Previously
  sell "follow friends, spoiler-free", hiding stills/summaries of unseen episodes ([Previously](https://mwm.ai/apps/previously-tv-show-tracker/6789976719), [TV Time](https://en.wikipedia.org/wiki/TV_Time)).
- "Netflix cheating": 46 % of streaming couples admitted watching ahead of their partner (Netflix/SurveyMonkey
  2017, up from 12 % in 2013; 25 % happens when the partner falls asleep) ([WTOP](https://wtop.com/news/2017/02/about-half-of-you-watch-netflix-ahead-of-a-significant-other-survey-says), [PR Newswire](https://prnewswire.com/news-releases/netflix-cheating-is-on-the-rise-globally-and-shows-no-signs-of-stopping-300406051.html)).
  No major service models "a show we watch together". Lilin knows who watched together (`watch_company`), so it can.

### G. Short-form discovery: Moments yes, a TikTok feed no
- Netflix Fast Laughs (2021, curated by staff, hidden on kids profiles) ([TechCrunch](https://techcrunch.com/2022/02/23/netflix-brings-its-short-form-video-feed-fast-laughs-to-the-tv)), Moments (Oct 2024, save/share a scene, mobile only)
  ([Tom's Guide](https://www.tomsguide.com/entertainment/netflix/netflixs-moments-feature-lets-you-share-your-favorite-scenes-heres-how-it-works)), and in Apr 2026 a vertical **Clips** feed in the redesigned mobile app ([Fast Company](https://www.fastcompany.com/91534522/netflix-goes-vertical-with-its-new-mobile-app), [Android Central](https://www.androidcentral.com/streaming-tv/netflix/clip-this-netflixs-new-mobile-design-is-all-about-short-videos-and-scrolling)).
- Endless feeds need an endless supply and an engagement model; Netflix staffs the curation. A 5-person server
  has neither, but it has something Netflix lacks: clips **made by people you know** (Lilin Moments). Better
  surface: Moments from friends as cards on the title and in a small "From friends" shelf, not a feed.

### H. Group deciders: swipe-to-match is crowded; the aggregation rule is the real design choice
- Dozens of swipe/match apps (WatchLitz share-a-link, Wecide, Swyf filters by service, MovieZang room codes, Stream
  Vote) ([WatchLitz](https://peerlist.io/logiclitz/project/watchlitz--free-group-movie-picker), [Wecide](https://play.google.com/store/apps/details?id=com.wecide.app), [Swyf](https://apps.apple.com/us/app/swyf-together/id6451088026), [Stream Vote](https://apps.apple.com/us/app/id1560203643)).
  Their common weaknesses: cold decks of everything on a service, no knowledge of what each person has already seen
  or disliked. Lilin knows both.
- Masthoff (TV group study, UMUAI 2004): people naturally use **Average**, **Average Without Misery** and **Least
  Misery**, care about fairness and avoiding anyone's misery; for sequences (several evenings) people expect
  turn-taking ([Aberdeen](https://abdn.elsevierpure.com/en/publications/group-modeling-selecting-a-sequence-of-television-items-to-suit-a/), [TU Wien tutorial](https://www.ec.tuwien.ac.at/sites/ec.tuwien.ac.at/files/news-attachments/Tutorial%20GRSs.pdf)).
- Netflix "Play Something"/"Surprise Me" shuffle was removed in 2023 for low use; commenters' explanation: people
  pick by mood and available time, a context-free random pick doesn't help ([Tom's Guide](https://www.tomsguide.com/news/netflix-just-killed-a-feature-that-seemed-like-a-great-idea), [The Streamable](https://thestreamable.com/netflix-removes-surprise-me-button-despite-content-discovery-becoming-increasingly-difficult)).
  Reelgood Roulette survives with filters (genre, type, minimum score) and re-spin ([BGR](https://bgr.com/2028118/reelgood-roulette-help-decide-what-to-watch)).
- Netflix Game Night (Nov 2025): party games on the TV with phones as controllers via QR code ([AlternativeTo](https://alternativeto.net/news/2025/11/netflix-launches-game-night-for-tv-play-using-phones-as-controllers-no-downloads-required), [Tom's Guide](https://www.tomsguide.com/entertainment/netflix/how-to-set-up-netflix-games-on-tv-all-you-need-is-your-phone)).
  The **TV-shows-a-QR, phones-vote** pattern is now familiar to families and fits Lilin's TV apps + phone PWA.

### I. Watchlists: graveyards alone, useful when shared
- Plex/OnePoll 2022 (n=2,000): 68 % say their watchlist is "nearly impossible" to get through; it "constantly gets
  longer" ([StreamTV Insider](https://www.streamtvinsider.com/video/plex-68-viewers-find-it-nearly-impossible-get-through-streaming-watchlist)).
- Shared/collaborative watchlists are a years-old request on Plex ([Plex forum](https://forums.plex.tv/t/vote-for-watch-lists-shared-watch-lists/182057), [Plex forum](https://forums.plex.tv/t/add-the-ability-to-share-watchlist/816165));
  JustWatch and Plex Lists share read-only, nobody ships co-editing ([JustWatch](https://support.justwatch.com/article/what-are-custom-lists)).
  Spotify proved the "two people, one auto-mixed list + taste match %" pattern (Blend, later up to 10 people)
  ([TechSpot](https://www.techspot.com/news/91043-spotify-rolls-out-blend-playlists-combines-listening-tastes.html), [Engadget](https://engt.co/3iPa0Lm)).

### J. Household profiles and kids
- Netflix: kids profiles (≤12), per-profile maturity, title blocks, per-profile PINs and a PIN to create profiles
  ([Netflix Help](https://help.netflix.com/node/264), [Common Sense](https://www.commonsensemedia.org/blog/how-to-set-parental-controls-on-netflix)).
- Jellyfin's controls are per user and leak (unrated items in Up next); kid-friendly home screens come from
  third-party clients; users ask for "first-class household profiles for shared devices"
  ([Jellyfin forum](https://forum.jellyfin.org/t-first-class-household-profiles-for-shared-devices), [GitHub](https://github.com/jellyfin/jellyfin/discussions/10313), [JellyWatch](https://jellywatch.app/doc/android-tv/tv-kids-profile)).
- Lilin's users are adults; a kids mode is a scale feature with no audience today. The **shared TV** is the real
  household problem: the parents' Samsung TV is one paired account (no profile picker in `public/tv/tv.js`), so two
  people's progress, thumbs and Wrapped are merged, and whoever watches alone moves the other's Continue watching.

### K. Social proof skews small groups hard
- MusicLab (Salganik, Dodds & Watts 2006): showing download counts made success more unequal and less predictable
  across parallel "worlds" ([PDF](https://www.cs.toronto.edu/~bor/303s19/docs/salganik_dodds_watts.pdf)). With 5-8 people, one person's binge or
  one enthusiastic liker decides Popular on Lilin. Names beat counts here ("ebi watched all of it") and a shelf should
  rotate people, not just rank totals.

### L. Content heads-up for mixed audiences
- DoesTheDogDie: crowdsourced per-title warnings (animal death, sexual assault, gore, …) with a v3 API (keyed,
  tiered) ([API](https://api.doesthedogdie.com/api/3.0), [Mental Floss](https://www.mentalfloss.com/article/611599/movie-website-warns-about-sad-dog-plots)); Emby users asked for exactly this integration ([Emby forum](https://emby.media/community/topic/120419-doesthedogdie-website-integration)).
  Useful when picking something for parents or a mixed room; age ratings alone are "too vague".

---

## What works for 3-10 people who know each other vs what only works at scale

| Works small (lean in) | Only works at scale (skip) |
| --- | --- |
| Named people as the explanation ("Liked by Pappa") | Counts, follower numbers, public profiles |
| Direct, personal sends ("you'd like this") with the loop closed | Algorithmic "people like you" from strangers |
| Spoiler-aware progress between friends / couples | Global trending feeds, top-10 by plays |
| Small curated decks for a room (vote/match) | Endless short-form feeds (need curation staff + supply) |
| Shared lists between 2-4 people | Community lists, list likes, list discovery |
| Presence ("ebi is watching X now") with an off switch | Weekly default-on activity emails (Plex) |
| Wrapped/yearly group story (already built) | Leaderboards (one binger wins every week, see MusicLab) |
| Household "who's watching" on a shared TV | Kids modes / maturity tiers (no kids on Lilin) |
| Episode-level one-line reactions among 3-5 viewers | Episode review pages with hundreds of reviews |

Rule of thumb from Plex: **every social signal needs an opt-out the person controls**, and on Lilin specifically
the owner seeing everything is the sensitive part, not peers.

---

## Product gaps found in Lilin (non-visual)

1. **No way to watch off the record.** `src/social.js:95` (`logWatch`) logs all playback; it feeds Activity (owner +
   "Can see activity"), Popular on Lilin (`src/social.js:131-157`, `watchedBy`) and Wrapped. Why it matters: Plex's
   2023-25 backlash was about exactly this (D). Fix: per-session/per-title "Watch privately" (idea 4). Severity: polish→trust.
2. **Saved for later is strictly personal** (`src/watchlist.js:1`); Shared libraries share the library but not the
   wish list, so couples/households can't plan together. Fix: idea 8. Polish.
3. **No title-level "recommend to a friend".** Moments sends clips (`public/moments.js:257` "Send to"), WT sends room
   invites; nothing sends a *title* with a note, the single most evidence-backed small-group feature (B). Fix: idea 1.
4. **TV app has no "who's watching"** (`public/tv/tv.js`, only download profile at :1355): shared TV merges two
   people's history. Fix: idea 9. Inconsistent (web knows people, TV doesn't).
5. **People-as-explanation used only on Popular/title pages**, not on Top picks / Because you watched / Moods cards
   (`public/app.js:1095-1129`). Fix: idea 10. Polish.
6. **Reviews are per title only** (memory `lilin-reviews-20261117.md`): no episode/season reactions, and friends'
   reviews have only a manual spoiler tick, not progress-aware hiding. Fix: idea 5. Polish.

---

## Ideas

Ranked by value-per-effort for this group. "Exists?" = closest thing already in Lilin.

**1. Send a title to someone ("You'd like this")** — On any film/show: Send → pick friends → optional one-line note.
They get a push and a **From friends** shelf at the top of Discover ("ebi: 'the ending!!'"). When they thumb or
review it, the sender gets a quiet "Pappa loved it" (closing the loop is what makes people send again). Who: everyone,
especially ebi ↔ Oliver and parents getting tips. Why Lilin: friends' picks beat algorithms (B), and Lilin can also
offer "Add to library" in the same tap since it's one server. Effort **S-M** (reuse friends, push kinds, Moments' share
panel). Exists? No; Moments send clips, WT sends room invites.

**2. Pick together (room/TV vote), designed with Average-Without-Misery** — Builds on the scout's "swipe to match".
Host starts from a WT room or the TV ("Pick something" shows a QR, like Netflix Game Night, H). Each phone gets a
deck of **12-15** candidates, not the catalogue: union of everyone's Saved + library titles nobody in the room has
finished + titles someone present liked that others haven't seen; drop anything anyone thumbed down. Swipe Yes / Fine /
No. Result: top 3 by average with any "No" as a veto (Masthoff), each with the reason ("ebi saved it, Oliver liked
the director"), runtime and "ends 23:05". One tap → Watch Together or play on this TV. Remember the winner so the
next evening tilts toward whoever lost (turn-taking). Who: same-room family, ebi + Oliver remote. Why Lilin: knows
history, dislikes, library and the people present; generic apps don't (H). Effort **M**. Exists? Scout pitch pending;
nothing built.

**3. "Watching with…" shows (no cheating)** — Mark a show as one you watch with someone (or auto-suggest after two
episodes together in WT/same room). Continue watching then shows "with ebi · she's 1 ahead"; pressing Play on the
next episode alone asks "Watch without ebi?" (Watch anyway / Invite her / Not now); the fell-asleep case is covered
because the sleep timer already knows. Who: couples, ebi + Oliver. Why Lilin: 46 % of couples watch ahead (F); Lilin
already logs `watch_company`. Effort **M**. Exists? No (WT company only feeds Wrapped).

**4. Watch privately** — A switch in the player ⋯ and on a title ("Keep this off the record"): no Activity row (or a
neutral "private" line for the owner), not in Popular on Lilin, Wrapped, presence or "who you watched with"; your
progress still saves. Optional Settings default per person ("Share what I watch: everyone / friends / nobody").
Who: family members, anyone embarrassed by their anime/true-crime habit. Why Lilin: the owner and "Can see activity"
people see everything today (D, gap 1); cheap insurance against the Plex reaction. Effort **S**. Exists? Partly
(thumbs down private; Restrict is owner-imposed, all-or-nothing).

**5. Episode reactions, spoiler-aware** — After an episode ends (Up next card), one tap for 😂/😮/😢/🔥 or a one-line
take. On the show page each episode shows friends' reactions **only once you've watched that episode**; friends'
reviews/Moments/Live chat about later episodes stay blurred until you get there. Who: anyone following a show with
others (anime with ebi). Why Lilin: Serializd/TV Time's draw is episode-level, spoiler-free social (F); Lilin knows
exact progress per person so hiding is automatic, not a tickbox. Effort **M**. Exists? Title-level reviews with
manual spoiler tick; WT emoji reactions (live only).

**6. Now watching (presence)** — A slim row on Discover: faces of friends watching right now ("ebi · Frieren E12 ·
14 min in"), tap → "Join" (asks her for a WT invite) or "Watch from the start". Respects idea 4 and a Settings switch;
off for Restricted. Who: friends in different homes. Why Lilin: Trakt/Discord-style presence works when the group is
small; Live TV already shows faces per channel. Effort **S-M**. Exists? Faces on Live TV only.

**7. Taste match + "Because ebi loved it"** — Per friend: a match % from shared thumbs/stars, "you both loved"
and a row of things they loved that you haven't seen (Spotify Blend pattern, I). On Discover one row per close
friend, rotating daily so one heavy rater doesn't dominate (K). Who: everyone with ≥10 ratings. Why Lilin: makes
reviews/thumbs pay off for the rater and the reader. Effort **S**. Exists? Popular on Lilin (everyone mixed), Because
you watched (own history).

**8. Our list (shared Saved list)** — A list two or more people both add to and both see ("Oliver & ebi", "Mamma &
Pappa"), shown as its own Discover shelf, with who added each item; "Download when it's out" works for it too. Pick
together (2) uses it as its first source. Who: couples, households in Shared libraries. Why Lilin: long-standing
Plex request, nobody ships co-editing (I); personal watchlists are graveyards, shared ones get decided on. Effort
**S-M**. Exists? Saved for later is per person; Shared libraries share files, not intentions.

**9. Who's watching? on the TV apps** — On TV start (or with a long-press on the profile pill) pick one or several
faces from the household; progress, thumbs, Continue watching and Wrapped credit go to everyone picked. Default
"same as last time" so parents aren't nagged. Who: parents on the Samsung TV, anyone sharing a TV. Why Lilin: the
TV app has no notion of people (gap 4); Netflix profiles / Jellyfin household-profile requests (J). Effort **M**
(server + two TV apps). Exists? No.

**10. People as the reason on every card** — Wherever a recommendation appears (Top picks, Because you watched,
Moods, billboard), add one line when it applies: "Liked by Anita", "ebi ★★★★★", "Saved by Pappa"; grouped like
Herlocker's winning display: "3 liked it" (never show dislike counts: with 4 people they'd identify who). Who:
everyone. Why Lilin: named peers are the most persuasive explanation (B) and Lilin is the rare service that has them.
Effort **S**. Exists? Only on Popular on Lilin and title pages.

**11. Tonight card (context, not random)** — One pick at the top of Discover after 19:00 (and on the TV home): fits
the time left before your usual bedtime (Wrapped already knows prime time), in your library or Play-now-able,
explained by a person or a mood, with Shuffle for another. Who: solo evening viewers, parents. Why Lilin: the
decision moment is where overload bites (A); Netflix's shuffle died for lacking context (H). Effort **S-M**. Exists?
Billboard (trending), Moods, scout's "Shuffle a show" pitch.

**12. Heads-up notes for watching with family** — On the title page, a small "Before you watch with others" line from
DoesTheDogDie (e.g. "an animal dies", "sexual content") behind a tap, so it doesn't spoil. Who: picking for parents,
mixed rooms, ebi. Why Lilin: age ratings are vague; it's on the Emby wish list (L). Effort **S-M** (external API key,
cache per title; check terms/cost first). Exists? Age ratings only.

**13. Loved it (one tap)** — Long-press / second tap on thumbs up = "Loved it" (= 5 ★ without opening the Review
sheet). Feeds 7 and 10 and Wrapped "favourites". Who: people who won't write reviews (most of the family). Why:
Netflix's double thumb (C). Effort **S**. Exists? Via stars in the Review sheet only.

**Deliberately not recommended:** a TikTok-style vertical feed (no supply/curation at this scale, G), a kids mode
(no kids on Lilin, J), public profiles/follower counts/leaderboards (D, K), default-on weekly "what your friends
watched" emails or pushes (D), a context-free random button (H).
