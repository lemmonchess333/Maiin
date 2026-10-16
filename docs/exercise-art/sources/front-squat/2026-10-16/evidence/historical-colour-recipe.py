from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import hashlib, io, json, shutil, zipfile
import xml.etree.ElementTree as ET
import numpy as np

R = Path(__file__).resolve().parent
W = R.parents[1]
REPO = W / 'Maiin-burpees'
OLD = W / 'thrusters'
TEMPLATE = W / 'rear-delt-machine-fly/approved-equivalent-source-review-20261014'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
save = lambda name, v: (R / name).write_text(json.dumps(v, indent=2) + '\n', encoding='utf-8')
def png(im):
    b=io.BytesIO(); im.save(b, format='PNG'); return b.getvalue()
def ora(path, layers, final):
    root=ET.Element('image', dict(w=str(final.width),h=str(final.height),name='Front Squat colour-only editable'))
    stack=ET.SubElement(root,'stack')
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('mimetype','image/openraster')
        for n,(name,layer) in enumerate(reversed(layers)):
            loc=f'data/{n}.png'; z.writestr(loc,png(layer))
            ET.SubElement(stack,'layer',dict(name=name,src=loc,x='0',y='0',opacity='1.0',visibility='visible',**{'composite-op':'svg:src-over'}))
        z.writestr('stack.xml',ET.tostring(root)); z.writestr('mergedimage.png',png(final))
    with zipfile.ZipFile(path) as z:
        reopened=Image.new('RGBA',final.size)
        for layer in reversed(list(ET.fromstring(z.read('stack.xml')).find('stack'))):
            reopened=Image.alpha_composite(reopened,Image.open(io.BytesIO(z.read(layer.attrib['src']))).convert('RGBA'))
        assert reopened.tobytes()==final.tobytes()

sources=[('1-rack-grip-candidate.png','rack-grip-prompt.txt'),('3-drive-candidate.png','drive-prompt.txt'),('2-squat-candidate.png','squat-prompt.txt')]
# These polygons only assign colour ownership to already generated tinted
# muscle fields. They do not draw, warp, move, replace or fit any body pixels.
quads={1:[(723,552),(787,566),(890,571),(885,707),(814,725),(716,717)],
       2:[(717,572),(781,580),(902,598),(920,691),(868,724),(724,699)],
       3:[(705,650),(791,655),(919,674),(930,743),(847,757),(713,742)]}
secondary={
  1:[[(735,414),(845,414),(856,509),(789,548),(729,514)],[(671,520),(735,520),(765,566),(733,654),(669,637)]],
  2:[[(731,468),(854,468),(856,562),(807,588),(721,559)],[(666,527),(755,527),(765,605),(725,678),(663,669)]],
  3:[[(741,562),(861,565),(859,651),(807,676),(730,645)],[(662,644),(716,641),(784,665),(747,718),(661,734)]]}
crop=(432,208,1104,944); padding=(32,32); display_size=(736,800)
rows=[]
for pose,(name,prompt) in enumerate(sources,1):
    for filename in [name,prompt]: shutil.copy2(OLD/filename,R/filename)
    original=Image.open(R/name).convert('RGBA'); assert original.size==(1536,1024)
    a=np.asarray(original); rgb=a[:,:,:3].astype(float); gray=rgb.max(2)
    diff=rgb[:,:,2]-rgb[:,:,:2].min(2)
    scope=np.zeros(gray.shape); scope[220:820,625:950]=1
    # Fill enclosed neutral highlights inside existing coloured fields rather
    # than leave patchy white holes. Outside is flood-filled from the canvas
    # corner; the field silhouette is still derived only from source colour.
    field=Image.fromarray(np.uint8(((diff>7)&(scope>0))*255))
    filled=field.copy();ImageDraw.floodfill(filled,(0,0),128)
    chroma=(np.asarray(filled)!=128).astype(float)*scope
    primary_mask=Image.new('L',original.size)
    ImageDraw.Draw(primary_mask).polygon(quads[pose],fill=255)
    # Shoulder/arm highlights in the Thrusters source do not belong in the
    # target primary/secondary map. Restore their source maximum-channel
    # neutral illumination. Retain glute/core fields as the target secondary.
    secondary_image=Image.new('L',original.size)
    for polygon in secondary[pose]:ImageDraw.Draw(secondary_image).polygon(polygon,fill=255)
    secondary_mask=np.asarray(secondary_image)/255
    pm=chroma*np.asarray(primary_mask)/255
    sm=chroma*(1-np.asarray(primary_mask)/255)*secondary_mask
    layers=[('Original complete generated Thrusters source; no contact grafts',original)]
    neutral=Image.fromarray(np.concatenate([np.uint8(np.repeat(gray[:,:,None],3,2)),np.uint8(chroma[:,:,None]*255)],2),'RGBA')
    layers.append(('Neutralise source violet; inherited neutral illumination',neutral))
    for label,col,mask,saturation_reference in [('Primary quadriceps #7B72E9',(123,114,233),pm,.75),('Secondary glutes/core #9590E0',(149,144,224),sm,.35)]:
        # Map the existing generated surface saturation/value into the exact
        # target base colour. Source highlights and shadows remain continuous;
        # no flat overpaint or newly invented gradient is applied.
        source_saturation=(rgb.max(2)-rgb.min(2))/np.maximum(gray,1)
        amount=np.clip(source_saturation/saturation_reference,0,1)
        tint=np.uint8(np.round(gray[:,:,None]*(col[2]/255)*(1-amount[:,:,None]*(1-np.array(col)[None,None,:]/col[2]))))
        layers.append((label+'; source illumination',Image.fromarray(np.concatenate([tint,np.uint8(mask[:,:,None]*255)],2),'RGBA')))
    median=np.asarray(Image.fromarray(gray.astype('uint8')).filter(ImageFilter.MedianFilter(5))).astype(float)
    detail=np.clip((median-gray-4)/22,0,1)*chroma
    contours=Image.new('RGBA',original.size,(119,119,119,0));contours.putalpha(Image.fromarray(np.uint8(detail*255)))
    layers.append(('Inherited grey contour detail',contours))
    full=Image.new('RGBA',original.size)
    for _,layer in layers: full=Image.alpha_composite(full,layer)
    out=np.asarray(full); changes=np.any(out!=a,2)
    assert not changes[scope==0].any()
    # Protect all original shoes, hands, plate/sleeve geometry and background.
    assert full.crop((640,835,910,930)).tobytes()==original.crop((640,835,910,930)).tobytes()
    full.save(R/f'{pose}-coloured-full.png'); ora(R/f'{pose}-full.ora',layers,full)
    framed_layers=[]
    for label,layer in layers:
        canvas=Image.new('RGBA',display_size)
        canvas.paste(layer.crop(crop),padding);framed_layers.append((label,canvas))
    # Opaque black padding is a scene layer, never an invented anatomical fill.
    framed_layers.insert(0,('Black scene padding',Image.new('RGBA',display_size,(0,0,0,255))))
    final=Image.new('RGBA',display_size)
    for _,layer in framed_layers: final=Image.alpha_composite(final,layer)
    final.save(R/f'{pose}-native.png');ora(R/f'{pose}-framed.ora',framed_layers,final)
    bright=np.asarray(original)[:,:,:3].max(2)>25
    outside=bright.copy();x0,y0,x1,y1=crop;outside[y0:y1,x0:x1]=False
    assert not outside.any(), f'Crop excludes source content: {pose}'
    sole=[]
    for x0,y0,x1,y1 in [(655,889,770,909),(770,879,896,901)]:
        region=a[y0:y1,x0:x1,:3];white=(region.min(2)>135)&((region.max(2)-region.min(2))<25)
        ys,xs=np.where(white);bottom=ys.max();band=white[max(0,bottom-3):bottom+1];by,bx=np.where(band)
        sole.append(dict(ROI=[x0,y0,x1,y1],bottomY=int(bottom+y0),lowerBandLeft=int(bx.min()+x0),lowerBandRight=int(bx.max()+x0)))
    rows.append(dict(pose=pose,source=name,sourceSha256=sha(R/name),sourcePrompt=prompt,
                     colourOwnershipBoundary=quads[pose],soleEnvelope=sole,colourChangedPixels=int(changes.sum()),
                     changedOutsideColourScope=0,originalShoesExact=True,equipmentOrAnatomyTransforms=0,
                     primaryExactPixels=int(np.all(out[:,:,:3]==(123,114,233),2).sum()),
                     secondaryExactPixels=int(np.all(out[:,:,:3]==(149,144,224),2).sum()),editableReopenedExact=True))
order=[1,2,3,3,2,1]
labels=['Rack','Lower','Depth','Brace','Rise','Stand']
cues=['Keep the bar supported; elbows forward.', 'Bend knees and hips; keep heels planted.', 'Reach parallel with your torso upright.', 'Keep your elbows high and core braced.', 'Drive up through your whole foot.', 'Stand tall with the bar still racked.']
times=[0,.5,1,1,.5,0]
(R/'final-frames').mkdir(exist_ok=True)
beats=[]
for beat,pose in enumerate(order,1):
    im=Image.open(R/f'{pose}-native.png').convert('RGB');im.save(R/f'final-frames/{beat}.webp',lossless=True,method=6)
    assert Image.open(R/f'final-frames/{beat}.webp').convert('RGB').tobytes()==im.tobytes()
    beats.append(dict(t=times[beat-1],label=labels[beat-1],cue=cues[beat-1],image=f'/form-frames/front-squat/{beat}.webp'))
assert all(len(b['cue'].split())<=7 for b in beats)
save('draft-beats.json',beats)
save('source-review.json',dict(exerciseId='front-squat',route='Existing intact front-squat subsequence from Thrusters original authoring set',
    sourcePoseOrder=order,physicalPoses=3,separatelyAuthoredTargetPoses=0,newImageRequests=0,
    originalHeldFrontSquatDraftsUsed=False,blockedRenderOrRepairRequested=False,contactGraftsUsed=False,
    commonCrop=crop,padding=padding,displaySize=display_size,wholeSceneScale=1,
    muscleMapping='Quadriceps primary; glutes/core secondary; original Thrusters shoulder/triceps tint neutralised.',
    neutralLighting='Existing source saturation/value mapped into each exact target base colour; original highlights/shadows retained. No new gradients.',
    rows=rows,status='Prepared outside public; final native/mobile/mechanics review required. Not approved or counted.'))
save('previous-artwork-hashes.json',{str(p.relative_to(REPO)).replace(chr(92),'/'):sha(p) for d in ['public/form-frames','public/form-art'] for p in (REPO/d).rglob('*') if p.is_file()})
config=(TEMPLATE/'review-vite.config.mjs').read_text().replace('rear-delt-machine-fly','front-squat').replace('width:856,height:1008','width:736,height:800').replace('["Rear Delts"]','["Quads"]').replace('["Rhomboids","Traps"]','["Glutes","Core"]').replace('8771','8773')
(R/'review-vite.config.mjs').write_text(config)
mobile=(TEMPLATE/'mobile-review.tsx').read_text().replace('Rear Delt Machine Fly','Front Squat').replace('Staged equivalent catalogue entry: exact approved-source reuse','Staged original front-squat poses; target muscle map').replace('<img src="/card-cutout.webp" alt="Front Squat card cutout" className="h-40 w-full object-contain" />','')
(R/'mobile-review.tsx').write_text(mobile)
(R/'mobile-review.html').write_text((TEMPLATE/'mobile-review.html').read_text().replace('Rear Delt Machine Fly','Front Squat'))
native=(TEMPLATE/'native-review.html').read_text(encoding='utf-8').replace('Rear Delt Machine Fly','Front Squat').replace('856','736').replace('1008','800')
native=native.replace('Exact reuse of already-approved equivalent catalogue movement. No pixel changes.','Existing intact front-squat source poses; colour finishing only; no contact grafts.')
import re
native=re.sub(r'cues=\[.*?\];let beat','cues='+json.dumps(cues)+';let beat',native)
(R/'native-review.html').write_text(native,encoding='utf-8')
shutil.copy2(TEMPLATE/'run-verify.ps1',R/'run-verify.ps1')
print(json.dumps({'prepared':True,'sourceRows':rows,'crop':crop,'nativeSize':display_size,'previousArtworkFiles':len(json.loads((R/'previous-artwork-hashes.json').read_text()))}))
