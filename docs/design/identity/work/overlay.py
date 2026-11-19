import sys; sys.path.insert(0,'work')
from textpath import text
from glyphs import rect, wordmark
W,H=3462,1818; BONE="#f1e9e3"
x=150; y=150
b=[]
WM,WW=wordmark(track=64); sc=0.046
b.append(f'<g transform="translate({x} {y-16}) scale({sc})"><path fill="{BONE}" d="{WM}"/></g>')
d1b,_=text("リリン","cjkm",x+WW*sc+28,y+30,34,track=0.1)
b.append(f'<path fill="{BONE}" fill-opacity="0.9" d="{d1b}"/>')
b.append(f'<path fill="{BONE}" fill-opacity="0.75" d="{rect(x,y+62,x+700,y+64.5)}"/>')
t2,_=text("Films and shows from your own server,","serif",x,y+122,34,track=0.01)
t3,_=text("on every phone and screen in the house.","serif",x,y+170,34,track=0.01)
b.append(f'<path fill="{BONE}" fill-opacity="0.86" d="{t2} {t3}"/>')
open('work/overlay.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(b)}</svg>')
