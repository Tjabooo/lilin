import sys, numpy as np
sys.path.insert(0,'work')
from PIL import Image, ImageFilter
from face import face_svg, FW, FH
import subprocess
S=2  # output scale vs template
src=Image.open('../public/banner-template.png').convert('RGB')
W0,H0=src.size; W,H=W0*S,H0*S
base=src.resize((W,H),Image.LANCZOS)
B=np.asarray(base).astype(np.float32)/255
# --- face art
svg,_,_=face_svg(scale=2); open('work/face_hi.svg','w').write(svg)
subprocess.run(['rsvg-convert','work/face_hi.svg','-o','work/face_hi.png'],check=True)
face=Image.open('work/face_hi.png').convert('RGB')
fw,fh=face.size
# corners (template px) TL TR BR BL, slightly outset so the face fills to the frame
Q=np.array([[982.0,403.0],[1548.5,36.5],[1526.0,526.5],[961.5,667.5]])
def homog(dst,srcp):
    A=[];bv=[]
    for (x,y),(u,v) in zip(dst,srcp):
        A.append([x,y,1,0,0,0,-u*x,-u*y]); bv.append(u)
        A.append([0,0,0,x,y,1,-v*x,-v*y]); bv.append(v)
    return np.linalg.solve(np.array(A),np.array(bv))
SS=2  # supersample for warp
dst=Q*S*SS
coef=homog(dst,[(0,0),(fw,0),(fw,fh),(0,fh)])
warp=face.transform((W*SS,H*SS),Image.PERSPECTIVE,tuple(coef),Image.BICUBIC)
cov=Image.new('L',face.size,255).transform((W*SS,H*SS),Image.PERSPECTIVE,tuple(coef),Image.BILINEAR)
warp=warp.resize((W,H),Image.LANCZOS); cov=cov.resize((W,H),Image.LANCZOS)
Fw=np.asarray(warp).astype(np.float32)/255; C=np.asarray(cov).astype(np.float32)/255
# --- mask of the original red face (soft)
r,g,b=B[...,0],B[...,1],B[...,2]
red=np.clip(((r-np.maximum(g,b))-0.30)/0.25,0,1)
yy,xx=np.mgrid[0:H,0:W]
M=red*(yy<720*S)
Mi=Image.fromarray((M*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
M=np.minimum(np.asarray(Mi).astype(np.float32)/255, C)
# --- paint texture from the original red face
R=Image.fromarray((r*255).astype(np.uint8))
Rb=np.asarray(R.filter(ImageFilter.GaussianBlur(18))).astype(np.float32)/255+1e-3
tex=np.clip(r/Rb,0.8,1.2)**0.9
# --- panel light: gentle falloff toward the frame + slight warm hot zone (backlit sign)
u=np.zeros((H,W),np.float32)
Hinv=np.linalg.inv(np.array([[coef[0],coef[1],coef[2]],[coef[3],coef[4],coef[5]],[coef[6],coef[7],1]]))
# face-space coords for each output px (at output scale)
cf=np.array([[coef[0],coef[1]*1,coef[2]/SS*SS],[0,0,0],[0,0,0]])
den=coef[6]*xx*SS+coef[7]*yy*SS+1
fu=(coef[0]*xx*SS+coef[1]*yy*SS+coef[2])/den/fw
fv=(coef[3]*xx*SS+coef[4]*yy*SS+coef[5])/den/fh
edge=np.clip(np.minimum.reduce([fu,1-fu,fv*3.6,(1-fv)*3.6])*9,0,1)
light=(0.86+0.14*edge)*(0.97+0.06*np.exp(-((fu-0.62)**2/0.08+(fv-0.45)**2/0.3)))
ink=(Fw.sum(2)<1.0).astype(np.float32)  # letter pixels
Fl=Fw*light[...,None]*tex[...,None]
# ink: not pure black, lifted by the glow and paint texture
Fl=Fl*(1-ink[...,None])+ink[...,None]*np.array([0.085,0.035,0.06])*tex[...,None]
O=B*(1-M[...,None])+Fl*M[...,None]
np.save('work/_O.npy',O); np.save('work/_M.npy',M); np.save('work/_F.npy',Fw*M[...,None]); np.save('work/_ink.npy',ink*M)
Image.fromarray((np.clip(O,0,1)*255).astype(np.uint8)).save('work/stage1.png')
