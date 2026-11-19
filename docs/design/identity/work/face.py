import sys; sys.path.insert(0,'work')
from glyphs import wordmark, rect
from textpath import text, vtext
INK="#150a12"; RED="#fb2c16"
FW,FH=3600,1000
WM,W=wordmark(track=64)
def face_svg(scale=2):
    b=[f'<rect width="{FW}" height="{FH}" fill="{RED}"/>']
    cap=790; s=cap/1000; wy=(FH-cap)/2-4
    # right: ink title block, katakana in red
    bx0,bx1,by0,by1=3160,3504,wy,wy+cap
    b.append(f'<rect x="{bx0}" y="{by0}" width="{bx1-bx0}" height="{by1-by0}" fill="{INK}"/>')
    ks=222; _,kh=vtext("リリン","cjk",0,0,ks,gap=0.04)
    kd,_=vtext("リリン","cjk",(bx0+bx1)/2-ks/2,by0+(by1-by0-kh)/2-4,ks,gap=0.04)
    b.append(f'<path fill="{RED}" d="{kd}"/>')
    wx=bx0-110-W*s
    b.append(f'<g transform="translate({wx:.1f} {wy}) scale({s})"><path fill="{INK}" d="{WM}"/></g>')
    # left (far) zone: kicker, tagline, colophon between two rules
    x2,rx1=96,wx-150
    b.append(f'<path fill="{INK}" d="{rect(x2,wy,rx1,wy+6)} {rect(x2,wy+cap-6,rx1,wy+cap)}"/>')
    d0,_=text("家の映画館","cjkm",x2,wy+124,70,track=0.12)
    d0b,_=text("THE HOUSE CINEMA","mono",rx1,wy+116,44,track=0.2,anchor='end')
    d,w1=text("A cinema","serifi",x2-8,wy+410,200,track=-0.01)
    d2,w2=text("of your own.","serifi",x2-8,wy+620,200,track=-0.01)
    d3,w3=text("SELF-HOSTED · WATCH TOGETHER","mono",x2,wy+cap-50,44,track=0.2)
    b.append(f'<path fill="{INK}" d="{d0} {d0b} {d} {d2} {d3}"/>')
    print('zone',rx1-x2,'tag',w2,'colophon',w3, 'wordmark u', wx/FW, (wx+W*s)/FW)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {FW} {FH}" width="{FW*scale}" height="{FH*scale}">{"".join(b)}</svg>', x2, rx1
if __name__=="__main__":
    s,_,_=face_svg(); open('work/face.svg','w').write(s)
