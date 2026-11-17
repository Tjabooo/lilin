# Product lead, round 2: what Lilin should do next

Lens: five real audiences, not personas.
- **Oliver**: owner, power user, desktop + iPhone. Restarts the server whenever he likes, binges with ebi in Watch Together.
- **ebi**: owner too, lives on the iPhone PWA, Firefox on desktop (no glass). She's the one who files the requests
  (memory `lilin-five-tweaks`, "all Swedish" docs complaint).
- **Pappa + Anita**: Swedish, **Restricted** since 11-17 (no friends, reviews, live chat or faces; links only), share
  a library with the "Home network" account.
- **Parents on the Samsung TV**: the shared Home network account on the Tizen app, which the server serves (we can ship
  without touching the TV, Oliver 11-16: "parents watching, don't disturb").

My rule: **anything a family member can hit in a normal evening beats anything new.** Lilin shipped ~160 changelog
entries in 7 weeks. What it lacks isn't features. It's the feeling that someone went over every screen once.

Things I checked myself: room Audio hidden (`app.js:4481`, plus two more `audioBtn.hidden = true` at 5702/6985), the
travel-list `false` (`app.js:783`), the offline copy (`app.js:10229`), the `onAccent` threshold (`app.js:370`), no
`MediaMetadata` (only the PiP handler at `app.js:6756`). Also note the **uncommitted `src/profiles.js`** in the working tree
(Letterboxd-style profiles: diary, favourites, "what they've watched lately", visibility). It's in flight, and it changes
how I rank the social ideas (see §3).

---

## 1. Read of the audits: what real users will actually feel

Merged and de-duplicated. Grouped by who gets hurt, worst first.

### 1a. Things that are broken for everyone, or that break a promise we made
| # | Finding (merged) | Sources | Who notices |
|---|---|---|---|
| R1 | **Watch Together hides the Audio button.** The 11-11 changelog says "Audio language in Watch Together", and it doesn't work. | player B1 | Oliver + ebi, every room with a dub/sub choice (anime) |
| R2 | **Primary buttons fail contrast in Ember/Synthwave** (2.6/2.8:1): Play, Add, Resume. One line in `applyTheme`. | system A1, owner B5 | anyone on those themes |
| R3 | **Live chat shows quiet and Restricted viewers' faces**, which the strip deliberately hides. It breaks the Restrict promise Oliver made for his family two days ago. | player B3 | Pappa/Anita (privacy), Oliver (trust) |
| R4 | **Offline / network failure speaks admin:** "Trending this week" over "Make sure server.js is running", raw "Failed to fetch"/"NetworkError…"/"Load failed" in English inside the Swedish UI, every row erroring separately. Lilin restarts often by design. | discover S1, S2, S3 | Pappa/Anita/parents: the one screen they see when things break |
| R5 | **Owner phone tab bar: 8 icon-only tabs that scroll, and Discover and Clips share one icon.** | owner B3 | Oliver and ebi, daily, on the phone |
| R6 | **Player menus stack on top of each other**, and the error box sits on the play button with no way out. | player B2, B9 | everyone who plays anything |
| R7 | **The room sheet covers the whole picture on phones, and covers the controls on tablets.** | player B6, B5 | ebi (phone-first) in every room |
| R8 | **The travel list prints `false`**. That's a regression of a bug the changelog already claimed fixed ("No more stray false", 11-14). | library D4 | ebi/Oliver, To phone |

### 1b. Family confusion (wording, jargon, dead ends)
- **The convert banner shows raw release names ("x265 Ghost") and ffmpeg failures to everyone** at the top of Library (library A2). Pappa doesn't need to know a server chore exists.
- **The library pushes the first title a screen down on a busy day** (library A1, still open from the pre-revamp audit, and worse now).
- **HEVC jargon in the player** ("HEVC (hvc1) doesn't play in this browser", player D6). Same disease as R4.
- **"Find torrents" in the Library header** (library A11). This is a family page.
- **Show page with no top action for people who can't download** (discover T6), and peek/billboard/page disagree on Play / Watch / Add (discover T7). *Whether this bites depends on Pappa/Anita's download rights: question for the engineer.*
- **"You're all caught up" on a show where nothing has downloaded** (library C2). **Unaired episodes offered with Add** (library C4).
- **"6d left" next to "8 min left" on one card; expiry spelled 3+ ways** (discover D7, library A7). Auto-delete is the most Lilin-specific concept family members trip over.
- **"Keep watching" on Live TV means leave the channel** (player C5). It's a trap button.
- **Swedish invite and Watch Together link pages are English only** (owner B6). These are exactly the links the family gets sent.
- **The SVT title sheet prints the title on bright raw art and is unreadable** (discover T1, DOC2). The parents love Swedish true crime and SVT (memory `lilin-documentaries`). This is *their* page.
- **Episode titles stay English in the Swedish UI** (library C6).
- **Raw JSON `{"error":"Not found."}` for a cut-off /c/ link** (owner I2), and a dead clip page with no card (I1).

### 1c. Phone-daily annoyances (ebi's world)
- The What's new button is a blank ring where a profile picture should be. **Three audits flagged it** (discover S5, owner I11, system C5).
- Ratings truncate to "★ …" in every phone grid (discover D4). The narrow-card badge is an unexplained square (D5).
- Facts wrap with a leading "·" on every phone title page (discover T2 = library B3).
- The press-peek sheet has no handle and no close (discover P2).
- Touch targets under 44 px everywhere, and hover colours stick after a tap on iOS (system D, E). Mechanical fixes.
- The SVT row hogs 40 % of the first search screen with irrelevant hits (discover X1). No-match is a dead end (X3).

### 1d. TV / sofa (parents)
- TV text sits at 20–22 px against a 24–28 px floor; guide text is small and dim; aired cells look the same as upcoming (design G5, owner T1–T3).
- **TV subtitles are fixed: 52 px, shadow only, no box** (design G3). The web has size and box options. The people who most need bigger, boxed captions are the ones who can't change them.
- No pressed state on Select, so a slow Tizen invites double presses (design G7).
- The web UI doesn't scale its chips, peek or toasts at 1920 (discover S9, system B1). Lower priority: the parents use the TV app, not a TV browser.

### 1e. Real, but users won't feel it one finding at a time
Token drift (42 font sizes, 93 shadows, 22 breakpoints, system B1–B11), 4 sheet implementations, 11 button heights. I
**back** a CI drift budget (system Phase 3), because it's cheap and stops the next agent making a 12th button. I **oppose** a
big-bang Phase 1 codemod before the user-visible bugs are fixed: it costs a lot of screenshot-diff review and nobody in
the family will notice it. Migrate a component's tokens when we touch it for a real fix.

### 1f. Operational finding everyone should know
The player audit found that **fleet screenshots start real conversions on geofront** (headless Chromium can't decode,
so `/api/media/.../audio` and `/api/convert` kick off H.264 copies). The harness must not do that. It burns the
server's encode lanes on the family's evenings.

---

## 2. Fix now (ranked, 25 max)

Rank = (how many real people hit it × how often) ÷ effort. Each item is S unless marked.

1. **Room Audio button back.** Delete the stray `audioBtn.hidden = true` in `renderParty` (player B1; check the twins at 5702/6985). It's a shipped promise.
2. **Live chat privacy.** One `visibleWatchers()` helper for the strip, chat header and guide (player B3). It's a trust bug in a feature two days old.
3. **Primary-button contrast by best ratio** (system A1 / owner B5). Bundle it with `--text-3` → AA (system A2) and theme-aware `--ok/--info/--warn` (system A3, owner I18). One contrast commit.
4. **Calm offline/reconnect.** Static heading → Discover. Family copy ("Lilin isn't answering right now, it's probably restarting"). Map fetch failures to one translated string. Add an `offline`/`online` listener with a "Reconnecting…" pill that re-renders when the server answers (discover S1–S3 + Idea 5). S–M.
5. **Owner hub tab on phones.** Discover · Live · Library · Owner · Settings, where Owner is a page of tiles with badges for Notes / Activity / House / Clips (owner B3 + Idea 1). Family tab bars don't change. **The conversion details move in here** (see 7). S–M.
6. **Player overlay discipline.** One `closePlayerMenus()` (player B2). The error becomes a card with Try again / Back that hides `.player-center` (B9), with "channel dropped out" wording on Live. Toast below the note (B8). Plain-language conversion note (D6). Live "Keep watching" → "Watch on demand" (C5).
7. **Convert banner off for non-owners.** Families see "Preparing" on the card instead. Owners get one line that opens a details sheet in the Owner hub. Titles, not file names (library A2).
8. **Room on phones and tablets:** use the live chat's stage-push sheet model: picture on top, room below; dock from 700 px with a narrower panel (player B6, B5). One `.side-panel` for both (player C2 / system C2). M. This is the big one in this list, and it's still a fix: rooms are unusable on a phone today.
9. **Travel list `false` + Swedish travel subtitle + untranslated quality label** (library D4).
10. **Shows tell the truth.** No "all caught up" with zero files (library C2). Unaired episodes say "Airs 3 Dec" with no Add (C4). Localised episode titles in Swedish (C6). Hide "0 episodes ready" (C3). S–M (air dates need `fillEpisodeDetails`).
11. **One expiry vocabulary.** An `expiryLabel()` helper used in all four places: "Leaves in 6 d" on art, "8 min left" stays for time. Drop the per-row Keep link under a keep bar (discover D7, library A7, C5). Keep-all becomes secondary (library C1, system C3).
12. **SVT title sheet through `pageHero`** (discover T1) + a skeleton instead of "Loading…". This is the parents' favourite content.
13. **Swedish share pages.** `translateHtml` on `/c/i/` and `/c/w/`, `sv-SE` dates (owner B6). HTML 404 card for malformed `/c/*` and a card on the dead clip page (I1, I2).
14. **Library top-of-page diet** (library A1, A9, A11): move the shared-library sentence to Settings, put the downloading and phone pills in one chip row, and fold Availability + **Sort** into one toolbar menu (A6, Idea 3). Hide the toolbar on an empty library. Move "Find torrents" out of the family header.
15. **Non-downloader show page gets a top action** (Play S1 E1 / Add to my library when it's on the server) plus one Play/Add vocabulary across peek, billboard and page (discover T6, T7). *Ranked higher if Pappa/Anita can't download.*
16. **Library film page gets the version picker** (library B1, the minimum version of "one title page"). Delete/Identify go behind ⋯ with `is-danger` (B2). Remove-from-library on shows goes behind ⋯ (C3).
17. **What's new on phones:** hidden when there's nothing new; lit bulb + count when there is (discover S5 / owner I11 / system C5). One `--ctl-h` for header controls (S6) while we're there.
18. **Phone grid captions:** keep the rating, drop the type word under 132 px (discover D4). Badge glyphs (check / house) instead of mystery squares (D5). No "On server" on Popular on Lilin, and thumbs instead of hearts (D6).
19. **Facts leading-dot wrap**, once in CSS (discover T2 / library B3), plus `fmtRating` with locale decimals (D19, T3).
20. **Touch hit-slop + `@media (hover:hover)` wrap** (system D, E). Mechanical, and every iPhone tap feels better.
21. **Peek sheet handle + close** (discover P2). Peek buttons use the billboard classes (P1).
22. **Wake Lock while the phone remote drives a playing TV** (design G2). It fixes a limitation our own changelog admits ("a locked phone can't start the next one").
23. **TV readability pass** (served, no reinstall): text floor 24/26 px, dim aired guide cells, full-width guide lane, a 120 ms pressed state on Select (design G5, G7; owner T1–T3). Translate "Home network" on the TV header (T4).
24. **Search order:** SVT row after the first results row unless it's an exact match (discover X1). No-match gets "Clear search" + (for downloaders) "Find it to add" (X3). Folds into feature #2 if that ships first.
25. **Discover tidy:** Trending row skips the six billboard items (D2). Genre page gets "‹ Discover" + "Comedy shows" (D9). Hide the global filters on Coming soon (D12) and sort its weeks by date (D13). Billboard kicker per context (D17). No parallax on phones (D18, which revamp.md already forbade).

Just below the line (do in passing, not as tasks): owner I3 owner toggles that snap back, I6 one clock format, I7 note
dates, B2 "ServerOwner" index, B4 Swedish segmented wrap, B1 Activity chips overlap (owners only, but Swedish-broken),
player B4/B10/D9/D10, library D1 Play-on-TV filename subtitle, D5 transfer sheet. All S. Bundle them into one "owner
screens tidy" commit and one "player strings" commit.

---

## 3. Feature shortlist (12 max, ranked)

Selection rule: it must make something Lilin already does feel *complete* for a named person, or remove a step they take
every week. New surfaces have to beat that bar. Ideas merged across files are noted.

**1. Watch Together keeps going: Next episode for everyone** (player Idea 1; + "Ask for a pause", player Idea 2).
Oliver and ebi binge anime in rooms. Today every credits roll ends the room and someone has to set it up again, which
is the single biggest friction in Lilin's best social feature. The host gets Up next; guests see "Next episode in 7 (ebi
has the remote)"; `room.switch` already swaps media for Play now. Add the ✋ pause request as a 1-day rider: Restricted
family can use rooms, and guests have no other way to ask. **M.**

**2. Search that knows the server** (discover Idea 3 + X2 + X3; comp. Infuse 8.5 grouping; comp #15 "can I watch this now").
The most common question in a household server is "is X on Lilin?". Results come grouped **On Lilin (Play) → Can be added
→ Free on SVT Play → People**, with All/Films/Shows, recent searches, and a no-match that offers a way forward. All
client-side regrouping on data we already have. Everyone uses search; nobody will open a new tab for it. **S–M.**

**3. Show pages that work like a remote: season tabs + season "mark watched" + "Next to go" once** (library Ideas 1, 2,
6, 9; revamp.md's promised tabs that never landed). Opens on the season with your next episode. Unaired rows say when.
The auto-delete line appears once per show. Mark a season watched for shows started on Netflix. It's one tap less every
evening for every show-watcher. Must cope with One Piece (20+ seasons → scrolling chips). **M.**

**4. Sofa comfort: captions and text size you can change** (design G3/G4/Idea 3 + system Idea 1).
TV subtitle look menu (size 75–150 %, box/shadow, low/high, live sample line) stored per TV. On the web, extend the
look to colour and box opacity. Appearance gets "Text size: Normal / Large / Larger" through a `--ui-scale` on the
existing fluid tokens. The audience the brief names (family, the parents' TV) gets the accessibility parity every
streaming app has. TV half is served, no reinstall. **M.**

**5. Watch privately** (social Idea 4, gap 1). A player ⋯ toggle and a per-title switch: progress still saves, but no
Activity row, Popular on Lilin, Wrapped companion, presence or **profile diary**. **Why now:** the uncommitted
`profiles.js` will show "what they've watched lately" to friends, and Activity is already visible to *two* owners.
ebi can see Oliver's dad's viewing today. This has to ship before or with profiles, not after the first awkward
moment. **S.**

**6. Phone feels native: lock-screen and headphone controls + Home Screen badge** (design G1/Idea 2, Idea 5).
`MediaMetadata` with poster and episode, play/pause/seek/next handlers, `setPositionState`; `setAppBadge` for
new-episodes-of-followed + downloads-ready. ebi lives in the PWA, and right now the lock screen shows a page title. **S.**

**7. "Ask for it" for people who can't download** (discover Idea 1; comp. Streamyfin Seerr requests). Instead of an
empty action row: "Ask Oliver for this" → owner push + a Requests tile in the Owner hub with one-tap Add, and a "your
request is here" push when it lands. **Conditional:** only if some family members lack download rights (question E1).
If everyone can download, kill it. **M.**

**8. Collection strip on the title page** (comp #5). "The Dune collection · 2 of 3 in Lilin", release order, watched
checks, **Add the missing one**, and "Part 1 comes first". `belongs_to_collection` already arrives and is shown as dead
text. One-press add makes this better than Jellyfin/Channels. Everyone hits the "which Mission Impossible is next" moment. **S–M.**

**9. A billboard about *your* Lilin + people as the reason** (discover Idea 10 + D2; design Idea 6; social Idea 10;
comp #15). The six slides become: 3 trending, "New episode" of a followed show, "Just added", "Out Friday". Cards and the
peek get at most one evidence chip from our own data ("Liked by ebi", "Saved by Pappa", "New ep Fri"), never
dislike counts, respecting Restrict and Watch privately. This turns the most-seen pixels from a TMDB ad into a
household one and kills the trending duplication for free. **S–M.**

**10. Skip recap + "there's a scene after the credits"** (comp #1). Stinger chip from TMDB keywords is **S**, and
it's genuinely loved (Plex's best-reviewed player feature). Recap skip via TheIntroDB (keyed by TMDB id) is **M**: plain
HTTP + cache, no package. Do the stinger first; recap only if the engineer is fine with an external segment source.

**11. In-app person pages, "On Lilin" first** (discover Idea 2). On the iPhone PWA, a cast tap that leaves for TMDB
drops you out of the app. A person page that shows what of theirs is already on the server is pure "what can I watch
right now". It's also the foundation for "Follow a person" later (comp #9, not now). **M.**

**12. "You'd like this": send a title** (social Idea 1). Pick friends, add a one-line note; they get a push and a "From
friends" shelf; the sender hears "ebi loved it". The most evidence-backed small-group feature, and it reuses Moments'
send panel. Low on my list because the audience is small: Restricted family can't use it, so in practice it's
Oliver ↔ ebi ↔ a few friends. **S–M.**

### Cut or deferred, and why
- **Moments reel / vertical feed** (comp #14, design #7): no supply at 5–10 people. Social research already argues
  against it. **Kill.**
- **Ask Lilin natural-language search** (comp #7) and **LLM "Previously on" recaps** (comp #2): the LLM is on magi,
  Oliver's gaming PC, and is only allowed at night/idle (`magi-gpu-busy`). Interactive search can't depend on that.
  Recaps could precompute, but that's L for a nice-to-have. **Defer** until there's a GPU that isn't a gaming PC.
- **Pick together / swipe-to-match** (social #2, scout): Oliver and ebi decide over Discord; the parents decide on
  the sofa. It's a whole new surface for a problem the Tonight card and personal billboard (feature 9) cover partly.
  **Defer**; it's in the scout inbox anyway.
- **Tonight card / Surprise me** (discover #4, social #11): Netflix killed context-free shuffle. The context version
  is absorbed by feature 9. **Merge, don't build separately.**
- **Who's watching on the TV** (comp #4, social #9): I'm sceptical. The parents' TV is one shared account that
  *already* shares a library with Pappa and Anita, and couples on one sofa mostly *want* one Continue watching. Building
  a profile picker across two TV codebases is M–L for a problem nobody has reported. **Defer: ask Oliver whether they
  ever watch separately.**
- **Edit your home (pin/hide/reorder rows)** (comp #6): the family won't edit. Oliver/ebi might, but the real
  fix is fewer, better rows (merge MOODS into vibes, discover D3; drop duplicate trending). If anything, ship "Hide this
  row" in a row ⋯ later. **Defer.**
- **Lists / Our list / Presented-by collections** (comp #8, social #8, design #8): three flavours of the same thing,
  and profiles (with favourites) are mid-build. Let profiles land, then see if lists are asked for. **Defer.**
- **Diary** (design #10): **duplicate** of the in-flight `profiles.js` diary. Kill as a separate idea.
- **Taste match, Now watching presence, Watching-with/no-cheating, episode reactions** (social #3, 5, 6, 7): each needs
  Watch privately first, and each serves 2–3 people. Presence also runs straight into the Plex backlash. **Defer.**
- **Smart To phone (keep next 3)** (comp #3): loved elsewhere, but nobody here has reported travelling with Lilin, and
  it's M. **Defer**; group the For-your-phone list by show when it grows.
- **Upgrade for films** (library #5), **Fit/Fill zoom, chapter names, speed badge** (comp #12), **Pause card** (comp #11),
  **Shuffle a show** (comp #13, scout), **Loved it** (social #13), **Spoiler guard** (comp #10, scout), **Bedtime dim**
  (player #6), **"What did they say?"** (player #3): all fine S-sized player/page niceties. Park them for a later
  "player polish" batch, or let the scout inbox carry them. "What did they say?" is the one I'd pick first from this
  pile (Pappa/Anita, Swedish/English mixes).
- **TV follows your theme / Auto theme** (owner #3, system #2, #6): nobody on the TV asked for colours. **Kill** TV theme;
  Auto theme is a maybe-later.
- **VT poster morph, real springs, ambient glow, scroll-driven animations, smart scrim** (design #1, 9, 11–13): the users
  won't name any of them. Smart scrim is the exception worth keeping in the design director's pocket (a readable title on
  the first screen). The rest goes after the fix list. **Defer.**
- **Weekly owner digest** (owner #6): Oliver prefers DMs, and the nightly reviewer exists. **Kill.** *Disk forecast in
  House* (owner #7) is S and useful with a 3 TB cap: fold it into the Owner hub.
- **Settings search** (owner #8): a sticky section-chip row on phones (owner I15) is cheaper and enough. **Kill**
  search, do I15.
- **.ics for planned parties** (owner #5): planning was removed in 12fac9e (`social.planPartyBody` is dead code). **Kill**,
  and delete the dead code.
- **DoesTheDogDie heads-up** (social #12): external key, terms and cost for a rare need. **Kill.**
- **Clip share page with match story** (owner #4), **seat lights**, **mini guide in channel** (player #5, #7):
  niche. **Defer.**
- **Owner style-guide page** (system #4): an agent tool, not a user feature. The CI drift budget (system #5) gets the
  same benefit cheaper. **Yes to the budget, no to the page.**

---

## 4. Challenges for the other panelists

### Design director
1. **Order of work.** My list puts ~25 user-facing fixes ahead of the token codemod and VT morph. Can you live with
   "migrate tokens when you touch a component", plus a CI budget that only fails on *increases*? If not, name the
   two or three token families users actually see (my guess: contrast, TV type scale, hit areas).
2. **Owner hub vs 8 tabs.** Do you agree that owners get a 5-tab bar with one Owner tab, rather than smarter icons? The
   family bar must stay at 4–5 labelled tabs.
3. **Season tabs at scale.** One Piece and long anime have 20+ seasons, specials, and "season 0". Tabs, chips, or a
   select? Show me the phone layout before anyone builds it.
4. **Billboard.** Netflix's 2025 backlash was density lost to spectacle. Is the billboard earning its height on desktop/TV,
   and will you accept a mixed personal billboard (feature 9) with per-slide kickers?
5. **The season page lights the bulb on three things** (library C1, system C3). What's the one lit thing: Play next, or the
   keep bar when deletion is imminent?
6. **MOODS rows vs vibes** (discover D3): retire the genre "moods" into vibe tiles, yes or no? Two things called Moods is
   the kind of thing ebi notices.
7. **Phone peek.** A long-press nobody discovers, with no close. Keep it and fix it (P2), or drop it on phones?

### Skeptic engineer
1. **Who can download?** Do Pappa, Anita and Mamma have `canGet`? That decides Fix #15 and feature #7. Check the users table
   on geofront (read only).
2. **Room sheet on phones (Fix #8).** Is sharing live chat's stage-push model with the room an S/M refactor or an L? It's
   the one "fix" I'm putting M effort into.
3. **Next episode in rooms (feature 1).** `room.switch` + the swap guard handle Play now → full. Is "advance to the next
   file for every member" the same code path, or a new sync state? What breaks for a guest still buffering?
4. **Two TV codebases** (JS in `public/tv` + the Rust WebGL app). Which one is on the parents' TV right now? Every TV
   item (Fix #23, feature 4) costs double while both live. Should one be frozen?
5. **Profiles in the working tree.** Who's building `src/profiles.js`, and can Watch privately (a flag in `logWatch`)
   land first so profiles, Activity, Popular and Wrapped all read one "private" bit?
6. **TheIntroDB** as a runtime HTTP dependency for recap segments: acceptable in a no-dependency server if it's
   cached and optional? Or only the TMDB stinger keywords?
7. **The screenshot harness starting real conversions on geofront** (player audit heads-up). Can `shoot.mjs` block
   `/api/convert` and `.../audio?plays=` too, not just non-GET?
8. **Offline pill (Fix #4).** Any risk the `online`/`offline` re-render fights the existing reconnect logic in the player
   (`lilin-player-reconnect`)?
9. **The convert-detached test fails on clean master** (memory `lilin-big-update`). Is CI red, and does that block the
   drift budget's CI step?
