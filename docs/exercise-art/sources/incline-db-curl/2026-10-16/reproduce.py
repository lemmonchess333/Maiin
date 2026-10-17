"""Portable native moving-region composite and colour/equipment finishing.
No image service calls, anatomical warps or individually fitted body parts.
"""
from pathlib import Path
from io import BytesIO
import hashlib,json,zipfile,xml.etree.ElementTree as ET,importlib.util
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
P=Path(__file__).resolve().parent;O=P/'draft';O.mkdir(exist_ok=True);plan=json.loads((P/'sequence-plan.json').read_bytes())
crop=tuple(plan['commonCrop']);pad=tuple(plan['padding']);canvas=tuple(plan['dimensions']);eid=plan['exerciseId']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def polygon(points,size):
    m=Image.new('L',size);ImageDraw.Draw(m).polygon(points,fill=255);return m
def muscle_field(points,size):
    points=np.array(points,float);curve=[]
    for i in range(len(points)):
        p0,p1,p2,p3=[points[j%len(points)] for j in [i-1,i,i+1,i+2]]
        for t in np.linspace(0,1,8,endpoint=False):curve.append(tuple(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)*3))
    m=Image.new('L',(size[0]*3,size[1]*3));ImageDraw.Draw(m).polygon(curve,fill=255)
    return np.array(m.resize(size,Image.Resampling.LANCZOS)).astype(float)/255
raw={n:Image.open(P/f'originals/{n}-original.png').convert('RGBA') for n in ['A','B']};assert raw['A'].size==raw['B'].size==(1536,1024)
if eid=='leg-press':
    points=[(150,200),(790,200),(860,245),(901,300),(927,365),(961,421),(986,470),(993,526),(965,553),(702,583),(150,605)]
else:
    points=[(447,350),(685,345),(713,422),(633,515),(584,596),(661,715),(441,715),(436,628),(461,521),(460,414)]
mask=polygon(points,raw['A'].size).filter(ImageFilter.GaussianBlur(1.2));a=np.array(raw['A']);b=np.array(raw['B']);alpha=np.array(mask).astype(float)/255
body={'A':a,'B':np.rint(a*(1-alpha[:,:,None])+b*alpha[:,:,None]).clip(0,255).astype('uint8')}
Image.fromarray(np.rint(alpha*255).astype('uint8')).save(O/'B-native-moving-region-alpha.png')
def frame(im):
    out=Image.new('RGBA',canvas);out.paste(im.crop(crop),pad);return out
def png(im):
    bio=BytesIO();im.save(bio,format='PNG');return bio.getvalue()
def stable(z,name,data,compression=zipfile.ZIP_DEFLATED):
    info=zipfile.ZipInfo(name,(2026,10,16,0,0,0));info.compress_type=compression;z.writestr(info,data)
def ora(path,layers,merged):
    root=ET.Element('image',{'version':'0.0.3','w':str(canvas[0]),'h':str(canvas[1])});stack=ET.SubElement(root,'stack')
    with zipfile.ZipFile(path,'w') as z:
        stable(z,'mimetype','image/openraster',zipfile.ZIP_STORED)
        for i,(name,im) in enumerate(reversed(layers)):
            rel=f'data/layer{i}.png';stable(z,rel,png(im));ET.SubElement(stack,'layer',{'name':name,'src':rel,'opacity':'1','visibility':'visible','composite-op':'svg:src-over','x':'0','y':'0'})
        stable(z,'stack.xml',ET.tostring(root));stable(z,'mergedimage.png',png(merged))
equipment=None
if eid=='leg-press':
    spec=importlib.util.spec_from_file_location('press_equipment',P/'equipment.py');equipment=importlib.util.module_from_spec(spec);spec.loader.exec_module(equipment)
stats=[]
for n in ['A','B']:
    source=body[n];rgb=source[:,:,:3].astype(float);mx=rgb.max(2);mn=rgb.min(2);sat=(mx-mn)/np.maximum(mx,1)
    violet=(rgb[:,:,2]-np.minimum(rgb[:,:,0],rgb[:,:,1])>7)&(mx>80);out=source.copy()
    if eid=='leg-press':
        regions={'A':[[(640,444),(666,433),(708,429),(758,435),(778,445),(750,465),(710,478),(655,478)],[(725,451),(767,439),(807,441),(859,452),(910,476),(923,491),(900,509),(856,521),(800,530),(755,519),(726,500)]], 'B':[[(791,253),(812,257),(837,286),(867,326),(892,373),(914,419),(915,442),(895,434),(861,406),(836,364),(814,317),(798,285)],[(697,234),(726,230),(753,242),(788,279),(783,294),(749,272),(719,249)]]}
        quad=np.maximum.reduce([muscle_field(p,raw[n].size) for p in regions[n]])
        primary=violet&(quad>.5);secondary=np.zeros(violet.shape,bool)
        # The source marks an oblique above the pelvis; it is neutral here.
        other=violet&~primary&~secondary;out[other,:3]=np.repeat(mx[:,:,None],3,2)[other].astype('uint8')
        hamstrings={'A':[(715,532),(746,537),(794,538),(839,537),(886,529),(926,522),(934,529),(906,539),(853,548),(797,551),(752,547),(719,541)],'B':[(783,399),(801,439),(829,475),(861,499),(901,517),(917,522),(901,530),(867,525),(838,507),(813,479),(791,441),(778,415)]}
        ham=muscle_field(hamstrings[n],raw[n].size);ham*=mx>100;ham*=~primary
    else:
        yy,xx=np.indices(violet.shape)
        biceps={'A':[(540,432),(558,448),(563,473),(562,500),(553,527),(538,543),(523,542),(516,526),(514,497),(516,463),(526,444)],'B':[(539,432),(555,435),(565,450),(556,473),(537,494),(519,498),(515,478),(519,451)]}
        field=muscle_field(biceps[n],raw[n].size);primary=violet&((field>.5)|(xx>700));secondary=violet&~primary;ham=np.zeros(violet.shape)
    for role,ms,target,ref in [('primary',primary,(123,114,233),.65),('secondary',secondary,(149,144,224),.35)]:
        amount=np.clip(sat/ref,0,1);tint=mx[:,:,None]*(1-amount[:,:,None]*(1-np.array(target)/255));out[ms,:3]=np.rint(tint[ms]).clip(0,255).astype('uint8');Image.fromarray(ms.astype('uint8')*255).save(O/f'{n}-{role}-mask.png')
    if ham.any():
        amount=ham*.38;tint=mx[:,:,None]*(1-amount[:,:,None]*(1-np.array([149,144,224])/255));out[ham>0,:3]=np.rint(tint[ham>0]).clip(0,255).astype('uint8');Image.fromarray(np.rint(ham*255).astype('uint8')).save(O/f'{n}-hamstrings-mask.png')
    changed=np.any(source!=out,2);overlay=np.zeros_like(out);overlay[changed]=out[changed]
    source[:, :,3]=np.where(np.max(source[:,:,:3],2)<=2,0,255);out[:,:,3]=source[:,:,3]
    scene=Image.fromarray(source);finished=Image.fromarray(out);scene.save(O/f'{n}-source-composite.png');finished.save(O/f'{n}-colour-full.png');Image.fromarray(overlay).save(O/f'{n}-colour-overlay.png')
    eq,mechanics=equipment.render(n) if equipment else (Image.new('RGBA',raw[n].size),None)
    back=Image.new('RGBA',canvas,(0,0,0,255));eqframe=frame(eq);scene_frame=frame(scene);over_frame=frame(Image.fromarray(overlay))
    native=Image.alpha_composite(Image.alpha_composite(back,eqframe),frame(finished));native.save(O/f'{n}-native.png');eq.save(O/f'{n}-equipment.png')
    ora(O/f'{n}-native.ora',[('Black background',back),('Custom apparatus',eqframe),('Native connected moving-region composite',scene_frame),('Approved palette using original source tone',over_frame)],native)
    diagnostic=(144,224,760,650) if eid=='leg-press' else (432,336,720,736);Image.alpha_composite(Image.alpha_composite(Image.new('RGBA',raw[n].size,(0,0,0,255)),eq),finished).crop(diagnostic).save(O/f'{n}-contact-native.png')
    stats.append({'pose':n,'sourceSha256':sha(P/f'originals/{n}-original.png'),'primaryPixels':int(primary.sum()),'secondaryPixels':int(secondary.sum()),'mechanics':mechanics,'headAndFixedScene': 'All pixels outside the documented B moving region come from A at unchanged coordinates. A itself is the retained native source; no original-master outside-pixel invariance claimed.','anatomicalTransforms':0})
(O/'frames').mkdir(exist_ok=True)
for i,n in enumerate(plan['sourcePoseOrder'],1):
    im=Image.open(O/f'{n}-native.png').convert('RGB');im.save(O/f'frames/{i}.webp',lossless=True,quality=100,method=4);assert Image.open(O/f'frames/{i}.webp').convert('RGB').tobytes()==im.tobytes()
report={'exerciseId':eid,'states':stats,'sourceScale':1,'commonCrop':crop,'integerPadding':pad,'dimensions':canvas,'anatomicalTransforms':0,'newImageRequestsInRecipe':0,'strictCertified':False,'completionCredit':False}
(O/'native-composite-and-exports-proof.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report))
