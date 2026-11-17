# Revamp 2: structure for the grown feature set (decision)

Lilin's web UI (public/, not the TV apps) doubled its feature count after the 11-10 redesign. This round keeps the
11-10 look and fixes the structure. Process: inventory (`revamp-2/inventory.md`), four competing proposals
(`revamp-2/proposals/A-D.md`: A keep tabs, B drop Library for a "You" hub, C social "Together" tab, D intent tabs),
two critique rounds (`revamp-2/critique/`). The round-2 files are the build specs for each area:
r2-A Discover + Library, r2-B You, r2-C Live + Invite + inbox, r2-D tabs/routes, search + Go to, title page, House.

## Decided

**Tabs.** Discover · Live · Library · You. Owners (incl. members with owner rights) also get **House**: one labelled
owner tab replacing the 8 icon tabs. The existing "House" section inside it is renamed **Machines**. Restricted and
shared household accounts see the same tab names with today's filtering. `you` and `live` become valid start views.

**Library stays.** Every proposal and critique except B's own ranked dropping it last or near last; each gain B
showed is also reached with Library kept. Library = three counted segments: **Titles** (grid, Sort, New, Leaving soon;
default sort Recently watched so Library-start users keep Continue watching) · **Watchlist** (Saved for later +
Coming up + Following, one list) · **Downloads** (everything about transfers). Downloads show on 3 surfaces, not 7.

**Discover.** Max 12 blocks (r2-A order). **Right now** strip directly under the billboard: 0-3 time-bound rows
(party today, leaving soon → Keep, download ready), each linking to that item's one home; Wrapped banner becomes a
row. One type/genre control row on every width. Mood systems merged into Moods. Continue watching only here.
Popular/Top rated merged in the browser (no API change; TV apps keep their rows).

**Live.** Keeps the name (renaming it hurts household/restricted accounts that only use SEELE TV). New top block
**Watch with someone**: Pick together tile + planned parties (join · copy · cancel). Party creation stays where 11-10
put it (Pick together's match flow); no new "start a party" button.

**You.** Replaces the Settings tab. The only personal inbox (friend requests, moments, idea answers) with a tab dot;
profile (private view + link to the public page), friends, Moments, Wrapped, Activity (owners too, and Can-see-activity
members), then a settings list where each row opens its own page; the list is the phone index. What's new (bulb) is
release notes only. The friend-request popup from 803907f stays.

**Everywhere.** One title page with state-driven buttons and one gold button. Search means "find a title" everywhere,
plus a **Go to** registry (places and settings findable by name, a test fails when a route has no entry); in-page
filters become small fields on those pages. One **Invite** sheet for all five invite contexts; access and invite
tools live in House → People. Every face opens a profile.

**Server (small, additive).** Shared household account can open its own profile/diary (src/profiles.js); user ids in
face data; `you`/`live` start views.

## Rules
Nothing deleted, only moved. Old hashes and links keep working (`#settings` → You, `#library` unchanged, notification
links land on their new homes). Restrict/owner/permission rules unchanged. All text via T() + Swedish. Firefox
no-glass path kept. No new blur or infinite animations. CSS must shrink overall (specs estimate −10 KB or more).
