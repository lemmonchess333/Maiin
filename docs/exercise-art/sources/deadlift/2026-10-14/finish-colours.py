from pathlib import Path
from PIL import Image,ImageFilter,ImageDraw
from collections import deque
import numpy as np,json,zipfile,io,xml.etree.ElementTree as ET
R=Path(__file__).resolve().parent
primary_boundaries={
 1:[(615,478),(647,478),(665,468),(681,465),(700,468),(718,466),(743,467),(766,479),(787,500),(830,522),(910,662),(615,670)],
 2:[(640,434),(667,427),(683,415),(709,411),(730,414),(750,421),(774,437),(812,485),(904,658),(640,669)],
 3:[(672,440),(694,422),(711,407),(739,395),(766,395),(785,405),(813,431),(843,499),(877,661),(672,666)]}
def png(im):
    b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()
audit=[]
for i in range(1,4):
    original=Image.open(R/f'{i}-whole-registered.png').convert('RGBA')
    equipment=Image.open(R/f'{i}-equipment-only-draft.png').convert('RGBA')
    a=np.asarray(equipment);changed=np.any(a!=np.asarray(original),axis=2)
    gear=a.copy();gear[:,:,3]=changed*255
    layers=[('Original complete generated source; whole-scene registration only',original),('Master outer plates/end sleeves; equipment only',Image.fromarray(gear))]
    rgb=a[:,:,:3].astype(float);gray=rgb.max(2);diff=rgb[:,:,2]-rgb[:,:,:2].min(2)
    scope=np.zeros(gray.shape);scope[20:810,625:980]=1
    chroma=np.clip((diff-15)/20,0,1)*scope
    binary=(diff>25)&(gray>90)&(scope>0);seen=np.zeros(binary.shape,bool);primary=np.zeros(binary.shape,np.uint8);components=[]
    for yy,xx in np.argwhere(binary):
        if seen[yy,xx]:continue
        seen[yy,xx]=True;queue=deque([(yy,xx)]);pts=[]
        while queue:
            y,x=queue.popleft();pts.append((y,x))
            for dy,dx in [(1,0),(-1,0),(0,1),(0,-1)]:
                y1,x1=y+dy,x+dx
                if 0<=y1<binary.shape[0] and 0<=x1<binary.shape[1] and binary[y1,x1] and not seen[y1,x1]:seen[y1,x1]=True;queue.append((y1,x1))
        if len(pts)<90:continue
        coords=np.asarray(pts);v=diff[coords[:,0],coords[:,1]];role='primary glutes/hamstrings' if float(v.mean())>110 else 'secondary erectors/traps'
        if role.startswith('primary'):primary[coords[:,0],coords[:,1]]=255
        components.append(dict(pixels=len(pts),bbox=[int(coords[:,1].min()),int(coords[:,0].min()),int(coords[:,1].max()+1),int(coords[:,0].max()+1)],meanSourceChroma=float(v.mean()),role=role))
    # Source chroma connects lumbar and glute planes; component-average thresholds
    # do not separate their anatomical ownership. Trace the visible glute/lumbar
    # border solely for colour ownership, never to construct or move anatomy.
    mask=Image.new('L',(original.width*3,original.height*3));ImageDraw.Draw(mask).polygon([(x*3,y*3)for x,y in primary_boundaries[i]],fill=255)
    pm=np.asarray(mask.resize(original.size,Image.Resampling.LANCZOS)).astype(float)/255*chroma;sm=chroma*(1-np.asarray(mask.resize(original.size,Image.Resampling.LANCZOS)).astype(float)/255)
    neutral=Image.fromarray(np.concatenate([np.uint8(np.repeat(gray[:,:,None],3,2)),np.uint8(chroma[:,:,None]*255)],2),'RGBA');layers.append(('Neutralise source violet; retain inherited neutral shading',neutral))
    for label,col,m in [('Primary glutes/hamstrings #7B72E9',(123,114,233),pm),('Secondary erectors/traps #9590E0',(149,144,224),sm)]:
        # Preserve existing source illumination instead of introducing a new
        # flat or gradient treatment. Bright planes reach the exact base colour.
        levels=np.clip(gray/col[2],0,1)
        tint=np.uint8(np.round(np.array(col)[None,None,:]*levels[:,:,None]))
        layer=Image.fromarray(np.concatenate([tint,np.uint8(m[:,:,None]*255)],2),'RGBA');layers.append((label+'; inherited source luminance',layer))
    median=np.asarray(Image.fromarray(gray.astype('uint8')).filter(ImageFilter.MedianFilter(5))).astype(float)
    detail=np.clip((median-gray-4)/22,0,1)*np.maximum(pm,sm)
    contour=Image.new('RGBA',original.size,(119,119,119,0));contour.putalpha(Image.fromarray(np.uint8(detail*255)));layers.append(('Inherited grey contours',contour))
    final=Image.new('RGBA',original.size)
    for _,layer in layers:final=Image.alpha_composite(final,layer)
    final.save(R/f'{i}-coloured-full.png')
    crop=(370,25,1270,905);display=Image.new('RGBA',(940,940),(0,0,0,255));display.paste(final.crop(crop),(20,50));display.save(R/f'{i}-native-review.png')
    root=ET.Element('image',dict(w='1536',h='1024',name=f'Deadlift source pose{i}'));stack=ET.SubElement(root,'stack')
    with zipfile.ZipFile(R/f'{i}-editable-draft.ora','w')as z:
        z.writestr('mimetype','image/openraster')
        for j,(label,layer)in enumerate(reversed(layers)):
            loc=f'data/{j}.png';z.writestr(loc,png(layer));ET.SubElement(stack,'layer',dict(name=label,src=loc,x='0',y='0',opacity='1.0',visibility='visible',**{'composite-op':'svg:src-over'}))
        z.writestr('stack.xml',ET.tostring(root));z.writestr('mergedimage.png',png(final))
    with zipfile.ZipFile(R/f'{i}-editable-draft.ora')as z:
        reopened=Image.new('RGBA',original.size)
        for el in reversed(list(ET.fromstring(z.read('stack.xml')).find('stack'))):reopened=Image.alpha_composite(reopened,Image.open(io.BytesIO(z.read(el.attrib['src']))).convert('RGBA'))
        assert reopened.tobytes()==final.tobytes()
    out=np.asarray(final)[:,:,:3];colorchanges=np.any(np.asarray(final)!=a,2);assert not colorchanges[scope==0].any()
    for c in components:c['role']='Source connected colour region; not anatomical ownership classification'
    audit.append(dict(pose=i,sourceComponents=components,primaryColourOwnershipBoundary=primary_boundaries[i],ownershipMethod='Source-tinted muscle regions plus native traced lumbar/glute boundary, not certified segmentation',colourLightingMethod='Existing source maximum-channel luminance retained relative to each exact base colour; no new gradient treatment',editableReopenedExact=True,exactPrimaryPixels=int(np.all(out==(123,114,233),2).sum()),exactSecondaryPixels=int(np.all(out==(149,144,224),2).sum()),colourChangeOutsideScope=0,bodyWarpGraftFitting=False,commonCrop=crop,commonPaddingOffset=[20,50],nativeSize=[940,940],reviewStatus='Muscle ownership/native sequence pending'))
(R/'colour-audit.json').write_text(json.dumps(audit,indent=2))
print(json.dumps(audit,indent=2))
