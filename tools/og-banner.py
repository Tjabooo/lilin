#!/usr/bin/env python3
"""Draws public/og-lilin.jpg, the 1200x630 card for shared Lilin links, using the website wordmark,
the tidal cinema illustration in tools/art/tidal-screen.jpg and the original outlined tagline.

  python3 tools/og-banner.py [out.jpg]     # the link card, served as /c/lilin.jpg (needs rsvg-convert, numpy and Pillow)
  python3 tools/og-banner.py --tv          # the Android TV home-screen banner: drawable-xhdpi + -xxxhdpi/banner.png
"""
import os
import sys

from PIL import Image, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brand  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def og(out):
    w, h = 1200, 630
    with Image.open(os.path.join(ROOT, "tools", "art", "tidal-screen.jpg")) as plate:
        art = ImageOps.fit(plate, (w, h), method=Image.LANCZOS).convert("RGBA")
    with open(os.path.join(ROOT, "public", "wordmark.svg"), encoding="utf-8") as f:
        ink = "#211B2A"
        title = f.read().replace("#F6EADF", ink).replace("#FF5649", ink)
        mark = brand.rasterize(title, 540, 207)
    left = 61
    art.alpha_composite(mark, (left, 175))
    size = 40
    tag_center = left + brand.TAGLINE_BOX[0] * size / 200
    tagline = brand.tagline(tag_center, 435, size, fill=ink, opacity=1)
    art.alpha_composite(brand.rasterize(brand.svg_doc(w, h, tagline), w, h))
    brand.save(art, out)
    print(out)


def tv():
    # Drawn at 1280x720 (4x the 320x180 dp banner); the TV shelf shows it small, so the wordmark is big and alone.
    w, h = 1280, 720
    bg = brand.curtain(w, h, seed=11, fold=112)
    mark, _ = brand.wordmark(w / 2, 196, 330, lit=True, anchor="center")
    body = f'<image href="{brand.png_data_uri(bg)}" width="{w}" height="{h}"/>{mark}'
    art = brand.rasterize(brand.svg_doc(w, h, body), w, h)
    res = os.path.join(ROOT, "tv", "android", "app", "src", "main", "res")
    for folder, size in (("drawable-xhdpi", (320, 180)), ("drawable-xxxhdpi", (640, 360))):
        path = os.path.join(res, folder, "banner.png")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        brand.save(art.resize(size, Image.LANCZOS), path, opaque=True)
        print(path)


if __name__ == "__main__":
    if "--tv" in sys.argv:
        tv()
    else:
        og(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "public", "og-lilin.jpg"))
