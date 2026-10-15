"""Prepare exactly one separate material-only revision of the held package."""
from pathlib import Path
import difflib
import hashlib
import json
import shutil
import numpy as np
from PIL import Image, ImageFilter

HERE=Path(__file__).resolve().parent
PRIOR=HERE.parent/'endpoint-common-camera-production-20261015'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
shutil.copytree(PRIOR/'inputs',HERE/'inputs')
shutil.copyfile(PRIOR/'catalogue.json',HERE/'catalogue.json')
manifest=json.loads((PRIOR/'input-provenance.json').read_bytes())
manifest['materialRevision']='One parent-authorized RGB-only equipment/body-colour finish after prior style HOLD; geometry, camera, pixel coordinates and depth masks are unchanged.'
manifest['priorPackage']={'root':str(PRIOR),'constructionProofSha256':sha(PRIOR/'construction-and-preservation-proof.json'),'sequencePlanSha256':sha(PRIOR/'sequence-plan.json')}
manifest.pop('reviewedWorkingUnitFrontRgbaHashes',None)
manifest.pop('reviewedWorkingUnitPinMeaning',None)
extra={}
for pose in [1,4]:
    for suffix in ['equipment-back','equipment-front-with-existing-depth','equipment-front-unoccluded']:
        source=PRIOR/f'working-unit/{pose}-{suffix}.png'
        destination=HERE/f'inputs/prior-{pose}-{suffix}-alpha.png'
        Image.open(source).convert('RGBA').getchannel('A').save(destination)
        extra[destination.relative_to(HERE).as_posix()]={'sha256':sha(destination),'derivedFrom':str(source),'sourceSha256':sha(source),'operation':'Exact original alpha channel only; no RGB or geometry change.'}
for source,name in [(PRIOR/'working-unit/construction-proof.json','prior-working-unit-proof.json'),(PRIOR/'construction-and-preservation-proof.json','prior-complete-construction-proof.json'),(PRIOR/'sequence-plan.json','prior-sequence-plan.json')]:
    destination=HERE/'inputs'/name;shutil.copyfile(source,destination)
    extra[destination.relative_to(HERE).as_posix()]={'sha256':sha(destination),'source':str(source),'sourceSha256':sha(source)}
source=PRIOR/'draft/fixed-covered-housings-and-chassis-unoccluded.png'
destination=HERE/'inputs/prior-static-alpha.png'
Image.open(source).convert('RGBA').getchannel('A').save(destination)
extra[destination.relative_to(HERE).as_posix()]={'sha256':sha(destination),'derivedFrom':str(source),'sourceSha256':sha(source),'operation':'Exact original static gear alpha channel.'}
source=Image.open(HERE/'inputs/1-original.png').convert('RGB')
patch=source.crop((830,760,842,800)).convert('L')
high=np.array(patch,dtype=float)-np.array(patch.filter(ImageFilter.GaussianBlur(1.5)),dtype=float)
high=np.rint(np.clip(high,-4,4)+128).astype('uint8')
destination=HERE/'inputs/source-metal-highpass.png';Image.fromarray(high).save(destination)
extra[destination.relative_to(HERE).as_posix()]={'sha256':sha(destination),'derivedFrom':'inputs/1-original.png','sourceSha256':sha(HERE/'inputs/1-original.png'),'sourceRoi':[830,760,842,800],'operation':'Source neutral polished-frame luminance high-pass, clamp±4 levels; equipment material only.'}
manifest['derivedMaterialInputs']=extra
# Keep the original geometry code exact apart from its render function body.
old=(PRIOR/'construct-working-unit.py').read_text(encoding='utf-8')
start=old.index('def render(faces):\n');end=old.index('\nassert np.allclose',start)
replacement='def render(faces):\n    from material_finish import render as shade_material\n    return shade_material(faces,SIZE,AA,project)\n'
new=old[:start]+replacement+old[end:]
assert new[:start]==old[:start] and new[new.index('\nassert np.allclose'):]==old[end:]
(HERE/'construct-working-unit.py').write_text(new,encoding='utf-8',newline='\n')
manifest['portableWorkingUnitSource']['portableSha256']=sha(HERE/'construct-working-unit.py')
manifest['portableWorkingUnitSource']['materialChangeOnly']='Previous working-unit source, only render function replaced. Geometry/camera/coordinates/cylinder/depth code before/after remain exact.'
old_repro=(PRIOR/'reproduce.py').read_text(encoding='utf-8')
repro=old_repro.replace('from PIL import Image\n','from PIL import Image\nfrom material_finish import colour_finish\n')
needle="    colour=Image.open(INPUTS/f'{pose}-exact-palette-layer.png').convert('RGBA')\n"
assert needle in repro
repro=repro.replace(needle,"    colour,colour_details=colour_finish(base,Image.open(INPUTS/f'{pose}-exact-palette-layer.png'))\n    colour.save(DRAFT/f'{pose}-source-tonal-colour-layer.png')\n")
start=repro.index('    expected_front=manifest.get(');end=repro.index("    scene.save(DRAFT/f'{pose}-native.png')",start)
repro=repro[:start]+"    assert np.array_equal(np.asarray(front)[:,:,3],np.asarray(Image.open(INPUTS/f'prior-{pose}-equipment-front-with-existing-depth-alpha.png')))\n"+repro[end:]
repro=repro.replace("'reviewedColourLayerByteIdentity':sha(INPUTS/f'{pose}-exact-palette-layer.png')", "'sourceColourSupportReferenceSha256':sha(INPUTS/f'{pose}-exact-palette-layer.png'),'sourceTonalColourMapping':colour_details,'newColourLayerSha256':sha(DRAFT/f'{pose}-source-tonal-colour-layer.png')")
repro=repro.replace("'Existing chromatic fields: exact approved primary and secondary'", "'Existing chromatic fields: canonical palette with original max-channel/chroma shading'")
repro=repro.replace("'anatomy-v3-2026-10-15-common-camera-endpoint-leg-extension-v1'", "'anatomy-v3-2026-10-15-material-endpoint-leg-extension-v1'")
start=repro.index('bounds=[]\n');end=repro.index('editables={}\n',start)
repro=repro[:start]+"crop=tuple(json.loads((INPUTS/'prior-sequence-plan.json').read_bytes())['commonCrop'])\n"+repro[end:]
verification='''
prior_work=json.loads((INPUTS/'prior-working-unit-proof.json').read_bytes())
for name in ['camera','equations','fixedPhysicalDimensionsMetres','joints','rotationAnglesDegrees','independentKneeAxisSeparationMetres']:
    assert g['proof'][name]==prior_work[name],name
for pose in [1,4]:
    assert g['proof']['poses'][str(pose)]['geometry']==prior_work['poses'][str(pose)]['geometry']
    for suffix in ['equipment-back','equipment-front-with-existing-depth','equipment-front-unoccluded']:
        assert np.array_equal(np.array(Image.open(HERE/f'working-unit/{pose}-{suffix}.png').convert('RGBA'))[:,:,3],np.array(Image.open(INPUTS/f'prior-{pose}-{suffix}-alpha.png'))),(pose,suffix)
prior_complete=json.loads((INPUTS/'prior-complete-construction-proof.json').read_bytes())
for name in ['axesWorld','housings','seatFrameJoinWorld']:
    assert proof['staticGeometry'][name]==prior_complete['staticGeometry'][name],name
assert np.array_equal(np.array(static)[:,:,3],np.array(Image.open(INPUTS/'prior-static-alpha.png')))
assert proof['crop']==prior_complete['crop'] and proof['dimensions']==prior_complete['dimensions']
proof['materialOnlyPreservation']={'allWorkingUnitWorldGeometryExact':True,'allStaticWorldGeometryExact':True,'cameraExact':True,'allWorkingUnitAlphaMasksExact':True,'staticRawAlphaExact':True,'cropAndBodyPlacementExact':True,'equipmentFinish':'Illustration metal reflection/grain/edge normal shader within unchanged raster coverage; no new physical bevel geometry.','bodyFinish':'Original pixel max channel and chroma to canonical bases; no body spatial gradient.'}
'''
at=repro.index("(HERE/'construction-and-preservation-proof.json').write_text")
repro=repro[:at]+verification+'\n'+repro[at:]
(HERE/'reproduce.py').write_text(repro,encoding='utf-8',newline='\n')
(HERE/'input-provenance.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
patch=''.join(difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='previous/construct-working-unit.py',tofile='material/construct-working-unit.py'))
(HERE/'working-unit-material-only.patch').write_text(patch,encoding='utf-8',newline='\n')
patch=''.join(difflib.unified_diff(old_repro.splitlines(keepends=True),repro.splitlines(keepends=True),fromfile='previous/reproduce.py',tofile='material/reproduce.py'))
(HERE/'package-material-only.patch').write_text(patch,encoding='utf-8',newline='\n')
(HERE/'bounded-revision.json').write_text(json.dumps({'status':'single-material-attempt-prepared-not-accepted','priorConstructionPreserved':True,'priorWorkingUnitSourceSha256':sha(PRIOR/'construct-working-unit.py'),'materialWorkingUnitSourceSha256':sha(HERE/'construct-working-unit.py'),'priorReproduceSha256':sha(PRIOR/'reproduce.py'),'materialReproduceSha256':sha(HERE/'reproduce.py'),'materialShaderSha256':sha(HERE/'material_finish.py'),'workingUnitPatchSha256':sha(HERE/'working-unit-material-only.patch'),'packagePatchSha256':sha(HERE/'package-material-only.patch'),'newGeometry':False,'bodyGeometryEdits':0,'newImageRequests':0,'productionChanges':False,'releaseApproved':False,'completionCredit':False},indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'prepared':True,'geometryChanged':False,'newImageRequests':0,'releaseApproved':False}))
