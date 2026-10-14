from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw
import numpy as np, json, hashlib, io, zipfile, xml.etree.ElementTree as ET
r=Path(__file__).resolve().parent
P=(123,114,233);S=(149,144,224);C=(119,119,119)
names=['master-brace-original.png','roll-original.png','reach-original.png']
# Role polygons classify existing colour pixels only; they do not paint or draw anatomy.
# Upper lateral trunk behind the neutral upper arm is the visible lat, not a new arm fill.
secondaryPolygons=[
    [(470,180),(700,180),(700,385),(655,390),(609,381),(566,372),(540,390),(480,386)],
    [(605,270),(930,270),(934,428),(848,446),(803,436),(766,437),(724,442),(684,443),(660,430),(630,411)],
    [(650,375),(1052,375),(1052,529),(987,534),(945,532),(919,520),(878,528),(843,528),(800,527),(754,523),(721,520),(693,502)]
]
crop=(48,8,1496,932)
def png(im):
    b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()
def ora(path,layers,merged):
    tree=ET.Element('image',{'w':str(merged.width),'h':str(merged.height),'name':'Intact whole-athlete kneeling Ab Wheel; exact catalogue muscle fields and inherited contours'})
    stack=ET.SubElement(tree,'stack')
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('mimetype','image/openraster')
        for i,(name,layer) in enumerate(reversed(layers)):
            fn=f'data/{i}.png';z.writestr(fn,png(layer));ET.SubElement(stack,'layer',{'name':name,'src':fn,'x':'0','y':'0','opacity':'1.0','visibility':'visible','composite-op':'svg:src-over'})
        z.writestr('stack.xml',ET.tostring(tree));z.writestr('mergedimage.png',png(merged))
    with zipfile.ZipFile(path) as z:
        tree=ET.fromstring(z.read('stack.xml'));check=Image.new('RGBA',merged.size)
        for layer in reversed(list(tree.find('stack'))):check.alpha_composite(Image.open(io.BytesIO(z.read(layer.attrib['src']))).convert('RGBA'))
        assert check.tobytes()==merged.tobytes()==Image.open(io.BytesIO(z.read('mergedimage.png'))).convert('RGBA').tobytes()
audit=[]
for n,name in enumerate(names,1):
    base=Image.open(r/name).convert('RGBA');a=np.asarray(base)[:,:,:3].astype(float)
    chroma=np.clip((a[:,:,2]-np.minimum(a[:,:,0],a[:,:,1])-6)/22,0,1)
    # No non-anatomical coloured objects are present; narrow domain excludes equipment/floor.
    domain=np.zeros(chroma.shape,bool)
    bounds=[(470,180,860,575),(610,280,1090,600),(650,380,1180,660)][n-1]
    x0,y0,x1,y1=bounds;domain[y0:y1,x0:x1]=True
    weight=chroma*domain
    smask=Image.new('L',base.size);d=ImageDraw.Draw(smask);d.polygon(secondaryPolygons[n-1],fill=255)
    # The far deltoid is a separately visible secondary field.
    far=[(776,220,870,386),(988,330,1090,470),(1055,460,1180,548)][n-1]
    d.rectangle(far,fill=255);secondary=np.asarray(smask)>0
    classes=np.where(secondary,2,1)
    out=base.copy();layers=[('intact-original-whole-athlete-equipment-floor',base)]
    for label,colour,kind in [('primary-core',P,1),('secondary-lats-deltoids',S,2)]:
        layer=Image.new('RGBA',base.size,colour+(0,));layer.putalpha(Image.fromarray(np.uint8(weight*(classes==kind)*255)))
        out.alpha_composite(layer);layers.append((label,layer));layer.save(r/f'{n}-{label}.png')
    gray=a.mean(axis=2).astype(np.uint8);median=np.asarray(Image.fromarray(gray).filter(ImageFilter.MedianFilter(5))).astype(float)
    inherited=np.clip((median-gray-6)/22,0,1)*weight
    layer=Image.new('RGBA',base.size,C+(0,));layer.putalpha(Image.fromarray(np.uint8(inherited*255)))
    out.alpha_composite(layer);layers.append(('source-derived-fine-neutral-contours-no-new-gradient',layer))
    b=np.asarray(out)[:,:,:3]
    assert np.array_equal(b[weight==0],a[weight==0])
    out.save(r/f'{n}-native-finished.png');framed=out.crop(crop);framed.save(r/f'{n}-framed.png')
    ora(r/f'{n}-framed.ora',[(name,im.crop(crop)) for name,im in layers],framed)
    audit.append({'pose':n,'source':name,'sourceSha256':hashlib.sha256((r/name).read_bytes()).hexdigest(),'anatomyGeometryTransform':False,'equipmentPixelsChanged':False,'allNeutralPixelsOutsideExistingColourFieldsExact':True,'commonCrop':crop,'dimensions':framed.size,'newGradient':False,'exactPrimaryPixels':int(np.all(b==P,axis=2).sum()),'exactSecondaryPixels':int(np.all(b==S,axis=2).sum()),'reopenedOraExact':True})
(r/'final-frames').mkdir(exist_ok=True)
order=[1,2,3,3,2,1]
for beat,pose in enumerate(order,1):
    im=Image.open(r/f'{pose}-framed.png');im.save(r/f'final-frames/{beat}.webp',lossless=True,quality=100,method=6)
    assert Image.open(r/f'final-frames/{beat}.webp').convert('RGBA').tobytes()==im.convert('RGBA').tobytes()
(r/'finishing-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
(r/'framing.json').write_text(json.dumps({'commonCrop':crop,'nativeDimensions':[1448,924],'sourcePoseOrder':order,'physicalPoses':3,'separateBeatPaths':6,'anatomyTransforms':False,'equipmentEdits':False},indent=2)+'\n',encoding='utf-8')
print(json.dumps(audit))
