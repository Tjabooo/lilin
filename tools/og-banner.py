#!/usr/bin/env python3
"""Draws public/og-lilin.jpg, the 1200x630 card Discord and iMessage show for a Lilin link (/c/, invites): the
wordmark with its bulbs lit and "Your own cinema", in front of the velvet curtain. Marks: tools/brand.py.

  python3 tools/og-banner.py [out.jpg]     # the link card, served as /c/lilin.jpg (needs rsvg-convert, numpy and Pillow)
  python3 tools/og-banner.py --tv          # the Android TV home-screen banner: drawable-xhdpi + -xxxhdpi/banner.png
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brand  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def card(w, h, *, mark_h, mark_top, tag_size=None, tag_baseline=None, fold=104, seed=11):
    bg = brand.curtain(w, h, seed=seed, fold=fold)
    mark, _ = brand.wordmark(w / 2, mark_top, mark_h, lit=True, anchor="center")
    tag = brand.tagline(w / 2, tag_baseline, tag_size) if tag_size else ""
    body = f'<image href="{brand.png_data_uri(bg)}" width="{w}" height="{h}"/>{mark}{tag}'
    return brand.rasterize(brand.svg_doc(w, h, body), w, h)


def og(out):
    brand.save(card(1200, 630, mark_h=236, mark_top=150, tag_size=40, tag_baseline=462), out, grain=0.005)
    print(out)


def tv():
    # Drawn at 1280x720 (4x the 320x180 dp banner); the TV shelf shows it small, so the wordmark is big and alone.
    art = card(1280, 720, mark_h=330, mark_top=196, fold=112, seed=11)
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
