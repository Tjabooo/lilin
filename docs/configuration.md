# Configuration

Lilin reads its settings from `.env` in the Lilin folder. `node setup.js` creates and edits that
file for you; you can also edit it by hand. Restart Lilin after a change. Variables set in the real
environment (Docker, systemd, CI) override `.env`.

Every setting is optional. A feature whose settings are blank is off, and Lilin says so at startup.
`node setup.js doctor` checks the whole file.

Settings marked 🔒 are secrets: keep `.env` readable only by the account that runs Lilin
(`setup.js` creates it with mode `600` on Linux and macOS) and never commit it.

## Server

| Setting | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | Port for the web app. |
| `HOST` | `0.0.0.0` | Address to listen on. `0.0.0.0` serves your home network; `127.0.0.1` only this computer, for use behind a reverse proxy or tunnel on the same machine. |
| `SERVER_IP` | detected | LAN address TVs stream from. Set it if the address printed at startup is wrong (several network cards, VPN). |
| `PUBLIC_URL` | from the request | Public address used in share links and link previews, e.g. `https://lilin.example.com`. |
| `DATA_DIR` | the Lilin folder | Where the database, state files, Notes attachments and `cache/` live. Lilin refuses to start if `DATA_DIR` points at an empty folder while the Lilin folder still has a database; move it with `node setup.js migrate-data --to <folder>`. |
| `CACHE_DIR` | `cache` in `DATA_DIR` | Where copies Lilin can always make again are kept: browser copies, timeline previews, share copies. They can take hundreds of GB, so put this on a big drive rather than a small system disk. To move it, stop Lilin and move the folder's contents. |
| `PREVIEW_DIR` | off | Absolute path to a second copy of the web app (another `public/` folder, e.g. a git worktree of a redesign branch). Opening `/preview` sets a `lilin_preview` cookie that makes this browser get its files (anything missing comes from `public/`); `/preview/off` clears it. Everything else stays the same: the API, sign-in and permissions. Server-drawn pages (sign-in, share pages) also get the folder's `pages.css`. Updating the preview's files needs no restart. See [Previewing a redesign](#previewing-a-redesign). |
| `STREAM_SECRET` 🔒 | generated | Key that signs stream links. Blank: generated once and stored in `.lilin-secret`. Changing it invalidates links that are already open on TVs. |
| `LILIN_ENV_FILE` | `.env` in the Lilin folder | Environment only (not read from `.env`): load settings from another file. |
| `WRAPPED_FROM` | `12-01` | Month and day (`MM-DD`) Lilin Wrapped comes out each year: it shows at the top of everyone's Discover until the end of January, with one notification at 18:00 on that day (under Settings → Notifications → Lilin updates). |

## Accounts and remote access

See [remote-access.md](remote-access.md) for how accounts work and how to publish Lilin safely.

| Setting | Default | Purpose |
| --- | --- | --- |
| `ADMIN_EMAILS` | | Owner accounts, as they sign in (Lilin's own sign-in or Cloudflare Access), comma-separated. The first is the owner: files added outside Lilin go to their library. Owners see Activity, House, Clips, Notes and the server settings. |
| `NOTES_EMAILS` | | Owners who get the Notes tab, comma-separated. Blank = every owner. Owners not listed see no Notes tab, and the Notes API answers 404 for them. |
| `HOME_NETWORK_ACCESS` | `shared` | `shared`: visitors directly on the home network (private, loopback and Tailscale addresses) use the shared Home network account without signing in. `signin`: everyone signs in. Visitors from the internet must sign in either way. |
| `SESSION_DAYS` | `30` | How long a Lilin sign-in lasts unused. Renewed while in use, never longer than a year from signing in. |
| `ALLOWED_HOSTS` | | Extra host names Lilin answers to, comma-separated (`*.example.com` allowed). IP addresses, `localhost`, single-label names, home-network suffixes (`.local`, `.lan`, `.home.arpa`, `.internal`, `.ts.net`) and `PUBLIC_URL`'s host always work; any other name is refused (DNS-rebinding protection). |
| `TRUSTED_PROXIES` | `127.0.0.1,::1` | Addresses or CIDR ranges whose identity headers (`Cf-Access-Authenticated-User-Email`, `Cf-Connecting-IP`, `X-Forwarded-*`) are believed. Headers from anywhere else are removed. Set it to the address of a proxy on another machine; an empty value trusts nobody. |
| `CF_ACCESS_TEAM_DOMAIN` | | Your Cloudflare Access team domain, e.g. `myteam.cloudflareaccess.com`. With `CF_ACCESS_AUD`, Lilin verifies each request's Access token and takes the account from it, wherever the connection comes from. |
| `CF_ACCESS_AUD` 🔒 | | The Access application's Audience (AUD) tag. |

## Metadata

| Setting | Default | Purpose |
| --- | --- | --- |
| `TMDB_TOKEN` 🔒 | | TMDB "API Read Access Token" (themoviedb.org → Settings → API). Enables Discover, search, posters and episode details. |
| `TMDB_API_KEY` 🔒 | | The short TMDB v3 key; used when `TMDB_TOKEN` is blank. |
| `TMDB_LANG` | `en-US` | Language for titles, and for descriptions when the viewer's language has none. People who use Lilin in Swedish get TMDB's Swedish descriptions and genre names on top of this. |
| `TMDB_REGION` | country in `TMDB_LANG` | Two-letter country whose cinema dates Discover's Coming soon shows first (`SE` = Swedish premieres). Streaming and disc dates come from anywhere. |
| `TITLE_MUSIC` | `on` | A title page's **More details** lists its soundtrack albums and their songs, looked up on Wikidata and MusicBrainz (free open data, no key) the first time someone opens it, then kept for 30 days in `CACHE_DIR/title-music.json`. Also adds the Wikipedia link. `off` = no requests to those sites; crew, facts and links from TMDB still show. |

## Library

| Setting | Default | Purpose |
| --- | --- | --- |
| `MEDIA_DIR` | | Folder with films and shows. Lilin needs read access to play and write access to convert, fetch subtitles, download and delete. Put qBittorrent's save path inside it. |

## qBittorrent

| Setting | Default | Purpose |
| --- | --- | --- |
| `QBIT_URL` | | qBittorrent Web UI address, e.g. `http://localhost:8081`. Enables downloads. |
| `QBIT_USER` | | Web UI user. |
| `QBIT_PASS` 🔒 | | Web UI password. |
| `QBIT_REMOVE_FINISHED` | `on` | Remove finished torrents from qBittorrent (files are kept) so nothing seeds. Tag a torrent `seed` to keep it. |
| `SCRATCH_DIR` | | Folder on a faster drive (an SSD) for unfinished downloads and conversions' temporary copies, when the library is on a hard disk. Torrents write pieces in random order, which stalls playback from the same disk. A download goes there only if it fits; qBittorrent moves it to the library when it completes, in one sequential copy. Play now keeps working during the move. |
| `SCRATCH_RESERVE_GB` | `40` | Space on the `SCRATCH_DIR` drive that downloads and conversions never use. If the drive runs low anyway, the largest unfinished download is moved back to the library drive. |
| `CONVERT_SCRATCH_DIR` | `SCRATCH_DIR\convert` | Where conversions write their temporary MP4 before it's copied next to the original. Point it at a second SSD so downloads and conversions don't share one drive. Used only when the copy fits. |
| `CONVERT_SCRATCH_RESERVE_GB` | `40` | Space on the `CONVERT_SCRATCH_DIR` drive that conversions never use, when it's not the `SCRATCH_DIR` drive. |

## Torrent search

| Setting | Default | Purpose |
| --- | --- | --- |
| `TORRENTS` | `on` | `off` hides torrent search. |
| `LIVE_TV_NAME` | `Lilin TV` | What Live TV (always-on channels from the library) is called in the app and on the TV. The owner can override it in Settings → Live TV. |
| `LIVE_TV_PICKS_GB` | `0` (off) | Live TV picks: every 3 hours the server downloads a few popular films and shows by itself for the automatic channels (Anime, Sitcoms, Films, Documentaries, Drama, Sci-Fi & Fantasy, Action & Adventure), mostly for the channel with the fewest titles. A show gets its first season (at most 12 episodes); Balanced quality, ≤16 GB a film, ≤4 GB an episode. Picks sit in nobody's library (Add to library keeps one) and the oldest nobody kept are deleted once the picks pass this many GB or are 60 days old. The media drive always keeps 300 GB free. The owner sees the picks in Live → Your channels. |
| `CONTENT_FILTER` | `on` | Keeps adult content off the server: porn is left out of torrent search, adult release names, `.torrent` files and TMDB titles are refused before they reach qBittorrent, and a download whose files turn out to be adult is removed with its files (logged under What happened). `members` exempts the owner, `off` turns it off. |
| `CONTENT_FILTER_WORDS` | | Extra words or phrases the filter blocks, comma-separated. |
| `TPB_API` | `https://apibay.org` | The Pirate Bay API base. |
| `X1337_URL` | built-in list | 1337x mirrors, comma-separated, tried in order. |
| `NYAA_URL` | `https://nyaa.si` | Nyaa, searched alongside the others for anime. `off` leaves it out. |
| `KNABEN_URL` | `https://api.knaben.org/v1` | Knaben, an index over many torrent sites with live seeder counts, searched alongside the others. The best at Swedish and documentary releases. `off` leaves it out. |
| `SVT_PLAY` | on | SVT Play in Discover → Documentaries, search and as a source when no torrent can be found. Works only from a Swedish address. `off` leaves it out. See [Integrations](integrations.md#svt-play). |
| `ANILIST_URL` | `https://graphql.anilist.co` | AniList API: anime names and how their seasons line up with TMDB's. |
| `FLARESOLVERR_URL` | | FlareSolverr address, e.g. `http://localhost:8191`, for when every 1337x mirror is behind a Cloudflare check. |

## Subtitles

| Setting | Default | Purpose |
| --- | --- | --- |
| `OPENSUBTITLES_API_KEY` 🔒 | | OpenSubtitles API key (opensubtitles.com → Profile → API consumers). Enables subtitle downloads. |
| `OPENSUBTITLES_USER` | | Optional account; raises the daily download limit. |
| `OPENSUBTITLES_PASS` 🔒 | | Its password. |
| `SUB_LANGS` | `en,sv,da,no,fi,de,nl,fr,es,pt-pt,pt-br,it,pl,ar,tr,ka,tl` | Languages offered, in order. |
| `SUBSYNC` | `on` | Fix the timing of downloaded subtitles automatically (needs ffmpeg). |
| `SUBTITLE_FIX` | `on` | Fix OCR mistakes in English subtitles as they're served: lowercase names and acronyms ("cuddy", "nicu"), I/l mix-ups ("l'm", "wiIl", "ls") and lowercase sentence starts. Uses the title's TMDB cast list and learns how names are written from the library's other English subtitles (kept in `CACHE_DIR/subtitle-words.json`, refreshed daily). Files on disk are never changed. `off` serves them as they are. |
| `SUBTITLE_REFERENCE` | `on` | When an English subtitle's casing looks broken, fetch the most downloaded human-made English subtitle of the same episode or film from OpenSubtitles (kept in `CACHE_DIR/subtitle-references`) and copy how it capitalises words ("Shyamalan", "a large Coke"): only words it always capitalises, or capitalises in the same company, and never words the library writes in lowercase. Its text and timing aren't used. The next episode's is fetched ahead. `off` never fetches one. |
| `SUBTITLE_REFERENCE_RESERVE` | `10` | OpenSubtitles downloads per day kept for subtitles people ask for: references are only fetched while more than this many are left. |
| `SUBTITLE_LLM_URL` | — | An OpenAI-compatible server (e.g. `http://127.0.0.1:8091/v1` for llama.cpp's `llama-server`) that proofreads every English subtitle once, in the background, the one being watched and the next episode first. It fixes OCR mistakes in context ("iysteria" → "Listeria", "Wizard of 02" → "Oz", "papewvork"). A change is kept only if it looks like an OCR repair: same punctuation at both ends of each row, letters within a small edit distance, no new spelling of a word the library or the reference subtitle has, no capitals on everyday words. Fixes are kept in `CACHE_DIR/subtitle-proofread`; files on disk are never changed. A 4B model (Qwen3-4B-Instruct Q4_K_M, 2.5 GB) fits a 4 GB graphics card. |
| `SUBTITLE_LLM_MODEL` | `subtitles` | The model name sent to that server. |
| `SUBTITLE_LLM_SERVER` | — | The command that starts that server. Lilin runs it at low priority when there's proofreading to do and stops it after 10 idle minutes. It can also be an SSH tunnel to a model on another machine (`ssh -N -L 8091:127.0.0.1:13306 desktop`). Leave empty if the server runs on its own. |
| `SUBTITLE_LLM_KEY` | — | Sent as a Bearer token, for a server that wants one. |
| `SUBTITLE_LLM_PAUSE` | — | A command that exits 0 while the machine running the model is busy with something that matters more, checked before every chunk (e.g. `ssh desktop pgrep -x cs2` when the model runs on a gaming PC's graphics card). Proofreading waits, checking every 5 minutes. |
| `SUBTITLE_LLM` | `on` | `off` pauses proofreading (fixes already made are still used only while it's on). |
| `MAGIC_SEARCH` | `on` | MAGIc search (Search → "MAGIc search" on a description of three words or more, or when no title matches): finds films and shows from what someone remembers by searching Wikipedia's film and TV articles, scoring their opening sections against the description and matching them to TMDB through their Wikidata IDs. No language model, nothing to install; needs TMDB. A few seconds a search, one at a time, cached for a day. `off` hides it. |
| `QUOTE_SEARCH` | `on` | Quote search (Search → **Lines**): every subtitle line saved beside the videos (English, Swedish and each person's default subtitle and app language) is indexed in `CACHE_DIR/lines.db`, so a line someone half remembers finds the films and episodes where it's said and plays from just before it. The index fills in the background (only changed subtitle files are read again, every 15 minutes) and can be deleted at any time; it is rebuilt. `off` hides it and stops the indexing. |

## Casting

| Setting | Default | Purpose |
| --- | --- | --- |
| `DLNA_DEVICES` | | DLNA description URLs for TVs that aren't discovered, comma-separated. |
| `CAST_APPLETV` | `on` | Apple TV support (needs pyatv). |
| `ATVSCRIPT` | `atvscript` on PATH | Full path to pyatv's `atvscript`. |
| `ATV_HOSTS` | | Apple TV addresses to query directly if discovery fails, comma-separated. |
| `CAST_WHEN_AWAY` | `off` | Offer TVs to visitors who aren't on the home network. |
| `ANDROID_APP_DIR` | `tv/android/dist` | Folder holding the Android TV app (`Lilin.apk` + `Lilin.json`, made by `tv/android/build.sh`), offered at `/android` on the home network. See [Android TV](android-tv.md). |

## Playback first

Streams always come before background work. These are the knobs; the defaults suit a media drive
that is a hard disk shared with downloads and conversions.

| Setting | Default | Purpose |
| --- | --- | --- |
| `STREAM_READ_KB` | `4096` | How much of a file a stream reads at a time (64–65536). Large reads keep a busy hard drive from making a player wait in its queue once per 64 KB. |
| `PHONE_STREAMS_MAX` | `3` | Phone-quality streams (a live 1080p or 720p version of a big file, for phones) that may run at once. Each uses one GPU encoder session; a new one stops the one idle longest. |
| `PLAY_NOW_ENGINE` | `auto` | Play now's helper, [playhead](https://github.com/Tjabooo/playhead). It runs next to qBittorrent (which still downloads, seeds and files the video) and fetches what the player needs next first: the start, the spot you seek to, and pieces stuck on a slow peer. Lilin downloads its pinned release (checksum checked) into `DATA_DIR/bin`, and binds it to qBittorrent's interface address. If that binding can't be mirrored, it stays off. `qbit` turns it off. |
| `PLAYHEAD_BIND_ADDRESS` / `PLAYHEAD_BIND_INTERFACE` / `PLAYHEAD_UNBOUND` | from qBittorrent | Where playhead may connect, when qBittorrent's binding can't be mirrored (Windows interface IDs). playhead refuses to start when that address is missing, and closes every connection when it goes away. |
| `PLAYHEAD_DNS` | `1.1.1.1, 9.9.9.9` | Resolvers playhead uses through the tunnel for tracker names. |
| `PLAYHEAD_BIN` | | Your own playhead build instead of the download. |
| `PARTIAL_STREAMS` | `on` | Play now: watch a video while qBittorrent is still downloading it, as a live stream of up to 1080p. Each stream counts towards `PHONE_STREAMS_MAX`. `off` plays finished files only. |
| `LILIN_PRIORITY` | `above_normal` | CPU priority of the Lilin process: `above_normal`, `normal` or `high`. On Windows its I/O and memory priority are always set to normal, also when it runs as a scheduled task (whose default is low I/O priority, which made streams stall behind downloads). |
| `BACKGROUND_PRIORITY` | `below_normal` | CPU priority of background jobs (conversions, browser copies, timeline previews, credits, subtitle sync, clip and note copies, OCR): `below_normal`, `idle` or `normal`. |
| `BACKGROUND_IO` | `normal` | Windows: I/O and memory priority of those jobs: `normal`, `low` or `very_low`. `low` makes their disk reads wait for a stream's and their cached pages leave RAM first, but slows a conversion 3–4x while anyone watches; try it only if streams still stall during background work. |
| `BACKGROUND_SERIAL_DRIVES` | empty (off) | Windows drive letters (e.g. `E` or `E,F`) of hard drives where conversions take turns instead of all reading at once. Several conversions on one hard drive spend their time seeking between files (5 readers together got ~70 MB/s from a disk that streams 200+ MB/s to one). A copy someone is waiting to play skips the queue; players, timeline previews and credits never wait. Leave SSDs out. |
| `BACKGROUND_READS_PER_DRIVE` | `1` | How many conversions may read one of those drives at once. |
| `QBIT_PLAYBACK_LIMITS` | `on` | While anyone is streaming, switch qBittorrent to its alternative speed limits (set them in qBittorrent: Options → Speed). Lilin turns them off again afterwards, unless they were already on. |
| `PLAYBACK_IDLE_SECONDS` | `60` | How long after the last stream downloads go back to full speed. |

## Conversion

| Setting | Default | Purpose |
| --- | --- | --- |
| `CONVERT` | `on` | Make MP4 copies of MKV, AVI, WebM and similar files so they play on iPhone and Apple TV (needs ffmpeg). |
| `CONVERT_DELETE_ORIGINAL` | `off` | Delete originals after conversion, including ones converted while qBittorrent still had them once it no longer does. Never applies to files qBittorrent owns. All subtitle tracks are first copied unchanged into `<name>.subtitles.mks` (MP4 can't hold Blu-ray/DVD image subtitles); if that fails, or the MP4 copy's length doesn't match, the original is kept. |
| `CONVERT_DETACHED` | `on` | Run each conversion in a process of its own (`src/convert-runner.js`), so restarting or updating Lilin doesn't throw away a half-done copy: the next start picks the running conversion up again and finishes it. `off` runs ffmpeg inside the server, so a restart starts the conversion over. |
| `BROWSER_H264_DAYS` | `14` | HEVC files added within this many days get an H.264 copy for browsers without HEVC right away; older ones when first played. `0` = off. |
| `PREPARE_NEXT_EPISODES` | `2` | Browser copies prepared ahead for the next episodes. `0` = off. |
| `FFMPEG`, `FFPROBE` | on PATH | Full paths to ffmpeg and ffprobe. |
| `AUDIO_FIX_DIR` | `audio` in `CACHE_DIR` | Where browser copies (audio-fixed and H.264) are kept. |
| `BROWSER_COPIES_MAX_GB` | `150` | Size cap for browser copies. When a new one needs room, the ones watched longest ago are deleted (none watched in the last 3 hours). Copies made in the background never push others out; they wait. `0` = no cap. |
| `MIN_FREE_GB` | `20` | Free space conversions leave on every drive they write to. Browser copies on that drive are deleted first if that helps; otherwise the conversion waits. `0` = off. |

Video is encoded with NVIDIA NVENC when ffmpeg has a working `h264_nvenc`, otherwise with libx264 on
the CPU. See [hardware-acceleration.md](hardware-acceleration.md).

## Clean-up

| Setting | Default | Purpose |
| --- | --- | --- |
| `CLEANUP_MIN_AGE_DAYS` | `30` | A download is only cleaned up once it has been on the server this many days. |
| `CLEANUP_IDLE_DAYS` | `30` | ...and only when nobody has watched it (or, for a show, any of its episodes) in this many days. `node src/cleanup.js` lists what would go; `--run` deletes it now. |

## Download to phone

| Setting | Default | Purpose |
| --- | --- | --- |
| `TRAVEL_DIR` | `travel` in `CACHE_DIR` | Where phone copies (Small 480p and Standard 720p MP4s) are kept. |
| `TRAVEL_KEEP_DAYS` | `7` | A phone copy is deleted this many days after anyone last asked for or downloaded it. |
| `TRAVEL_MAX_GB` | `50` | Size cap for phone copies. When a new one doesn't fit, copies everyone has already downloaded go first, oldest first. |

## Notes

| Setting | Default | Purpose |
| --- | --- | --- |
| `NOTES_FILES_DIR` | `.lilin-notes-files` in `DATA_DIR` | Where Notes attachments are stored. Copy existing files before changing it. |
| `NOTES_OCR` | on | Text in Notes images becomes searchable: Windows OCR on Windows, Tesseract elsewhere when installed. `off` disables it. |
| `TESSERACT` | `tesseract` on PATH | Full path to Tesseract. |

## House

| Setting | Default | Purpose |
| --- | --- | --- |
| `HOUSE_TOKEN` 🔒 | generated by setup | Shared secret for `agents/lilin-house` on your Linux machines. Reports are only accepted from the home network. |
| `SCREENTIME_TOKEN` 🔒 | generated by setup | Bearer token for `POST /api/screentime` from the [screentime](https://github.com/Tjabooo/screentime) daemon. |
| `SCOUT_TOKEN` 🔒 | generated by setup | Bearer token for the idea scout runner ([agents/lilin-scout](integrations.md#idea-scout)), which posts ideas to the owner's idea inbox and reports on builds through `/api/scout/ideas`. Blank = the scout is off. |
| `ADGUARD_URL` | | AdGuard Home web UI, e.g. `http://localhost:3000`. |
| `ADGUARD_USER` | | AdGuard Home user. |
| `ADGUARD_PASS` 🔒 | | AdGuard Home password. |
| `WOL_BROADCAST` | | Extra Wake-on-LAN broadcast addresses, comma-separated. |
| `UPLOAD_MBPS` | | Your internet upload speed in Mbit/s, for the Sharing meter. |
| `NVENC_SESSION_LIMIT` | `8` | Hardware encodes the GPU runs at once. |
| `LOAD_SAMPLER` | on (Windows) | `off` stops sampling Windows performance counters and `nvidia-smi` every 5 seconds. Not available on other systems. |
| `NVIDIA_SMI` | `nvidia-smi` on PATH | Full path to `nvidia-smi`. |
| `TORRENT_VPN_STATUS` | `%ProgramData%\TorrentVpn-Status\status.json` on Windows | Status file written by [tools/torrent-vpn](../tools/torrent-vpn/README.md). |

## Clips

| Setting | Default | Purpose |
| --- | --- | --- |
| `CLIPS_DIR` | | Folder game clips are synced to (`Kept/<game>/`, `Trimmed Clips/`). Blank hides the Clips tab. |

## Moments

Moments are short pieces (2 s to 3 min) of a film or episode that people cut in the player (⋯ → Clip a moment) and send to friends or share by link. See [architecture.md](architecture.md#moments).

| Setting | Default | Purpose |
| --- | --- | --- |
| `MOMENTS_DIR` | `moments` in `CACHE_DIR` | Folder for the cut moments (small H.264 MP4s, a thumbnail and subtitles each). |
| `MOMENTS_DAYS` | `30` | Days a moment, and its link, is kept. The person who made it can delete it sooner. |
| `MOMENTS_MAX_GB` | `20` | Space all moments together may use. Past it the oldest are deleted first. |

## LikLok (preview)
LikLok is a tab with a swipeable feed of short clips (22-70 s) from the first episodes of the shows on the server, each with Keep watching (the episode, from the clip's second) and From episode 1. Clips are picked from scene cuts, loudness and the episode's subtitles, and cut in the background. It's a preview: only the people listed see it.

| Setting | Default | Purpose |
| --- | --- | --- |
| `LIKLOK_EMAILS` | | Who gets the LikLok tab, comma-separated. Blank = LikLok is off and no clips are cut. |
| `LIKLOK_EPISODES` | `3` | How many episodes from the start of each show's first season are looked at. |
| `LIKLOK_MAX_GB` | `25` | Space all LikLok clips together may use. Past it no new clips are cut. |
| `LIKLOK_DIR` | `liklok` in `CACHE_DIR` | Folder for the clips (H.264 MP4s, a thumbnail and subtitles each). |
| `LIKLOK_DELAY_MS` | `90000` | How long after start-up the clip cutting begins. |

## Invites

Invites add people to the email list your Cloudflare Access policy allows. See
[remote-access.md](remote-access.md#invites).

| Setting | Default | Purpose |
| --- | --- | --- |
| `CF_API_TOKEN` 🔒 | | Cloudflare API token with "Zero Trust: Edit" on the account. |
| `CF_ACCOUNT_ID` | | Cloudflare account ID. |
| `CF_ACCESS_LIST_ID` | | ID of the email list (Zero Trust → Reusable components → Lists). |
| `INVITE_DAYS` | `7` | How long an invite link stays valid. |
| `OIDC_CLIENT_ID` | | With the two below: Lilin becomes Cloudflare Access's login method, so people sign in with a Lilin password and invites sign people straight in ([remote-access.md](remote-access.md#lilin-as-the-sign-in-for-access-no-email-codes)). |
| `OIDC_CLIENT_SECRET` | | Long random string, also entered in the Access login method. |
| `OIDC_REDIRECT_URIS` | | Comma-separated; for Access `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`. |

## Previewing a redesign

`PREVIEW_DIR` lets you try a new web app on the real server, with the real library, before anyone else
sees it:

1. Check the branch out next to the live copy, e.g. `git worktree add ../lilin-preview redesign`.
2. Set `PREVIEW_DIR` to its `public` folder (absolute path) and restart Lilin once.
3. Open `https://your-lilin/preview` in the browser that should see it. `/preview/off` goes back.

Pull new commits into the worktree to update the preview; static files are read on every request, so
no restart is needed, and open preview pages offer a reload like after a normal update. The preview
uses the live API, so a server change it relies on has to be live first.

