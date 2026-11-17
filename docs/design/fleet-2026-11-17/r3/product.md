# r3 · Product lead: rebuttal and final vote

## 1. Answers

**To the design director**
1. **Does anyone use the web UI at 1920?** As far as I know, no. The parents watch on the Samsung app; Oliver and ebi use desktop browsers at desktop sizes. *Ask Oliver:* "Does anyone run Lilin in a TV browser or on a laptop over HDMI?" Until he says yes, take your own flip: the **TV-app type floor + TV captions come first**, and web ≥1600 scaling waits.
2. **Which themes are picked?** Unknown. The engineer can read the per-user appearance setting read-only, or *ask Oliver*. Step A is a day of work and fixes a real failure either way; agreed on no new theme features.
3. **One lit "Leaving soon" thing per surface?** Yes, that's enough: the keep bar plus only the row that's about to go. I doubt the family ever presses the per-row Keep links; *ask Oliver* whether Pappa or Anita have ever kept anything. I accept the engineer's condition: before demoting per-episode Play, show at 390 px that the next-up episode is still the obvious tap.
4. **Trade three features for the one-title-page merge?** No, not as a separate L. Do the parity patches now (`filmVersionPick` in `renderFilm`, SVT through `pageHero`). Then do the show half properly *inside* season tabs, so one shared episode-list component carries air dates.
5. **Is Who's watching a real problem?** As far as anyone has reported, it's hypothetical. *Ask Oliver:* "Do Pappa and Anita ever watch separately on the TV, and has anyone complained about Continue watching getting mixed up?" Until he says yes, it stays out.

**To the skeptic engineer**
1. **Client split:** I don't have it. Pull it read-only from Activity user agents. Working guess: iPhone PWA > Samsung TV > Firefox (ebi) > Chrome. Rank by real sessions, agreed.
2. **Do Pappa and Anita use the web app?** Their accounts have personal emails (one iCloud), so probably an iPhone at least now and then, but I can't prove it. *Ask Oliver.* If it's TV-only, the family-wording fixes keep their value only where the TV also shows them (offline/errors). TV captions and type move up, which my vote already does.
3. **Retroactive exposure in profiles:** **I don't sign off.** No history that existed before profiles may become friends-visible by default. The diary starts from the day profiles ship, or it's opt-in, and Watch privately lands first. A precondition, not a follow-up.
4. **One-week polish freeze:** yes, gladly. That's my whole lens. The CSS budget gate lands in the same week.
5. **"Ask for it" turning owners into a queue:** fair point. The simpler answer may be giving family download rights with a size cap. *Ask Oliver:* "Do Pappa, Anita and Mamma have download rights, and do you want requests or a capped download right?" Until he answers, it drops off my top 6.

## 2. Concessions
- **E1 (no ETag, no compression, 1.5 MB on every cold open)** is the best perf fix on the table, and I missed it. The parents' LAN clients and every iPhone PWA open feel it. It goes straight into my top 3.
- **E2:** the restricted-viewer leak is server-side (one SSE state for everyone with names and faces), not just the chat header. That makes it my #1, and the fix is per-recipient projection.
- **The convert banner was overstated** (it only shows jobs from your own library that your browser can't play). Demoted. Raw file names → titles is still worth an S.
- **GET `/api/convert` is pure; `/audio?plays=` is the side-effecting one.** I take the engineer's two-ended fix.
- **Text size on the web is blocked** on the type-token migration. It's off my list; TV captions don't depend on it.
- **The VT morph is a trap right now** (the sheet's art loads async). I side with the engineer against design's #2.
- **Bulb inflation is a real "finished" problem** (design #1). I fold the season-page part into season tabs.

## 3. Disagreements
- **Design's font-size codemod as Step C.** Its payoff is web-at-TV-size, and as far as I know that audience doesn't exist (answer 1). It's also the merge-conflict machine the engineer describes. Migrate-on-touch plus the budget gate; the TV app's own CSS floor gets done now.
- **Who's watching (design #4) and Pick together (design #10).** These are new surfaces for problems nobody has reported. The family decides on the sofa; Oliver and ebi decide on Discord. Defer both until Oliver confirms the need.
- **Design's "Send a title / From friends" at #7, above the collection strip:** fine as an idea, but Restricted family can't use it. Below the line.
- **Engineer's "Ask for it = yes":** it's conditional on the rights answer, see above.
- **Room overlays after room/Up next (engineer's Q4 to design):** agreed, but then the **phone/tablet room layout (player B5–B7) ships in the same pass as Up next**. On a phone, the picture being fully covered is a fix, not a nicety.

## 4. Final vote

### Fix now (in order)
1. **Watcher privacy, server-side:** per-recipient member projection in `watch.js` + a shared `visibleWatchers()` for the strip and chat header (E2, player B3).
2. **Player correctness:** remove the room `audioBtn.hidden`, add `closePlayerMenus()`, roster key gets the text, `T()` the stray English (player B1, B2, B4, B10).
3. **Static ETag/304 + brotli/gzip** in `serveStatic` (E1).
4. **Contrast:** `--on-bulb` by best ratio + accent check in the custom theme, theme-aware `--ok/--info/--warn/--live`, `--text-3` to AA (system A1–A3). CSS budget gate committed the same day.
5. **Calm failure:** offline heading and family copy, translated fetch errors, a reconnect pill on `online`, player error card with Try again/Back, plain-language conversion note (discover S1–S3, player B9, D6).
6. **Stop side-effecting probes:** harness stubs `/audio`, and the enqueue moves to `POST …/prepare` (engineer §1b). It protects the family's encode lane and Play now.
7. **Shows and To phone tell the truth:** no "caught up" with zero files, no travel `false` + a Swedish count key, localised episode titles, "Season to phone" not red (library C2, D4, C6, C7).
8. **Swedish family surfaces:** invite and watch pages through `translateHtml` + `sv-SE` dates, SVT sheet via `pageHero`, HTML card for broken `/c/` links (owner B6, I1, I2; discover T1).
9. **Owner hub tab on phones:** 5 labelled tabs, Owner = Notes/Activity/House/Clips tiles with badges (owner B3). Decide it before a 9th tab arrives.
10. **Phone polish batch:** What's new ring hidden when empty, facts leading dot, rating kept in grids, hit-slop + `(hover:hover)`, peek handle/close, Trending skips billboard items, no parallax on phones (discover S5, T2, D4, P2, D2, D18; system D, E).

### Features (in order)
1. **Watch privately.** One flag on `logWatch`, filtered by Activity, Popular, Wrapped, `watch_company` and profiles. It must land before profiles go live.
2. **Watch Together keeps going:** Up next for the whole room, plus the phone/tablet room layout using live chat's stage-push model (player Idea 1, B5–B7), plus "✋ Pause?" if there's room.
3. **Lock screen + remote stays awake:** Media Session (room-aware: guests get no seek or next) + Wake Lock on the remote sheet.
4. **Season tabs on one shared episode list:** air dates, unaired rows muted with no Add, season "mark watched", one "Next to go" line, bulb only on next-up (proved at 390 px first).
5. **Search that knows the server:** On Lilin → Can be added → SVT (after the first row) → People; a type switch; no-match with a way forward. The four card-status glyphs replace the mystery squares.
6. **TV comfort:** caption size/box/position on Tizen JS + Android TV, a 24/26 px type floor, dimmed past guide cells, a pressed state on Select. Served, no reinstall; the Rust app gap gets documented.

Next in line: the after-credits chip (S, keywords already fetched), the collection strip, people-as-reason chips on cards, "Ask for it" (if Oliver answers "requests"), and Send a title.

### Questions to put to Oliver (one DM)
1. Does anyone use Lilin in a TV browser?
2. Do Pappa and Anita use the web/iPhone app or only the TV, and do they ever watch separately?
3. Download rights for family: requests, or a capped right?
4. Profiles: is a diary from today / opt-in OK (not retroactive)?
5. Has anyone in the family ever pressed Keep?
