# Critique round 1: designer D on A, B and C

Read in full: `proposals/A.md`, `B.md`, `C.md` and their mockups (A: discover-phone, owner-phone, library-desktop;
B: phone-you, phone-search, phone-house, desktop-you; C: together-phone, library-phone, together-desktop). Two facts
checked in the code because they change the scoring:

- **The TV app's home is the library.** `public/tv/tv.js` `homeScreen()` is your own rows (with the on-its-way
  row kept live), and Search · Lilin TV · Discover · Documentaries are top links over them. Every web proposal
  except D keeps Discover as the web home, so web and TV keep opening on different things.
- **H's moments are a client gate, not a server change.** `src/moments.js` `list(user)` keys on `user.id`; only
  `public/moments.js:300` (`if (!me()?.email) return []`) hides them. A and C were right, and D.md section 2.2 was
  wrong to call it a server question.

## The same 13 tasks, taps from cold (phone)

| Task | Today | A | B | C | D |
| --- | --- | --- | --- | --- | --- |
| Resume what I was watching | 1 | 1 | 1 | 1 | 1 |
| Open my whole library grid | 1 | 1 | **2** | 1 | 1 + ~1,800 px scroll |
| See what's downloading | 1 + scroll | 2 | **1** (Right now) | 2 | 1 + ~1 screen scroll |
| Keep a title that leaves tomorrow | 2 + scroll | 2–3 | **2** (Keep in Right now) | 2–3 | 3 |
| Pick together | 1 + 2.2 screens | 1 + ~1 screen | 2 | 2 | 2 |
| Documentaries on a phone | 2 | **1** | 2 | 2 (unchanged) | 2 |
| Accept a friend request (popup dismissed) | scroll | 2 | 2 | **1–2** (card on Together) | 2 |
| Moments sent to you | scroll | 1–2 | 2 | 1 + scroll | 2 |
| Tune SEELE TV ch. 3 | 2 | 2 | 2 | 2 (guide: 3) | 2 |
| Sign in a TV | scroll | 2 | **3** (You → Settings → Devices) | 2 | 2 |
| Owner: open Notes | 1 (icon, may be off-screen) | 1–2 | 2 | 1–2 | 1–2 |
| Owner: change someone's Can download | bottom of ~5.7k px | 3 | 3 | 3 | 3 |
| New member, empty library, first open | Discover | Discover | Discover | Discover | **near-empty Watch** |

## A: keep the tabs, one home per job

**Strongest ideas**
1. **Library as three short segments: Titles · Watchlist · Downloads.** The desktop mockup's Watchlist (dated Coming
   up rows with the follow switch inline, Saved, Following) is the first complete watchlist any of us drew.
   Downloads 7 → 3 is the best number on the panel, and On this phone gets a permanent home.
2. **"Invite" means one thing.** Invite = bring someone into Lilin; rooms and Pick say "Ask to join" / "Send link";
   profiles say "Share". It costs nothing and fixes a real confusion. Together with What's new → **For you**
   (moments, idea answers, requests), this is an inbox without a new surface.
3. **It ships in small batches and leaves the TV rows alone.** Members' tab bars don't change. Merged Popular/Top
   rated get *new* `HOME_ROWS` keys, so the TV apps keep the old ones. H gets a household page through a client gate
   change only (correct, see above). Of the four plans, this is the one most likely to be live and working by tonight.

**Worst flaws**
1. **The two homes survive.** Continue watching stays on Discover. Your watchlist, downloads and new arrivals all
   move to Library. A member who opens the app gets Trending first and has to cross tabs for "what's mine". People
   whose start view is Library (A guesses the TV-minded family) *lose* the Continue shelf from their start screen (A,
   risk 5). Pressing Download on Discover now gives only a toast and a badge, because the On its way row left the
   page you're on.
2. **The social layer hides behind two small header icons.** Friends, Moments, Wrapped, your reviews and the H
   household page sit behind a 32 px face in the top-right corner, and the What's new bulb (no label under 600 px)
   now lights for two unrelated reasons: release notes *and* "someone sent you a moment". People who learned to
   ignore the bulb will miss friend requests. Pick together still needs about a screen of scroll (block 3), which
   fails the ≤ 2-tap test, and owner Screen Time goes 2 → 3 taps.
3. **The 8-tab overflow comes back one level down.** The Owner tab is a 7-chip row (6 for co-owner) that scrolls sideways
   on a 390 px phone. In `A/owner-phone.png`, Game clips is already cut and Notes, Ideas and Server are off-screen:
   the same "is it there?" problem as the icon tab bar. +act members keep Activity as a 5th tab while owners get it
   as a chip, so the tab model isn't uniform. The global search also removes Library's in-place text filter (A,
   risk 8): narrowing a 214-title grid by typing now means leaving the grid.

**Other checks.** co-owner (Firefox): fine, no new blur. R: no change to rules. New member with an empty library: fine
(Discover stays home). TV parity: unchanged mismatch (web opens on Discover, TV on the library). Scroll: Discover
~3,600 px, Library segments short; good.

| Findability | Phone-first | Nothing lost | Fewer entry points | Future fit |
| :-: | :-: | :-: | :-: | :-: |
| 7 | 6 | 9 | 8 | 7 |

## B: no Library tab, a You hub, a Search tab

**Strongest ideas**
1. **Right now.** One block with at most 3 rows of time-bound personal things (on the way, leaves tomorrow → Keep,
   party tonight → Join, preparing, phone copy ready) replaces six scattered bits: the convert banner, two summary
   buttons, the parties shelf, the Leaving soon shelf and Discover's On its way. It wins every time-bound task in
   the table above and disappears when there's nothing. This is the best single idea on the panel.
2. **Search as a tab with a browse landing.** Pick together first, then Films / Shows / Documentaries / Coming soon
   tiles, Moods and Genres. Search moves into thumb reach, its six meanings collapse into one, Pick together is 2
   taps from cold, and Discover can go back to being a feed. (D's Find is the same idea with Discover's rows
   attached; B got there more cleanly.)
3. **House's "Needs you" list and old hash names as page names.** "3 new ideas", "1 download needs attention" above
   the tool list is better than D's tiles with counts: it says what to do, not just how many. `#library` simply stays
   the grid page under You, with no redirects to maintain.

**Worst flaws**
1. **The daily job moves behind the weekly one.** The full grid goes 1 → 2 taps for all 35 accounts (You → See all),
   and the word "Library" leaves the tab bar. That's the opposite of the TV app the parents use, where the library
   *is* the home. A member browsing their 214 titles pays a tap every time.
2. **The hub is Settings 2.0 with posters on top.** The member hub is 8 blocks (~1,880 px): identity, Right now, 2
   poster shelves, Yours (Notes, Downloads, History, Ratings and reviews, Liked), Wrapped, People, Lilin
   (Ideas, What's new, Settings). It creates new duplicates: downloads show up in Right now, the Downloads row and
   card progress; ratings and liked titles show up in both the hub and the public profile (B, risk 4); Moods and
   Coming soon get 2 entries each. The You tab carries a download badge *and* a dot for What's new, requests and
   moments: one badge, four meanings. Sign in a TV becomes **3 taps** (You → Settings → Devices).
3. **Owner and desktop regressions.** Notes moves into a personal hub between Downloads and History (2 taps, not a
   remembered tab), Activity sits in You for owners while its admin half sits in House, and the H account's "You"
   is a household (B, risk 5). On desktop, Discover loses its type control: Films becomes field → Films (2 clicks),
   and there's no visible Search page to discover. The What's new pill also leaves the header for a row inside You.

**Other checks.** co-owner: fine. R: many role-gated rows on one page (B, risk 11) are where a gate gets miscopied. New
member with an empty library: Discover is home, but the hub is a stack of empty lists (History 0, Liked 0, Your
library 0). TV parity: worse than today in name (no "Library" anywhere on the web nav). Scroll: Discover keeps the
most blocks (14, ~4,400 px).

| Findability | Phone-first | Nothing lost | Fewer entry points | Future fit |
| :-: | :-: | :-: | :-: | :-: |
| 8 | 8 | 7 | 6 | 6 |

## C: Together (social-first)

**Strongest ideas**
1. **One Invite sheet, five contexts.** People with an action button · Copy link · Share…, opened for Lilin access,
   friends, rooms, Pick and moments. A and D only fix the *words*; C merges the *component* (friends.css rows and
   moment share rows → one row style). It's the real fix for the inventory's "5 invite flows".
2. **Watch parties become creatable where they're listed.** Start now / Plan a time from Together, using the existing
   `POST /api/watch/plan`. That fixes the inventory dead end (you can cancel a party in Library but only create one
   through a Pick match) with no new server code. The friend-request card that replaces the on-open popup is also
   right: it stops interrupting people.
3. **The most careful privacy rule.** "Together shows no data the account can't already see today", with R spelled
   out (head counts only, no faces, link-only Pick and rooms, no chat) and phase 2 held until Watch privately
   ships. Every other plan should adopt that sentence. (Also good: Settings on phones as an index where each group
   is its own page, ≈ 700 px instead of 5,657+ px for the owner.)

**Worst flaws**
1. **Live, the one feature every account uses, gets demoted to make room for social.** Live TV is the only tab
   restricted users, the H account and the family all share. C renames it "Together" and puts a friend-request card
   and a friends strip above SEELE TV. The full guide becomes `#together/guide` (2 → 3 taps). For H and R the tab is
   3 blocks, which C admits reads as "a renamed Live tab". The TV app still says "Lilin TV", so the parents get a
   different word on each screen. "Tillsammans" is 11 characters on a 78 px tab.
2. **Discover's real inconsistency is left as it is.** The type filter stays a segmented control on desktop and
   Browse ▾ on phones. The phone header on Discover keeps 5 controls (wordmark, Browse, search, bulb, face), and
   Documentaries on a phone is still 2 taps through a sheet. Search is narrowed to "find a title", so people can only
   be found through Together → Add. Discover also keeps personal rows (Continue, Your list slice, New in your
   library), so the two-homes split survives as well.
3. **The owner's social space fills up with admin.** Activity, with permission changes, downloads and idea events,
   moves into "Together" for owners, so co-owner and Owner see a different Together from everyone else (C, risk 4).
   Putting "Owner · TV 3" on a front page makes existing presence data far more visible (risk 3). It's also the
   biggest build (new view, hub, Settings index, Library segments, invite component, router aliases, title
   renderer), and the part that matters to the most people (Live) is the part it makes worse.

**Other checks.** co-owner (Firefox): Together uses no blur, good. R: best-specified of the four. New member with an
empty library: Discover home, fine; a Together of "You + Add" and channels is honest. Scroll: the channel rail
refreshes every minute and the friends strip listens on SSE, so it should get `content-visibility` below the fold,
as C says. TV parity: worse in naming (Live → Together).

| Findability | Phone-first | Nothing lost | Fewer entry points | Future fit |
| :-: | :-: | :-: | :-: | :-: |
| 7 | 6 | 8 | 7 | 6 |

Future fit is low because "involves another person → Together" catches almost everything (send a title, review,
moment, party), so the 7-block cap will be the first budget anyone breaks.

## D, scored by the same rules (not defended)

| Findability | Phone-first | Nothing lost | Fewer entry points | Future fit |
| :-: | :-: | :-: | :-: | :-: |
| 7 | 6 | 7 | 7 | 7 |

D is the only plan whose web home matches the TV home. It's also the only plan where a new member with an empty
library opens on a near-empty page, where the grid is a long scroll below 5–8 rows, and where search on a phone is
2 taps from every tab. The Trending billboard and the "Discover" name are both demoted.

## What I'd steal into D

| From | Idea | Where it goes in D |
| --- | --- | --- |
| B | **Right now** (max 3 rows, time-bound) | replaces D's conditional On its way, Leaving soon and On this phone rows on Watch, plus "party today". Watch drops from 10 max blocks to 7 and puts Keep one tap from the tab |
| B | House **Needs you** list above the tools | on top of D's House tiles |
| A | **Library as segments**: Titles · Your list · Downloads | Watch's lower half becomes a segmented "Your library" (fixes D's long scroll; a second tap on Watch jumps there) |
| A | "Invite" wording rule + new `HOME_ROWS` keys so TV rows stay | as is |
| A, C | H sees its moments (client gate only) | correct D.md 2.2 |
| C | **One Invite sheet**, 5 contexts | replaces D's "3 verbs" (D only changed the words) |
| C | Create watch parties where they're listed | Live → Planned gets "Plan a watch party" |
| C | Friend-request card instead of the on-open popup; the "no data the account can't already see" rule | You → Friends card + tab dot; the rule as a design constraint |
| C | Settings phone index with group pages | D already does this in You, so it confirms the shape |

## Where D is now weaker than another plan

- **Than A on risk and on the front door.** A changes nothing for members' tab bars and keeps Discover as the
  familiar first screen. D changes the home for all 35 people, and the empty-library case has no proven answer, only
  a fallback rule. If the panel weighs "ship tonight and don't confuse Robin", A wins.
- **Than A on the library itself.** A's three short segments beat D's rows-then-grid single scroll for browsing
  what you have: with D the grid starts ~1,800 px down unless you know the second-tap trick.
- **Than B on time-bound things.** Right now is cleaner than D's four conditional rows, and B's Search tab is D's
  Find without the row clutter.
- **Than C on social.** D leaves Pick (Find), rooms (player and Live), friends (You) and moments (You) in four
  places (D, risk 12). C is the only plan where "watch with someone" has a home, and the only one with a real
  invite component.
- **One factual error:** H moments are a client gate, not a server change (fixed above).

## Ranking

1. **A**: lowest risk, nothing lost, best library and downloads structure. Its flaws (two homes, the bulb as an
   inbox, the scrolling chip row) are fixable inside A.
2. **D**: the right home (matches TV) and the one search box, but it pays for both with the front-door change and a
   long Watch. It's best taken as a hybrid with A's segments and B's Right now.
3. **B**: Right now and the Search tab are the best parts on the panel, but it moves the library behind a hub.
4. **C**: the invite sheet and party creation are worth stealing, but it demotes the one tab everyone uses.

Close call between D and B; I'm D, so discount my order there by one place.
