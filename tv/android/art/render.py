#!/usr/bin/env python3
"""Draws the Android TV app's launcher icon, splash icon and home-row banner from Lilin's identity
(docs/design/identity: the LN monogram on signal red, the LiLiN wordmark over the screen's red line).
Needs rsvg-convert.   python3 tv/android/art/render.py"""
import os
import re
import subprocess
import tempfile

here = os.path.dirname(os.path.abspath(__file__))
top = os.path.normpath(os.path.join(here, '..', '..', '..'))
res = os.path.join(here, '..', 'app', 'src', 'main', 'res')
ln = re.search(r'<path fill="#140a14" d="([^"]+)"', open(os.path.join(top, 'docs/design/identity/lilin-icon-v4.svg')).read()).group(1)
wm = re.search(r'<path fill="#efe8e1" d="([^"]+)"', open(os.path.join(top, 'public/wordmark.svg')).read()).group(1)


def render(svg, out, w, h):
    with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False) as f:
        f.write(svg)
    try:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(h), f.name, '-o', out], check=True)
    finally:
        os.unlink(f.name)


# Launcher: a rounded square (22.4 % corners), LN on signal red.
icon = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="229" fill="#fb2c16"/><path fill="#140a14" d="{ln}"/></svg>'
render(icon, os.path.join(res, 'mipmap-xhdpi', 'ic_launcher.png'), 96, 96)
render(icon, os.path.join(res, 'mipmap-xxxhdpi', 'ic_launcher.png'), 192, 192)

# Android 12+ splash: 240 dp drawn at 2x, only the middle 160 dp circle shows: a red disc with LN, on ink.
splash = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1536"><rect width="1536" height="1536" fill="#0e070e"/>'
          f'<circle cx="768" cy="768" r="460" fill="#fb2c16"/><g transform="translate(512 512) scale(0.5)"><path fill="#140a14" d="{ln}"/></g></svg>')
render(splash, os.path.join(res, 'drawable-xhdpi', 'splash.png'), 480, 480)

# Banner (the TV's app row): the ink room with a dusk glow from above, LiLiN in bone over the red line.
banner = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
<defs><radialGradient id="g" cx="640" cy="-60" r="900" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3b2433"/><stop offset="1" stop-color="#3b2433" stop-opacity="0"/></radialGradient>
<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140a14"/><stop offset="1" stop-color="#0b050b"/></linearGradient>
<filter id="b" x="-50%" y="-800%" width="200%" height="1700%"><feGaussianBlur stdDeviation="14"/></filter></defs>
<rect width="1280" height="720" fill="url(#v)"/><rect width="1280" height="720" fill="url(#g)"/>
<g transform="translate(372 196) scale(0.2555)"><path fill="#efe8e1" d="{wm}"/></g>
<rect x="352" y="497" width="576" height="6" rx="3" fill="#fb2c16" opacity=".55" filter="url(#b)"/>
<rect x="352" y="497" width="576" height="6" rx="3" fill="#fb2c16"/>
</svg>'''
render(banner, os.path.join(res, 'drawable-xhdpi', 'banner.png'), 320, 180)
render(banner, os.path.join(res, 'drawable-xxxhdpi', 'banner.png'), 640, 360)
print('Icons, splash and banner written to', os.path.normpath(res))
