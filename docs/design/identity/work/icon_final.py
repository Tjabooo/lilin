import sys; sys.path.insert(0,'work'); from glyphs import rect, poly
INK="#140a14"; RED="#fb2c16"; REFL="#7a1a1e"
def fig(cx, base, h, flip=False, refl=1.0):
    s=h/1000; t=150*s; e=46*s; x=cx-t/2
    if not flip:
        y=base-h; return f"{rect(x,y,x+t,y+150*s)} {rect(x,y+180*s,x+t,base)} {rect(x-e,base-22*s,x+t+e,base)}"
    r=refl; y=base; return f"{rect(x-e,y,x+t+e,y+22*s*r)} {rect(x,y,x+t,y+(h-180*s)*r)} {rect(x,y+(h-150*s)*r,x+t,y+h*r)}"
HZ=712; X0,X1=148,876; YL,YR=488,168   # slab: left top / right top, bottom on the horizon
def icon(size=1024, small=False, rounded=False, bg=INK):
    R=0.36  # reflection squash
    body=[f'<path fill="{RED}" d="{poly([(X0,YL),(X1,YR),(X1,HZ),(X0,HZ)])}"/>']
    gap=20
    rl=(HZ-YL)*R; rr=(HZ-YR)*R
    body.append(f'<path fill="{REFL}" d="{poly([(X0,HZ+gap),(X1,HZ+gap),(X1,HZ+gap+rr),(X0,HZ+gap+rl)])}"/>')
    if not small:
        # water breaks across the reflection
        for f,h in [(0.42,9),(0.70,7)]:
            yl=HZ+gap+rl*f; yr=HZ+gap+rr*f
            body.append(f'<path fill="{bg}" d="{poly([(X0,yl),(X1,yr),(X1,yr+h),(X0,yl+h)])}"/>')
    fx=392; fh=250 if not small else 300
    body.append(f'<path fill="#3c0f16" d="{fig(fx,HZ+gap,fh,True,R*1.05)}"/>')
    body.append(f'<path fill="{INK}" d="{fig(fx,HZ,fh)}"/>')
    clip = '<clipPath id="r"><rect width="1024" height="1024" rx="228"/></clipPath>' if rounded else ''
    g0,g1 = ('<g clip-path="url(#r)">','</g>') if rounded else ('','')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="{size}" height="{size}">'
            f'<title>Lilin</title><defs>{clip}</defs>{g0}<rect width="1024" height="1024" fill="{bg}"/>{"".join(body)}{g1}</svg>')
if __name__=="__main__":
    open('lilin-icon.svg','w').write(icon(1024))
    open('lilin-icon-rounded.svg','w').write(icon(1024,rounded=True))
    open('lilin-icon-small.svg','w').write(icon(1024,small=True))
