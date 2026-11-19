# Convert text to SVG outline paths (so the deliverable SVGs need no fonts).
from fontTools.ttLib import TTFont, TTCollection
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
_cache={}
FONTS={
 'cjk': ('/usr/share/fonts/noto-cjk/NotoSerifCJK-Black.ttc',0),
 'cjkm': ('/usr/share/fonts/noto-cjk/NotoSerifCJK-Medium.ttc',0),
 'serif': ('/usr/share/fonts/noto/NotoSerifDisplay-Regular.ttf',None),
 'serifi': ('/usr/share/fonts/noto/NotoSerifDisplay-Italic.ttf',None),
 'serifb': ('/usr/share/fonts/noto/NotoSerifDisplay-Black.ttf',None),
 'mono': ('/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Medium.ttf',None),
 'monob': ('/usr/share/fonts/TTF/JetBrainsMonoNerdFont-ExtraBold.ttf',None),
}
def font(key):
    if key not in _cache:
        p,i=FONTS[key]; _cache[key]=TTCollection(p).fonts[i] if i is not None else TTFont(p)
    return _cache[key]
def text(s, key, x, y, size, track=0.0, sx=1.0, anchor='start'):
    """Horizontal run, baseline at y. track in em. sx = horizontal scale. Returns (path_d, width)."""
    f=font(key); cmap=f.getBestCmap(); gs=f.getGlyphSet(); upm=f['head'].unitsPerEm; k=size/upm
    adv=[gs[cmap[ord(c)]].width*k*sx + track*size for c in s]
    w=sum(adv)-track*size
    if anchor=='middle': x-=w/2
    elif anchor=='end': x-=w
    out=[]; cx=x
    for c,a in zip(s,adv):
        pen=SVGPathPen(gs); tp=TransformPen(pen,(k*sx,0,0,-k,cx,y)); gs[cmap[ord(c)]].draw(tp); out.append(pen.getCommands()); cx+=a
    return " ".join(out), w
def vtext(s, key, x, y, size, gap=0.0):
    """Vertical run (CJK), each char em-box stacked from top y, x = left of column. Returns (d, height)."""
    f=font(key); cmap=f.getBestCmap(); gs=f.getGlyphSet(); upm=f['head'].unitsPerEm; k=size/upm
    asc=0.88*size; out=[]; cy=y
    for c in s:
        g=gs[cmap[ord(c)]]; off=(size-g.width*k)/2
        pen=SVGPathPen(gs); tp=TransformPen(pen,(k,0,0,-k,x+off,cy+asc)); g.draw(tp); out.append(pen.getCommands()); cy+=size*(1+gap)
    return " ".join(out), cy-y-size*gap
