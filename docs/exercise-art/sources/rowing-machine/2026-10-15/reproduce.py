"""Portable whole-source Rowing palette draft. Pillow+NumPy only.
--build creates one source-preserving palette pass; --verify reads outputs.
No source service/repo access, body/gear transforms or invented motion.
"""
from pathlib import Path
from io import BytesIO
from hashlib import sha256
import argparse,json,zipfile
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image,ImageDraw,__version__ as pillow_version
HERE=Path(__file__).resolve().parent
SIZE=(1536,1024);CROP=(60,90,1476,920);ORDER=[1,2,3,3,2,1];POSITIONS=[0,.5,1,1,.5,0]
EXPECTED={1:'54976c3327f10fcd229c6fbe20225d7c31af877896d1d0a77fc5424fb912466e',2:'c9e9d5359938dfab494dd01d9bbfe6a09d64bd21df669c376fa8bee307579609',3:'b325b7dec503c4c1b2541a636ebc3434791214ac4d6c6e6eb2e6f8ea0db0a046'}
BEATS=[(0,'Catch','Compress with straight arms and vertical shins.'),(.5,'Drive','Push with your legs; keep arms straight.'),(1,'Finish','Lean back slightly; draw handle below ribs.'),(1,'Relax','Stay supported; keep wrists and shoulders relaxed.'),(.5,'Recover','Arms away, then hinge forward before sliding.'),(0,'Reset','Recover twice as slowly as you drive.')]

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

def ora(path,source,colour,expected):
    doc=ET.Element('image',w=str(expected.width),h=str(expected.height),name='Rowing intact whole source + source-tonal palette')
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

def manifest(root):
    paths=[p for folder in ['originals','draft'] for p in (root/folder).rglob('*') if p.is_file()]
    paths += [root/n for n in ['reproduce.py','palette-recipe.json','catalogue.json','source-provenance.json','parent-source-eligibility.json','source-native-review.json','sequence-plan.json','editables-proof.json','README.md','card-preview-proof.json'] if (root/n).is_file()]
    assert all(not p.is_symlink() and not p.is_junction() for p in paths)
    save(root/'candidate-payload-manifest.json',{'status':'curated-three-whole-source-draft-not-acceptance','files':{p.relative_to(root).as_posix():digest(p) for p in sorted(paths)}})
def run(root,build):
    recipe=load(root/'palette-recipe.json');provenance=load(root/'source-provenance.json');catalogue=load(root/'catalogue.json');eligibility=load(root/'parent-source-eligibility.json')
    assert catalogue['id']=='rowing-machine' and catalogue['muscleGroup']=='Cardio' and catalogue['secondaryMuscles']==['Back','Legs','Core']
    assert eligibility['sourceEligible'] is True and eligibility['authoringOnly'] is True and eligibility['completionCredit'] is False
    assert digest(root/'parent-source-eligibility.json')==provenance['parentSourceEligibility']['sha256']
    assert all(0<len(cue.split())<=7 for _,_,cue in BEATS)
    if build:
        assert not (root/'draft').exists(),'One palette pass only; preserve current outputs'
        for name in ['frames','layers','masks']:(root/'draft'/name).mkdir(parents=True)
    images={};poses=[];oras=[]
    for pose in [1,2,3]:
        path=root/f'originals/{pose}-original.png';assert digest(path)==EXPECTED[pose]==provenance['sources'][str(pose)]['sha256']
        prompt=provenance['sources'][str(pose)]['promptMetadata'];assert digest(root/prompt['path'])==prompt['sha256']
        original=opened(path);assert original.size==SIZE
        finished,layer,support,primary,secondary,details=finish(original,pose,recipe);framed=finished.crop(CROP);images[pose]=framed
        outputs={f'draft/{pose}-native.png':finished,f'draft/{pose}-framed.png':framed,f'draft/layers/{pose}-colour-native.png':layer,
                 f'draft/masks/{pose}-existing-colour-support.png':support,f'draft/masks/{pose}-primary-role.png':primary,f'draft/masks/{pose}-secondary-role.png':secondary}
        for relative,im in outputs.items():
            if build:im.save(root/relative)
            else:assert pixel(opened(root/relative))==pixel(im),relative
        for kind,base,overlay,expected in [('native',original,layer,finished),('framed',original.crop(CROP),layer.crop(CROP),framed)]:
            target=root/f'draft/{pose}-{kind}.ora';checked=ora(target,base,overlay,expected) if build else verify_ora(target,expected)
            checked['path']=target.relative_to(root).as_posix();oras.append(checked)
        poses.append({'pose':pose,'sourceSha256':EXPECTED[pose],'nativeSize':list(SIZE),'wholeSceneTranslation':[0,0],'wholeSceneScale':1,
                      'allSourceRgbaOutsideExistingColourSupportExact':True,'sourceAlphaExact':True,'colour':details,'bodyLocalTransforms':0,'equipmentEdits':0})
    encoded={};frames=[]
    for number,pose in enumerate(ORDER,1):
        path=root/f'draft/frames/{number}.webp'
        if build:
            if pose not in encoded:
                stream=BytesIO();images[pose].save(stream,format='WEBP',lossless=True,quality=100,method=6,exact=True);encoded[pose]=stream.getvalue()
            path.write_bytes(encoded[pose])
        assert b'VP8L' in path.read_bytes()[:40] and pixel(opened(path))==pixel(images[pose])
        frames.append({'path':path.relative_to(root).as_posix(),'sourcePose':pose,'sha256':digest(path),'decodedRgbaExact':True})
    plan={'exerciseId':'rowing-machine','name':catalogue['name'],'version':'anatomy-v3-2026-10-15-retained-whole-trio-rowing-v1',
          'physicalPoses':3,'sourcePoseOrder':ORDER,'positions':POSITIONS,'registeredCanvas':list(SIZE),'commonCrop':list(CROP),'dimensions':[1416,830],
          'primary':['Quads','Upper back'],'secondary':['Hamstrings','Biceps'],'cataloguePrimary':catalogue['muscleGroup'],'catalogueSecondary':catalogue['secondaryMuscles'],
          'activationRoles':'Specific existing source activation shown for the catalogue Cardio exercise, as other Cardio guides. No neutral Core is painted.',
          'setup':catalogue['instructions'][:1],'techniqueInstructions':catalogue['instructions'],
          'beats':[{'t':t,'label':label,'cue':cue} for t,label,cue in BEATS],'frameHashes':{f['path']:f['sha256'] for f in frames},'referenceFrame':3,
          'scope':'Three intact physical states, repeated six paths with endpoint cuts. Legs-first straight-arm drive then body swing/handle pull and reverse recovery are taught; no invented or calibrated smooth intermediate trajectory.',
          'timing':'Teaching slots only. Catalogue smooth2:1 return-to-drive instruction retained as prose; six equal playback slots do not certify actual rowing cadence.',
          'findings':eligibility['findings'],'finalPaletteReviewed':False,'registeredReviewComplete':False,'strictCertified':False,'completionCredit':False}
    proof={'status':'one-pass-three-whole-source-palette-integrity-not-visual-acceptance','exerciseId':'rowing-machine','pillowVersion':pillow_version,
           'sourcePoseOrder':ORDER,'sourceNativeDimensions':list(SIZE),'commonCrop':list(CROP),'dimensions':[1416,830],'poses':poses,'frames':frames,
           'openRasterChecks':oras,'allSixORAsReopenedRgbaExact':True,'canonicalBases':{'primary':'#7B72E9','secondary':'#9590E0'},
           'bodyLocalTransforms':0,'equipmentEdits':0,'neutralCoreNotPainted':True,'newImageRequests':0,'repoChanges':0,'strictCertified':False,'completionCredit':False}
    if build:
        save(root/'sequence-plan.json',plan);save(root/'editables-proof.json',proof)
        (root/'README.md').write_text('# Rowing Machine retained whole-source draft\n\nThree exact retained landscape sources: catch, straight-arm leg drive, pulled finish. Root accepted source eligibility under owner findings after direct native review. Visible residual finish knee flexion is retained; no locked/straight/perfect-leg claim or strict certification.\n\nOnly original chromatic muscle fields are mapped to primary/secondary canonical bases using original maximum-channel brightness and chroma. Editable semantic role traces preserve actual quads/upper-back versus hamstrings/biceps fields; neutral Core is not painted. No source body or gear pixel is transformed. Common crop[60,90,1476,920] yields1416x830; all source scenes keep identity placement on1536x1024. Historical catch-master framing is disclosed separately.\n\nSix lossless paths reuse sourceorder[1,2,3,3,2,1]. These are endpoint cuts, not generated interpolation or calibrated rowing cadence. Six two-layer OpenRaster documents preserve intact source plus editable colour layers.\n\nPortable reproduction: copy this small payload to a fresh directory excluding draft/ and generated plan/proof/manifest, then run python -B reproduce.py --build with Pillow and NumPy. Use --verify for read-only pixel/source/layer checks and --refresh-manifest only after a separately reviewed normal card preview. No repository or external service access.\n\nNative palette, actual player/mobile, final registration, project, CI and merge acceptance remain separate. No completion credit.\n',encoding='utf8')
        manifest(root)
    else:
        assert load(root/'sequence-plan.json')==plan
        assert all(digest(root/p)==v for p,v in load(root/'candidate-payload-manifest.json')['files'].items())
    print(json.dumps({'mode':'build' if build else 'verify','candidate':str(root),'physicalPoses':3,'paths':6,'ORAs':6,'dimensions':[1416,830],'manifestSha256':digest(root/'candidate-payload-manifest.json'),'finalAcceptance':False},indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output-dir',type=Path,default=HERE);m=p.add_mutually_exclusive_group(required=True)
    m.add_argument('--build',action='store_true');m.add_argument('--verify',action='store_true');m.add_argument('--refresh-manifest',action='store_true');args=p.parse_args()
    if args.refresh_manifest:manifest(args.output_dir.resolve())
    else:run(args.output_dir.resolve(),args.build)
