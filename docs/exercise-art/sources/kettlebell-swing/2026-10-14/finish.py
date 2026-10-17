from pathlib import Path
from PIL import Image,ImageFilter
from collections import deque
import numpy as np, json, hashlib, io, zipfile, xml.etree.ElementTree as ET

r=Path(__file__).resolve().parent
P=(123,114,233);S=(149,144,224);C=(119,119,119)
crop=(280,0,970,1008)
names=['1-master.png','2-hike-candidate.png','3-mid-candidate.png']
primary=[[39,49,64,77,81,99,109],[17,22,35,61,67,74],[14,19,23,30,64,86]]
secondary=[[24,33],[1,20,39],[1]]

def png(im):
    b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()

def ora(path,layers,merged):
    tree=ET.Element('image',{'w':str(merged.width),'h':str(merged.height),'name':'Retained intact canonical Russian swing; colour and inherited contour layers'})
    stack=ET.SubElement(tree,'stack')
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('mimetype','image/openraster')
        for i,(name,layer) in enumerate(reversed(layers)):
            fn=f'data/{i}.png';z.writestr(fn,png(layer));ET.SubElement(stack,'layer',{'name':name,'src':fn,'x':'0','y':'0','opacity':'1.0','visibility':'visible','composite-op':'svg:src-over'})
        z.writestr('stack.xml',ET.tostring(tree));z.writestr('mergedimage.png',png(merged))
    with zipfile.ZipFile(path) as z:
        tree=ET.fromstring(z.read('stack.xml')); check=Image.new('RGBA',merged.size)
        for layer in reversed(list(tree.find('stack'))):
            check.alpha_composite(Image.open(io.BytesIO(z.read(layer.attrib['src']))).convert('RGBA'))
        assert check.tobytes()==merged.tobytes()==Image.open(io.BytesIO(z.read('mergedimage.png'))).convert('RGBA').tobytes()

audit=[]
for n,name in enumerate(names,1):
    base=Image.open(r/name).convert('RGBA');a=np.asarray(base)[:,:,:3].astype(float)
    chroma=np.clip((a[:,:,2]-np.minimum(a[:,:,0],a[:,:,1])-6)/22,0,1)
    strong=(chroma>.7)&(a.mean(axis=2)>110)
    labels=np.zeros(strong.shape,np.int32);k=0
    for sy,sx in zip(*np.where(strong)):
        if labels[sy,sx]:continue
        k+=1;q=deque([(sy,sx)]);labels[sy,sx]=k
        while q:
            y,x=q.popleft()
            for ny,nx in [(y-1,x),(y+1,x),(y,x-1),(y,x+1)]:
                if 0<=ny<1024 and 0<=nx<1536 and strong[ny,nx] and labels[ny,nx]==0:
                    labels[ny,nx]=k;q.append((ny,nx))
    classes=np.zeros(labels.shape,np.uint8)
    classes[np.isin(labels,primary[n-1])]=1
    classes[np.isin(labels,secondary[n-1])]=2
    valid=chroma>0
    valid[:260]=False;valid[730:]=False;valid[:,:330]=False;valid[:,625:]=False
    q=deque(zip(*np.where(classes>0)))
    while q:
        y,x=q.popleft()
        for ny,nx in [(y-1,x),(y+1,x),(y,x-1),(y,x+1)]:
            if 0<=ny<1024 and 0<=nx<1536 and valid[ny,nx] and classes[ny,nx]==0:
                classes[ny,nx]=classes[y,x];q.append((ny,nx))
    weight=chroma*(classes>0)
    layers=[('intact-original-body-equipment-floor-native',base)]
    out=base.copy()
    for label,colour,kind in [('primary-glutes-hamstrings',P,1),('secondary-abs-lower-back',S,2)]:
        layer=Image.new('RGBA',base.size,colour+(0,))
        layer.putalpha(Image.fromarray(np.uint8(chroma*(classes==kind)*255)))
        out.alpha_composite(layer);layers.append((label,layer));layer.save(r/f'{n}-{label}.png')
    gray=a.mean(axis=2).astype(np.uint8)
    median=np.asarray(Image.fromarray(gray).filter(ImageFilter.MedianFilter(5))).astype(float)
    inherited=np.clip((median-gray-6)/22,0,1)*weight
    layer=Image.new('RGBA',base.size,C+(0,));layer.putalpha(Image.fromarray(np.uint8(inherited*255)))
    out.alpha_composite(layer);layers.append(('source-derived-fine-contours-no-new-gradient',layer))
    b=np.asarray(out)[:,:,:3]
    assert np.array_equal(b[weight==0],a[weight==0])
    assert np.array_equal(b[:260],a[:260])
    assert np.array_equal(b[730:],a[730:])
    assert np.array_equal(b[:,625:],a[:,625:])
    out.save(r/f'{n}-native-finished.png')
    framed=out.crop(crop);framed.save(r/f'{n}-framed.png')
    ora(r/f'{n}-framed.ora',[(name,im.crop(crop)) for name,im in layers],framed)
    audit.append({'sourcePose':n,'source':name,'originalSha256':hashlib.sha256((r/name).read_bytes()).hexdigest(),'humanGeometryOrEquipmentPixelsTransformed':False,'allNeutralPixelsOutsideOriginalColourFieldsExact':True,'headArmsGripsShoesEquipmentExact':True,'commonWholeSceneCrop':crop,'dimensions':framed.size,'newGradient':False,'exactPrimaryPixels':int(np.all(b==P,axis=2).sum()),'exactSecondaryPixels':int(np.all(b==S,axis=2).sum()),'reopenedEditableExact':True,'unclassifiedOriginalStrongColourPixelsInBodyDomain':int(np.sum(strong&valid&(classes==0)))})
(r/'final-frames').mkdir(exist_ok=True)
for beat,pose in enumerate([2,3,1,1,3,2],1):
    im=Image.open(r/f'{pose}-framed.png');im.save(r/f'final-frames/{beat}.webp',lossless=True,quality=100,method=6)
    assert Image.open(r/f'final-frames/{beat}.webp').convert('RGBA').tobytes()==im.convert('RGBA').tobytes()
(r/'finishing-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
(r/'framing.json').write_text(json.dumps({'commonCrop':crop,'nativeDimensions':[690,1008],'sourcePoseOrder':[2,3,1,1,3,2],'physicalStates':3,'separateBeatPaths':6,'anatomyTransforms':False,'equipmentEdits':False},indent=2)+'\n')
print(json.dumps(audit,indent=2))
