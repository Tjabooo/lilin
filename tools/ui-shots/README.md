# UI screenshots

Headless Chromium over the DevTools protocol, no dependencies. Used for design reviews: the same
screens at phone, tablet, desktop and TV sizes, in English and Swedish.

```sh
# The real library (LAN): every request that isn't GET is refused, so nothing changes on the server
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
`--theme paper` (any Appearance preset), `--reduced-motion`. Scenes, their steps and API mocks are in
`scenes.mjs`. Each run writes PNGs, half-size JPEGs in `small/` and `report.json` with console errors.

## Scroll benchmark

`scrollperf.mjs` scrolls a page with real wheel input in headless Chromium and prints frame times plus the
main-thread work (style, layout, script) the scroll caused. Same read-only rule and `--overlay` as `shoot.mjs`.

```sh
node tools/ui-shots/scrollperf.mjs --base http://SERVER:8080 --runs 3 --cpu 4                    # what's live
node tools/ui-shots/scrollperf.mjs --base http://SERVER:8080 --overlay public --runs 3 --cpu 4   # this branch
```

`--cpu N` slows the CPU N times (phone-ish), `--size phone`, `--shot out.png --shot-y 450` saves the page
scrolled to 450 px. Headless Chromium rasterises in software, so GPU work (blur, big layers) isn't measured.
