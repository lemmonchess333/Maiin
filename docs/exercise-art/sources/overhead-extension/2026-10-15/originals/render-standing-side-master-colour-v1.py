from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
import numpy as np,json,hashlib,zipfile,io,base64
import xml.etree.ElementTree as ET
r=Path(__file__).parent;s=json.loads((r/'standing-side-master-colour-v1.json').read_text())
source=Image.open(r/s['source']).convert('RGBA');size=source.size;scale=4
def points(path):
    out=[];cur=(0,0);start=None
    for cmd in path:
        if cmd[0]=='M':cur=tuple(cmd[1:]);start=cur;out.append(cur)
        elif cmd[0]=='C':
            a=cur;b=cmd[1:3];c=cmd[3:5];d=cmd[5:7]
            for n in range(1,81):
                t=n/80;u=1-t;out.append(tuple(u**3*a[k]+3*u*u*t*b[k]+3*u*t*t*c[k]+t**3*d[k] for k in (0,1)))
            cur=tuple(d)
        elif cmd[0]=='Z':out.append(start)
    return [(x*scale,y*scale) for x,y in out]
a=np.array(source);interior=np.array(Image.fromarray((np.max(a[:,:,:3],axis=2)>8).astype('uint8')*255).filter(ImageFilter.MinFilter(3)))==255
layers=[];coverage=np.zeros((size[1],size[0]),bool)
for f in s['fills']:
    mask=Image.new('L',(size[0]*scale,size[1]*scale));ImageDraw.Draw(mask).polygon(points(f['path']),fill=255)
    alpha=np.array(mask.resize(size,Image.Resampling.LANCZOS));alpha[~interior]=0
    layer=Image.new('RGBA',size,s['palette'][f['role']]);layer.putalpha(Image.fromarray(alpha));layers.append((f['name'],layer,f['role']));coverage|=alpha>0
mask=Image.new('L',(size[0]*scale,size[1]*scale));draw=ImageDraw.Draw(mask)
for c in s['contours']:draw.line(points(c['path']),fill=255,width=3,joint='curve')
alpha=np.array(mask.resize(size,Image.Resampling.LANCZOS));alpha[~coverage]=0
layer=Image.new('RGBA',size,s['palette']['contour']);layer.putalpha(Image.fromarray(alpha));layers.append(('contours',layer,'contour'))
merged=source.copy()
for name,layer,_ in layers:merged=Image.alpha_composite(merged,layer)
out=r/s['output'];merged.save(out)
merged.crop((375,175,715,550)).resize((1020,1125),Image.Resampling.NEAREST).save(r/'standing-side-master-colour-native-v1.png')
root=ET.Element('image',{'w':str(size[0]),'h':str(size[1]),'name':'Standing overhead extension editable muscle fields DRAFT'});stack=ET.SubElement(root,'stack')
ora=r/'standing-side-master-colour-v1.ora'
with zipfile.ZipFile(ora,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('mimetype','image/openraster',compress_type=zipfile.ZIP_STORED)
    for n,(name,layer,_) in enumerate(list(reversed(layers))+[('source-base',source,'source')]):
        p=f'data/layer{n}.png';buf=io.BytesIO();layer.save(buf,format='PNG');z.writestr(p,buf.getvalue());ET.SubElement(stack,'layer',{'name':name,'src':p,'opacity':'1.0','visibility':'visible','composite-op':'svg:src-over','x':'0','y':'0'})
    buf=io.BytesIO();merged.save(buf,format='PNG');z.writestr('mergedimage.png',buf.getvalue());z.writestr('stack.xml',ET.tostring(root))
with zipfile.ZipFile(ora) as z:
    xml=ET.fromstring(z.read('stack.xml'));recomposed=Image.new('RGBA',size)
    for node in reversed(xml.find('stack').findall('layer')):recomposed=Image.alpha_composite(recomposed,Image.open(io.BytesIO(z.read(node.attrib['src']))).convert('RGBA'))
assert np.array_equal(np.array(merged),np.array(recomposed))
b=np.array(merged);changed=np.any(a!=b,axis=2);palette={}
for i,(name,layer,role) in enumerate(layers[:-1]):
    eligible=np.array(layer)[:,:,3]==255
    for _,later,_ in layers[i+1:]:eligible&=np.array(later)[:,:,3]==0
    target=np.array(Image.new('RGB',(1,1),s['palette'][role]))[0,0]
    palette[name]={'samples':int(eligible.sum()),'wrongPixels':int(np.any(b[:,:,:3][eligible]!=target,axis=1).sum())}
regions={}
for name,box in {'head-interior':(450,270,520,370),'complete-weight-and-hands':(620,175,715,350),'neutral-torso-pelvis-legs':(300,550,700,1270),'trainers':(300,1270,700,1465)}.items():regions[name]=bool(np.array_equal(a[box[1]:box[3],box[0]:box[2]],b[box[1]:box[3],box[0]:box[2]]))
report={'source':s['source'],'sourceSha256':hashlib.sha256((r/s['source']).read_bytes()).hexdigest(),'output':out.name,'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'changedPixels':int(changed.sum()),'changesOutsideLayers':int((changed&~coverage).sum()),'alphaChanges':int((a[:,:,3]!=b[:,:,3]).sum()),'changedSourceBlackPixels':int((changed&(np.max(a[:,:,:3],axis=2)<=8)).sum()),'nonblackSupportChanges':int(np.count_nonzero(np.any(a[:,:,:3]>0,axis=2)!=np.any(b[:,:,:3]>0,axis=2))),'unchangedRegions':regions,'opaqueInteriorPalette':palette,'independentORARecompositionExact':True,'accepted':False,'limitations':s['limitations']}
(r/'standing-side-master-colour-audit-v1.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
