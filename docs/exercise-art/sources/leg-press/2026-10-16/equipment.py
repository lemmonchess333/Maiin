"""Custom illustrative plate-loaded double-beam press. Native coordinates.
This is not a manufacturer replica or a recovered anatomical camera.
"""
import math
import numpy as np
from PIL import Image,ImageDraw
S=(1536,1024);AA=3
PIVOT=np.array([592.5,894.]);OFFSET=np.array([130.,25.]);JOINTS={'A':np.array([350.,650.]),'B':np.array([595.,550.])}
def render(name):
    canvas=(S[0]*AA,S[1]*AA);out=Image.new('RGBA',canvas);d=ImageDraw.Draw(out)
    def pts(points):return [tuple(np.rint(np.array(p)*AA).astype(int)) for p in points]
    def line(points,c,w):d.line(pts(points),fill=c,width=max(1,round(w*AA)),joint='curve')
    def poly(points,c=(79,79,86),edge=(154,154,162),w=1.3,metal=True):
        nonlocal out,d
        points=[np.array(p,float) for p in points]
        lo=np.floor(np.minimum.reduce(points)*AA).astype(int)-2;hi=np.ceil(np.maximum.reduce(points)*AA).astype(int)+3
        lo=np.maximum(lo,0);hi=np.minimum(hi,canvas);width,height=hi-lo
        mask=Image.new('L',(int(width),int(height)));md=ImageDraw.Draw(mask);md.polygon([tuple(p*AA-lo) for p in points],fill=255)
        y,x=np.mgrid[:height,:width];t=x/max(1,width-1)
        tone=(.75+.27*np.sin(t*math.pi)+.08*np.cos((x+y)*.022)) if metal else np.ones_like(t)
        rgb=np.clip(tone[:,:,None]*np.array(c),0,255).astype('uint8');layer=np.zeros((height,width,4),dtype='uint8');layer[:,:,:3]=rgb;layer[:,:,3]=np.array(mask)
        out.alpha_composite(Image.fromarray(layer),tuple(lo));d=ImageDraw.Draw(out);line(points+[points[0]],edge,w)
    def joint(p,r=13):
        x,y=p;d.ellipse(((x-r)*AA,(y-r)*AA,(x+r)*AA,(y+r)*AA),fill=(42,42,48),outline=(169,169,177),width=AA)
        d.ellipse(((x-4)*AA,(y-4)*AA,(x+4)*AA,(y+4)*AA),fill=(181,181,188))
    def beam(a,b,width=27):
        a=np.array(a,float);b=np.array(b,float);v=b-a;n=np.array([-v[1],v[0]])/np.linalg.norm(v)*width/2
        poly([a+n,b+n,b-n,a-n]);line([a+n*.58,b+n*.58],(134,134,143),1.2);line([a-n*.75,b-n*.75],(44,44,49),1.5)
    beam([566,918],PIVOT,40);beam([696,943],PIVOT+OFFSET,40);beam([566,918],[696,943],36)
    J=JOINTS[name];translation=J-JOINTS['A'];beam(PIVOT,J);beam(PIVOT+OFFSET,J+OFFSET,30);beam(J,J+OFFSET,31)
    v=J-PIVOT;load=PIVOT+.35*np.array([-v[1],v[0]]);beam(PIVOT,load);beam(load,load+[72,18],15)
    for t in [0,16,32]:
        x,y=load+[t,t*.25]
        d.ellipse(((x-29)*AA,(y-61)*AA,(x+29)*AA,(y+61)*AA),fill=(43,43,49),outline=(133,133,141),width=round(1.5*AA))
        d.ellipse(((x-21)*AA,(y-52)*AA,(x+21)*AA,(y+52)*AA),outline=(76,76,84),width=AA)
        d.ellipse(((x-5)*AA,(y-10)*AA,(x+5)*AA,(y+10)*AA),fill=(154,154,162))
    plate=[np.array(p,float)+translation for p in [(185,355),(318,598),(450,632),(317,389)]];hinge=np.array([371.,564.])+translation
    beam(J,hinge,31);beam(J+OFFSET,hinge+OFFSET*.45,23);poly(plate,(41,41,46),(150,150,158),1.5,False)
    for t in np.linspace(.08,.94,14):line([plate[0]*(1-t)+plate[1]*t,plate[3]*(1-t)+plate[2]*t],(65,65,72),.8)
    for p in [PIVOT,PIVOT+OFFSET,J,J+OFFSET,hinge]:joint(p)
    return out.resize(S,Image.Resampling.LANCZOS),{'joint':J.tolist(),'fixedPivot':PIVOT.tolist(),'secondFixedPivot':(PIVOT+OFFSET).tolist(),'beamLength':float(np.linalg.norm(J-PIVOT)),'loadCentre':load.tolist(),'loadPlateCount':3,'loadPlateRadiusY':61,'plateTranslation':translation.tolist(),'sourceScale':1,'anatomicalTransforms':0}
