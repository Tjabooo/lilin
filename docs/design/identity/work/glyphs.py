# Custom LILIN letterforms. Units: cap height 1000, y down, baseline y=1000.
T=150; H=22; E=46; CUT=36; HEAD=150; S=36
def rect(x0,y0,x1,y1): return f"M{x0:.1f} {y0:.1f}H{x1:.1f}V{y1:.1f}H{x0:.1f}Z"
def poly(pts): return "M"+" L".join(f"{x:.1f} {y:.1f}" for x,y in pts)+"Z"
def glyph_I(x):
    return [rect(x,0,x+T,HEAD), rect(x,HEAD+CUT,x+T,1000), rect(x-E,1000-H,x+T+E,1000)], (E,T,E)
def glyph_L(x, arm=228):
    xe=x+T+arm
    return [rect(x-E,0,x+T+E,H), rect(x,0,x+T,1000), rect(x-E,1000-H,x+T,1000),
            poly([(x+T,1000-30),(xe-86,1000-30),(xe-4,1000-150),(xe,1000-146),(xe,1000),(x+T,1000)])], (E,T+arm,0)
def glyph_N(x, w=410):
    xr=x+w
    return [rect(x,0,x+S,1000), rect(x-E,1000-H,x+S+E,1000), rect(x-E,0,x+T*0.6,H),
            poly([(x,0),(x+T,0),(xr,1016),(xr-T,1016)]), rect(xr-S,0,xr,1016), rect(xr-S-E,0,xr+E,H)], (E,w,E)
FN={'L':glyph_L,'I':glyph_I,'N':glyph_N}
KERN={('L','I'):-6,('I','L'):10,('I','N'):10}
def wordmark(text="LILIN", track=34):
    parts=[]; x=0; prev=None
    for ch in text:
        _,(lb,w,rb)=FN[ch](0)
        if prev: x+=track+KERN.get((prev,ch),0)
        x+=lb; p,_=FN[ch](x); parts+=p; x+=w+rb; prev=ch
    return " ".join(parts), x
