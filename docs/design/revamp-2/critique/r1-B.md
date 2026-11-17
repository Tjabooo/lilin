# Critique round 1: designer B on A, C and D

Read in full: `proposals/A.md`, `C.md`, `D.md` and all their PNGs. Facts were checked against the code where a claim
mattered. I've tried not to defend B by reflex. Section 4 is where B loses.

**What the panel already agrees on** (so it isn't scored as anyone's win):
- 5 labelled tabs at most, and one owner hub tab.
- Settings holds preferences only, with a Devices group.
- One title page with state-driven actions and one episode list.
- One meaning for the search box.
- Continue watching only on Discover/Watch.
- Downloads 7 → 3–4.
- One watchlist.
- The two mood systems → one.
- Game clips renamed.
- Stats for nerds in player ⋯.
- Every face opens a profile.

**What is actually contested** is where *your titles* live and where *people stuff* lives:
- A: Library tab + profile face.
- B: You tab for both.
- C: Library tab + a Together tab.
- D: Watch as home + You tab.

TV-app reference: `public/tv/tv.js` `homeScreen` is library-first (Continue watching, On its way, Films, Shows rows),
with top links Search · Lilin TV · Discover · Documentaries.

---

## A: keep the tabs, one home per job

### Three strongest ideas
1. **Library as three segments with counts: Titles · Watchlist (n) · Downloads (n).** It keeps the noun all 35
   people know and gets the same consolidation B needed a new tab for. Downloads 7 → 3 beats B's 4. Each segment
   renders on its own, so the page is lighter than today's 11-block Library. It's also the best TV parity: the TV
   home is your titles, and the web tab keeps the name.
2. **H gets a "household page" through the existing API.** A checked that `/api/profiles/me` and `/api/moments` already
   answer for the shared account. I verified it too: the route at `src/server.js:3988` has no email gate. Only
   `renderMeButton` and `moments.js` gate on `email`. The fix is cheap and correct, and it means **B's claim (risk 5)
   that H needs a server change was wrong.**
3. **Invite vocabulary.** "Invite" means bring someone into Lilin. Rooms and Pick say "Ask to join" / "Send link",
   and a profile says "Share". That fixes the inventory's 5 meanings with wording alone, at zero CSS cost. B left all
   5 meanings untouched. Honourable mention: six independent, revertable batches. That fits Owner's "ship live,
   revert if disliked" better than any other plan.

### Three worst flaws
1. **Your personal side is behind a 32 px face.** Take a member opening Lilin to find the moment co-owner sent last week.
   While it's new: bulb (1) → For you (2). Once seen: face (1) → profile → Moments (2) → a sheet. On desktop, when the
   profile is nested over a title page, that's a dialog over a dialog over a dialog (A's own risk 11). The face isn't
   labelled, so a new member with an empty library and no friends has nothing telling them that Friends, Wrapped
   and their reviews exist. Mixing "a friend sent you a moment" into the **app changelog** (What's new › For you)
   trains people who dismiss update popups to ignore the bulb that now carries personal messages.
2. **The owner's 8 scrolling icons become 7 scrolling chips.** In `A/owner-phone.png` the chip row (Activity ·
   People · House · Game clips · Notes · Ideas · Server) is cut off at 390 px. The overflow problem has moved down one
   level. Screen Time goes 2 → 3 taps (A admits it). For co-owner (Firefox, no Notes), Activity is now 2 taps. And
   Activity has **two homes by role**: a tab for +act members, a segment for owners.
3. **Things lost or pushed out of reach on phones:**
   - **The in-place Library text filter goes** (A risk 8). An owner with a 214-title shared library can no longer type
     to narrow the grid while keeping All/Films/Shows and the sort. Global search returns a result list, not a
     filtered grid. That's a real regression for exactly the people who use Library most.
   - **The type chip row lives under the billboard and scrolls away.** Changing Films → Shows after scrolling means
     scrolling back to the top first. Browse ▾ worked from anywhere.
   - **Pick together still needs a scroll** (~900 px, block 3), so it's not ≤2 taps cold.

| Findability ≤2 taps | Phone-first | Nothing lost | Fewer entry points | Future features |
| :-: | :-: | :-: | :-: | :-: |
| 7 | 7 | 8 | 8 | 7 |

Future fit is 7 because the profile action row and What's new › For you are the next catch-alls (budget "≤ 4
actions" on a profile is tight), and the face is a weak door for anything new.

---

## C: Together (social-first)

### Three strongest ideas
1. **One Invite sheet component, 5 contexts** (Lilin, Friend, Room, Pick, Moment). It's the only plan that merges
   the five invite *UIs* rather than just renaming them, and it removes ~2.8 KB of row styles. It ends up with people,
   Copy link and Share in the same order everywhere. That's the best pattern-level consolidation on the panel.
2. **The friend-request popup becomes a card + badge, and parties become creatable.** The popup interrupting app open
   becomes an Accept card at the top of Together. The inventory's "parties can be cancelled but not created" dead end
   is fixed with *Start now / Plan a time* next to the planned list. Both are concrete and small.
3. **Discover keeps a "Your list" slice of ready-to-watch titles**, hidden when empty, with the full list in Library.
   That answers the strongest objection to moving the watchlist off the home page (B's risk 8), for one conditional
   row. Also good: Settings on phones becomes a ~700 px index with each group as a sub-page.

### Three worst flaws
1. **Removing "Live" from the tab bar hurts the accounts that use Lilin most.**
   - SEELE TV is the only feature every role uses, R and H included. In C it becomes the third block of a tab named
     after friends.
   - For H and R (the family accounts, likely most of the 35), Together is 3 blocks: On now, Watch with someone,
     Moments. That's a renamed Live tab with a vaguer label ("Tillsammans", 11 characters on a 78 px tab, fallback
     "Ihop").
   - The full guide goes from 1 tap to 2 (Together → Guide).
   - The TV app keeps calling it "Lilin TV", so web and TV now disagree on the name.
   - Restricted users get head counts with no faces and no chat. Their "Together" has no people in it.
2. **Presence moves onto a front page.** A friends strip with "Owner · TV 3", put first on a tab, makes existing
   visibility far more noticeable. The fleet review's privacy item #1 (Restricted/quiet viewers leaked through Live
   state) is fresh. C itself defers its feed until Watch privately ships, but the TV dot ships in phase 1. The
   owner's Together also carries Activity's admin events (C's risk 4), so the "social" tab means something different
   for Owner and co-owner than for members.
3. **Discover is left half-fixed on phones.**
   - Browse ▾ stays, so the phone header still has 5 controls on Discover.
   - The type control is still different per width: the inventory's 2.1 inconsistency is "unchanged".
   - Documentaries is still 2 taps behind a sheet.
   - Popular films and Popular shows leave the All view (only in type pages), so the two most generic browse rows
     disappear from home.
   - On top of that it's the biggest build of the four (C's risk 9: new view, hub, index, segments, Invite sheet,
     router, title page).
   - Owner hub budget is "no limit": the place most likely to sprawl is the only one without a cap.

| Findability ≤2 taps | Phone-first | Nothing lost | Fewer entry points | Future features |
| :-: | :-: | :-: | :-: | :-: |
| 7 | 6 | 8 | 8 | 7 |

Scroll performance is a plus for C: the full guide (53 buttons) only renders on its own page, so most opens are
cheaper than today's Live tab.

---

## D (wildcard): Watch / Find

### Three strongest ideas
1. **Split by intent: Watch = yours or playable, Find = the catalogue.**
   - It removes the root cause the inventory keeps hitting ("two homes and no catalogue"): Continue, On its way, Saved
     and New all go to one home.
   - The billboard becomes *personal and playable*: every slide is one tap to Play.
   - It's the only plan whose web home matches the TV app's library-first home in structure.
   - "Open Lilin on Discover/Library" stops being necessary.
2. **"Go to" search registry + a unit test.** Places and settings are findable by name, with Swedish synonyms, and a
   test fails if a route has no registry entry or no Swedish label. That's the only *mechanism* on the panel that
   makes future features findable by default, instead of a budget table that relies on discipline. The desktop
   drop-down in place (Ctrl K) also ends "typing on Settings throws you to Discover" more cleanly than a search page.
3. **Tab stacks + a state table for the title page.**
   - Tapping House returns to the last tool (Notes), and a second tap shows the tiles. That keeps Owner's Notes at 1
     tap without a Notes tab, which is the best answer anyone gave to the owner's lost-tap problem (A, B and C all
     just accept it).
   - The 7-state title-page table (one primary per state) is the most precise of the four title-page merges.

### Three worst flaws
1. **The library grid ends up at the bottom of a long Watch page.** Take a member of a shared library looking for
   "the film Robin added last week". In `D/watch-phone-full-annotated.png`, Your library starts ~2,000 px down,
   after the billboard, Keep watching, On its way, Ready for you, Your list, Leaving soon, On this phone and Popular
   on Lilin. Today it's Library (1 tap) → grid after the shelves. It's also the heaviest single document on the panel:
   up to 7 carousels plus a 200+ card grid in one scroll. That needs `content-visibility`, lazy images and a
   scrollperf run (D's risk 8). On a mid-range phone that's the plan most likely to stutter.
2. **The front door moves for all 35 accounts, and the start screen depends on the account's state.**
   - A saved "discover" start preference can't be told apart from the default, so everyone who chose Discover is
     moved to Watch (D admits it).
   - A **new member with an empty, unshared library** gets a Watch tab that is a billboard of other people's titles,
     or Lilin opens them on Find instead. So the first screen depends on library state, which is the least
     predictable kind of home.
   - Titta / Hitta differ by one letter.
3. **Small but real gaps:**
   - On phones, search exists only on Find. From Watch it's 2 taps (Find, then the field, or a second tap), where
     today it's 1 tap on every tab.
   - Activity has two homes by role (House for owners, You for +act).
   - D calls H's Moments list "a server question" and leaves it hidden, but the API already answers for H (see A).
     That leaves a fixable dead end unfixed.
   - Hygiene: `D/house-phone.png` shows real hostnames and home-network details ("<desktop host>", "<DNS service>: nothing on
     port 53") in docs for a public repo. Those need generic stand-ins before anything is committed.

| Findability ≤2 taps | Phone-first | Nothing lost | Fewer entry points | Future features |
| :-: | :-: | :-: | :-: | :-: |
| 8 | 8 | 8 | 8 | 9 |

---

## Calibration: B by the same rubric

| Findability ≤2 taps | Phone-first | Nothing lost | Fewer entry points | Future features |
| :-: | :-: | :-: | :-: | :-: |
| 8 | 8 | 8 | 7 | 7 |

Fewer entry points is 7 because B leaves the 5 invite meanings untouched and creates a new overlap (section 4).
Future fit is 7 because the hub's cap is a promise, not a mechanism. D's registry test is a mechanism.

## What B would steal

| From | Steal | Fixes in B |
| --- | --- | --- |
| D | **Tab stacks** (a tab remembers its last sub-page) | B's risk 6: Notes and Game clips back to 1 tap for Owner |
| D | **Go to registry + route test** in the one search | makes "nothing lost" testable; any hub row is findable by name |
| D | personal, playable billboard slides | gives the Wrapped slide idea a real system |
| D | the 7-state title-page table | replaces B's looser "two states" in 4.6 |
| C | **one Invite sheet** (5 contexts) | B's gap: invite flows untouched |
| C | request card + badge instead of the popup; Start/Plan a party next to the plans list | B kept the popup; B's plans could only be joined or cancelled |
| C | a conditional Discover "Your list" (ready to watch) row | B's risk 8: the watchlist stops being a source of what to watch tonight |
| A | invite *wording* ("Ask to join", "Share") | same gap, at zero cost |
| A | H household page via the existing API, client gate only | corrects B's risk 5 (no server change needed) |
| A | counts on segment chips; independent revertable batches | B's tab removal and hub have to land together, the riskiest ship |

## Where B is now weaker than another plan

1. **Where your titles live.** This is the contested question, and B gives the weakest answer. The full grid is
   2 taps in B, 1 in A and C, and 1 + scroll in D. B's tab is called "You" while the TV app's home is the library,
   so B has the **worst TV parity** of the four. A keeps the word, D keeps the structure, B keeps neither.
2. **B has two places to find things.** Discover rows *and* the Search landing both offer Moods, Coming soon and type
   modes. That's exactly the kind of duplicate the inventory flags, and B created it. D has one catalogue (Find);
   A has one (Discover with a chip row).
3. **Social discoverability.** B scatters it over Search (Pick), You (Friends, Moments, Activity), the player (rooms)
   and Your list (plans). C is clearly better here. A and D at least keep it next to the object.
4. **Relearning cost without a matching gain for the family accounts.** For H and R, B's You hub is mostly Your
   library + Your list + Settings. That's a renamed Library with Settings bolted on, so they pay the move for little.
5. **B and D converged** on a You tab wearing the face, Settings inside it, and House for owners. That part of B is
   validated, but not unique. What only B has: the **Right now** strip, which puts time-bound personal things in one
   place instead of banners, and "Your list" as the watchlist's name. Both port cleanly to A or D.

**Net:** I'd no longer pick B whole. Strongest hybrid as I see it:
- D's Watch/Find intent split, with the library grid reachable at 1 tap from a "Your library" anchor or segment,
  using A's segment pattern rather than a long scroll.
- D's registry and tab stacks.
- C's Invite sheet.
- B's Right now strip at the top of Watch.

## Ranking

1. **D**: the best IA and the best future-feature mechanism. Its risks (long Watch page, front-door change) are
   fixable by design.
2. **A**: lowest risk, best TV and name parity, ships in revertable batches. Its weak spots are the face as a door
   and the scrolling owner chips.
3. **B**: scores close to A on the rubric, but loses on relearning, TV parity and its own Discover/Search overlap.
4. **C**: its best parts (Invite sheet, request card) are portable, but swapping Live for Together costs the family
   accounts the most.
