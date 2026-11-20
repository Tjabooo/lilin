#!/usr/bin/env python3
"""Draws Lilin's icons (python3 tools/app-icon.py; needs rsvg-convert, numpy and Pillow): the "li" monogram from the
wordmark, its bulb lit, in front of the velvet curtain. The marks live in tools/brand.py.

  public/icon-192.png / icon-512.png          manifest "any": rounded square, transparent corners
  public/maskable-192.png / maskable-512.png  manifest "maskable": full bleed, monogram inside the 80 % safe circle
                                              (the Samsung TV app's tile too: tv/tizen/build.sh copies maskable-512)
  public/apple-touch-icon.png                 180x180 full bleed, opaque (iOS rounds it itself)
  public/badge-96.png                         white silhouette for Android's notification bar
  public/favicon.svg                          flat vector monogram for browser tabs
  public/wordmark.svg                         the wordmark, paper and gold, for the share and sign-in pages
  (the Android TV app's icons: tv/android/art/render.py)

tools/og-banner.py draws the link-preview card and the Android TV banner with the same marks.
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brand  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = 1024  # everything is drawn at this size, then scaled down


def backdrop():
    """The icon's curtain: darker and closer than the banner's, so the monogram carries at 40 px."""
    cur = brand.curtain(ART, ART, seed=5, fold=140, light=(0.52, -0.3), spread=0.7, grain=0.008, vignette=(0.40, 0.3),
                        body=(0.30, 0.05, 0.15), sheen=(0.70, 0.32, 0.45))
    velvet = np.array([0x1F, 0x10, 0x19]) / 255
    return cur * 0.8 + velvet * 0.25


def icon(rounded, mono_h):
    """The full icon as an RGBA image of ART x ART; mono_h = monogram height as a fraction of the side."""
    h = ART * mono_h
    mark, _ = brand.monogram(ART / 2, (ART - h) / 2, h, lit=True)
    defs = f'<clipPath id="c"><rect width="{ART}" height="{ART}" rx="{ART * 0.2227:.1f}"/></clipPath>' if rounded else ""
    clip = ' clip-path="url(#c)"' if rounded else ""
    body = f'<g{clip}><image href="{brand.png_data_uri(backdrop())}" width="{ART}" height="{ART}"/>{mark}</g>'
    return brand.rasterize(brand.svg_doc(ART, ART, body, defs), ART, ART)


def splash():
    """Android 12+ splash icon: 240 dp drawn at 2x; only the middle 160 dp circle shows, on velvet_deep."""
    h = 230
    mark, _ = brand.monogram(240, (480 - h) / 2, h, lit=True, pool=False)  # a pool would end at the circle's edge
    return brand.rasterize(brand.svg_doc(480, 480, f'<rect width="480" height="480" fill="{brand.VELVET_DEEP}"/>{mark}'), 480, 480)


def badge():
    mark, _ = brand.monogram(48, 6, 84, letters="#fff", bulb="#fff")
    return brand.rasterize(brand.svg_doc(96, 96, mark), 96, 96)


def favicon():
    """64-unit grid: a velvet tile, the monogram in paper, the bulb in gold (no gradients: crisp at 16 px)."""
    mark, _ = brand.monogram(32, 9, 46)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<rect width="64" height="64" rx="14" fill="{brand.VELVET}"/>{mark}</svg>\n')


def wordmark_svg():
    w, h = brand.WORDMARK_BOX
    mark, _ = brand.wordmark(0, 0, h)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w / 10:g}" height="{h / 10:g}">'
            f'<title>Lilin</title>{mark}</svg>\n')


def write(img, path, size, opaque=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = img if img.size == (size, size) else img.resize((size, size), Image.LANCZOS)
    brand.save(out, path, opaque=opaque)


def main():
    pub = os.path.join(ROOT, "public")
    rounded = icon(True, 0.585)
    full = icon(False, 0.55)  # maskable: the monogram's corners stay inside the 80 % circle
    for size in (192, 512):
        write(rounded, os.path.join(pub, f"icon-{size}.png"), size)
        write(full, os.path.join(pub, f"maskable-{size}.png"), size, opaque=True)
    write(full, os.path.join(pub, "apple-touch-icon.png"), 180, opaque=True)
    write(badge(), os.path.join(pub, "badge-96.png"), 96)
    # The Android TV app's icons follow the new identity now: tv/android/art/render.py draws them.
    with open(os.path.join(pub, "favicon.svg"), "w") as f:
        f.write(favicon())
    with open(os.path.join(pub, "wordmark.svg"), "w") as f:
        f.write(wordmark_svg())


if __name__ == "__main__":
    main()
