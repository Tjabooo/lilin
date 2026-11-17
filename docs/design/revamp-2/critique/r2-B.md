# Critique round 2: designer B on the hybrid, plus the You tab spec

Inputs: `hybrid-draft.md`, `critique/r1-{A,B,C,D}.md`, master `b85d964`. Code claims below were checked in `src/` and
`public/`.

## 1. Holes in the hybrid (5, each with a fix)

1. **The Home network fix is only half client-side, and round 1 (me included) got this wrong.**
   - *Moments: true.* `src/moments.js` `list(user)` keys on `user.id`. Only `public/moments.js:300`
     (`if (!me()?.email) return []`) hides them.
   - *History, ratings and liked: false.* `/api/profiles/me` → `profileView()` → `profiles.view()` → `access()`,
     and `src/profiles.js:147` throws **404 for the Home account** (`social()` rejects `email === 'home'`). The diary
     and reviews routes call the same `access()`. A's claim and my r1 "verified" both checked only the route.
   - **Fix:** in `access()`, return `'self'` when `viewer.id === target.id` *before* the `social(target)` check. Others
     still get 404 for H, and `save()` keeps its `social()` guard, so H can't publish a page. That's ~2 lines + 1 test.
     Without it, H's History/Ratings/Liked rows must stay hidden.
2. **Two personal inboxes.** The hybrid puts moments, idea answers and friend requests in What's new › For you,
   *and* gives You friends + requests + Moments. That's the duplicate every r1 critique flagged. It also teaches
   people who dismiss release notes to ignore the bulb that now carries messages.
   **Fix:** What's new = release notes only. Personal arrivals go to **For you cards at the top of You** (0–3, hidden
   when empty) + one bulb dot on the You tab. That's C's request card, applied to all three kinds. The on-open
   friend popup (`maybeAskFriends`) retires: the card plus the existing push replace it.
3. **"Right now on top of Discover" breaks the billboard and misses people who start on Library.**
   - Above the billboard, it pushes the hero off a phone's first screen.
   - Anyone with Open Lilin on = Library never sees it.
   - Its download row also duplicates Library › Downloads unless it's defined as a pointer.

   **Fix:**
   - Render it **once, under the billboard of the start tab** (Discover, or the top of Library › Titles when that's
     the start view).
   - Every row is a deep link (download → `#downloads`, Keep acts inline, party → Live). It's never a second list.
   - Count downloads honestly: Library badge + Right now + Downloads segment + title state line = **4 surfaces**,
     not 3.
4. **Activity has no owner home.** The hybrid only says "You: Activity (if Can see activity)". Owners have it today,
   and A, C and D each placed it differently. **Fix:** one page `#activity` under **You** for owners and +act alike.
   That's one home, not two by role. The owner-only parts (Invite tile `activityInvite()`, the access list,
   `activityPersonPanel()`) move to **House › People**. House has no Activity row, only a Needs-you link when
   something there needs action.
5. **Pick together still fails ≤ 2 taps.** As the first Moods tile it sits ~900 px down (A's own risk 3), and parties
   moved to Live without a way to create one there. **Fix:** put a **Watch with someone** strip at the top of Live
   (Pick together tile · Plan a party (`POST /api/watch/plan`, C) · today's planned parties). That makes Pick 2 taps
   cold and puts creating parties next to the list. The Moods tile stays as a shortcut to the same `.pick` overlay.

## 2. Spec: the You tab (replaces the Settings tab)

### 2.1 Shell

- **Tab:** `data-view="you"`, label **You** / **Du**, in Settings' slot (last). The icon is your face (24 px,
  `people.face`); H gets a person glyph.
- **Badge:** one bulb dot for For-you items only (requests, unseen moments, idea answers). Downloads keep the Library
  badge, so each badge has one meaning.
- **Header:** `#me-btn` is removed at every width (the tab/link wears the face). On desktop the header link shows the
  face + "You". The What's new pill stays.
- **Routing:** page names are hash names (B's page table). Tabs `replaceState`; sub-pages `pushState`, so Back
  returns to the You list. Re-entering You restores its last page (D's tab stack). Tapping You while on it pops to
  the root and scrolls to top.
- **Layout:**
  - Phone: the root list *is* the index, and every row opens its own page.
  - Tablet ≥ 760 px landscape and desktop ≥ 900 px: two panes. The list is a sticky 340 px column (it reuses the
    `#settings-body` grid rule, retargeted) and the open page is on the right. `#you` on wide screens shows
    Overview.

### 2.2 The You root list, in order

| # | Block / row (→ page) | Owner (O+Notes) | co-owner (O) | Member | +act / +inv / +dl | Restricted | Home network |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Identity card** (→ `#you` Overview on desktop): face, name, @handle, "Visible to: Friends", **Edit profile**, **View public page ›** | ✓ (tag Owner) | ✓ | ✓ | ✓ | ✓ (page has no Friends section, as today) | "Home network · shared by everyone at home". No Edit, no public page |
| 2 | **For you** cards, 0–3 | requests, moments | same | requests, moments, idea answers | same | moments, idea answers | moments, idea answers |
| 3 | *Your watching:* History → `#history` · Ratings and reviews → `#ratings` · Liked → `#liked` · Wrapped {year} (opens `openWrapped`) | ✓ | ✓ | ✓ | ✓ | "Ratings" (R can't review) | ✓ **after fix 1.1**, else Wrapped only |
| 4 | *People:* Friends → `#friends` (pill = requests) · Moments → `#moments` · Activity → `#activity` · Invite someone to Lilin (opens C's Invite sheet, Lilin context) | all 4 (Invite = access invite) | all 4 | Friends, Moments | + Activity (+act), + Invite (+inv, member link) | Moments only | Moments only |
| 5 | *Settings:* Account → `#account` · Language and look → `#look` · Watching → `#watching` · Devices and notifications → `#devices` · Downloads → `#download-settings` | all 5 | all 5 | 4 | + Downloads (+dl) | 4 (+dl if granted) | 4 (+dl if granted) |
| 6 | Ideas and bugs → `#ideas` | — (inbox is House › Ideas) | — | ✓ | ✓ | ✓ | ✓ |

- Rows are `.set-stack` rows with a meta line showing the current state or value, e.g. "English subtitles · skip
  intros automatically", "3 friends · 1 request", "Nothing yet". So the list answers most questions without being
  opened, and a new member with an empty library and no friends still sees a full, useful list rather than empty
  shelves.
- Phone height: ~950–1,150 px. Today Settings is 3,832 px (member) to 5,657 px+ (owner).
- Notes, Game clips, People admin, Server rules, Ideas inbox, House and Screen Time are not in You (House).

### 2.3 Pages

| Page | Content | Built from (existing code) | Roles |
| --- | --- | --- | --- |
| `#you` **Overview** (private view; desktop right pane, phone = top of the list) | identity card, For you, Numbers (films / episodes / hours this year), the last 5 diary entries | `profileView` data via `/api/profiles/me` (already loaded for the profile), `profiles.js` `statsRow`, `diaryList` | all with a profile; H after fix 1.1 |
| **Public page** (overlay, unchanged) | the Letterboxd-style `.pf`, opened by `profiles.openMine()` from "View public page", pushes `/#@handle` | `profiles.js` as is | M, O, R. **Not H** (others still 404) |
| `#history` / `#ratings` / `#liked` | full private lists, always `self` scope (they include sections the public page hides) | new `profiles.privateList(kind)` export wrapping `openDiary`/`diaryList`, `loadReviews`/`reviewCard`, liked `posterButton` grid | as row 3 |
| `#friends` | requests (Accept / Decline), Find someone by name, list + Remove, Waiting for an answer, **Invite someone to Lilin** button (+inv / O → Invite sheet) | `friends.js` `settings()` → `page()` (same body; drop `set-head`, `data-anchor`, `jump` scroll) + `memberInviteSettings()` content moved into the Invite sheet | M, O (gate unchanged: `restricted \|\| !email → []`) |
| `#moments` | Shared with you · Yours; re-copy, delete; empty state "Clip a moment from the player's ⋯ menu" | `moments.js` `settings()` → `page()`; gate `!me()?.email` → `!me()`; always rendered | all (R, H: own + link-only sharing, as today) |
| `#activity` | stat tiles, people strip, filters, feed, local filter field; faces open profiles (M/O rule) | `renderActivity()` minus `activityInvite()`, the access list and `activityPersonPanel()` (→ House › People) | O; +act read-only |
| Wrapped | the `.wrapped` story (no page) | `openWrapped(year)`; Discover's seasonal banner unchanged | all |
| `#account` | sign-in line + tags (Owner, Can't download), Change password, Sign out | the You-card text from `renderSettings` + `accountSection()` | all (H: sign-in line only) |
| `#look` | Language segmented, themes + own colours | the Language block + `appearanceSection()` | all |
| `#watching` | Subtitles, Intros, **Open Lilin on: Discover · Live · Library** | rows from `renderSettings` | all |
| `#devices` | Notifications on this device (+ kinds), Sign in a TV, Android TV, Jellyfin | `notificationSettings()`, `tvSignInRow()`, the Android row, `jellyfinRow()` | all |
| `#download-settings` | Quality, Largest download, Audio language; a link "Storage and keep rules → Library" | the +dl block from `renderSettings` | +dl |
| `#ideas` | send an idea or a bug, your ideas + answers | `ideaBox()` | M, H, R |

Leaving Settings for other tabs (not in You):
- **Your library card** → Library › Titles footer.
- **Library order** → Library Sort.
- `ownerSettings()` (Server rules, People) → House.
- `ideaInbox()` + scout → House › Ideas.

### 2.4 Old hashes and links

| Link | Lands on |
| --- | --- |
| `#settings` (bookmarks, reloads) | You root (alias of `#you`, `replaceState` to `#you`) |
| `/?friends=1#settings` (push) | `#friends` (request on top) |
| `?moment=<id>` (push) | `#moments`, `momentsUI.jumpTo(id)` plays it |
| `/?ideas=1#settings` (push) | member/H/R: `#ideas`; owner: House › Ideas (same page name, parent by role, as today's behaviour) |
| `#activity` | `#activity` under You if allowed, else the start view (today's fallback) |
| `?wrapped=<year>`, `?update=`, `/#@handle` | unchanged overlays, over whatever page is open |
| saved `startView` | unchanged values; `src/accounts.js` `START_VIEWS` gains `live` (1 line) |

- The boot block (`app.js` ~10440–10470) and the service-worker `lilin:open` handler (~10382) duplicate this
  parsing. Merge them into one `openLink(url)`.
- Every new page gets a Go-to registry entry with Swedish + synonyms ("subtitles/undertexter", "sign out/logga ut",
  "password/lösenord", "theme/tema", "TV code", "notifications/aviseringar"). D's route test covers them.

### 2.5 Files and functions

- **`public/index.html`:** the Settings tab button becomes the You tab; `#view-settings`/`#settings-body` become
  `#view-you` with `#you-list` + `#you-page`; remove `#me-btn`.
- **`public/app.js`:**
  - **New:** `PAGES` table + `pageOf(hash)`/`tabOf(page)` replacing `linkedView()`; `setView()` → `setPage()`
    (push vs replace); `renderYou()` (list + meta lines), `renderYouPage(page)`, `forYouCards()`,
    `renderYouTab()` (replaces `renderMeButton()`); `openLink(url)`.
  - **Split:** `renderSettings()` → `accountPage`, `lookPage`, `watchingPage`, `devicesPage`, `downloadPrefsPage`.
    To avoid touching ~33 call sites, keep the name `renderSettings` as "redraw the open You page" and
    `renderSettingsWhenStill` → same with its not-mid-scroll guard. Replace the 21 `state.view === 'settings'`
    checks with `onYou()`.
  - **Delete:** `settingsLayout()` (the list is the index), the profile card, the Wrapped button,
    `maybeAskFriends()` + its retry timers, and the `#me-btn` listener.
  - **Move:** `memberInviteSettings()` → Invite sheet; `ownerSettings()` / `ideaInbox()` / access parts → House.
  - **Other edits:** `enableActivityTab()` → registers the `activity` page (no tab); `renderActivity()` loses its
    owner admin blocks. The search `input` listener drops its `settings`/`live` → Discover jump (global search
    layer). The SSE handler (~2481, ~2503): `view === 'settings'` → `onYou()`.
- **`public/friends.js`:** `settings()` → `page()`; new `forYou()` (request cards); `askSheet`/`askLater`/
  `waitingAsks` retire with the popup.
- **`public/moments.js`:** `settings()` → `page()`, H gate fixed, unseen count for the tab dot.
- **`public/profiles.js`:** export `privateList(kind)` and `stats()`; `openMine` unchanged; Edit profile reachable
  from the identity card (`openEditor`).
- **`public/people.js`:** face for the tab (24/26 px variant).
- **`public/i18n-sv.js`:** ~30 strings (You = Du, For you = Till dig, History = Historik, Ratings and reviews = Betyg
  och recensioner, Liked = Gillat, Language and look = Språk och utseende, Devices and notifications = Enheter och
  aviseringar, View public page = Visa din offentliga sida, Ideas and bugs = Idéer och buggar, plus row meta
  phrasings); ~10 retired (Settings sections, Your profile).
- **`public/sw.js`:** cache version bump.
- **`src/profiles.js`:** `access()` self-first (fix 1.1).
- **`src/accounts.js`:** `START_VIEWS` + `live`.
- **Tests:**
  - **Role × row matrix:** Owner, co-owner, M, M+act, M+inv, M+dl, R, H, asserting exactly the rows in 2.2. This is
    where a miscopied gate would leak.
  - **Deep links:** `#settings`, `?friends=1`, `?moment=`, `?ideas=1` (both roles), `#activity` (allowed and
    forbidden).
  - **H endpoints:** H gets `self` on `/api/profiles/me` and on its own diary/reviews; other users still get 404 for H.
  - **Registry:** the route test.

### 2.6 CSS

| Out (measured today) | Bytes |
| --- | ---: |
| `.set-index` + `#settings-body` side-index grid (`style.css` ~2571–2577) | 686 |
| Settings profile card `.profile`, `.profile-text/-tags/-who/-open` (~2610–2615) | 1,165 |
| `.wrapped-open` + `.set-stack > .wrapped-open` rules | 392 |
| `.me-btn` (`profiles.css` 6–8) | 351 |
| friend-ask popup rules (`friends.css`) | 53 |
| `.tabs:has(.tab:nth-child(6))` label shrink (+act members drop 5 → 4 tabs; the owner rules go with House) | ~250 |
| **Total out** | **≈ 2.9 KB** |

| In | Bytes |
| --- | ---: |
| `.lrow` (icon · label + meta · count · chevron) inside `.set-stack`, also used by House | ~600 |
| identity card `.you-id` (reuses `.face`, `.chip`, `.pf-vis`) | ~400 |
| For-you card (reuses `.friend` row + `.chip`) | ~150 |
| two-pane rule on `#view-you` (replaces the `#settings-body` grid) | ~250 |
| tab face + dot | ~250 |
| **Total in** | **≈ 1.65 KB** |

Net for the You area ≈ **−1.25 KB**. No blur, no keyframes, no `!important`; `@media` count −1. The bigger savings in
the overall budget come from the Discover, Library, title-page and House batches.

### 2.7 Taps, before → after (phone, cold)

| Task | Today | You tab |
| --- | --- | --- |
| Change default subtitles | Settings + scroll | 2 (You → Watching) |
| Sign in a TV | Settings + scroll to row 4–6 | 2 (You → Devices) |
| Turn notifications on | Settings + scroll | 2 |
| Accept a friend request (popup gone) | Settings + scroll | 2 (You → card), the tab dot tells you |
| Open a moment sent to you | Settings + scroll (hidden until one exists) | 2 (You → card or Moments) |
| Your ratings / reviews / diary | face → profile → scroll; H impossible | 2; H 2 after fix 1.1 |
| Wrapped outside Dec–Jan | Settings, second block | 2 |
| Activity (owner / +act) | 1 (tab) | 2; +act members drop 5 → 4 tabs |
| Your public profile | 1 (header face) | 2 (You → View public page) |
| Sign out | Settings, You group | 2 |

Costs I accept: the public profile (1 → 2) and Activity (1 → 2). Settings stays 1 tap to its list and 2 to any group,
on every width.
