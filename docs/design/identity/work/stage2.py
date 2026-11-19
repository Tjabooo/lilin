import numpy as np
from PIL import Image, ImageFilter
O=np.load('work/_O.npy'); M=np.load('work/_M.npy'); F=np.load('work/_F.npy'); INK=np.load('work/_ink.npy')
H,W,_=O.shape; S=2
src=np.asarray(Image.open('../public/banner-template.png').convert('RGB').resize((W,H),Image.LANCZOS)).astype(np.float32)/255
yy,xx=np.mgrid[0:H,0:W]
def _g1(a,r,axis):
    n=a.shape[axis]; pad=int(3*r)+1
    a=np.pad(a,[(pad,pad) if i==axis else (0,0) for i in range(a.ndim)],mode='reflect')
    m=a.shape[axis]; f=np.fft.rfftfreq(m)
    k=np.exp(-2*(np.pi*f*r)**2)
    shp=[1]*a.ndim; shp[axis]=len(k)
    out=np.fft.irfft(np.fft.rfft(a,axis=axis)*k.reshape(shp),n=m,axis=axis)
    return np.take(out,np.arange(pad,pad+n),axis=axis).astype(np.float32)
def blur(a,r): return _g1(_g1(a,r,0),r,1)
# 1. sky grade: deeper zenith, untouched horizon; billboard face excluded (it emits)
t=np.clip(yy/(0.80*H),0,1)
L=(0.70+0.30*t**1.15)[...,None]
sat=(0.80+0.20*t)[...,None]
gry=O.mean(2,keepdims=True)
sky=(gry+(O-gry)*sat)*L*np.array([0.97,0.95,1.03])
O=sky*(1-M[...,None])+O*M[...,None]
# 2. ground reflections: mirror the lettering into the red puddles
r,g,b=src[...,0],src[...,1],src[...,2]
Rm=np.clip((r-b-0.10)/0.2,0,1)*np.clip((r-0.40)/0.2,0,1)*(yy>782*S)
Rm=blur(Rm,1.0)
cols=np.where(M.max(0)>0.5)[0]
ytop=np.full(W,-1.0); ybot=np.full(W,-1.0)
for x in cols:
    c=np.where(M[:,x]>0.5)[0]; ytop[x]=c.min(); ybot[x]=c.max()
inkR=np.zeros((H,W),np.float32)
y0,y1=788*S,909*S
for x in cols:
    rr=np.arange(y0,y1); tt=(rr-y0)/(y1-y0)
    fy=(ybot[x]-tt*(ybot[x]-ytop[x])*1.0).astype(int).clip(0,H-1)
    inkR[rr,x]=INK[fy,x]
inkR=_g1(_g1(inkR,7,0),2.5,1)
O=O*(1-(Rm*inkR*0.72)[...,None])
# re-tint reflections toward the new panel red (keep their texture)
O[...,0]=O[...,0]*(1-Rm*0.0)
# 3. bloom from the panel (halation on the frame, sky and lettering)
E=F*(1-INK[...,None]*0.9)
b1=blur(E,10*S); b2=blur(E,46*S); b3=blur(E,140*S)
bloom=b1*0.30+b2*0.32+b3*0.34
bloom*=np.array([1.0,0.30,0.26])
bloom*=(1-M*0.75)[...,None]
O=1-(1-O)*(1-np.clip(bloom,0,1))
# 4. soft warm haze along the horizon under the billboard
hz=np.exp(-((yy-778*S)/(26*S))**2)*np.exp(-((xx-1250*S)/(420*S))**2)
O=1-(1-O)*(1-(hz*0.16)[...,None]*np.array([1.0,0.35,0.45]))
# 5. tone: gentle S-curve, violet-lifted blacks
O=np.clip(O,0,1); O=O+0.10*(O-0.5)*(1-np.abs(2*O-1))
O=O*0.965+np.array([0.022,0.010,0.034])
# 5b. editorial type in the sky
ov=np.asarray(Image.open('work/overlay.png').convert('RGBA')).astype(np.float32)/255
a=ov[...,3:4]; O=O*(1-a)+ov[...,:3]*a
# 6. vignette + film grain
d=np.sqrt(((xx-W*0.62)/(W*0.75))**2+((yy-H*0.48)/(H*0.85))**2)
O*=(1-0.28*np.clip(d-0.35,0,1)**1.6)[...,None]
rng=np.random.default_rng(7)
n=blur(rng.normal(0,1,(H,W)).astype(np.float32),0.7)
O=O+(n*0.022)[...,None]
O=np.clip(O,0,1)
np.save('work/_O2.npy',O)
Image.fromarray((O*255+0.5).astype(np.uint8)).save('work/stage2.png')
