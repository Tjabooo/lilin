# Critique round 1: designer A on B, C and D (and on A)

Read in full: `proposals/B.md`, `C.md`, `D.md` and every PNG in `B/`, `C/`, `D/`. Taps are counted on a phone from a
cold tab bar. "Today" figures are from `inventory.md`. The code claims are checked against master `b85d964`.

## 0. Same tasks, four plans (phone)

| Task | Today | A | B | C | D |
| --- | --- | --- | --- | --- | --- |
| Open your whole library grid | 1 | 1 | **2** (You → Your library) | 1 | 1 + scroll past 6–9 blocks (~2,000 px on D's own mockup) |
| Tune a SEELE TV channel | 2 | 2 | 2 | 2 (Together → tile); full guide **3** | 2 |
| Pick together | 1 + 2.2 screens of scroll | 1 + ~1 screen | **2** | **2** | 1 + ~0.7 screen (Find block 5) |
| Change default subtitles | 1 + scroll | 2 (index chip) | 3 (You → ⚙ → scroll) | 2 (sub-page) | 2 (You → row) |
| Open a moment sent to you | Settings + scroll | 1 (What's new while new) / 2 | 2 | 1–2 | 2 |
| Accept a friend request after closing the popup | Settings + scroll | 2 | 2 | **1** (card on top of Together) | 2 |
| Search for a title while on Library | 1 (but it *filters the library*) | 1 | 1 (Search tab) | 1 | **2** (Find, then the field; no header search on phones) |
| See what's downloading | 1 | 2 (count visible on the segment) | **1** (Right now row on You) | 2 | 1 + scroll (Watch block 3) |
| Full What's new list | 1 | 1 | **2** (You → row) | 1 | 1 |
| Owner: open Notes | 1 (unlabelled, scrolling bar) | 1–2 | 2 | 1–2 | 1–2 |
| Owner: change one person's Can download | Settings + ~5k px scroll | 3 | 3 | 3 | 3 |

## 1. Proposal B: no Library tab, a "You" hub

### Strongest ideas
1. **Right now** (0–3 rows, ordered by urgency: party in the next 12 h → Join, leaving within 48 h → one-tap Keep,
   downloads on the way or needing attention, preparing playback, phone copy ready). It is the one surface in any
   plan that answers "what needs me today" without visiting three places. It replaces the conversion banner, both
   summary buttons, the parties shelf, the Leaving soon shelf and Discover's On its way. A doesn't have it. A spreads
   those same things over Library › Titles, Library › Downloads and Live.
2. **Search as a browse landing** (`B/phone-search.png`): Pick together card first, Browse tiles (Films, Shows,
   Documentaries, Coming soon), Moods, Genres. Pick together becomes 2 taps with no scroll, and the browse controls
   are the same at every width. This is the best Pick together placement of the four.
3. **Old hash names become page names.** A page table `{page → {tab, allowed()}}` replaces `.tab[data-view]`
   checks, so `#library`, `#downloads`, `#settings` and `#notes` keep landing on real pages instead of redirect
   chains. This is the cleanest routing spec in the panel. A's router would be better for copying it.

### Worst flaws
1. **It taxes the daily job to fix the weekly one.** The whole grid goes from 1 tap to 2 for all ~35 accounts (B's
   risk 2), Settings from 1 to 2 (You → ⚙), What's new from 1 to 2 (the header pill is removed and becomes a row in
   You). For the TV-first family (Robin, Alex, the Home network account), whose TV app opens on their library
   (`public/tv/tv.js` `homeScreen`), the web app loses the word they know as a destination. On the TV it is the home
   screen. On the web it becomes a shelf inside "You".
2. **"You" is wrong for the busiest shared account.** The Home network account is the whole household: a person
   glyph labelled "You", a hub showing History, Ratings, Liked and Moments for "everyone at home". Restricted
   members get a hub where half the rows are gated differently (Ratings but not reviews, no Friends). Eleven
   role-gated rows on one page is the leak risk B lists itself (risk 11).
3. **Discover is barely decluttered, and browse jumps tabs.** Discover stays at 14 blocks with Popular films/shows
   and Top rated films/shows still split (A, C and D all merge them). Picking "Films" on the Search tab switches you
   to the Discover tab in a "Films ×" mode. That is a control in one tab silently changing another tab, the same
   class of bug as today's "typing on Settings throws you to Discover" (inventory 3.2). On desktop, Films goes from
   1 click to 2 (B's risk 7).

Also: owner Activity lands in the personal hub, not House, so admin events sit in "You". The hub is 1,880 px for a
member with 8 blocks and 12+ rows, and the cap is a promise, not a mechanism (B's risk 3). It is the likeliest
Settings 2.0.

### Scores
| Findability ≤2 taps | Phone-first | Nothing lost | Fewer entry points | Future features |
| :-: | :-: | :-: | :-: | :-: |
| 7 | 8 | 8 | 7 | 6 |

Findability: social things and Pick get to 2, but the grid, Settings and What's new get worse. Phone-first: Search
in thumb reach, a clean header and Right now are all excellent on a phone. Entry points: downloads go 7 → 4, but
Moods, Coming soon, reviews, the profile editor and Settings each gain a door. Future: "put it in the hub" is too
easy an answer.

## 2. Proposal C: Together (social-first)

### Strongest ideas
1. **One Invite sheet, five contexts** (Lilin, Friend, Room, Pick, Moment): people with an action · Copy link ·
   Share…. R gets the link part only, as today. This is the only plan that turns the 5 invite UIs into **one
   component**. A only renamed them, D only cut them to 3 verbs, and B left them alone.
2. **The friend-request popup becomes a card + tab badge.** The app stops interrupting on open, and pending
   requests have a permanent 1-tap place. It is gentler than today's popup, and A keeps the popup.
3. **The privacy rule written down:** "Together shows no data the same account can't already see today". It comes
   with R's channel tiles showing head counts, not faces, and phase-2 "From friends" gated behind Watch privately.
   It is the most careful role table in the panel. Settings as an index of sub-pages (≤1.5 phone screens each) is
   also a better phone pattern than A's chip index over one long page.

### Worst flaws
1. **It renames the one feature every role uses.** Live is the only non-Discover tab that H, R and the parents
   reliably use. C turns it into "Together"/"Tillsammans" (11 characters, C's risk 2), adds a couch icon, and moves
   the full guide from 1 tap to 2. For R and H, Together has 3 blocks: a SEELE TV rail, two tiles they can use by
   link only, and their moments. It is a renamed Live tab with social chrome they can't use. C admits this (risk 1).
2. **Discover keeps the per-width control split.** "Type filter + Genres: unchanged". Phones still get Browse ▾ in
   the header and desktop the segmented control, so Documentaries stays 2 taps on phones. Discover also keeps New in
   your library (a duplicate of Library's Newest sort) and *adds* a "Your list" slice row. That leaves 12–14 blocks
   and two duplicates the inventory flagged.
3. **Admin and feature work in a social tab.** Owner Activity (permission changes, download events, idea events) is
   in Together, so the owner's Together differs from everyone else's (C's risk 4). "Watch party: pick a title from
   your library → Start now / Plan a time" is a new creation flow. The 11-10 revamp deliberately removed party
   planning from title pages and the player, and C brings it back in the IA round without a decision. It is also the
   biggest build (new view, hub, settings sub-pages, invite sheet, router aliases) for the smallest CSS win
   (−3.5 KB).

Also: putting "Owner · TV 3" in the friends strip on the front page makes existing presence more visible (C's risk
3). Pick together leaves Discover, the place where the "can't agree" moment happens.

### Scores
| Findability ≤2 taps | Phone-first | Nothing lost | Fewer entry points | Future features |
| :-: | :-: | :-: | :-: | :-: |
| 7 | 7 | 8 | 8 | 7 |

Findability: social is 1–2 taps, but the guide gets worse and Documentaries on phones doesn't improve.
Phone-first: Together's first screen (`C/together-phone.png`) is the best social screen in the panel, but Browse ▾
survives. Entry points: the invite sheet and friends going 3 → 2 are real cuts. Future: the "involves another
person → Together" rule is clear, but Together then attracts everything and is capped at 7 blocks.

## 3. Proposal D: Watch / Find

### Strongest ideas
1. **Search with a "Go to" registry plus a test.** About 45 places and settings (Swedish labels, synonyms, who
   sees each, route) are searchable next to titles. A unit test fails if a route has no registry entry or no Swedish
   label (`D/find-desktop.png`: "sign" finds Signs, a channel, a friend, *Sign in a TV*, *Who may sign in*, *Sign
   out*). It is the only mechanism in the panel that keeps findability from drifting as features land. The rest of
   us, A included, have only budget tables.
2. **The title-page state table**: seven states (Not on Lilin, On Lilin not yours, On its way, Ready, Leaving soon,
   Unreleased, SVT), each with exactly one primary and a quiet state line ("Leaves in 2 days · Keep", "43 % · about
   20 min"). All four of us merge the three renderers, and D's is the spec I'd build from.
3. **A playable, personal billboard on the home** ("Ready for you · You saved it"). The first thing on the default
   screen is something you can press Play on, not TMDB's trending. Together with "Open Lilin on" losing its reason
   to exist, it is the cleanest answer to "Lilin has two homes". On concept it is also closer to the TV app (whose
   home is your library) than A, which only matches the TV app on names.

### Worst flaws
1. **The front door changes for everyone, and both main tabs are renamed.** Discover → Find, Library → Watch, with
   Titta/Hitta one letter apart in Swedish (D's risk 9). Saved "Open Lilin on: discover" can't be told apart from the
   default, so people who chose Discover land on Watch (D's own deep-link table). Robin and Alex relearn two names.
   A relearns none and B one.
2. **Watch is one very long page.** Billboard plus up to 7 conditional rows plus the whole grid with a sticky toolbar
   in one scroll. D's annotated mockup reaches "Your library" at ~2,000 px with 3 tiny rows. A real library (214
   titles in B's mockups) adds ~70 grid rows below that. Browsing your own collection becomes 1 tap + a long scroll,
   and the page holds the most posters of any screen in the panel (D's risk 8: needs `content-visibility`, a
   scrollperf run). A new member with an empty library gets a home that has to fall back to Popular on Lilin and
   then redirect to Find. That is the branchiest first run of the four.
3. **Search moves off the phone header.** From Watch, Live or You, search becomes Find → field (2 taps, risk 4).
   Settings hides behind a face-shaped tab (risk 11). D also says H's moments are "a server question", which the code
   contradicts. `src/moments.js` `list(user)` already returns `mine` by `user.id` for any account, and only
   `public/moments.js` `settings()` gates on `me()?.email`. So D's "Not solved" list keeps an H dead end that is a
   one-line client fix.

Also: Activity has two homes by role (House for owners, You for +act). Phone copies go 5 → 6 entry points across
two homes (Watch row while copies exist, You › Devices & TVs). Find loses the billboard.

### Scores
| Findability ≤2 taps | Phone-first | Nothing lost | Fewer entry points | Future features |
| :-: | :-: | :-: | :-: | :-: |
| 8 | 6 | 7 | 7 | 9 |

Findability: the registry finds anything by name, but the grid needs a long scroll and phone search is 2 taps.
Phone-first: Watch is long and search isn't in reach. Nothing lost: H moments are left hidden on a wrong premise,
and phone copies and Activity are split. Future: the slot table plus the registry test is the strongest mechanism
here.

## 4. A, scored the same way (self-assessment; discount accordingly)

| Findability ≤2 taps | Phone-first | Nothing lost | Fewer entry points | Future features |
| :-: | :-: | :-: | :-: | :-: |
| 7 | 7 | 9 | 8 | 7 |

## 5. What A would steal

1. **D's You tab in Settings' slot.** Discover · Live · Library · **You** (+ Owner). You = You card → profile,
   Friends, Moments, Activity (+act only), Invite to Lilin, Wrapped, Ideas, then the Settings groups as rows →
   sub-pages (C's phone pattern). This fixes A's worst weakness (the personal page behind a 32 px face, A risk 1),
   removes A's What's new "For you" overload and the H household-page special case (H's You card is "Home network"
   with Moments/Wrapped/Ideas, as in D and B), and takes +act members from 5 tabs to 4. It costs Settings one tap
   (2 instead of 1 + scroll) and puts a face, not a gear, where Settings was. The Library tab and every tab name
   except Settings stay.
2. **B's Right now at the top of Library** (0–3 rows, above the segments; hidden when there's nothing). It replaces
   A's Leaving soon shelf and the need to open Downloads to see "1 needs attention". Planned parties *today* show
   there too, while their full list stays in Live.
3. **D's Go-to registry + route test**, added to A's global search.
4. **C's one Invite sheet** and **C's friend-request card** (on top of You, with the tab dot) instead of A's popup.
5. **D's title-page state table** as the spec for A's one title page (A's "Your copy" block becomes D's state line).
6. **Pick together at 2 taps:** keep A's Moods tile and add a "Watch with someone" strip on top of Live (Pick
   together tile + today's planned parties), C's pairing without renaming Live.

## 6. Where A is now weaker than another plan

- **A personal/social home:** B, C and D all give "you and your people" a labelled tab or space. A's answer, a face
  plus an overloaded What's new sheet, is the weakest of the four. (Fix: steal 1.)
- **Pick together:** B and C reach it in 2 taps with no scroll. A still needs about a screen of scroll.
- **"What needs me now":** B's Right now beats A's spread of shelves and segments.
- **Settings on phones:** C's index of sub-pages and D's list-as-index beat A's chip row over one long page.
- **Future-proofing:** D's registry plus test is a mechanism. A's budget table is only a promise, like B's and C's.
- **Invites:** C cut 5 UIs to 1 component. A only changed words.
- **TV parity on concept:** D's library-first home matches the TV app's home better than A's Discover-first web app.
  A only keeps the names.

Where A still wins: the leanest Discover (11 blocks, one control on every width), Library at 1 tap with no long
scroll, Live untouched for the roles that live in it, no tab renamed for members, and the lowest-risk batches.

## 7. Ranking (standalone plans)

1. **A**: the safest skeleton with the leanest Discover, but it needs D's You tab and B's Right now to be a winner
   rather than a tidy-up.
2. **D**: the best ideas per page (registry, state table, playable home). It's held back by the renames, the long
   Watch page and search off the phone header.
3. **C**: the best social first screen and the Invite sheet, but it buries Live under a social label for the
   accounts that can't use social features, and leaves Discover's split control.
4. **B**: Right now and the Search landing are excellent. Removing Library costs the daily job a tap for everyone,
   and the hub is the likeliest Settings 2.0. It doesn't beat the alternatives, so by the brief's own test Library
   stays.

Recommended hybrid for round 2: **A's tabs and Discover/Library + D's You (in Settings' slot) + B's Right now + D's
registry and title-page states + C's Invite sheet.**
