# Critique round 1: designer C on A, B and D

I read A.md, B.md and D.md in full, looked at every mockup PNG and checked a few of their claims against the code
(`public/tv/tv.js`, `src/server.js` `HOME_ROWS`, `public/moments.js`). The tap counts below come from their
sitemaps and mockups at 390×844. "Scroll" means the target is below the first screen. To keep the comparison fair,
C is in every table too, scored the same way.

## 0. One task set for all four plans

| # | Task (phone, cold start, no push) | A | B | C | D |
| --- | --- | --- | --- | --- | --- |
| 1 | Resume what you were watching | 2 | 2 | 2 | 2 |
| 2 | Start Pick together | 2 + scroll (≈ 900 px down, admitted) | 2 (Search landing, first card) | 2 (Together, above the fold) | 2 + ≈ fold (Find block 5) |
| 3 | Accept a friend request after dismissing the popup | 3 (face → profile → Friends (n)), or What's new → For you | 3 + scroll (You → People group sits under two poster shelves) | **2** (Together card) | 3 (You → Friends, first row) |
| 4 | Open a moment someone sent you | 2 while new (What's new › For you), else 3 | 3 + scroll | 2 + scroll | 3 |
| 5 | Find a title you own (214 titles) | 1 + type (global, On Lilin first) | 1 + type (Search tab) | 1 + type | **2** + type (Find → field; header icon gone on phones) |
| 6 | See your whole library grid | **1** | 2 (You → Your library See all) | **1** | 1 + ≈ 2–3 screens of rows above the grid |
| 7 | Check how a download is doing | 2 (badge visible) | **1** (You → Right now) | 2 (badge visible) | 1 + scroll (Watch row 3) |
| 8 | Change the default subtitle language | 2 (Settings index chip) | 2 + scroll (You → ⚙, still no phone index, ≈ 2.4k px) | 2 (Settings index) | 2 + scroll (You list, Settings group at the bottom) |
| 9 | Owner opens Notes (not the last section used) | 2 + **sideways swipe** (Notes is chip 5 of 7; 4 fit at 390 px, see `A/owner-phone.png`) | 2 + **≈ 1 screen of scroll** (Notes sits under Right now + 2 shelves) | 2 | 2 (first tile) |
| 10 | Owner invites someone to Lilin | 3 | 3 | 3 | 3 |
| 11 | Restricted viewer tunes channel 3 | 2 | 2 | 2 | 2 |
| 12 | Documentaries on a phone | **1** (chip under the billboard) | 2 | 2 (Browse ▾, unchanged) | 2 |

What the table shows: nobody wins every row. A and C tie on the daily jobs (grid, settings). B wins downloads. C
wins the social jobs. D wins Notes but loses search and the grid on phones.

---

## 1. Proposal A: keep the tabs, one home per job

### Strongest ideas

1. **What's new becomes "what reached you".** Moments sent to you, answers to your ideas and waiting friend requests
   go under a "For you" section of the bulb that already exists, which every account already looks at. That gives a
   social inbox without a new tab and without a popup. It's cheaper than my Together badge, and it works for H and R,
   which C serves badly.
2. **Ships in independent, revertable batches,** and nobody's tab bar changes except the owner's. Six batches, each
   on its own: Owner hub, Settings, Library, Discover, search, title page. Owner asked for a no-wait ship with an
   easy revert, and A is the only plan where a revert of one batch doesn't strand the others.
3. **H gets a household page** (Numbers, Wrapped, Moments, its own reviews). It reuses `/api/profiles/me` and
   `/api/moments`, which already answer for H. It fixes three H dead ends at once (Moments never listed, Wrapped
   only in Settings, reviews you can't see). C fixes only the Moments one. A also narrows **"Invite" to one meaning**
   (bring someone into Lilin) and renames the others ("Ask to join", "Send link", "Share"). That fixes the
   five-meanings problem with words, not with a new component.

### Worst flaws

1. **Pick together still fails the ≤ 2-tap rule.** A admits it: it moves from 2.2 screens down to about 1 screen,
   as a tile inside Moods. A brand-new member who has never heard of it still won't find it, which is the exact
   problem the inventory flagged.
2. **The owner's chip row brings back the scrolling tab bar, one level down.** Seven chips at 390 px means Notes,
   Ideas and Server are off-screen in `A/owner-phone.png`. Owner's most-used tool (Notes) needs a sideways swipe
   whenever it wasn't the last segment. The labels are better than icons, but "off-screen" is the same failure the
   fleet review named.
3. **Library loses its in-place text filter** (A's own risk 8). With 214 titles, narrowing the grid by typing is
   gone; you get global search results instead. That breaks "nothing lost" for a Library-only capability. Smaller
   flaw: Friends and Moments live behind a 32 px header face, plus dialog-over-dialog on desktop when the profile is
   nested over a title page.

**Roles, TV, scroll:** owner/co-owner are fine apart from flaw 2. Restricted is unchanged, which is good. A new member
with an empty library gets today's Discover, so that's fine. TV parity is best on *names*: Live, Discover and
Library stay as the TV app says them, though the merged Popular/Top rated rows need new `HOME_ROWS` keys (A plans
for it). Scroll: Discover drops to 11 blocks and loses one `backdrop-filter`. That's the best Discover perf of the
four.

**Scores:** findability 6 · phone-first 7 · nothing lost 7 · fewer entry points 8 · future features 7.

---

## 2. Proposal B: no Library tab, a "You" hub

### Strongest ideas

1. **"Right now", 0–3 time-bound rows** (party tonight → leaving within 48 h with one-tap Keep → downloads on the
   way → preparing → phone copy ready), shown only while something is due. It replaces six scattered bits with one
   ranked strip. It's the best single pattern in round 1. C has nothing like it: my parties sit in Together,
   downloads and Leaving soon in Library, so the same three things are split over two tabs.
2. **The House landing with "Needs you"** (0–3 actionable rows: new ideas, a failed download, low disk) above a
   status strip. My Owner landing has a status line per row. B's is better because it puts the one thing to act on
   first.
3. **Old hash names become page names** (`#library` is still the library, now a page under You), with a page table
   `{ page → tab, allowed() }`. That's cheaper and safer than my alias map, and every server push URL keeps landing
   without a change. Runner-up: **Search as a phone tab** with a browse landing (Pick together, Browse tiles, Moods,
   Genres) puts search in thumb reach and gives Pick a 2-tap home.

### Worst flaws

1. **The daily job gets one tap further.** The full grid goes 1 → 2 taps for everyone. The word "Library" leaves
   the bar. The TV app the parents use is library-first (`tv.js` home: Continue watching, On its way, Films, Shows),
   so web and TV drift apart. Opening Lilin on Library as a start view hides that cost, but only for people who know
   the setting exists.
2. **You is Settings 2.0 by construction.** On a member's phone it holds identity, Right now, two poster shelves,
   Notes, Downloads, History, Ratings, Liked, Wrapped, Friends, Moments, Activity, Ideas, What's new and Settings:
   1,880 px before Settings opens. Settings itself still has **no phone index** (≈ 2.4k px), and changing the
   subtitle language is You → ⚙ → scroll. Notes (an owner tool) is in You while Game clips is in House, which is
   inconsistent. On a phone, Notes sits under two shelves (task 9).
3. **More entry points, not fewer, and Discover barely shrinks.** Many rows go 1 → 2 (Leaving soon, parties,
   Manage downloads, Identify, Moods, Coming soon, the Settings tab itself) and downloads only drop 7 → 4. Discover
   keeps Popular films/shows and Top rated films/shows as separate rows: 14 blocks against 11–12 for A, C and D.
   Social ends up in four places (Search, You, the player, Your list), as B admits.

**Roles, TV, scroll:** the restricted gates on ~10 hub rows are a real leak risk (B's own risk 11). H's "You" is a
household with no face, which is semantically off, and it needs a server change for H History. co-owner is fine (House).
For a new member with an empty library, You opens on two empty shelves and an empty Right now: the hub's first
screen is empty states. TV parity is the worst of the four (no Library). Scroll: two poster shelves plus lists on
You is fine; no new blur.

**Scores:** findability 6 · phone-first 8 · nothing lost 8 · fewer entry points 5 · future features 6.

Verdict on Owner's experiment: removing Library doesn't beat keeping it. Every gain B shows (Right now, one
watchlist, downloads in one place, Settings content moved out) is also reached by A and C *with* a Library tab. The
cost (grid +1 tap, a hub that grows) is B's alone.

---

## 3. Proposal D: Watch / Find, one search box, one title page

### Strongest ideas

1. **The "Go to" search registry with a unit test.** One box that finds titles, channels, programmes tonight,
   people, notes, clips *and places* ("Sign in a TV → You › Devices & TVs"), with Swedish synonyms. A test fails if a
   route has no registry entry or no Swedish label. This is the best future-features mechanism in round 1: every new
   feature gets a findable name for free, whatever tab it lands in. It also answers my biggest risk (people
   searching "Live" or "TV" after the rename).
2. **Watch = library as home, aligned with the TV app.** The TV home is Continue + On its way + Films + Shows, and
   D's Watch is that plus a personal billboard ("Ready for you · you saved it"). It ends the "Open Lilin on Discover
   or Library" indecision. The personal, playable billboard is a genuinely better first screen for people who
   already have things waiting.
3. **The title-page state table** (7 states, each with exactly one primary and a state line: not on Lilin / on
   Lilin, not yours / on its way / ready / leaving soon / unreleased / SVT). It's the most precise version of the
   "one title page" every plan wants, and it builds the one-lit-button rule into the model. Also good: **tabs keep
   their own stack** (House remembers Notes), generalised to every tab, not only the owner hub.

### Worst flaws

1. **The front door changes for all 35 people, with two new labels at once.** Discover → Find and Library → Watch,
   and the Swedish pair **Titta / Hitta** differs by one letter (D's own risk 9). That's a lot of relearning for the
   family to buy a cleaner model. A new member with an empty library opens on an empty Watch and has to be bounced to
   Find (risk 2).
2. **Watch gets very long, and the grid hides behind rows.** Up to 10 blocks (billboard, Keep watching, On its way,
   Ready for you, Your list, Leaving soon, On this phone, Popular on Lilin), then a 214-title grid in the same
   scroll. Reaching the grid on a phone means 2–3 screens of rows (task 6). This is also the scroll-perf hot spot of
   the whole round: a billboard (trailer on desktop) plus 7 rows plus ~70 grid rows in one document. D flags it but
   the plan depends on `content-visibility` and a scrollperf run that haven't been done.
3. **Search is one tap further on phones** (Find, then the field; the header icon goes), so the plan's own
   centrepiece is harder to reach from Watch, Live and You than today's icon (task 5). Two smaller factual
   problems: D keeps the H Moments dead end, calling it "a server question", but `/api/moments` already answers for
   H and the gate is the client's `!me()?.email` in `public/moments.js`. D also merges Popular and Top rated rows
   without listing the `HOME_ROWS` change in `src/server.js`. Activity has two homes by role, and the phone-copies
   list ends up under You › Devices & TVs, a content list filed as a setting.

**Roles, TV, scroll:** owner/co-owner: House tiles with badges are the clearest owner landing of the four. Restricted:
gates are sound. TV parity is best on *structure*, worst on *names* (Find ≠ "Discover" on the TV). Scroll: see
flaw 2.

**Scores:** findability 7 · phone-first 5 · nothing lost 7 · fewer entry points 7 · future features 9.

---

## 4. Score summary (C self-scored the same way; read it with suspicion)

| | Findability ≤ 2 taps | Phone-first | Nothing lost | Fewer entry points | Future features | Sum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 6 | 7 | 7 | 8 | 7 | 35 |
| B | 6 | 8 | 8 | 5 | 6 | 33 |
| C (self) | 8 | 6 | 8 | 7 | 6 | 35 |
| D | 7 | 5 | 7 | 7 | 9 | 35 |

I marked C's phone-first down to 6 and future features to 6 after reading the others. The reasons are in section 6.

## 5. What I'd steal into C

1. **From B: Right now.** Put a 0–3-row time-bound strip at the top of Library → Yours (downloads, leaving within
   48 h with Keep, a phone copy that's ready) and the "party tonight" row at the top of Together. That removes the
   split of time-bound personal stuff across two tabs.
2. **From B: House "Needs you"** on the Owner landing, above the section list.
3. **From B: page names instead of aliases.** `#live` stays a real page name (Together's guide page), and
   `#activity` stays a page under Together. No redirect table to maintain.
4. **From D: the "Go to" registry + its test.** Searching "Live", "TV", "SEELE", "Friends" or "Notes" finds the place.
   It's the safety net for every move in every plan.
5. **From D: the title-page state table and per-tab stacks.** They replace my vaguer "actions follow state" and
   "hub remembers the last section".
6. **From A: What's new › For you** as the inbox for accounts with no social layer (H, R), plus A's verb split
   (Invite / Ask to join / Send link / Share) on top of my one Invite sheet component. The component stays
   shared, but each context uses its own verb.
7. **From A: the household page for H,** which fixes H's reviews and Wrapped dead ends, not just Moments.

## 6. Where C is now weaker than another plan (honest)

1. **The rename of Live is C's worst move,** and A's critique of it is right. The accounts that use Lilin most (H,
   R, the TV-minded family) can use the least of the social layer. For them, Together is Live with a vaguer name: On
   now plus two link-only tiles plus their own moments. The TV app calls it "Lilin TV"/SEELE TV. I'd now **keep the
   tab label and icon "Live"** and make the Live tab the social home for accounts that have one: On now and the guide
   first, then Watch with someone (Pick, parties), and friends, requests and Moments only for M/O. That gets C's
   findability wins (Pick, friends and Moments at 2 taps) without the relabel cost or the half-empty problem.
2. **Time-bound personal things are split** (parties in Together, downloads and Leaving soon in Library). B's
   Right now handles this better. Fix: section 5.1.
3. **The future-features fit is weaker than D's.** My routing table plus block budget is a promise, the same
   weakness I accuse B of. D's registry plus test is a mechanism.
4. **Revert granularity is worse than A's.** Together replaces Live atomically, and the social moves out of
   Settings depend on it. A can ship and revert six independent batches. If I keep the Live label (point 1), C's
   social moves become additive and that gap mostly closes.
5. **I missed a server change.** C merges Top rated films and shows on type All but lists `src/accounts.js` as
   the only server change. Like A, I'd need new `HOME_ROWS` keys (or a client-side interleave) so the TV apps keep
   the old rows.
6. **Where C still beats the others:** social findability (tasks 2–4), and the owner reaching Notes in 2 taps with
   nothing off-screen. Every plan converges on 3 Library segments, an owner hub, one title page and one search
   meaning, so the real choice in round 2 is narrower than it looks: where social lives, and whether the front door
   changes.

## 7. Ranking

1. **A**: the safest base, keeping today's names and TV parity, with independent batches. Its gaps (Pick, social
   inbox, owner chip overflow) are fixable with steals.
2. **C**, if it keeps the Live label (section 6.1): the best social findability. As written, with the rename, it
   would be third.
3. **D**: the best ideas per page (registry, state table, Watch ≈ TV home), but the costliest relabel and the
   longest page.
4. **B**: Right now and Needs you are worth taking, but removing the Library tab loses on taps, entry points and
   TV parity to plans that keep it.
