from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np, io, json, hashlib, zipfile
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parent
ASSEMBLY=ROOT.parent/'safety-layer-assembly-production'
SIZE=(1024,1536)
CROP=(60,80,1000,1390)
STAGES=['1-lower','2-near-top','3-raised']
ORDER=[0,1,2,2,1,0]
TARGET=np.array([123.,114.,233.])
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def png(im):
    out=io.BytesIO();im.save(out,format='PNG');return out.getvalue()
def create_ora(path,layers,merged):
    root=ET.Element('image',{'w':str(merged.width),'h':str(merged.height),'name':path.stem})
    stack=ET.SubElement(root,'stack')
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('mimetype','image/openraster')
        for i,(label,layer) in enumerate(reversed(layers)):
            item=f'data/{i}.png';z.writestr(item,png(layer))
            ET.SubElement(stack,'layer',dict(name=label,src=item,x='0',y='0',opacity='1.0',visibility='visible',**{'composite-op':'svg:src-over'}))
        z.writestr('stack.xml',ET.tostring(root));z.writestr('mergedimage.png',png(merged))
    with zipfile.ZipFile(path) as z:
        reopened=Image.new('RGBA',SIZE)
        for el in reversed(list(ET.fromstring(z.read('stack.xml')).find('stack'))):
            reopened=Image.alpha_composite(reopened,Image.open(io.BytesIO(z.read(el.attrib['src']))).convert('RGBA'))
        assert reopened.tobytes()==merged.tobytes(),'Editable reopen mismatch'
    return True

equipment=[('Shared floor/base and rear upright; equipment/background only','shared-floor-base-layer.png'),
 ('Shared neutral rear bearing and original shaft/cap','shared-rear-bearing-layer.png'),
 ('Shared platform front face; equipment only','shared-platform-front-face-layer.png'),
 ('Shared disengaged safety tube/handle; equipment rigid swing only','shared-disengaged-safety-layer.png'),
 ('Shared ground hinge foreground','shared-ground-hinge-front-layer.png')]
scope=np.zeros((1536,1024),bool);scope[650:965,285:555]=True
audit=[];finals=[]
for stage in STAGES:
    if stage=='2-near-top':
        base=Image.open(ASSEMBLY/'3-raised-without-safety.png').convert('RGBA')
        generated=Image.new('RGBA',SIZE)
        generated.paste(Image.open(ROOT/'middle-window-corrected-normalized.png').convert('RGBA'),(15,440))
        layers=[('Complete raised canonical scene; original head/shoulders outside window',base),
                ('One generated connected moving-unit window, uniformly normalized at15,440',generated)]
    else:
        base=Image.open(ASSEMBLY/(stage+'-without-safety.png')).convert('RGBA')
        layers=[('Complete connected image-generated body/carriage source; no anatomy fitting',base)]
    for label,filename in equipment:layers.append((label,Image.open(ASSEMBLY/filename).convert('RGBA')))
    merged=Image.new('RGBA',SIZE)
    for _,layer in layers:merged=Image.alpha_composite(merged,layer)
    expected=Image.open(ASSEMBLY/(stage+'-assembly-draft.png')).convert('RGBA')
    assert merged.tobytes()==expected.tobytes(),'Source/equipment composition mismatch'
    rgb=np.array(merged)[:,:,:3].astype(float)
    gray=rgb.max(2)
    source_chroma=np.maximum(rgb[:,:,2]-np.minimum(rgb[:,:,0],rgb[:,:,1]),0)
    tinted=(source_chroma>14)&(gray>80)
    assert not (tinted&~scope).any(),'Unexpected source tint outside calf scope'
    q=float(np.percentile(source_chroma[tinted],95))
    ink=np.clip((source_chroma-10)/max(q-10,1),0,1)*scope
    # Neutralisation retains inherited value/contours; primary ink alpha follows
    # original source tint and keeps source luminance shading, not flat repaint.
    neutral_rgb=np.repeat(gray[:,:,None],3,2)
    neutral_layer=np.zeros((1536,1024,4),np.uint8)
    neutral_layer[:,:,:3]=neutral_rgb.astype(np.uint8)
    neutral_layer[:,:,3]=np.uint8(tinted*255)
    neutral=Image.fromarray(neutral_layer)
    merged=Image.alpha_composite(merged,neutral)
    levels=np.clip(gray/233,0,1)
    ink_rgb=np.uint8(np.round(TARGET[None,None,:]*levels[:,:,None]))
    tint_layer=np.concatenate([ink_rgb,np.uint8(np.round(ink*255))[:,:,None]],2)
    tint=Image.fromarray(tint_layer)
    merged=Image.alpha_composite(merged,tint)
    layers.extend([('Source calf tint neutralised; inherited luminance retained',neutral),
                   ('Calves primary #7B72E9; source-derived shading and contours',tint)])
    merged.save(ROOT/('final-'+stage+'.png'))
    merged.crop((290,650,590,1040)).save(ROOT/(stage+'-colour-and-contact-native.png'))
    exact=create_ora(ROOT/(stage+'-editable.ora'),layers,merged)
    final=np.array(merged)[:,:,:3]
    original=np.array(expected)[:,:,:3]
    changed=np.any(final!=original,2)
    assert not changed[~scope].any(),'Palette changed outside calf scope'
    assert np.any(np.all(final==(123,114,233),2)),'No exact primary pixels'
    finals.append(merged.convert('RGB').crop(CROP))
    audit.append({'stage':stage,'primary':[123,114,233],'sourceChroma95':q,
                  'exactPrimaryPixels':int(np.all(final==(123,114,233),2).sum()),
                  'outsideCalfColourScopeChanged':0,'editableReopenedExact':exact,
                  'individualAnatomyTransform':False,'wholeWindowNormalization':stage=='2-near-top',
                  'sourceSha256':sha(ASSEMBLY/(stage+'-without-safety.png')),
                  'finalSha256':sha(ROOT/('final-'+stage+'.png'))})
out=ROOT/'final-frames';out.mkdir(exist_ok=True)
rows=[]
for i,idx in enumerate(ORDER,1):
    im=finals[idx];file=out/f'{i}.webp';im.save(file,format='WEBP',lossless=True,quality=100,method=6)
    assert Image.open(file).convert('RGB').tobytes()==im.tobytes()
    rows.append({'frame':i,'stage':STAGES[idx],'sha256':sha(file)})
labels=['Stretch','Rise','Squeeze','Hold','Lower','Reset']
cues=['Lower your heels under control.','Press through the balls of your feet.','Raise your heels; keep knees under pads.','Keep the contraction controlled.','Ease your heels down from the top.','Return to the lower heel position.']
times=[0,.875,1,1,.875,0]
beats=[{'t':t,'label':label,'cue':cue,'image':f'/final-frames/{i}.webp'} for i,(t,label,cue) in enumerate(zip(times,labels,cues),1)]
card=finals[0].convert('RGBA');a=np.array(card)
card.putalpha(Image.fromarray(np.uint8(np.where(a[:,:,:3].max(2)>=18,255,0))))
card.save(ROOT/'card-cutout.webp',format='WEBP',lossless=True,quality=100,method=6)
(ROOT/'draft-beats.json').write_text(json.dumps(beats,indent=2)+'\n')
(ROOT/'colour-editable-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
(ROOT/'export-review.json').write_text(json.dumps({'exerciseId':'seated-calf-raise','status':'Prepared outside production; final native/mobile review and project checks required',
 'distinctPhysicalPoses':3,'sourcePoseOrder':[1,2,3,3,2,1],'sourceStages':STAGES,
 'nearTopPhaseDisclosure':'Corrected local state is a small near-top transition, not a claimed halfway pose. The .875 cue progress is qualitative from the observed heel ladder, not a calibrated joint angle.',
 'commonEmptyMarginCrop':CROP,'deliveryDimensions':finals[0].size,'losslessFramesExact':True,
 'editablesReopenedExact':True,'frames':rows,'cardSha256':sha(ROOT/'card-cutout.webp'),
 'anatomicalGrafts':False,'individualLimbFitting':False,'wholeWindowNormalization':{'sourceOutput':[1536,1024],'nativeWindow':[990,660],'uniformScale':.64453125,'origin':[15,440]}
},indent=2)+'\n')
print(json.dumps({'stages':audit,'frames':rows,'size':finals[0].size}))
