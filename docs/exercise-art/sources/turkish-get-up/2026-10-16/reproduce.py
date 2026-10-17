"""Reproduce complete source panels, palette overlays, editable ORAs and stills.
No service calls, body-part fitting, reflection or anatomical warping.
"""
from pathlib import Path
from io import BytesIO
import hashlib,json,zipfile,xml.etree.ElementTree as ET
import numpy as np
from PIL import Image,ImageDraw
from source_colour_regions import regions
P=Path(__file__).resolve().parent;O=P/'candidate';O.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
crop=(304,80,928,656);pad=(32,32);size=(688,640)
def frame(im):
    out=Image.new('RGBA',size,(0,0,0,255));out.paste(im.crop(crop),pad);return out
def png(im):
    b=BytesIO();im.save(b,format='PNG');return b.getvalue()
def ora(path,source,overlay,merged):
    layers=[('Source panels / whole-source framing',source),('Approved palette using source tone',overlay)]
    root=ET.Element('image',{'version':'0.0.3','w':str(size[0]),'h':str(size[1])});stack=ET.SubElement(root,'stack')
    with zipfile.ZipFile(path,'w') as z:
        def put(name,data,compression=zipfile.ZIP_DEFLATED):
            i=zipfile.ZipInfo(name,(2026,10,16,0,0,0));i.compress_type=compression;z.writestr(i,data)
        put('mimetype','image/openraster',zipfile.ZIP_STORED)
        for i,(name,im) in enumerate(reversed(layers)):
            rel=f'data/layer{i}.png';put(rel,png(im));ET.SubElement(stack,'layer',{'name':name,'src':rel,'opacity':'1','visibility':'visible','composite-op':'svg:src-over','x':'0','y':'0'})
        put('stack.xml',ET.tostring(root));put('mergedimage.png',png(merged))
facts=[]
for n in 'ABCDEF':
    f=P/f'native-extraction/{n}-native.png'
    if n=='B':
        f=P/'elbow-contact-generated-full.png';im=Image.open(f).convert('RGBA');assert im.size==(1512,1040)
        im=im.resize((756,520),Image.Resampling.LANCZOS);scene=Image.new('RGBA',(1024,704),(0,0,0,255));scene.paste(im,(195,165))
    else:scene=Image.open(f).convert('RGBA')
    source=np.array(scene);rgb=source[:,:,:3].astype(float);mx=rgb.max(2);mn=rgb.min(2);sat=(mx-mn)/np.maximum(mx,1)
    violet=(rgb[:,:,2]-np.minimum(rgb[:,:,0],rgb[:,:,1])>7)&(mx>80)
    pri,sec,neutral=regions(n,rgb,violet)
    out=source.copy();out[neutral,:3]=np.repeat(mx[:,:,None],3,2)[neutral].astype('uint8')
    for role,m,target,ref in [('primary',pri,(123,114,233),.65),('secondary',sec,(149,144,224),.35)]:
        amount=np.clip(sat/ref,0,1);tint=mx[:,:,None]*(1-amount[:,:,None]*(1-np.array(target)/255));out[m,:3]=np.rint(tint[m]).clip(0,255).astype('uint8');Image.fromarray(m.astype('uint8')*255).save(O/f'{n}-{role}-mask.png')
    overlay=np.zeros_like(out);changed=np.any(source!=out,2);overlay[changed]=out[changed]
    finished=frame(Image.fromarray(out));sourceframe=frame(scene)
    overframe=Image.new('RGBA',size);overframe.paste(Image.fromarray(overlay).crop(crop),pad)
    finished.save(O/f'{n}-native.png');ora(O/f'{n}-native.ora',sourceframe,overframe,finished)
    (O/'frames').mkdir(exist_ok=True);i=ord(n)-ord('A')+1;finished.convert('RGB').save(O/f'frames/{i}.webp',lossless=True,quality=100,method=4)
    assert Image.open(O/f'frames/{i}.webp').convert('RGB').tobytes()==finished.convert('RGB').tobytes()
    facts.append({'pose':n,'sourceSha256':sha(f),'wholeSourceUniformFraming':.5 if n=='B' else 1,'individualBodyPartTransforms':0,'primaryPixels':int(pri.sum()),'secondaryPixels':int(sec.sum()),'neutralisedChestPixels':int(neutral.sum())})
sheet=Image.new('RGB',(size[0]*3,size[1]*2))
for i,n in enumerate('ABCDEF'):sheet.paste(Image.open(O/f'{n}-native.png').convert('RGB'),((i%3)*size[0],(i//3)*size[1]))
sheet.save(O/'six-native-contact-sheet.png')
(O/'reproduction-proof.json').write_text(json.dumps({'dimensions':size,'commonCrop':crop,'integerPadding':pad,'sourcePoseOrder':list('ABCDEF'),'automaticPlayback':[0,1,2,3,4,5,4,3,2,1],'states':facts,'strictCertified':False,'completionCredit':False},indent=2)+'\n',encoding='utf8')
print(json.dumps({'exported':6,'dimensions':size,'strictCertified':False,'completionCredit':False}))
