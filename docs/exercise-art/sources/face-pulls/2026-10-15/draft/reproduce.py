"""Portable Face Pulls candidate compositor. Relative originals/layers only.

Pillow and NumPy are required. `--verify` is read-only. `--build` recreates
candidate art in this directory. `--prepare-from-work` is the one-time local
collection of the separately reviewed original/layer inputs. No repo access,
registration, acceptance, production card generator, or progress counter.
"""
from pathlib import Path
from hashlib import sha256
from io import BytesIO
import argparse
import json
import shutil
import zipfile
from xml.etree.ElementTree import Element, SubElement, tostring
import numpy as np
from PIL import Image, features, __version__ as pillow_version

ROOT=Path(__file__).resolve().parent
CROP=(0,72,982,1330)
ORDER=[1,1,4,4,1,1]
RAW={1:('1-master.png','30c17a6d7c4416cb908d6f87ac5fb754bb45cb86116844a953893b761f48f8aa'),4:('4-rope-rejected.png','eb07393aa9a70788874b70bfc48cdab5de143798082cc300d627fd3aeea7c628')}
GEAR={1:'ff3e23beecbbac7e9d2093fc881cae70b57db7e428623585fa697d89b4beabef',4:'bb0590673f7f806106f2aa101fc30edab8ae21885d44fd91437022e3e127120e'}
COLOUR={1:'357dc3d003d7553e0feaafc7a0a5073d0a519b5352bd93353744b768abd6037e',4:'7a3ba87b6fbc4fad1b9c9354cb970ec0cd3a935be851a1ba7ff53b163348666e'}

def digest(path): return sha256(path.read_bytes()).hexdigest()
def pixels(im): return sha256(im.convert('RGBA').tobytes()).hexdigest()
def opened(path): return Image.open(path).convert('RGBA')
def bytes_png(im):
    b=BytesIO();im.save(b,format='PNG');return b.getvalue()

def prepare():
    source=ROOT.parent.parent
    gear_dir=source/'ergonomic-handle-equipment-proposal-v2-20261015'
    colour_dir=source/'colour-only-proposal-20261015'
    for name in ['originals','layers','provenance']:(ROOT/name).mkdir(exist_ok=True)
    rows=[]
    for pose,(raw_name,raw_sha) in RAW.items():
        name='1-start' if pose==1 else '4-finish'
        paths={'original':source/raw_name,'gear':gear_dir/f'{name}-equipment-material-v2-layer.png','colour':colour_dir/f'{pose}-colour-layer.png'}
        expected={'original':raw_sha,'gear':GEAR[pose],'colour':COLOUR[pose]}
        for role,path in paths.items(): assert digest(path)==expected[role],str(path)
        original=opened(paths['original']);gear=opened(paths['gear']);colour=opened(paths['colour'])
        gear_reference=opened(gear_dir/f'{name}-ergonomic-material-v2.png')
        colour_reference=opened(colour_dir/f'{pose}-native-colour-proposal.png')
        assert pixels(Image.alpha_composite(original,gear))==pixels(gear_reference)
        assert pixels(Image.alpha_composite(original,colour))==pixels(colour_reference)
        shutil.copyfile(paths['original'],ROOT/'originals'/raw_name)
        shutil.copyfile(paths['gear'],ROOT/'layers'/f'{pose}-gear.png')
        shutil.copyfile(paths['colour'],ROOT/'layers'/f'{pose}-colour.png')
        rows.append({'pose':pose,'original':f'originals/{raw_name}','originalSha256':raw_sha,'gearLayer':f'layers/{pose}-gear.png','gearLayerSha256':GEAR[pose],'colourLayer':f'layers/{pose}-colour.png','colourLayerSha256':COLOUR[pose],'individualGearCompositeRGBAsha256':pixels(gear_reference),'individualColourCompositeRGBAsha256':pixels(colour_reference),'reviewedGearProposalFileSha256':digest(gear_dir/f'{name}-ergonomic-material-v2.png'),'reviewedColourProposalFileSha256':digest(colour_dir/f'{pose}-native-colour-proposal.png')})
    # Small provenance files only: actual supplied inputs and technique history.
    for path,target in [(gear_dir/'material-v2-preservation-review.json','equipment-material-proof.json'),(colour_dir/'colour-pixel-proof.json','colour-pixel-proof.json'),(colour_dir/'colour-recipe.json','colour-recipe.json'),(source/'DEFERRED.md','historical-service-hold.md')]:
        shutil.copyfile(path,ROOT/'provenance'/target)
    plan={'status':'outside-production-candidate-inputs-not-acceptance','crop':list(CROP),'canvasBefore':[1024,1536],'canvasAfter':[982,1258],'physicalPoses':2,'sourcePoseOrder':ORDER,'excursionPositions':[0,0,1,1,0,0],'referencePose':1,'rows':rows,'scope':'Two intact reach/external-rotation endpoints, repeated honestly across six files. No intermediate or continuous-trajectory claim.','equipmentFinding':'Illustrative authentic ergonomic construction topology, not an exact manufacturer model. Far start free-end/palm support potentially occluded behind unchanged fist; explicitly unresolved as a strict equipment claim.','identity':'Current FA56 bald featureless anatomical model without shorts; no body fitting, grafting, warping or scale change.'}
    (ROOT/'composition-plan.json').write_text(json.dumps(plan,indent=2)+'\n',encoding='utf-8')

def write_ora(path,layers,merged):
    root=Element('image',w=str(merged.width),h=str(merged.height),name='Face Pulls intact two-endpoint candidate')
    stack=SubElement(root,'stack')
    for name in ['colour','gear','source']:
        SubElement(stack,'layer',name={'colour':'Existing muscle fields: colour-only finish','gear':'Ergonomic equipment and rubber material only','source':'Untouched original source'}[name],src=f'data/{name}.png',opacity='1.0',visibility='visible',**{'composite-op':'svg:src-over'})
    with zipfile.ZipFile(path,'w') as z:
        z.writestr('mimetype','image/openraster',compress_type=zipfile.ZIP_STORED)
        z.writestr('stack.xml',tostring(root,encoding='utf-8'),compress_type=zipfile.ZIP_DEFLATED)
        for name,im in layers.items():z.writestr(f'data/{name}.png',bytes_png(im),compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('mergedimage.png',bytes_png(merged),compress_type=zipfile.ZIP_DEFLATED)
    verify_ora(path,merged)

def verify_ora(path,expected):
    with zipfile.ZipFile(path) as z:
        ims={name:opened(BytesIO(z.read(f'data/{name}.png'))) for name in ['source','gear','colour']}
        rebuilt=Image.alpha_composite(Image.alpha_composite(ims['source'],ims['gear']),ims['colour'])
        assert pixels(rebuilt)==pixels(expected),str(path)
        assert pixels(opened(BytesIO(z.read('mergedimage.png'))))==pixels(expected)

def manifest():
    files={str(p.relative_to(ROOT)).replace('\\','/'):digest(p) for p in ROOT.rglob('*') if p.is_file() and p.name not in ['asset-hashes.json'] and '__pycache__' not in p.parts}
    (ROOT/'asset-hashes.json').write_text(json.dumps({'status':'candidate-file-integrity-only-not-qa-acceptance','files':files},indent=2)+'\n',encoding='utf-8')

def run(build):
    plan=json.loads((ROOT/'composition-plan.json').read_bytes())
    assert tuple(plan['crop'])==CROP and plan['sourcePoseOrder']==ORDER
    framed={};rows=[]
    if build:(ROOT/'frames').mkdir(exist_ok=True)
    for row in plan['rows']:
        pose=row['pose']
        for role in ['original','gearLayer','colourLayer']:
            hash_key={'original':'originalSha256','gearLayer':'gearLayerSha256','colourLayer':'colourLayerSha256'}[role]
            assert digest(ROOT/row[role])==row[hash_key],role
        original=opened(ROOT/row['original']);gear=opened(ROOT/row['gearLayer']);colour=opened(ROOT/row['colourLayer'])
        assert original.size==gear.size==colour.size==(1024,1536)
        assert pixels(Image.alpha_composite(original,gear))==row['individualGearCompositeRGBAsha256']
        assert pixels(Image.alpha_composite(original,colour))==row['individualColourCompositeRGBAsha256']
        gear_support=np.array(gear.getchannel('A'))>0;colour_support=np.array(colour.getchannel('A'))>0
        assert not (gear_support&colour_support).any()
        merged=Image.alpha_composite(Image.alpha_composite(original,gear),colour)
        reverse=Image.alpha_composite(Image.alpha_composite(original,colour),gear)
        assert pixels(merged)==pixels(reverse)
        a=np.array(original);b=np.array(merged);changed=np.any(a!=b,axis=2)
        assert not (changed&~(gear_support|colour_support)).any()
        assert np.array_equal(a[:,:,3],b[:,:,3])
        removed=np.ones(a.shape[:2],bool);removed[CROP[1]:CROP[3],CROP[0]:CROP[2]]=False
        maximum=int(b[:,:,:3][removed].max())
        assert maximum<=2,'Proposed crop clips possible foreground'
        frame=merged.crop(CROP);framed[pose]=frame
        layers={'source':original,'gear':gear,'colour':colour}
        if build:
            merged.save(ROOT/f'{pose}-full.png');frame.save(ROOT/f'{pose}-framed.png')
            write_ora(ROOT/f'{pose}-full.ora',layers,merged)
            write_ora(ROOT/f'{pose}-framed.ora',{name:im.crop(CROP) for name,im in layers.items()},frame)
        else:
            assert pixels(opened(ROOT/f'{pose}-full.png'))==pixels(merged)
            assert pixels(opened(ROOT/f'{pose}-framed.png'))==pixels(frame)
            verify_ora(ROOT/f'{pose}-full.ora',merged);verify_ora(ROOT/f'{pose}-framed.ora',frame)
        rows.append({'pose':pose,'individualGearLayerRecreatesReviewedProposalExact':True,'individualColourLayerRecreatesReviewedProposalExact':True,'gearColourAlphaIntersectionPixels':0,'layerOrderCommutesRGBAExact':True,'outsideCombinedSupportRGBAExact':True,'originalAlphaExact':True,'removedRegionMaxRGB':maximum,'cropClipsForegroundAbove2RGB':False,'fullRGBAsha256':pixels(merged),'framedRGBAsha256':pixels(frame),'fullAndFramedORAsReopenedRGBAExact':True})
    frame_rows=[]
    for index,pose in enumerate(ORDER,1):
        path=ROOT/'frames'/f'{index}.webp'
        if build:framed[pose].save(path,format='WEBP',lossless=True,quality=100,method=6,exact=True)
        assert opened(path).size==(982,1258)
        assert pixels(opened(path))==pixels(framed[pose]),str(path)
        assert b'VP8L' in path.read_bytes()[:40],'Expected lossless WebP'
        frame_rows.append({'file':f'frames/{index}.webp','sourcePose':pose,'sha256':digest(path),'decodedRGBAexact':True})
    proof={'status':'candidate-composition-and-reproduction-proof-not-visual-acceptance','pillowVersion':pillow_version,'libwebpVersion':features.version('webp'),'crop':list(CROP),'nativeDimensions':[982,1258],'physicalPoses':2,'sourcePoseOrder':ORDER,'frames':frame_rows,'poses':rows,'noAnatomicalRescaleOrWarp':True,'noRepoRegistrationOrCredit':True}
    if build:
        (ROOT/'composition-proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
        manifest()
    else:
        hashes=json.loads((ROOT/'asset-hashes.json').read_bytes())['files']
        for name,expected in hashes.items():assert digest(ROOT/name)==expected,name
    print(json.dumps({'status':proof['status'],'mode':'build' if build else 'read-only-verify','dimensions':proof['nativeDimensions'],'frames':len(frame_rows),'poses':len(rows),'manifestSha256':digest(ROOT/'asset-hashes.json')},indent=2),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--prepare-from-work',action='store_true');p.add_argument('--build',action='store_true');p.add_argument('--verify',action='store_true');p.add_argument('--refresh-manifest',action='store_true');args=p.parse_args()
    if args.prepare_from_work:prepare()
    if args.refresh_manifest:manifest()
    if args.build or args.verify:run(args.build)
