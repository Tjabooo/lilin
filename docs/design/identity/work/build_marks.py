import sys; sys.path.insert(0,'work')
from glyphs import wordmark, rect
from textpath import text, vtext
INK="#140a14"; BONE="#efe8e1"; RED="#fb2c16"
WM, W = wordmark(track=64)
def svg(vb, body, w=None, h=None, title="Lilin"):
    x,y,vw,vh=vb; w=w or vw/2; h=h or vh/2
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {vw} {vh}" width="{w:.0f}" height="{h:.0f}"><title>{title}</title>{body}</svg>'
# 1. wordmark alone (tight box, overshoot of N included)
for name,col in [('lilin-wordmark',INK),('lilin-wordmark-bone',BONE),('lilin-wordmark-red',RED)]:
    open(f'{name}.svg','w').write(svg((0,0,W,1016),f'<path fill="{col}" d="{WM}"/>'))
# 2. lockup: wordmark | hairline | vertical katakana; descriptor under a rule
def lockup(fg, accent):
    kx=W+96; rule=f'<path fill="{fg}" d="{rect(W+48,0,W+52,1000)}"/>'
    kd,kh=vtext("リリン","cjk",kx,-4,300,gap=0.06)
    by=1130
    d1,w1=text("HOME CINEMA — SELF-HOSTED","mono",0,by,56,track=0.24)
    d2,w2=text("WATCH TOGETHER","mono",kx+300,by,56,track=0.24,anchor='end')
    body=(f'<path fill="{fg}" d="{WM}"/>{rule}<path fill="{accent}" d="{kd}"/>'
          f'<path fill="{fg}" d="{rect(0,1058,kx+300,1062)}"/><path fill="{fg}" d="{d1} {d2}"/>')
    return svg((-20,-30,kx+340,1200), body), kx+300
s,LW=lockup(INK,RED); open('lilin-lockup.svg','w').write(s)
s,_=lockup(BONE,RED); open('lilin-lockup-bone.svg','w').write(s)
print(W,LW)
