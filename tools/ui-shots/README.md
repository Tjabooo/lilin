# UI screenshots

Headless Chromium over the DevTools protocol, no dependencies. Used for design reviews: the same
screens at phone, tablet, desktop and TV sizes, in English and Swedish.

```sh
# The real library (LAN): every request that isn't GET is refused, so nothing changes on the server (see Read-only)
node tools/ui-shots/shoot.mjs --base http://SERVER:8080 --out shots/before

# A branch's public/ against the real API, without deploying it
node tools/ui-shots/shoot.mjs --base http://SERVER:8080 --overlay public --out shots/after

# The preview (PREVIEW_DIR) on the server
node tools/ui-shots/shoot.mjs --base http://SERVER:8080 --preview --out shots/preview

# Owner screens and edge cases on a throwaway local server (identity headers are trusted from loopback)
node tools/ui-shots/shoot.mjs --base http://localhost:8091 --as owner@example.test --allow-writes --scenes 'owner-*,signin*,share-*'

# Contact sheet, before | after
node tools/ui-shots/contact.mjs shots/before sheet.png --pair shots/after --cols 3 --width 260
```

Options: `--scenes a,b,prefix*`, `--sizes phone,tablet,desktop,tv`, `--langs en,sv`,
`--theme paper` (an Appearance preset: `lilin midnight forest ember lagoon synth noir paper daylight`, read from
`THEMES` in `public/app.js`; `synthwave` works too, and an unknown name stops the run instead of shooting Lilin),
`--reduced-motion`. Scenes, their steps and API mocks are in `scenes.mjs`. Each run writes PNGs, half-size JPEGs
in `small/` and `report.json` with console errors.

## Read-only

Without `--allow-writes`, nothing a scene does changes the server or starts work on it (`guard.mjs`):
- Every request that isn't GET/HEAD/OPTIONS gets a 403 from the harness.
- Opening the player asks `GET /api/media/<kind>/<id>/audio`, and for a file headless Chromium can't play (it has
  no H.264/HEVC) the server answers by queueing a browser copy and getting the next episodes ready. The harness
  asks it the way a phone does (`plays=phone`: probe only, nothing queued) and turns the answer back into a
  browser one, so the Audio menu still shows the real tracks.
- `play-link` with an audio track is refused; one with a phone quality (`auto`, `1080`, `720`) or a `phone*`
  variant is asked for the original file instead, since those start live encodes.

`scrollperf.mjs` uses the same guard and answers `/audio` with `{"known":false}`.

## Scenes that need a setup

- **Sign-in pages** (`signin`, `signin-error`, `oidc-signin`, `password-gate`): from the LAN the server signs you
  in as the home network's shared account, so these never show. Run a throwaway local server with
  `HOME_NETWORK_ACCESS=signin` (plus `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URIS` and `PUBLIC_URL`
  for `oidc-signin`). With OIDC on, the password gate shows for the `--as` owner too, so shoot owner scenes on a
  server without OIDC.
- **Share pages** (`share-invite`, `share-watch`): the default token `x` shows the not-found page. Set
  `LIL_INVITE` (16 characters) and `LIL_ROOM` (24) to real tokens for the real pages.
- **The Samsung TV app** (`tvapp-*`): the scenes load `/tv-shell.html` from the `--overlay` folder. Make it from
  `tv/tizen/index.html`: copy it and `tv/tizen/shell.js` into the `--overlay` folder (a folder of their own
  shows the server's TV app, `public/` this branch's; don't commit them there), name the copy `tv-shell.html`, and
  replace its two script lines `$WEBAPIS/webapis/webapis.js` and `config.js` with
  `<script>window.LILIN_SERVER=location.origin;try{localStorage.setItem("lilin:tv-engine","js")}catch(e){}</script>`.
  Since SEELE TV came, Up + OK on the home screen opens the SEELE TV guide first, so `tvapp-discover` and
  `tvapp-title` show the guide rather than Discover and a title page.

## Scroll benchmark

`scrollperf.mjs` scrolls a page with real wheel input in headless Chromium and prints frame times plus the
main-thread work (style, layout, script) the scroll caused. Same read-only rule and `--overlay` as `shoot.mjs`.

```sh
node tools/ui-shots/scrollperf.mjs --base http://SERVER:8080 --runs 3 --cpu 4                    # what's live
node tools/ui-shots/scrollperf.mjs --base http://SERVER:8080 --overlay public --runs 3 --cpu 4   # this branch
```

`--cpu N` slows the CPU N times (phone-ish), `--size phone`, `--shot out.png --shot-y 450` saves the page
scrolled to 450 px. Headless Chromium rasterises in software, so GPU work (blur, big layers) isn't measured.
