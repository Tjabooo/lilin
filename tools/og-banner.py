#!/usr/bin/env python3
"""Draws public/og-lilin.jpg, the 1200x630 card for shared Lilin links, using the website wordmark,
the tidal cinema illustration in tools/art/tidal-screen.jpg and the original outlined tagline.

  python3 tools/og-banner.py [out.jpg]     # the link card, served as /c/lilin.jpg (needs rsvg-convert, numpy and Pillow)
  python3 tools/og-banner.py --tv          # the Android TV home-screen banner: drawable-xhdpi + -xxxhdpi/banner.png
"""
import os
import sys

import numpy as np
from PIL import Image, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brand  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def print_billboard(art):
    """Project the one-colour viewer onto the four painted corners of the screen."""
    with open(os.path.join(ROOT, "tools", "art", "viewer.svg"), encoding="utf-8") as f:
        viewer = brand.rasterize(brand.viewer_stencil(f.read(), "#fff"), 360, 360)
    panel = Image.new("L", (800, 420))
    panel.paste(viewer.getchannel("A"), (220, 36))
    corners = [(680, 285), (1073, 26), (1057, 366), (668, 461)]
    # Pillow samples from the panel for each output pixel, so solve screen -> panel.
    rows, values = [], []
    for (x, y), (u, v) in zip(corners, [(0, 0), (800, 0), (800, 420), (0, 420)]):
        rows.extend(([x, y, 1, 0, 0, 0, -u*x, -u*y], [0, 0, 0, x, y, 1, -v*x, -v*y]))
        values.extend((u, v))
    coeffs = np.linalg.solve(rows, values)
    mask = panel.transform(art.size, Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC)
    ink = Image.blend(art, Image.new("RGBA", art.size, "#211B2A"), 0.86)
    art.paste(ink, mask=mask)


def og(out):
    w, h = 1200, 630
    with Image.open(os.path.join(ROOT, "tools", "art", "tidal-screen.jpg")) as plate:
        art = ImageOps.fit(plate, (w, h), method=Image.LANCZOS).convert("RGBA")
    print_billboard(art)
    with open(os.path.join(ROOT, "public", "wordmark.svg"), encoding="utf-8") as f:
        ink = "#211B2A"
        title = f.read().replace("#F6EADF", ink).replace("#FF6157", "#BB302F").replace("#56BFF2", "#175E96")
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
