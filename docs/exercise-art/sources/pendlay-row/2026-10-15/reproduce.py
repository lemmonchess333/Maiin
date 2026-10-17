"""Portable Pendlay retained-pair palette draft. Pillow+NumPy only.

--build creates one palette pass; --verify reads it without writing.
--refresh-manifest only reindexes the small explicitly curated payload.
No body/equipment geometry edits, source service calls or repository access.
"""
from pathlib import Path
from io import BytesIO
from hashlib import sha256
import argparse
import json
import zipfile
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image, ImageDraw, __version__ as pillow_version

HERE=Path(__file__).resolve().parent
SIZE=(1536,1056)
CROP=(200,90,1380,982)
ORDER=[1,1,4,4,1,1]
EXPECTED={1:'c8f6f4906986e99c1e2d44b99d5b5ea6dfe97b781edd9aa83c33aee49c7a6f3d',
          4:'5d3097bac7a113f68f877643beb8bf6da94db97e42db7719033463a0d93e60cc'}
BEATS=[(0,'Set','Brace flat-backed with the bar over midfoot.'),
       (0,'Brace','Keep your torso low and feet planted.'),
       (1,'Row','Row the bar toward your lower chest.'),
       (1,'Squeeze','Draw elbows back; squeeze your shoulder blades.'),
       (0,'Lower','Lower under control to a dead stop.'),
       (0,'Reset','Keep feet planted; brace before each row.')]

def digest(path):return sha256(path.read_bytes()).hexdigest()
def load(path):return json.loads(path.read_bytes())
def opened(path):return Image.open(path).convert('RGBA')
def pixel(im):return sha256(im.convert('RGBA').tobytes()).hexdigest()
def png(im):
    b=BytesIO();im.save(b,format='PNG');return b.getvalue()
def save(path,value):path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def finish(original,pose,recipe):
    a=np.array(original);rgb=a[:,:,:3].astype(float);r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    roi=np.zeros(r.shape,bool);x0,y0,x1,y1=recipe['sourceColourRoi'];roi[y0:y1,x0:x1]=True
    rules=recipe['supportRules']
    support=roi&(b-r>=rules['bMinusRMin'])&(b-g>=rules['bMinusGMin'])&(r-g>=rules['rMinusGMin'])
    trace=Image.new('L',(1536*4,1024*4));draw=ImageDraw.Draw(trace)
    for polygon in recipe['primaryRoleTraces'][str(pose)]:
        draw.polygon([(x*4,y*4) for x,y in polygon],fill=255)
    trace=trace.resize((1536,1024),Image.Resampling.LANCZOS)
    weight=np.array(trace,dtype=float)/255;weight[~support]=0
    maximum=rgb.max(2);chroma=(maximum-g)/np.maximum(maximum,1)
    neutral=maximum[:,:,None]
    primary=np.asarray(recipe['primary'],float);secondary=np.asarray(recipe['secondary'],float)
    pc=neutral+(primary*maximum[:,:,None]/255-neutral)*np.minimum(chroma/recipe['sourceTintStrengthDenominators']['primary'],1)[:,:,None]
    sc=neutral+(secondary*maximum[:,:,None]/255-neutral)*np.minimum(chroma/recipe['sourceTintStrengthDenominators']['secondary'],1)[:,:,None]
    mapped=pc*weight[:,:,None]+sc*(1-weight[:,:,None])
    edited=a.copy();edited[support,:3]=np.rint(np.clip(mapped[support],0,255)).astype('uint8')
    assert np.array_equal(edited[~support],a[~support]) and np.array_equal(edited[:,:,3],a[:,:,3])
    layer=np.zeros_like(a);layer[support]=edited[support];layer[support,3]=255
    primary_mask=np.rint(weight*255).astype('uint8')
    secondary_mask=np.where(support,255-primary_mask,0).astype('uint8')
    im=Image.fromarray(edited);colour=Image.fromarray(layer)
    assert pixel(Image.alpha_composite(original,colour))==pixel(im)
    changed=np.any(edited!=a,axis=2)
    details={'sourceColourPixels':int(support.sum()),'changedRgbPixels':int(changed.sum()),
             'primaryLabelPixelsAboveHalf':int((weight>.5).sum()),'secondaryLabelPixelsAboveHalf':int((support&(weight<=.5)).sum()),
             'allNeutralAndEquipmentPixelsOutsideSourceChromaRgbaExact':True,'originalAlphaExact':True,
             'noNewSpatialBodyGradient':True,'noNewBodyMuscleField':True,
             'primarySourceTonalUniqueRgb':int(len(np.unique(edited[weight>.5,:3],axis=0))),
             'sourceTintStrengthDenominators':recipe['sourceTintStrengthDenominators'],
             'sourceRoleTraceIsEditableAndRequiresNativeReview':True}
    return im,colour,Image.fromarray((support*255).astype('uint8')),Image.fromarray(primary_mask),Image.fromarray(secondary_mask),details

def placed(im,pose,transparent=False):
    out=Image.new('RGBA',SIZE,(0,0,0,0 if transparent else 255))
    out.paste(im,(0,32 if pose==1 else 0));return out

def ora(path,source,colour,expected):
    doc=ET.Element('image',w=str(expected.width),h=str(expected.height),name='Pendlay intact source + source-tonal palette')
    stack=ET.SubElement(doc,'stack')
    for key,name in [('colour','Existing source colour fields only: editable canonical palette'),('source','Intact original: integer whole-scene placement only')]:
        ET.SubElement(stack,'layer',name=name,src=f'data/{key}.png',x='0',y='0',opacity='1',visibility='visible',**{'composite-op':'svg:src-over'})
    members={'mimetype':b'image/openraster','stack.xml':ET.tostring(doc,encoding='utf-8'),
             'data/source.png':png(source),'data/colour.png':png(colour),'mergedimage.png':png(expected)}
    with zipfile.ZipFile(path,'x') as z:
        for name,data in members.items():
            info=zipfile.ZipInfo(name,(2026,10,15,0,0,0));info.compress_type=zipfile.ZIP_STORED if name=='mimetype' else zipfile.ZIP_DEFLATED
            z.writestr(info,data)
    return verify_ora(path,expected)

def verify_ora(path,expected):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None and len(z.namelist())==len(set(z.namelist()))==5
        source=opened(BytesIO(z.read('data/source.png')));colour=opened(BytesIO(z.read('data/colour.png')))
        assert pixel(Image.alpha_composite(source,colour))==pixel(expected)==pixel(opened(BytesIO(z.read('mergedimage.png'))))
        return {'path':str(path.name),'sha256':digest(path),'dimensions':list(expected.size),'layers':2,
                'reopenedRgbaExact':True,'members':{name:sha256(z.read(name)).hexdigest() for name in z.namelist()}}

def refresh_manifest(root):
    paths=[p for directory in ['draft','originals'] for p in (root/directory).rglob('*') if p.is_file()]
    paths += [root/name for name in ['reproduce.py','palette-recipe.json','catalogue.json','source-provenance.json',
              'parent-source-eligibility.json','sequence-plan.json','editables-proof.json','README.md','card-preview-proof.json'] if (root/name).is_file()]
    assert all(not p.is_symlink() and not p.is_junction() for p in paths)
    save(root/'candidate-payload-manifest.json',{'status':'curated-candidate-inputs-not-acceptance',
         'scope':'Two intact originals, exact prompt metadata/current identity review reference, palette recipe, four layered ORAs, six paths and minimal proofs. No runtime cache or dependency bundles.',
         'files':{p.relative_to(root).as_posix():digest(p) for p in sorted(paths)}})

def run(root,build):
    recipe=load(root/'palette-recipe.json');provenance=load(root/'source-provenance.json');catalogue=load(root/'catalogue.json')
    eligibility=load(root/'parent-source-eligibility.json')
    assert eligibility['sourceEligible'] is True and eligibility['finalPaletteReviewed'] is False
    assert digest(root/'parent-source-eligibility.json')==provenance['parentSourceEligibility']['sha256']
    assert digest(root/'palette-recipe.json')==provenance['paletteRecipeSha256']
    assert catalogue['id']=='pendlay-row' and catalogue['muscleGroup']=='Lats'
    assert catalogue['secondaryMuscles']==['Rhomboids','Rear Delts','Biceps','Core']
    assert all(len(cue.split())<=7 for _,_,cue in BEATS)
    if build:
        assert not (root/'draft').exists(),'One palette build only; preserve previous output before any separate authorized correction.'
        for rel in ['draft/frames','draft/layers','draft/masks']:(root/rel).mkdir(parents=True)
    frames={};proof=[];oras=[]
    for pose in [1,4]:
        path=root/f'originals/{pose}-original.png';assert digest(path)==EXPECTED[pose]==provenance['sources'][str(pose)]['sha256']
        prompt=root/provenance['sources'][str(pose)]['promptMetadata']['path']
        assert digest(prompt)==provenance['sources'][str(pose)]['promptMetadata']['sha256']
        original=opened(path);assert original.size==(1536,1024)
        native,layer,support,primary,secondary,details=finish(original,pose,recipe)
        source_registered=placed(original,pose);layer_registered=placed(layer,pose,True);full=placed(native,pose)
        assert pixel(Image.alpha_composite(source_registered,layer_registered))==pixel(full)
        offset=32 if pose==1 else 0
        assert np.array_equal(np.asarray(source_registered)[offset:offset+1024],np.asarray(original))
        cropped=full.crop(CROP);frames[pose]=cropped
        outputs={f'draft/{pose}-native-finished.png':native,f'draft/{pose}-native.png':full,f'draft/{pose}-framed.png':cropped,
                 f'draft/layers/{pose}-colour-native.png':layer,f'draft/layers/{pose}-colour-registered.png':layer_registered,
                 f'draft/masks/{pose}-existing-colour-support.png':support,f'draft/masks/{pose}-primary-role.png':primary,
                 f'draft/masks/{pose}-secondary-role.png':secondary}
        for rel,im in outputs.items():
            if build:im.save(root/rel)
            else:assert pixel(opened(root/rel))==pixel(im),rel
        for kind,base,overlay,expected in [('native',source_registered,layer_registered,full),('framed',source_registered.crop(CROP),layer_registered.crop(CROP),cropped)]:
            p=root/f'draft/{pose}-{kind}.ora'
            check=ora(p,base,overlay,expected) if build else verify_ora(p,expected)
            check['path']=p.relative_to(root).as_posix();oras.append(check)
        proof.append({'pose':pose,'sourceSha256':EXPECTED[pose],'nativeSize':[1536,1024],'wholeSceneTranslation':[0,offset],
                      'allOriginalSourceRgbaAtIntegerPlacementExact':True,'colour':details,'humanLocalTransforms':0,'equipmentEdits':False})
    encoded={};frame_rows=[]
    for n,pose in enumerate(ORDER,1):
        path=root/f'draft/frames/{n}.webp'
        if build:
            if pose not in encoded:
                b=BytesIO();frames[pose].save(b,format='WEBP',lossless=True,quality=100,method=6,exact=True);encoded[pose]=b.getvalue()
            path.write_bytes(encoded[pose])
        assert b'VP8L' in path.read_bytes()[:40] and pixel(opened(path))==pixel(frames[pose])
        frame_rows.append({'path':path.relative_to(root).as_posix(),'sourcePose':pose,'sha256':digest(path),'decodedRgbaExact':True})
    plan={'exerciseId':'pendlay-row','name':catalogue['name'],'version':'anatomy-v3-2026-10-15-retained-whole-pair-pendlay-v1',
          'physicalPoses':2,'sourcePoseOrder':ORDER,'positions':[0,0,1,1,0,0],'commonCrop':list(CROP),'registeredCanvas':list(SIZE),
          'dimensions':[1180,892],'primary':['Lats'],'secondary':catalogue['secondaryMuscles'],'setup':catalogue['instructions'][:2],
          'beats':[{'t':t,'label':label,'cue':cue} for t,label,cue in BEATS],
          'frameHashes':{row['path']:row['sha256'] for row in frame_rows},'referenceFrame':3,
          'scope':'Two real whole source endpoints repeated honestly. Only an integer whole-scene placement/common crop and existing-colour finishing; no local body/equipment changes.',
          'findings':eligibility['findings'],'finalPaletteReviewed':False,'registeredReviewComplete':False,'strictCertified':False,'completionCredit':False}
    integrity={'status':'one-pass-palette-and-editable-integrity-not-visual-acceptance','exerciseId':'pendlay-row','pillowVersion':pillow_version,
               'sourceNativeDimensions':[1536,1024],'registeredCanvas':list(SIZE),'commonCrop':list(CROP),'dimensions':[1180,892],
               'sourcePoseOrder':ORDER,'poses':proof,'frames':frame_rows,'openRasterChecks':oras,'allFourORAsReopenedRgbaExact':True,
               'canonicalBases':{'primary':'#7B72E9','secondary':'#9590E0'},'neutralBicepsCoreNotPainted':True,
               'bodyLocalTransforms':0,'equipmentEdits':0,'newImageRequests':0,'repoChanges':0,'strictCertified':False,'completionCredit':False}
    if build:
        save(root/'sequence-plan.json',plan);save(root/'editables-proof.json',integrity)
        (root/'README.md').write_text('# Pendlay retained whole-pair palette draft\n\nTwo successful original whole1536x1024 sources, exact historical prompt metadata and the current FA56 review reference are retained. Historical output drift notes remain unchanged; the parent independently accepted this specific reverse-derived wider-grip pair for colour/integration with findings.\n\nOnly existing chromatic fields are remapped using original per-pixel brightness/chroma and editable semantic lat traces. Neutral Biceps/Core are not painted. Four OpenRaster documents keep intact source and editable palette layers. Whole source1 is placed at(0,+32), source4 at(0,0) on1536x1056; crop[200,90,1380,982] yields1180x892. No local anatomical/equipment fitting, warps or grafts.\n\nFor reproduction, copy this small payload to a fresh directory excluding generated draft/, then run `python -B reproduce.py --build`. Requires Pillow and NumPy. Use `--verify` for read-only pixel/ORA/source checks. `--refresh-manifest` reindexes only curated payload after the normal card preview is separately supplied.\n\nSource order[1,1,4,4,1,1] repeats two actual endpoints. Mild source head/torso/stance and far-grip variation remain. Palette/native/mobile/registration/project/CI/merge gates remain separate; no final acceptance or strict certification is inferred.\n',encoding='utf-8')
        refresh_manifest(root)
    else:
        assert load(root/'sequence-plan.json')==plan
        manifest=load(root/'candidate-payload-manifest.json')
        assert all(digest(root/p)==v for p,v in manifest['files'].items())
    print(json.dumps({'mode':'build' if build else 'verify','candidate':str(root),'physicalPoses':2,'frames':6,'ORAs':4,
                      'dimensions':[1180,892],'manifestSha256':digest(root/'candidate-payload-manifest.json'),'finalAcceptance':False},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output-dir',type=Path,default=HERE)
    mode=p.add_mutually_exclusive_group(required=True);mode.add_argument('--build',action='store_true');mode.add_argument('--verify',action='store_true');mode.add_argument('--refresh-manifest',action='store_true')
    args=p.parse_args();root=args.output_dir.resolve()
    if args.refresh_manifest:refresh_manifest(root)
    else:run(root,args.build)
