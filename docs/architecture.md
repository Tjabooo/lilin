# How Lilin works

## Playback

The Library refreshes automatically while open and after downloads complete or leave the download list. Returning to the page on a phone refreshes it too; unchanged responses preserve the current cards, focus and scroll position.

Videos are streamed with HTTP range requests, so seeking works in every browser and on iOS. Watch progress is stored in the browser, and playback resumes where you left off.

## Conversion

The converter scans the library and finished downloads every two minutes. Any MKV, AVI, WebM, WMV, FLV, TS or MPEG file gets an MP4 copy next to it; once that exists, the library lists the copy instead. H.264 and HEVC video are copied without re-encoding; other codecs are re-encoded. Text subtitles are saved beside the copy as `.srt` files (some TVs refuse MP4s with many subtitle tracks) and image-based subtitles are dropped.

## Browser audio

The player’s **Audio** menu uses the tracks from the browser version actually being played, including any stereo copy conversion added. Browsers that expose a verifiable native audio-track mapping switch directly. Other browsers prepare a separate copy with the chosen audio in AAC and copied video, then switch at the current position while preserving pause, subtitles, volume and fullscreen. Failed preparation keeps the current audio available and offers **Retry**. Audio choices reset for each video. Automatic audio compatibility and timing fixes continue to work; the old manual **Audio out of sync** menu has been replaced.

Output files start with a stereo AAC track, followed by the original tracks, so browsers play them with sound and receivers still get surround. MP4 files downloaded as-is are never modified because qBittorrent may be seeding them; if their audio isn't browser-compatible, a fixed copy is written to `AUDIO_FIX_DIR` and served only to browsers. When you open such a file, it moves to the front of the queue and the player switches to the fixed copy when it's ready.

## Subtitle timing

Subtitles from OpenSubtitles are often made for a different release of the same film, so they can start a few seconds early or late, slowly drift when the release runs at a different frame rate (23.976 vs 25 fps), or be right only in parts because the other release is cut differently (a recap, a longer intro, ad breaks, an extra or missing scene). After a download, Lilin lines the file up in the background against the first of these it finds:

1. a subtitle track inside the video (or the MKV it was converted from), including the display/clear timings of PGS/DVD bitmap captions,
2. a subtitle file Lilin extracted from such a track,
3. subtitles that came with the release (`Subs/<video name>/*.srt`, or `Subs/*.srt` next to a single film),
4. the film's audio, by finding where people are talking.

For the audio, every 10 ms of the main track (the centre channel of a surround mix) is scored for how speech-like it is: loudness inside and outside the voice band, how much it flickers at syllable rate, how strongly it has a voice pitch, and how these change. The weights were fitted to when subtitles are on screen in English and Japanese films and series, and each measure is standardised within the film, so the language, the mix and the loudness don't matter.

The alignment then works in three steps:

1. **Overall match.** The subtitle lines and the reference become on/off signals and are compared at every offset up to ten minutes, for each common frame-rate ratio.
2. **Parts.** Every line picks its own shift from a 0.1 s grid within five minutes of that match. Consecutive lines keep the same shift unless switching gains clearly more than it costs (about ten well-placed lines' worth). The best choice for all lines together is found exactly by dynamic programming, and lines stay in their original order. A part must have at least eight lines and its shift must stand out on its own, otherwise it joins a neighbour. Each part is then refined to 5 ms. The likeliest frame rates are each tried, and they compete on the same measure, so a slow drift isn't mistaken for a staircase of splits.
3. **Check.** The re-timed file is compared with the reference at every other offset again. The fix is applied only when it clearly beats every alternative, otherwise the file is left alone.

Checking against a subtitle track takes about a second. Against the audio it takes roughly 10–20 seconds for a feature film. Hash matches from OpenSubtitles are checked as well, because uploads are often tagged with the wrong release.

The subtitle menu in the player shows the result and has **Undo timing fix**; the original is kept in `cache/subsync/`. **Fix timing** runs the check on demand for subtitles that weren't checked automatically. The **Subtitle offset** buttons (−1 s, −¼ s, +¼ s, +1 s) in the player's subtitle menu and in the TV remote move every line by hand; on a TV the new timing is sent over a moment after the last tap, restarting at the same spot. **Reset offset** puts the lines back. When a file is fixed in parts, the menu says how many. Lines that exist only in the other cut stay near the part they belong to.

Subtitle selection uses the original release's file hash when a converted copy is being played, prefers the matching BluRay/WEB/TV source, and checks episode numbers when choosing a file from a multi-file upload. Identified films are searched by TMDB ID. Existing automatic results (and earlier hash matches) are revisited once with the current engine when subtitles are opened; manual offsets and undone fixes are preserved. **Check timing again** is also available after an uncertain result. Bitmap timing requires the original file to still exist; it aligns text subtitles but does not turn subtitle pictures into text. A weak match is left unchanged.

## Browser copies of MP4s

Downloaded MP4s are never modified, since qBittorrent may still be seeding them. When one won't play in browsers, a browser copy is made in `cache/audio/` and played instead; TVs still get the original. That happens when the audio isn't AAC or MP3 or starts out of sync, and when the video won't play in Safari: HEVC labelled `hev1` (relabelled to `hvc1`, which is quick and keeps the quality), 10-bit H.264, AV1 or other codecs (re-encoded to H.264). Opening such a file in the player moves it to the front of the queue, and playback switches to the copy by itself when it's ready.

HEVC episodes keep their HEVC video in the MP4 copy: that's lossless and quick, and TVs, iPhones, Safari and Chrome play it. Firefox (and browsers built on it, like Zen) can't, so those get an H.264 copy, which takes a minute or two per episode. When that happens, the next episodes of the show (`PREPARE_NEXT_EPISODES`, default 2) get their copies made in the background, so the next one starts right away.

## Download: what, not how

The details sheet of a film or show has one Download (smart-download.js, ranking in recommend.js). Preferences are set once in **Settings → Downloads**: a quality profile (Save Space: compact 1080p or 720p; Balanced, the default: good 1080p at sensible sizes; Best Quality: 4K when there is one), the largest download per film or episode, and an audio language. A fixed resolution chosen before profiles existed keeps working until a profile is picked.

- **Films**: already in your library, on the server (it joins your library) or downloading? Nothing new is queued. Otherwise the best match for the title and year is downloaded: 5+ seeders first, remuxes, burned-in subtitles, Dolby Vision without HDR10 and dubs in another language count against, and a release larger than your limit or the free space on the media disk (minus what queued downloads still need, minus 5 GB) is never chosen. No suitable release: the sheet says why, with Try again.
- **Seasons**: TMDB's aired episodes minus what's already in the library, on the server or in qBittorrent. With three or more missing, a pack of exactly that season (never a multi-season or complete-series bundle) is added; once its file list arrives the episodes you already have are switched off (priority 0), and episodes the pack turns out not to contain are fetched one by one. A pack with nothing new in it is removed again. Fewer missing, or no suitable pack: episode by episode (`SxxExx`, then `1x05` and known aliases like House / House MD, TV category then everywhere). A failed search is retried once; a release qBittorrent rejected isn't picked again for six hours. Episodes that can't be found are listed with **Retry unavailable**.
- **Episodes in order** (episode-order.js): for a season Lilin downloads, the next unfinished episode in a pack gets qBittorrent's top file priority, and separate episode torrents run one at a time (the rest show as Queued). A stalled episode lets the next one run alongside it (up to three). A finished episode is converted to MP4 straight away, even while the rest of its pack downloads. Pausing, resuming or removing one yourself takes it out of the order.
- **Advanced options** on a title: an exact resolution (finds nothing rather than another one) and the release list to pick from yourself.

## Save for later and Follow

Every title sheet has **Save** (films and shows) and **Follow** (shows) (watchlist.js on the server, public/watchlist.js on the page; tables `watchlist` and `follow_episodes` in `.lilin.db`). Saved titles are a row at the top of Discover. A background round every 10 minutes checks what's due, one title at a time, and downloads with the same Download command as the button, as that person and with their quality settings. Automatic downloads need download rights.

- **Films**: a saved film can wait for its release (*Download it when a good copy is out*). The expected date is the earliest digital or disc release on TMDB, else the first release date. Before that it's checked once a day; afterwards the Download command runs (it never takes a cam), and when nothing suitable is out yet it tries again after 1, 2, 4, 8 and 12 hours, then daily. Once a download starts (or the film is already here) it's done.
- **Shows**: following starts after the last episode that had aired when you followed (or switched automatic downloads on), so nothing older downloads by itself. Every 3 hours the show's newest aired episodes are added to a per-episode list and fetched with the Download command for exactly those episodes (it skips episodes in your library, on the server or already downloading). A missing episode is retried with the same pauses and reported as not found 14 days after it aired. Episodes that downloaded this way show a **New** badge on the show's Library card until you open the show.
- **Coming up** (Library): the next episode of each followed show and the release date of each saved film that isn't out yet, soonest first.

## Coming soon

Discover's **Coming soon** (src/coming-soon.js on the server, public/coming-soon.js on the page) lists films and shows that come out in the next 120 days: one row on the All tab right after *New episodes this week* (films only on the Films tab, shows only on the Shows tab) and a full page behind *See all*, grouped by this week, next week and month, with All / Films / Shows.

- **Films**: the cinema date in `TMDB_REGION` (else the country in `TMDB_LANG`) while it's ahead, else the earliest cinema date anywhere; once the cinema run has started, the digital or disc date. A film Lilin can already get (`filmOut` in watchlist.js) or one in cinemas with no home release date yet isn't listed. Candidates come from TMDB's `/discover/movie` (cinema in the region, cinema anywhere, digital/disc anywhere), each checked against its own `release_dates`.
- **Shows**: new series from `/discover/tv` by first air date, and new seasons of running shows (shows with an episode in the window whose `next_episode_to_air` is an episode 1, or with a dated season that hasn't started). News, reality, soap and talk shows are left out.
- **Ranking**: `hype = ln(1 + popularity) / ln(1 + reference)` with a reference per kind (films 60, new series 8, new seasons 80: TMDB popularity runs on very different scales), `closeness = 0.5 ^ (days / 30)`, score `hype³ × closeness`. Hype under 0.5 is demoted (×0.2), under 0.35 left out, as are titles without a poster. Tests: tests/coming-soon.test.mjs.
- The lists are built in the background (first ~20 s after start, then every 3 hours; ~200 TMDB calls, release dates cached 12 hours) and the home row is skipped while the first build is still running. Thumbs-down titles are hidden like on the rest of Discover. Each card has one-tap **Save** (films; with automatic downloads on when you may download) or **Follow** (shows) through `/api/watchlist`. The TV apps get the row through `/api/discover/home` and its pages through `/api/discover/list?key=coming-soon`; every item carries `soon: { date, kind: cinema|digital|disc|premiere|season, season?, local? }`.

## Download to phone

**To phone** on a film, the phone button on an episode row and **Season to phone** open a sheet with three choices (src/travel.js on the server, public/travel.js on the page; table `travel` in `.lilin.db`): **Small** (480p, H.264 ~900 kbps, AAC 96k), **Standard** (720p, ~2.2 Mbps, AAC 128k) and **Full quality** (the file as it is, or its MP4 copy, downloaded straight away). Small and Standard are made on request: one ffmpeg at a time below normal priority, NVENC with hardware decoding when the GPU has it, then NVENC alone, then x264. The copy never upscales, has square pixels, carries the default audio track plus up to two other languages (no commentaries) as stereo AAC, and every subtitle saved beside the video as a `mov_text` track (rewritten as UTF-8 first), with the index at the front (`+faststart`). HDR (PQ or HLG) is tone-mapped to SDR BT.709 (zscale + Hable) when the ffmpeg build has zscale.

Copies live in `cache/travel/<key>.mp4`, where the key covers the source path, size and modification time, the size choice and an encode version, so a replaced file gets a fresh copy and two people asking for the same thing share one file. Each person's list remembers what they asked for and when they last downloaded it; a request untouched for `TRAVEL_KEEP_DAYS` (7) is dropped, and a copy nobody's list points at is deleted. `TRAVEL_MAX_GB` (50) caps the folder: before a copy is made, copies everyone already downloaded go first, oldest request first; if it still doesn't fit, the copy fails with a message. Downloads are served with `Content-Disposition: attachment` and range support, only to people whose list holds that copy. Unfinished copies are queued again after a restart. Finished copies notify the people waiting for them (*Downloads ready*), and the notification opens **For your phone** in the Library.

## Moods

Discover's **Moods** row (`src/vibes.js` on the server, `public/vibes.js` + `vibes.css` on the page) lists about 28 hand-made moods. Each is data: English and Swedish names and a one-line blurb, two colours and a glyph for its tile, and a few TMDB `/discover` queries (keyword IDs, genres to want and to leave out, release years, original language) with a rating and vote-count floor, plus 6 to 17 hand-picked anchor titles. A query marked `boost` only lifts titles the other queries found (tone keywords like *suspenseful* are too broad to find titles on their own), and `skip` leaves out titles that match the filters but not the feeling. `months` limits a mood to part of the year.

A mood's titles are pooled once per language and kept for 6 hours: two pages of each query (sorted by vote count, adult titles excluded, nothing unreleased), the anchors, scored by a vote-weighted rating plus a little for being well known, more for being found by several queries, most for being an anchor; the best 120 are kept. The page orders that pool itself with a seeded shake of the scores (the seed is the day, or a new one on **Shuffle**), titles in your library first, and filters films and shows without asking the server again. Titles you gave a thumbs down are left out, as everywhere on Discover.

The IDs are checked against TMDB by `TMDB_TOKEN=… node tools/vibes-check.mjs [mood …]`, which also lists what a mood finds, so a change can be judged by eye before it ships.

## Shows in the library

Films and shows appear as poster cards, separated into Films and Shows inside each library section. Film posters, backdrops and descriptions come from TMDB, matched by title and year and cached in `.lilin-shows.json` (30 days for matches, one day for misses); unavailable artwork falls back to the title.

Episodes are recognised from `S01E05`, `S01E01E02`, `1x05` and `Season 1 Episode 5` in the file name. A file named only `S02E05.mkv` takes the show's name from its folder (`The Bear (2022)/Season 2/`). Episodes are grouped into one show when their names match loosely (case, punctuation and a leading "The" are ignored) or when TMDB resolves them to the same show, so episodes from different releases end up together. TMDB supplies the show's and each season's poster and the episode names; lookups are cached in `.lilin-shows.json` (found shows for 30 days, refreshed weekly for new seasons; unknown names are retried daily). Without TMDB, shows are still grouped by name.

## Finished downloads

With `QBIT_REMOVE_FINISHED=on` (the default), a finished download is removed from qBittorrent within a minute, with its files kept, so it never seeds. Categorized downloads go into `MEDIA_DIR/Movies` or `MEDIA_DIR/TV` (unclassified ones use qBittorrent's default, ideally `MEDIA_DIR/Downloads`), so the video stays in the Library and gets its MP4 copy as usual. A download still waiting for subtitles requested with it is stopped first and removed once they're fetched (at most 2 hours later). Downloads saved outside `MEDIA_DIR` are only stopped, so they stay accessible from Library transfer details. Give a torrent the tag `seed` in qBittorrent to keep it seeding. Once a download is removed, its files count as ordinary library files, so `CONVERT_DELETE_ORIGINAL=on` applies to them.

## Accounts

There's no separate login. Cloudflare Access adds the signed-in email to every request (`Cf-Access-Authenticated-User-Email`) and that email is the account; one is created the first time someone opens Lilin. The header is only believed from a trusted proxy or with a verified Access token (see [remote-access.md](remote-access.md#how-accounts-work)). Visits on the home network carry no email and share a "Home network" account. Accounts live in `.lilin.db`, a SQLite database (Node's built-in `node:sqlite`, so still no dependencies): people and their settings, what's in each library, who started each download, and watch progress.

- **One file, many libraries.** A video exists once on disk. "Add to my library" adds it to your list; nothing is copied or downloaded again. A video's identity is its path in `MEDIA_DIR` without the extension, so the MP4 copy and the original count as the same video.
- **Whose download.** Torrents added through Lilin get the qBittorrent tag `lilin-u<id>` (and a magnet's infohash is recorded). When one finishes, its videos go into that person's library, before the no-seeding cleanup removes the torrent. Torrents added straight in qBittorrent count as the owner's (the first address in `ADMIN_EMAILS`). A whole-season download puts episodes that are already on the server into your library instead of downloading them again.
- **Already there.** On the first start with accounts, every video already on the server goes into the owner's library as `existing`, so the clean-up never deletes what was there. Videos copied into `MEDIA_DIR` by hand later are treated the same way.
- **Clean-up.** Once an hour Lilin deletes downloads that are over a month old and that nobody has watched in the last 30 days (`src/cleanup.js`). "Watched" means anyone saved a position in it or had watch time on it; a show counts as one, so its episodes stay while anyone watches any episode. The video leaves every library and the file goes (with its MP4 copy and subtitles); a file that's playing is retried later. Videos that were already on the server (above) are never cleaned up. `node src/cleanup.js` lists what would go now; `--run` does it straight away. `CLEANUP_MIN_AGE_DAYS` and `CLEANUP_IDLE_DAYS` change the two 30s.
- **Deleting** takes a video out of your library; the file is only deleted when nobody else has it. The owner can also delete it for everyone.
- **Privacy.** People only see their own library and downloads. Search tells them a title is on the server, not whose it is. The owner's Settings tab lists everyone with how much they have.
- **Restrict.** The owner can mark a person **Restrict** in Settings → People (`users.restricted`; never the owner). A restricted person keeps Watch Together (rooms, Live TV and room chat) but no other social features: they don't see who else liked a title and nobody sees their likes (counts stay), they have no friends list and can't be found in it, they aren't offered as a Watch Together invitee and can't send notification invites, and nobody can send them a moment. They share and receive by copying links only. Code reads it through `isRestricted(user)` and `restrictedIds()` in `src/accounts.js`.
- **Staying signed in.** How long a sign-in lasts is Cloudflare's setting: Zero Trust → Access → Applications → your Lilin app → **Session duration** (24 hours by default; up to a month). If a sign-in runs out while Lilin is open, it says so and signs back in with one tap.

## Activity

The name chosen in **Settings → Profile** is the default person label in Activity, the access list, download ownership and Watch Together. Activity resolves names when read, so a profile rename also updates older events; email addresses remain searchable and are shown secondarily in the owner's People/access lists. Active watch rooms receive profile-name changes immediately and refresh them on heartbeat/rejoin.

City and country appear beside the OS/browser for people and events, using Cloudflare's `CF-IPCity` and `CF-IPCountry` headers. In the domain's Cloudflare dashboard, go to **Rules → Settings → Managed Transforms** and enable **Add visitor location headers**. Location is approximate (VPNs and mobile carriers can change it), not GPS. No external IP lookup service is called. Old events and direct LAN visits have no inferred location; country-only headers still show the country.

The **Activity** tab shows who has been using Lilin and what they did: downloads started, films watched in the browser, casts to TVs, subtitles fetched and deletions. People are identified by the email they log in to Cloudflare Access with, plus the device and browser; visits through the server's local address show up as "Home network". The tab is only shown to the emails listed in `ADMIN_EMAILS`, and only through the Cloudflare address, since local visits have no email. The last 2,000 entries are kept in `.lilin-activity.jsonl`. Logins themselves (who signed in, when, from where) are in the Cloudflare Zero Trust dashboard under **Logs → Access**.

## Deletion

Deleting a video that belongs to a torrent removes it through qBittorrent, so the torrent stops seeding and no "missing files" errors appear. For multi-file torrents you can delete a single episode (qBittorrent is told not to download it again) or the whole torrent. The MP4 copy, subtitles and audio-fixed copy are deleted too, as are any empty folders left behind.

## What's new

After an update, everyone sees a short **What's new** sheet once, the next time they open Lilin or come back to an open page. The notes are written by hand in `whats-new.json` at the app root, newest first, in plain language for the people who use Lilin (CHANGELOG.md stays the technical record for whoever runs the server):

```json
[{ "id": "2026-11-05", "date": "2026-11-05", "title": "Fresh this week",
   "items": [{ "title": "Skip intro", "text": "A button skips the opening titles." },
             { "title": "Server tool", "text": "Only the owner sees this one.", "audience": "owner" }] }]
```

Each person's settings remember the newest update they've closed (`seenUpdate`). Someone who has never closed one sees only the updates dated on or after the day they joined, so newcomers aren't shown the whole history. At most the three newest unseen updates are shown. The sheet waits while a video is playing or another sheet is open. A page that was left open through an update (the web app's files changed since it loaded) offers **Reload to update**. Settings → What's new lists every update. The file is re-read when it changes, so a note can be fixed without a restart. Each new update is also sent once as a notification (*Lilin updates*, see Notifications).

## Notifications

Lilin can notify people's phones and computers through **Web Push**, with no dependencies and no third-party account: the server signs each message with its own VAPID key (ES256, RFC 8292) and encrypts it for the device (aes128gcm, RFC 8291), all with `node:crypto`. The key pair is made on first start and kept with the devices in `.lilin-push.json` (mode 600) in `DATA_DIR`; deleting that file means everyone turns notifications on again. `public/sw.js` is a service worker that only shows notifications and opens Lilin when one is tapped (an open Lilin handles the link without reloading); it caches nothing. `manifest.webmanifest` and the icons let phones install Lilin to the Home Screen.

People turn it on per device in **Settings → Notifications** and switch each kind on or off for all their devices:

| Kind | Setting | Sent when |
| --- | --- | --- |
| Downloads ready | `pushDownload` | Something you downloaded (or asked for) landed in your library; a season pack's episodes replace each other's notification |
| New episodes | `pushEpisode` | A show you follow got an episode downloaded for you, or an episode of a show in your library was downloaded by someone else; once per episode. Nothing about shows or films that aren't in your library |
| Watch Together invites | `pushWatch` | Someone in a room taps **Invite** and picks you; opens the room's join screen. Also Pick together: an invite to a pick (`/?pick=<id>`), a match while you're away from it, and a room someone started from a match. Off: you aren't offered as an invitee |
| Moments | `pushShare` | A friend sent you a moment and it's ready to watch; opens and plays it (`/?moment=<id>`) |
| Friends | `pushFriend` | Someone asks to be your friend, or says yes to your request; opens Settings → Friends (`/?friends=1`) |
| Lilin updates | `pushUpdate` | A new update in `whats-new.json` that you haven't read yet: its title, a short summary and *Tap to read more*, which opens its notes (`/?update=<id>`). Sent once per update (`.lilin-update-pushes.json` in `DATA_DIR`), only for updates dated today or yesterday, after the file has sat unchanged for 90 s; several at once become one notification |

Push endpoints must belong to a known push service (Google FCM, Mozilla, Apple, Windows), so a subscription can't make the server POST to an address on your network. A device the push service reports as gone (404/410) is removed. On iPhone and iPad, Apple allows web notifications only for Home Screen apps (iOS 16.4+), which Settings explains. A server reached only over plain `http://` (not localhost) can't use notifications: browsers require https.

## Friends

Settings → **Friends** (src/friends.js, public/friends.js; table `friend_links` in `.lilin.db`). People find each other by name (two letters or more), send a request, and become friends once the other person accepts; asking someone who already asked you accepts theirs. Declining, taking back a request and removing a friend are quiet (no notification). Restricted people (see Accounts) can't be found, can't ask or be asked, and their friendships are hidden while they're restricted (kept, so lifting it brings them back). The shared Home network account has no friends. Other code uses `areFriends(a, b)` and `friendIds(userId)`; Watch Together lists friends first among invitees.

## Taste match

A friend's profile has a **Taste match** section (src/taste-match.js, public/taste-match.js; profile section `match`, after Ratings). It compares the stars and thumbs both people gave the same films and shows (`reviews` and `ratings`, Letterboxd imports included). Every opinion becomes stars: stars as given, a like next to stars lifts them to at least 4, a like without stars counts as 4½ and a thumbs down without stars as 1½. The gaps between the two people's stars are averaged, leaning toward an ordinary gap of 1¼ stars as if four more titles were in common (so ten lucky likes don't make Super on their own), and the average becomes a word: up to ½ star apart Super, then Very high (0.7), High (0.95), Medium (1.3), else Low. Under 10 titles in common there's no level, only how many there are so far. Never a percentage.

Under it: **You both loved** (both 4 stars or more, the highest first, up to 10), **Where you split** (2 stars or more apart, widest first, up to 6) and **<name> loved, you haven't seen** (their 4 stars or more that you haven't rated, started or logged on Letterboxd, up to 8). A thumbs down on its own is private in Lilin, so a split is only listed when the other person's side is stars or a like; the level counts those thumbs too (a word over ten or more titles, like the title averages). It's only there for friends who can see the profile in full: not for restricted people or the Home network account, not on your own page, and each person can switch the section off on their own profile, which hides their side from everyone else.

## Moments

A moment is a piece of a film or episode (2 s to 3 min) someone cut in the player (src/moments.js, public/moments.js; tables `moments` and `moment_shares` in `.lilin.db`, files in `MOMENTS_DIR`). Not the owner's game Clips. In the player, **⋯ → Clip a moment** pauses and shows a zoomed strip of about six minutes around the current spot, with two handles (drag, or arrow keys; the picture follows), **Start here** / **End here** for the playhead, and **Preview**. In a Watch Together room the picture isn't moved; only the handles are. **Next** takes a note, whether to keep the subtitles that were on (the cues the player showed, saved as WebVTT beside the moment, not burned in), and which friends to send it to; **Copy link** makes the link only. You can clip what's in your library (the owner anything, room members the room's video).

The server cuts it in the background, one at a time: when the source is browser-safe H.264 (8-bit, SDR, up to 1080p) and a keyframe lies within 0.25 s of the start, the video is copied unchanged; otherwise it is encoded to H.264 (NVENC when available, else x264 veryfast; at most 1080p, HDR tone-mapped). The audio is the person's audio language (or the default track), as stereo AAC. Each moment gets an unguessable 22-character link, `/c/m/<token>`: a public page like a shared game clip (Lilin's player with only that piece, the note, a thumbnail for chat previews). Friends it was sent to get it in Settings → **Moments** (Shared with you) and a notification once it's ready (`pushShare`); opening the notification plays it. The maker sees their moments there too, with Copy link and Delete (the link stops working at once). Moments are deleted after `MOMENTS_DAYS` and the oldest go first past `MOMENTS_MAX_GB`. Restricted people can make links but can't send moments to anyone directly, and nobody can send them one.

## Watch Together

Rooms work in the browser player, including fullscreen. Invite URLs are `/?watch=<random token>` and stay behind the existing Cloudflare sign-in. The room grants access to that title without adding it to each guest's library. Up to 12 viewers can join. Casting is outside synchronized playback: leave the room before using a TV receiver.

The server publishes a shared timeline over Server-Sent Events, with heartbeats to keep Cloudflare Tunnel from buffering or closing the connection. Each browser estimates clock offset from low-round-trip-time samples, starts at a shared future time and compensates for message arrival delay. Small drift is corrected with a bounded playback-rate adjustment; larger drift seeks to the shared position. The group pauses when a member buffers or needs an autoplay gesture and resumes when everyone is ready. This reduces skew but does not promise frame-perfect playback on every device or connection. Each viewer streams separately, so server upload bandwidth must cover all viewers.

Only play/pause/seek and readiness enter room state. Caption tracks and manual offsets remain in each viewer's player; party offset buttons do not edit the shared SRT file. The host's departure pauses playback and hands control to a remaining viewer. Dropped viewers have a 20-second reconnect grace period. Rooms are in memory, expire within 24 hours and end when Lilin restarts. Active rooms protect their media against file deletion; normal retention cleanup retries later.

## Pick together

Swipe to match (src/match.js, public/match.js + match.css; tables `match_picks`, `match_members`, `match_cards`, `match_votes` and `match_hits` in `.lilin.db`). One person starts a pick with filters (films or shows, a genre, a longest running time for films, leave out what anyone in it has seen, server only) and invites people: the same people Watch Together offers (invites on, a device with notifications, not restricted; friends first), notified as *Watch Together invites* (`pushWatch`) with `/?pick=<id>`, or anyone with the link. The id is 22 random characters. Restricted people can start a pick and join by link, but aren’t offered as invitees and can’t invite.

**The stack.** Cards are dealt 20 at a time, and everyone gets the same cards in the same order. Each person’s taste comes from their own history: `watch_log` titles of the pick’s type watched for a while or finished and thumbs-up titles in `ratings` (a thumbs up counts most, recent counts more), up to six seeds each, whose TMDB recommendations become candidates credited to that person. Invited people count from the start; people who join by link count from the next hand. Someone with fewer than three seeds borrows the household’s Popular on Lilin as seeds. Every pick also brings in TMDB `/discover` crowd-pleasers (by vote count, and popular from the last twelve years; rating and vote floors, the genre and running-time filters), the week’s trending titles and up to 40 titles from the server. A candidate’s score: the group’s average taste for it, the least keen person’s again, a lift when it was recommended from two or more people’s histories, each person’s genre leaning (the genres recommended for them, then what they said yes and no to in this pick), a vote-weighted rating, and a little for being on the server or popular in the house. Unreleased, obscure (under 80 votes for films, 30 for shows, unless on the server), disliked and (with the filter) seen titles are left out; news, reality, soap and talk shows too. The order avoids two cards of the same main genre in a row where it can. A new hand is dealt when someone has fewer than 8 cards left: it is scored again with everyone’s swipes so far and adds TMDB recommendations for titles that got a yes. Card details (running time, seasons, genres, the description in each member’s language) come from TMDB and are cached for six hours; films over the longest running time are dropped there. A pick deals at most 300 cards.

**Swipes and matches.** A swipe is `1`, `-1`, or `0` to undo; only the person who swiped sees it, and swipes never become thumbs. When everyone in the pick (two or more) has said yes to the same card it’s a match, recorded once; someone leaving can complete one. Each person sees only their own reason on a card (*Because you watched …*). A match on a film that’s on the server offers **Watch together** (a room on the server’s copy, added to that person’s library, then the player opens in the room) or **Plan for later** (a planned party); the others in the pick see who started it and **Join**, and get a notification. Others in the pick hear about joins, new hands, finished stacks and matches on the live topic `match`; whoever hasn’t swiped in the last minute also gets a notification for a match. A pick is deleted 12 hours after its last swipe. One person can start 20 picks a day and have three going.

# Project layout

```text
server.js            entry point (node server.js); the app is in src/
setup.js             setup wizard, doctor, backups, service management (src/setup/)
src/
  server.js          HTTP server, routes and the library
  env.js, paths.js   .env loading, APP_DIR/DATA_DIR and the list of state files
  trust.js           which proxy/identity headers are believed
  config-check.js    setting checks shared by startup and doctor
  accounts.js        people, libraries, progress (SQLite)
  convert.js         MP4 conversion, browser audio, browser copies
  torrents.js, smart-download.js, season.js, release-match.js, recommend.js, download-paths.js, torrent-fetch.js
  documentaries.js (Discover's documentary categories), vibes.js (Discover's Moods), svtplay.js + svt-queue.js (SVT Play catalogue, saved copies)
  subtitles.js, subsync.js
  cast.js            DLNA and Apple TV
  watch.js, watch-page.js   Watch Together
  shows.js, episode-order.js, credits.js, previews.js, theme-music.js
  notes*.js, note-share.js  Notes, attachments, OCR, shared previews
  house.js, load.js, screentime.js, clips.js, invites.js, activity.js, live.js, network.js
  social.js, reviews.js thumbs, Popular, Wrapped, watch parties; stars + written reviews
  profiles.js, taste-match.js  profile pages; Taste match on a friend's profile
  match.js           Pick together (swipe to match)
  setup/             wizard, detection, integrations, services, packages, backups
public/              the web app (plain JavaScript and CSS, no build step)
agents/              lilin-house reporter for Linux machines (bash + systemd units), lilin-scout idea scout (Python + Claude Code)
scripts/windows/     Task Scheduler service and restart scripts; setup-wizard.ps1 (WPF setup wizard,
                     drives setup.js through `setup.js wizard` JSON) and LilinSetup.cs (its .exe launcher)
start-lilin.cmd    Windows launcher the scheduled task runs
tools/               optional extras: torrent-vpn (Windows), Discord notes import
docker/, Dockerfile, docker-compose.yml
tests/               node --test suites
```

State lives in `DATA_DIR` (the Lilin folder unless set): `.lilin.db` (SQLite: accounts, libraries,
progress, Notes), `.lilin-*.json` (caches and small registries; `.lilin-push.json` holds the
notification key), `.lilin-secret`,
`.lilin-notes-files/`, `.lilin-avatars/` (profile pictures) and `cache/` (rebuildable copies and previews).

# API

The web client uses a JSON API that can also be scripted. `<kind>` is `lib` for library files or `dl` for downloads.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/status` | Enabled features |
| `GET` | `/api/activity` | Recent activity and people (`ADMIN_EMAILS`, plus people with Can see activity) |
| `POST` | `/api/watch` | Host a library title (`{ id, clientId, position }`), returns a private room token |
| `GET` | `/api/watch/clock` | Server clock sample for latency compensation |
| `GET` | `/api/watch/<token>/preview` | Title and host for the join screen (normal sign-in required) |
| `POST` | `/api/watch/<token>/join`, `/heartbeat`, `/control`, `/leave` | Room membership and playback; all use `clientId`, control adds `{ action, position }`, heartbeat adds `{ ready, buffering, blocked, rtt }` |
| `GET` | `/api/watch/<token>/events?clientId=` | Immediate timeline updates over SSE (joined viewers only) |
| `GET` | `/api/watch/<token>/play-link?clientId=` | Browser stream for the room's title (joined viewers only) |
| `GET` | `/api/watch/<token>/invitees?clientId=` | People you can invite with a notification (`people: [{ id, name }]`; joined viewers only) |
| `POST` | `/api/watch/<token>/invite` | Notify people about the room (`{ clientId, userIds }`; each person once every two minutes) |
| `GET` | `/api/push` | The server's VAPID public key and your devices with notifications on |
| `POST` | `/api/push/subscribe` | Turn notifications on for a device (`{ subscription, label?, replaces? }`, the browser's `PushSubscription.toJSON()`) |
| `POST` | `/api/push/unsubscribe` | Turn them off (`{ endpoint }` for this device or `{ id }` from the list) |
| `POST` | `/api/push/test` | Send a test notification to your devices |
| `GET` | `/api/ideas` | The idea box: your own ideas (`mine`); for the owner also everyone's (`all`) and the idea scout's (`scout`) |
| `POST` | `/api/ideas`, `/api/ideas/<id>`, `/api/ideas/<id>/delete` | Send an idea (`{ text, kind }`); owner: answer a member's idea (`{ status, reply }`) or decide on a scout idea (`{ action: accept\|comment\|notnow, comment }`); take back or delete |
| `GET` | `/api/scout/ideas` | The idea scout runner (`Authorization: Bearer SCOUT_TOKEN`): its ideas with status, thread and build, plus the members' ideas (text and status only) for de-duplication |
| `POST` | `/api/scout/ideas` | Runner: post an idea `{ title, pitch, evidence: [{ text, url, where, year }], fit, size: small\|medium\|large }`; same title twice → 409, 12 a day |
| `POST` | `/api/scout/ideas/<id>` | Runner: answer a comment (`{ comment, status: "new", pitch?, … }`) or report a build (`status: building\|added\|failed\|approved`, `build: { branch, commit, note }`); other moves → 409 |
| `POST` | `/api/agent/notify` | An agent on the home network (`X-Lilin-Token: HOUSE_TOKEN`) sends the owner a notification `{title, body, url}`; 1 per 20 s, 30 a day |
| `POST` | `/api/watch/<token>/chat`, `/react` | Room chat (`{ text }`, last 50 kept for late joiners) and emoji reactions (`{ emoji }`); both arrive on the room's event stream |
| `POST` | `/api/watch/<token>/chat` on a Live TV channel | Channel chat (src/live-chat.js): the same route and stream, but the last 50 messages (14 days at most) belong to the channel and are kept in `.lilin-live-chat.json`, so they outlive the room; messages carry `uid`; 8 per 15 s per person across devices, no repeats within 30 s. Restricted people get 403 and the stream sends them no messages, history or reactions |
| `POST` | `/api/live/<channel>/chat/delete` | Owner only: `{ id }` removes a channel chat message; everyone tuned in gets the new `chatLog` on the room's stream |
| `POST` | `/api/watch/<token>/schedule` | Host only: `{ startsAt }` (ms) starts playback by itself at that time, `null` clears it |
| `POST` | `/api/watch/plan` | Plan a party for later (`{ id, startsAt }`, up to two weeks ahead); saved in `watch_parties` so it survives a restart |
| `GET` | `/api/friends` | Your friends, requests you got (`incoming`) and sent (`outgoing`) |
| `GET` | `/api/friends/search?q=` | People to add by name (not restricted people), with `state`: `friend`, `sent`, `received` or `null` |
| `POST` | `/api/friends/request`, `/api/friends/accept`, `/api/friends/remove` | `{ id }`: ask, accept, or decline / take back / remove |
| `GET` | `/api/profiles/<id>`, `/api/profiles/@<handle>` | A profile (profiles.js). For a friend it also carries `match` (taste-match.js): `{ level: "low" \| "medium" \| "high" \| "veryHigh" \| "super" \| null, common, need, both, split, theirs }`, the lists `[{ key, title, card }]`, `split` with `mine` / `theirs` `{ stars, liked }` (`mine.disliked` too), `theirs` with `{ stars, liked }`; `null` when there's nothing to compare or it isn't shown |
| `GET` | `/api/moments` | Moments you made (`mine`) and that friends sent you (`shared`, with `seen`) |
| `POST` | `/api/moments` | `{ kind: "lib" \| "dl", id, start, end, note?, title?, label?, subtitles?: [{ start, end, text }], to?: [userId] }`: cut a moment (and send it); returns `{ moment, link, sent }` |
| `POST` | `/api/moments/<id>/send`, `/delete`, `/seen` | Send to friends (`{ userIds }`), delete (yours: for everyone; sent to you: off your list), mark as watched |
| `GET` | `/c/m/<token>` | Public moment page; `/video.mp4`, `/thumb.jpg`, `/subs.vtt` |
| `GET` | `/api/match` | Pick together: your picks still going and the ones you were invited to (`picks`), and who you can invite (`people`) |
| `POST` | `/api/match` | Start a pick `{ type: "movie" \| "tv", genre?, maxMinutes?: 0 \| 100 \| 120 \| 150, unseen?, serverOnly?, invite?: [userId] }`; deals the first hand and returns the pick |
| `GET` | `/api/match/<id>?from=` | The pick: `members` (with `swiped`, `done`), `invited`, `cards` from `from` on (`key`, `title`, `poster`, `runtime`, `seasons`, `genreNames`, `overview`, `onServer`, your own `why`), your swipes (`mine`), `matches`, `room`, `more`; before joining only who’s in it |
| `GET` | `/api/match/<id>/invitees` | People you can invite to it |
| `POST` | `/api/match/<id>/join`, `/vote`, `/more`, `/invite`, `/leave`, `/watch` | Join; swipe `{ key, vote: 1 \| -1 \| 0 }` (returns `match` and how many cards are `left`); deal the next hand when you have fewer than 8 left; invite `{ userIds }`; leave; Watch Together on a match `{ key, clientId }` or plan it `{ key, startsAt }` (returns `room`) |
| `GET` | `/api/watch/parties` | Planned parties you made or joined |
| `POST` | `/api/watch/<token>/cancel` | Whoever planned a party ends it |
| `GET` | `/api/trending`, `/api/search?q=` | TMDB titles |
| `GET` | `/api/title/<movie\|tv>/<id>/details` | A title page's **More details** (src/details.js), asked only when someone opens it: crew groups (`people: [{ key, people: [{ id, name, jobs?, episodes? }] }]`), `facts` (studios, countries, languages, dates, money), `keywords`, `links`, and `music.albums` (soundtrack albums with tracks from Wikidata + MusicBrainz, cached in `CACHE_DIR/title-music.json`; `musicPending: true` while still being looked up). Season answers (`/api/tv/<id>/season/<n>`) give episodes a `credits` field (director, writers, guest stars) when TMDB has them |
| `GET` | `/api/vibes` | Discover's moods (`vibes: [{ id, name, blurb, colors, glyph, types, seasonal }]`, in the viewer's language; empty without TMDB) |
| `GET` | `/api/vibes/<id>` | One mood with its titles (`results`: TMDB cards with a `score`, best first; the page shuffles them) |
| `GET` | `/api/library` | Your library (`items`, with `addedAt`), and what else is on the server (`server`) |
| `POST` | `/api/library/add` | Add videos already on the server to your library (`{ ids }`) |
| `POST` | `/api/library/extend` | Keep videos longer (`{ ids }`) |
| `GET`, `POST` | `/api/library/identify` | Owner only: search film candidates (`?id=&q=`) or assign a TMDB identity to one file (`{ id, tmdbId }`) |
| `GET` | `/api/library/delete-info?id=` | What deleting an item would remove, and how many others have it |
| `POST` | `/api/library/delete` | Remove from your library; deletes the file or torrent when nobody else has it (`{ id, scope: "file" \| "torrent", everyone? }`) |
| `GET` | `/signin` | Sign-in page (public; redirects home when already signed in) |
| `POST` | `/api/auth/login` | `{ email, password }` as JSON, or the sign-in form; sets the session cookie. Public |
| `POST` | `/api/auth/logout` | Ends this browser's session. Public |
| `POST` | `/api/auth/password` | `{ current, next }`: change your Lilin password (signs out other sessions) |
| `GET` | `/api/auth/status` | How this request is identified (`via`: proxy, session, home or null). Public |
| `GET`, `POST` | `/api/me` | You and your settings (`{ name?, theme?, subLang?, quality?, startView?, librarySort?, seenUpdate?, skipIntro?, pushDownload?, pushEpisode?, pushWatch? }`); `skipIntro`: `button` or `auto` |
| `GET` | `/api/media/<lib\|dl>/<id>/credits` | When the closing credits start (`{ creditsAt }`, seconds or `null`) |
| `GET` | `/api/media/<lib\|dl>/<id>/intro` | The opening titles to skip (`{ intro: { start, end } }` in seconds, or `intro: null`) |
| `GET` | `/api/media/lib/<id>/theme` | A show page's theme music (src/theme-music.js): up to 30 s of the opening Skip intro found in any episode of the show `<id>` belongs to (the earliest season first), as `audio/mp4` (AAC, cached in `CACHE_DIR/theme-music`). Only what's already known is used: `204` when no opening is known yet, and one episode is then looked at in the background while nobody is watching |
| `GET` | `/api/whats-new` | Every update's notes (`updates`, newest first) and the newest one you've seen (`seen`); `/api/status` carries `whatsNew: { latest, unseen, build }` |
| `GET`, `POST` | `/api/me/progress` | Where you stopped watching (`{ ref, time, duration }`; `time: null` = finished). The player adds `{ watched, about: { titleKey, title, season, episode }, room }`: seconds really played since the last save, logged per day in `watch_log` (capped at ~2x the time that passed) |
| `GET` | `/api/me/wrapped?year=` | Lilin Wrapped: your year from `watch_log`, `watch_company` and `ratings` |
| `POST` | `/api/social/rate` | Thumbs `{ key: "movie:<tmdb id>" \| "tv:<tmdb id>", value: 1 \| -1 \| 0, title }` |
| `GET` | `/api/social/title?key=`, `/api/social/ratings?keys=` | Your thumb and who else liked a title (dislikes are never shown to others); bulk `{ mine, likes }` |
| `GET` | `/api/social/popular?type=` | Popular on Lilin: last 60 days of likes, viewers and hours, as TMDB cards |
| `GET` | `/api/reviews?key=[&all=1]` | A title's reviews (reviews.js): `{ average, ratings, count, thumb, mine, reviews: [{ userId, name, avatar, stars, text, spoiler, created, edited, mine, friend, canRemove }] }`; two reviews without `all`. Average only from 2 people's stars. Restricted people get `{ restricted: true }` and nobody sees theirs |
| `POST` | `/api/reviews` | Your review `{ key, title, stars: 1-5 \| null, text (plain, ≤ 2000), spoiler, thumb? }`; stars set your thumb (4-5 up, 1-2 down, 3 none). 403 for restricted people, 429 past 20 writes in 10 min. Live topic `reviews` |
| `POST` | `/api/reviews/delete` | `{ key, userId? }`: your own review, or anyone's for the owner (the thumb stays) |
| `GET` | `/api/lists[?key=]` | Your lists (lists.js), newest change first, each `{ id, name, about, ranked, private, count, preview }`; `key` adds `has` (holds that title). Restricted / Home network: `{ lists: [], off: true }` |
| `POST` | `/api/lists` | New list `{ name (≤ 80), about (≤ 600), ranked, private, key? \| keys? }` → `{ list }`. 100 lists per person, 500 titles per list |
| `GET` | `/api/lists/<id>` | One list with `items` (title snapshots) and its maker; 404 unless you can see the maker's profile (and it isn't private) |
| `POST` | `/api/lists/<id>` | Change `{ name, about, ranked, private, order: [keys] }` (maker only) |
| `POST` | `/api/lists/<id>/add`, `/remove`, `/delete` | `{ key }` puts a title at the end / takes it off; `delete` removes the list |
| `GET` | `/api/ghosts?key=[&season=&episode=]` | Ghost reactions on a film or episode (ghosts.js): yours and friends', `{ reactions: [{ id, userId, name, avatar, at, emoji, mine }], emoji }`. Restricted people's are hidden; they get `off: true` |
| `POST` | `/api/ghosts` | Leave one `{ key, season?, episode?, at (seconds), emoji }` (one of `emoji`); the same emoji within 2 s is the same reaction. 30 a minute, 400 per video |
| `POST` | `/api/ghosts/delete` | `{ id }`: take one of yours back |
| `GET`, `POST` | `/api/admin/settings` | Server rules and defaults (`ADMIN_EMAILS` only) |
| `GET` | `/api/admin/users` | Everyone who has used Lilin, with their library size (`ADMIN_EMAILS` only) |
| `POST` | `/api/admin/users/<id>` | `{ canDownload?, canInvite?, restricted?, keep?, libraryWith? }` (`ADMIN_EMAILS` only) |
| `GET` | `/api/downloads` | Your qBittorrent downloads (`?all=1`: everyone's, owner only) |
| `POST` | `/api/downloads/add` | Add a magnet or `.torrent` URL (`{ link, subs?, movieId? }`); `movieId` carries the selected TMDB film identity |
| `POST` | `/api/downloads/smart` | Download a film or season (`{ type: "movie" \| "tv", tmdbId, season?, episodes?, profile?, quality? }`), returns `{ id }` |
| `GET` | `/api/downloads/smart/:id` | That command's state: `running`, then `outcome` (`started`, `partial`, `have`, `queued`, `none`) with a plain `message` and `unavailable` episodes |
| `GET` | `/api/discover/coming-soon?type=all\|movie\|tv` | Everything in Coming soon, ranked (`items` with `soon`), and the region its cinema dates come from (`region`). Rows and TV pages use `/api/discover/list?key=coming-soon` (`-movie`, `-tv`; the old `upcoming` key is the films list) |
| `GET` | `/api/watchlist` | Your saved and followed titles (`items`: `type`, `id`, `title`, `saved`, `follow`, `auto`, `release`, `nextEpisode`, `state`, `note`, `newEpisodes`, `waiting`, `missed`) and whether automatic downloads are open to you (`autoDownload`) |
| `POST` | `/api/watchlist` | Save, follow or switch automatic downloads (`{ type, tmdbId, saved?, follow?, auto? }`); returns the `item`, or `null` once it's neither saved nor followed |
| `POST` | `/api/watchlist/seen` | Clear a followed show's New badge (`{ tmdbId }`) |
| `GET` | `/api/media/<lib\|dl>/<id>/travel` | Download to phone choices: `qualities` (`quality`, `label`, `height`, `estimate` in bytes, `state`: `none`/`queued`/`making`/`ready`/`failed`, `percent`, `size`, `mine`, `url`), `original` (`size`, `name`, `url`) and `duration` |
| `GET` | `/api/media/<lib\|dl>/<id>/original/<name>` | The file at full quality (the MP4 copy when there is one) as a download |
| `GET`, `POST` | `/api/travel` | Your phone copies (`items`: `kind`, `id`, `quality`, `label`, `title`, `state`, `percent`, `size`, `estimate`, `url`, `requestedAt`, `downloadedAt`); POST `{ items: [{ kind, id, title }], quality: "small" \| "standard" }` asks for copies (60 per person) |
| `POST` | `/api/travel/remove` | Take one off your list (`{ kind, id, quality }`); the copy goes once nobody's list has it |
| `GET` | `/api/travel/file/<key>/<name>` | Download a finished phone copy on your list |
| `GET` | `/api/torrents/search?q=&type=` | Torrent search (`type`: `movie`, `tv` or `all`) |
| `GET` | `/api/torrents/magnet?ref=` | Magnet link for a 1337x result |
| `GET` | `/api/convert` | Conversion progress |
| `GET` | `/api/subs/langs` | Subtitle languages for a file (`kind`, `id`) or title (`q`, `type`) |
| `POST` | `/api/subs/fetch` | Download subtitles (`{ kind, id, lang }`) |
| `GET` | `/api/subs/file/<kind>/<id>/<lang>.vtt` | Subtitles as WebVTT (`.srt` also available) |
| `GET` | `/api/subs/sync` | Timing check state for saved subtitles (`kind`, `id`, `lang`) |
| `POST` | `/api/subs/sync` | Fix, undo or shift subtitle timing (`{ kind, id, lang, action: 'sync' \| 'undo' \| 'shift', seconds }`) |
| `GET` | `/api/stream/<kind>/<id>` | Video stream with range support |
| `GET` | `/api/play-link?kind=&id=&variant=` | Signed `/play/` link (`variant`: `browser` or `tv`). Optional `audio` stream index + `audioSource` fingerprint prepares a selected-audio browser variant; 202 while preparing, 200 when ready. |
| `GET` | `/play/...` | Video stream through a signed link; works without signing in |
| `GET` | `/api/cast/devices`, `/api/cast/sessions` | TVs and what's playing |
| `GET` | `/api/network` | Whether the request is from the home network, for troubleshooting |
| `POST` | `/api/cast/play` | Start playback on a TV |
| `GET` | `/api/house` | Server health and home machines (`ADMIN_EMAILS` only) |
| `POST` | `/api/house/report` | A machine's report (`X-Lilin-Token`, home network only) |
| `GET` | `/api/house/summary` | Issues, machines at home and the server's uptime, free space and services, for status bars and the MAGI panel (`X-Lilin-Token`, home network only) |
| `POST` | `/api/house/boot` | A dual-boot machine's boot menu and network card; the reply says whether to restart, and into what (`X-Lilin-Token`, home network only) |
| `POST` | `/api/house/power` | `{ host, action: "wake" \| "restart", entry? }`: wake a machine into a boot entry, or restart it (`ADMIN_EMAILS` only) |
| `GET` | `/api/clips` | Clips and their share state (`ADMIN_EMAILS` only) |
| `POST` | `/api/clips/<id>/rename` | Set a display name (`{ title, previousTitle? }`); keeps files and share links unchanged (`ADMIN_EMAILS` only) |
| `GET` | `/api/clips/<id>/thumb.jpg`, `/api/clips/<id>/video` | Thumbnail and video (`ADMIN_EMAILS` only) |
| `POST` | `/api/clips/<id>/share`, `/api/clips/<id>/unshare` | Create or remove a public link (`ADMIN_EMAILS` only) |
| `GET` | `/api/clips/<id>/keyframes` | Duration and keyframe times, for the editor (`ADMIN_EMAILS` only) |
| `POST` | `/api/clips/<id>/trim` | Lossless edit (`{ segments: [{ start, end }, …], deleteOriginal? }`, or a single `start`/`end`) into `Trimmed Clips/<Game>/` (`ADMIN_EMAILS` only) |
| `POST` | `/api/admin/notes/<id>/share`, `/api/admin/notes/<id>/unshare` | Make or remove a note's preview link; returns `{ note, url }` (`ADMIN_EMAILS` only) |
| `POST` | `/api/clips/<id>/delete` | Delete a clip: link and copies removed, file moved to `CLIPS_DIR/.deleted/` for 30 days (`ADMIN_EMAILS` only) |
| `GET` | `/api/access` | Who can sign in + invite links (`ADMIN_EMAILS` only) |
| `POST` | `/api/access/invite`, `/api/access/invite/<id>/revoke`, `/api/access/remove` | Make or cancel an invite, remove someone's access (`ADMIN_EMAILS` only) |
| `GET`, `POST` | `/c/i/<token>` | Public: the invite page and its email form |
| `GET` | `/c/`, `/c/<token>`, `/c/<token>/video.mp4`, `/c/<token>/thumb.jpg`, `/c/player.js`, `/c/style.css` | Public: invite card and shared clips (a player page for one clip), with OpenGraph tags for Discord |
| `GET` | `/c/n/<token>`, `/c/n/<token>/image` | Public: a shared note's preview for link-preview bots; people are redirected to `/?note=<id>` |
