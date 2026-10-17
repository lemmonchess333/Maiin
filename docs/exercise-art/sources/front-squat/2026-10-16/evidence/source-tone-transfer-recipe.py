"""One bounded correction of colour transfer, without new spatial shading.

Old finish attenuated even neutral highlights by targetBlue/255 and added a
median-derived contour layer. Here source-neutral pixels remain byte exact;
only original violet pixels use a continuous saturation-weighted target tint.
"""
from pathlib import Path
from io import BytesIO
import hashlib,json,shutil,zipfile
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
P=Path(__file__).resolve().parent
OLD=P/'candidate';NEW=P/'candidate-source-tone-v2'
assert not NEW.exists()
shutil.copytree(OLD,NEW,ignore=shutil.ignore_patterns('draft','candidate-payload-manifest.json'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf8')
rows=[]
for label in ['A','B']:
    raw=np.array(Image.open(NEW/f'originals/{label}-original.png').convert('RGBA'))
    rgb=raw[:,:,:3].astype(float);maximum=rgb.max(2)
    r,g,b=rgb.transpose(2,0,1)
    # Same existing ownership fields, never redrawn muscle contours.
    masks={}
    with zipfile.ZipFile(NEW/f'originals/{label}-existing-colour-layers.ora') as z:
        for l in ET.fromstring(z.read('stack.xml')).find('stack'):
            if l.attrib['name'].startswith(('Primary','Secondary')):
                masks[l.attrib['name'].split()[0]]=np.array(Image.open(BytesIO(z.read(l.attrib['src']))).convert('RGBA'))[:,:,3]>0
    scope=np.zeros(maximum.shape,bool);scope[220:820,625:950]=True
    original_violet=(b-np.minimum(r,g)>7)&scope
    final=raw.copy()
    # Source maximum-channel neutralisation is only applied inside violet
    # support, as authorised; it does not claim recovered pre-tint shading.
    final[original_violet,:3]=np.rint(np.repeat(maximum[:,:,None],3,axis=2)[original_violet]).astype('uint8')
    saturation=(maximum-rgb.min(2))/np.maximum(maximum,1)
    counts={}
    for role,col,ref in [('Primary',(123,114,233),.75),('Secondary',(149,144,224),.35)]:
        use=original_violet&masks[role]
        amount=np.clip(saturation/ref,0,1)
        tint=maximum[:,:,None]*(1-amount[:,:,None]*(1-np.array(col)[None,None,:]/255))
        final[use,:3]=np.rint(tint[use]).clip(0,255).astype('uint8')
        counts[role]=int(use.sum())
    changed=np.any(final!=raw,axis=2)
    assert not np.any(changed&~original_violet)
    assert not np.any(changed[835:930,640:910])
    overlay=np.zeros_like(raw);overlay[changed]=final[changed]
    Image.fromarray(final).save(NEW/f'originals/{label}-source-tone-finish.png')
    Image.fromarray(overlay).save(NEW/f'originals/{label}-source-tone-overlay.png')
    Image.fromarray((original_violet*255).astype('uint8')).save(NEW/f'originals/{label}-source-violet-support.png')
    rows.append({'label':label,'changedPixels':int(changed.sum()),'sourceVioletPixels':int(original_violet.sum()),
                 'changedOutsideSourceViolet':0,'sourceNeutralRgbaExact':True,'sourceTrainersRgbaExact':True,
                 'ownershipPixelCounts':counts,'spatialShadingAdded':False,'anatomicalTransforms':0})
recipe=(NEW/'reproduce.py').read_text(encoding='utf8')
recipe=recipe.replace('existing-colour-overlay.png','source-tone-overlay.png').replace('existing-colour-finish.png','source-tone-finish.png')
recipe=recipe.replace('Existing quadriceps primary and glutes/core secondary colour finish','Quadriceps primary and glutes/core secondary: continuous source-tone transfer')
(NEW/'reproduce.py').write_text(recipe,encoding='utf8')
shutil.copyfile(Path(__file__),NEW/'evidence/source-tone-transfer-recipe.py')
save(NEW/'evidence/source-tone-transfer-proof.json',{'status':'native-review-pending','rows':rows,
    'formula':'sourceMaximum * (1 - saturationAmount * (1 - exactTargetRGB/255))',
    'targets':{'primary':'#7B72E9','secondary':'#9590E0'},
    'shadeSupport':'Per-pixel source maximum and saturation only; no spatial gradient, invented detail layer or body coordinate change.',
    'previousRecipePreserved':True,'newImageRequests':0,'completionCredit':False})
plan=json.loads((NEW/'sequence-plan.json').read_bytes());plan.pop('frameHashes',None)
plan['version']='anatomy-v3-2026-10-16-worn-reference-harness-source-tone-v1'
plan['findings']=[x for x in plan['findings'] if not x.startswith('Existing source colour finish')]
plan['findings'].insert(-1,'Original neutral source pixels remain exact; original violet fields use the exact target bases and per-pixel source tone. Neutralised source tint is not recovered pre-tint anatomy.')
save(NEW/'sequence-plan.json',plan)
save(NEW/'evidence/input-hashes.json',{p.relative_to(NEW).as_posix():sha(p) for folder in ['originals','equipment','evidence'] for p in sorted((NEW/folder).rglob('*')) if p.is_file() and p.name!='input-hashes.json'})
print(json.dumps({'candidate':str(NEW),'sourceToneProof':rows,'registered':False}))
