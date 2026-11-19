from PIL import Image; import numpy as np
im=np.asarray(Image.open('../public/banner-template.png').convert('RGB')).astype(int)
r,g,b=im[...,0],im[...,1],im[...,2]
m=(r>170)&(g<110)&(b<100)&(r-g>120); m[700:]=False
def fit(xs,ys):  # y = a x + c
    return np.polyfit(xs,ys,1)
top=[];bot=[]
for x in range(1010,1520,2):
    c=np.nonzero(m[:,x])[0]
    if len(c): top.append((x,c.min())); bot.append((x,c.max()))
left=[];right=[]
for y in range(120,640,2):
    c=np.nonzero(m[y])[0]
    if len(c): left.append((y,c.min())); right.append((y,c.max()))
t=fit(*zip(*top)); bo=fit(*zip(*bot))
l=fit(*zip(*[(y,x) for y,x in left if y>430 and y<640])); rr=fit(*zip(*[(y,x) for y,x in right if y<500]))
def inter(h,v): # h: y=a x+c ; v: x = p y + q
    a,c=h;p,q=v; y=(a*q+c)/(1-a*p); return (p*y+q,y)
for n,(h,v) in dict(TL=(t,l),TR=(t,rr),BR=(bo,rr),BL=(bo,l)).items(): print(n,[round(z,1) for z in inter(h,v)])
