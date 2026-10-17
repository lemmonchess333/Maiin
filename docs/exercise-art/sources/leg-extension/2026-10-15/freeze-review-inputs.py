"""Pin the completed single material attempt; no art or prior-package writes."""
from pathlib import Path
import difflib
import hashlib
import json
import numpy as np
from PIL import Image

HERE=Path(__file__).resolve().parent
PRIOR=HERE.parent/'endpoint-common-camera-production-20261015'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest_path=HERE/'input-provenance.json'
manifest=json.loads(manifest_path.read_bytes())
manifest['portableWorkingUnitSource']['previousPathOnlyChanges']=manifest['portableWorkingUnitSource']['changes']
manifest['portableWorkingUnitSource']['changes']='Only the prior package input/output root adaptation and new RGB material renderer; all geometry, camera, vertices, cylinder dimensions and depth guards remain exact.'
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
repro=(HERE/'reproduce.py').read_text(encoding='utf-8')
old=(PRIOR/'reproduce.py').read_text(encoding='utf-8')
patch=''.join(difflib.unified_diff(old.splitlines(keepends=True),repro.splitlines(keepends=True),fromfile='previous/reproduce.py',tofile='material/reproduce.py'))
(HERE/'package-material-only.patch').write_text(patch,encoding='utf-8',newline='\n')
revision_path=HERE/'bounded-revision.json'
revision=json.loads(revision_path.read_bytes())
revision['initialPreparedReproduceSha256']=revision['materialReproduceSha256']
revision['materialReproduceSha256']=sha(HERE/'reproduce.py')
revision['packagePatchSha256']=sha(HERE/'package-material-only.patch')
revision['postPreparationMetadataNote']='One additional fail-closed check pins all derived alpha/geometry/material input hashes before the actual first render. The final patch and code SHA include that check.'
revision['status']='single-material-attempt-rendered-independent-review-pending'
revision_path.write_text(json.dumps(revision,indent=2)+'\n',encoding='utf-8',newline='\n')
for rel,row in manifest['inputs'].items():
    assert sha(HERE/rel)==row['sha256']
    assert sha(Path(row['source']))==row['sourceSha256']
proof=json.loads((HERE/'construction-and-preservation-proof.json').read_bytes())
assert all(proof['materialOnlyPreservation'][k] is True for k in ['allWorkingUnitWorldGeometryExact','allStaticWorldGeometryExact','cameraExact','allWorkingUnitAlphaMasksExact','staticRawAlphaExact','cropAndBodyPlacementExact'])
for pose in [1,4]:
    # The colour mapping only changes original tint. Original trainers, neutral
    # body, seat and source frame stay exact wherever reviewed gear is absent.
    original=np.array(Image.open(HERE/f'inputs/{pose}-source-kept-base.png').convert('RGBA'))
    colour=np.array(Image.open(HERE/f'draft/{pose}-source-tonal-colour-layer.png').convert('RGBA'))
    contour=np.array(Image.open(HERE/f'inputs/{pose}-retained-coloured-contour-layer.png').convert('RGBA'))
    gear=[np.array(Image.open(HERE/path).convert('RGBA')) for path in [f'draft/{pose}-fixed-covered-housings-depth.png',f'working-unit/{pose}-equipment-back.png',f'working-unit/{pose}-equipment-front-with-existing-depth.png']]
    keep=(colour[:,:,3]==0)&(contour[:,:,3]==0)
    for layer in gear:keep&=layer[:,:,3]==0
    final=np.array(Image.open(HERE/f'draft/{pose}-native.png').convert('RGBA'))
    assert np.array_equal(final[keep],original[keep])
files=[p for directory in ['inputs','draft','working-unit'] for p in (HERE/directory).rglob('*') if p.is_file()]
files += [HERE/name for name in ['material_finish.py','construct-working-unit.py','reproduce.py','input-provenance.json','catalogue.json','sequence-plan.json','construction-and-preservation-proof.json','bounded-revision.json','working-unit-material-only.patch','package-material-only.patch']]
report={'status':'single-material-attempt-frozen-independent-style-review-pending','exerciseId':'leg-extension','reviewedInputs':{p.relative_to(HERE).as_posix():sha(p) for p in sorted(files)},'preservation':proof['materialOnlyPreservation'],'colourStats':{pose:row['sourceTonalColourMapping'] for pose,row in proof['poses'].items()},'authorNativeObservation':'Viewed both finished framed poses once. Quads now show the original fine tonal striation; housing edges and metal surfaces now carry neutral contour, reflected light and fine source-frame grain. Source body, grip, foot/shin contact and apparatus silhouette remain as the prior construction. This observation is not an independent style acceptance.','independentReview':None,'nativeUiOrMobileReview':None,'styleAccepted':None,'newImageRequests':0,'productionChanges':False,'releaseApproved':False,'completionCredit':False,'stopRule':'No more material iterations under this task. Independent review chooses ready or hold.'}
(HERE/'material-attempt-review-inputs.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'frozenFiles':len(files),'reviewInputSha256':sha(HERE/'material-attempt-review-inputs.json'),'independentStyleAcceptance':None,'artChangesAfterSingleRender':0}))
