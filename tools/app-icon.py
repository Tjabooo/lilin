#!/usr/bin/env python3
"""Draw Lilin's icons with rsvg-convert, numpy and Pillow.

  python3 tools/app-icon.py --web             browser, home-screen and notification icons
  python3 tools/app-icon.py                   also rebuild the native Android TV artwork

The website's ribbon L comes from public/wordmark.svg. The native Android TV marks live in tools/brand.py.

  public/icon-192.png / icon-512.png          manifest "any": rounded square, transparent corners
  public/maskable-192.png / maskable-512.png  manifest "maskable": full bleed, monogram inside the 80 % safe circle
                                              (the Samsung TV app's tile too: tv/tizen/build.sh copies maskable-512)
  public/apple-touch-icon.png                 180x180 full bleed, opaque (iOS rounds it itself)
  public/badge-96.png                         white silhouette for Android's notification bar
  public/favicon.svg                          ribbon tile for browser tabs
  tv/android/.../splash.png, ic_launcher.png  the Android TV app's splash icon and launcher icons

tools/og-banner.py draws the link-preview card and the Android TV banner.
"""
import os
import sys
from xml.etree import ElementTree

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


def web_mark(path, scale, fill):
    # The L is 84 × 96. Its long left stem and low foot need a small optical offset.
    x, y = 68 - 42 * scale, 62 - 48 * scale
    return f'<path fill="{fill}" transform="translate({x:g} {y:g}) scale({scale:g})" d="{path}"/>'


def web_tile(path, scale, radius):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">\n'
            '  <title>Lilin</title>\n'
            '  <defs><linearGradient id="amber" x2=".85" y2="1">'
            '<stop stop-color="#FFE19B"/><stop offset=".55" stop-color="#F4BC60"/>'
            '<stop offset="1" stop-color="#ED9F4B"/></linearGradient></defs>\n'
            f'  <rect width="128" height="128" rx="{radius}" fill="url(#amber)"/>\n'
            f'  {web_mark(path, scale, "#2A1421")}\n</svg>\n')


def write(img, path, size, opaque=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = img if img.size == (size, size) else img.resize((size, size), Image.LANCZOS)
    brand.save(out, path, opaque=opaque)


def main():
    pub = os.path.join(ROOT, "public")
    source = ElementTree.parse(os.path.join(pub, "wordmark.svg"))
    ribbon = source.find('.//*[@id="lilin-ribbon"]').attrib["d"]
    rounded = brand.rasterize(web_tile(ribbon, 0.92, 28), ART, ART)
    full = brand.rasterize(web_tile(ribbon, 0.80, 0), ART, ART)
    for size in (192, 512):
        write(rounded, os.path.join(pub, f"icon-{size}.png"), size)
        write(full, os.path.join(pub, f"maskable-{size}.png"), size, opaque=True)
    write(full, os.path.join(pub, "apple-touch-icon.png"), 180, opaque=True)
    badge = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">{web_mark(ribbon, 1.1, "#fff")}</svg>'
    write(brand.rasterize(badge, 384, 384), os.path.join(pub, "badge-96.png"), 96)
    with open(os.path.join(pub, "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(web_tile(ribbon, 1, 27))

    if "--web" in sys.argv:
        return
    res = os.path.join(ROOT, "tv", "android", "app", "src", "main", "res")
    rounded = icon(True, 0.585)
    write(splash(), os.path.join(res, "drawable-xhdpi", "splash.png"), 480, opaque=True)
    write(rounded, os.path.join(res, "mipmap-xhdpi", "ic_launcher.png"), 96)
    write(rounded, os.path.join(res, "mipmap-xxxhdpi", "ic_launcher.png"), 192)


if __name__ == "__main__":
    main()
