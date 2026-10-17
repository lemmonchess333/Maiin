"""Reproduce the bounded endpoint candidate from immutable native input pixels.

Requires Pillow and NumPy. Run in a fresh copy of this folder without draft/ or
working-unit/. No repository, service, source-picture or prior-draft writes.
"""
from pathlib import Path
import hashlib
import io
import json
import math
import runpy
import zipfile
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
from material_finish import colour_finish

HERE=Path(__file__).resolve().parent
INPUTS=HERE/'inputs'
DRAFT=HERE/'draft'
DRAFT.mkdir(exist_ok=False)
(DRAFT/'frames').mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((HERE/'input-provenance.json').read_bytes())
for rel,row in manifest['inputs'].items():assert sha(HERE/rel)==row['sha256'],rel
for rel,row in manifest['derivedMaterialInputs'].items():assert sha(HERE/rel)==row['sha256'],rel
assert sha(HERE/'construct-working-unit.py')==manifest['portableWorkingUnitSource']['portableSha256']
g=runpy.run_path(str(HERE/'construct-working-unit.py'))
SIZE,UP,N,F,S,TOP=g['SIZE'],g['UP'],g['N'],g['FORWARD'],g['S'],g['TOP']
render,cylinder,unit,project=g['render'],g['cylinder'],g['unit'],g['project']
W=g['world_centres']
assert np.allclose(np.column_stack([N,UP,F]).T@np.column_stack([N,UP,F]),np.eye(3),atol=1e-12)

def box(c,dimensions,axes=(N,UP,F),base=100):
    """Closed world cuboid; only camera-facing true faces are rendered."""
    c=np.asarray(c,float);axes=np.asarray(axes,float)
    faces=[]
    for axis in range(3):
        other=[i for i in range(3) if i!=axis]
        for sign in [-1,1]:
            normal=sign*axes[axis]
            if normal[2]>=1e-10:continue
            facecentre=c+normal*dimensions[axis]/2
            a,b=[axes[k]*dimensions[k]/2 for k in other]
            faces.append(([facecentre-a-b,facecentre+a-b,facecentre+a+b,facecentre-a+b],normal,base))
    return faces

def beam(a,b,width=.052,height=.05,base=115):
    """Rigid floor beam between two common-height world points."""
    a,b=np.asarray(a),np.asarray(b)
    axis=unit(b-a)
    assert abs(axis@UP)<1e-10
    across=unit(np.cross(axis,UP))
    return box((a+b)/2,[float(np.linalg.norm(b-a)),height,width],(axis,UP,across),base)

# This is the same fixed chassis in both poses. Covered columns are placed in
# native empty margins; no front housing or arbitrary body-obscuring mask is
# introduced. The pre-existing retained frame occludes back equipment as in the
# reviewed local working-unit construction. No exposed moving stack/cable is drawn.
fixed=[]
static_records={}
ground={}
housing={}
for side in ['far','near']:
    pivot=np.array(g['proof']['joints'][side]['externalPivotWorld'])
    ground[side]=pivot-.55*UP
    lateral=-.72 if side=='far' else 1.32
    housing[side]=W[side]-.55*UP+lateral*N-.02*F
    bottom=housing[side]
    centre=bottom+.54*UP
    fixed+=box(centre,[.18,1.08,.18],base=113)
    # A closed inset panel and cap preserve the physical common-camera box.
    fixed+=box(centre+.094*N,[.012,.93,.145],base=55)
    fixed+=box(bottom+.028*UP,[.24,.056,.26],base=62)
    fixed+=box(bottom+1.065*UP,[.20,.03,.20],base=126)
    # Small fixed selector-access recess and pin; no visible weight position is
    # invented. This indicates a covered selectorized family, not a brand.
    fixed+=box(bottom+.33*UP+.096*F,[.052,.25,.012],base=28)
    pin=bottom+.29*UP+.108*F
    fixed+=cylinder(pin,pin+.017*F,.008,143,24)
    fixed+=beam(ground[side],bottom,.06,.045,116)
    # Short enclosed base drive cover joins the existing pivot support foot to
    # the floor transmission beam. Internal cams/belts remain hidden/unverified.
    drive=ground[side]-.055*F+.023*UP
    fixed+=box(drive,[.105,.046,.18],base=80)
    static_records[side]={'housingBottomWorld':bottom.tolist(),'housingCentreWorld':centre.tolist(),'housingBodyDimensionsMetresAlongNUpForward':[.18,1.08,.18],'housingBottomProjection':project(bottom).tolist(),'housingTopProjection':project(bottom+1.08*UP).tolist(),'groundSupportWorld':ground[side].tolist(),'coveredRoutingVerified':False}
# Tie both independent pivot supports and the retained seat/frame family onto
# one horizontal world chassis. The source frame remains foreground, unchanged.
seat_join=W['near']-.55*UP-.52*F+.05*N
fixed+=beam(ground['far'],ground['near'],.052,.05,112)
fixed+=beam(ground['near'],seat_join,.055,.05,116)
fixed+=beam(housing['near'],seat_join,.055,.05,116)
static=render(fixed)
static.save(DRAFT/'fixed-covered-housings-and-chassis-unoccluded.png')
static_array=np.asarray(static)
# Covered columns are back equipment. Their overlap with retained foreground
# (including existing floor beams and the extended far trainer) is measured,
# rather than mistaken for an empty-margin guarantee. No source foreground is
# overwritten, and the raw render makes all equipment depth assumptions visible.
column_mesh=[]
for side in ['far','near']:
    bottom=housing[side]
    column_mesh+=box(bottom+.54*UP,[.18,1.08,.18],base=113)
column_alpha=np.asarray(render(column_mesh))[:,:,3]>0

def png(im):
    b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()
def compose(layers,size):
    out=Image.new('RGBA',size)
    for _,layer in layers:out=Image.alpha_composite(out,layer)
    return out
def ora(path,layers):
    size=layers[0][1].size
    merged=compose(layers,size)
    root=ET.Element('image',{'w':str(size[0]),'h':str(size[1]),'name':'Leg Extension: intact two endpoints, common-camera apparatus'})
    stack=ET.SubElement(root,'stack')
    with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr('mimetype','image/openraster',compress_type=zipfile.ZIP_STORED)
        for i,(name,layer) in enumerate(reversed(layers)):
            src=f'data/layer-{i}.png'
            ET.SubElement(stack,'layer',{'name':name,'src':src,'x':'0','y':'0','opacity':'1','visibility':'visible','composite-op':'svg:src-over'})
            z.writestr(src,png(layer))
        z.writestr('stack.xml',ET.tostring(root,encoding='utf-8'))
        z.writestr('mergedimage.png',png(merged))
        thumb=merged.copy();thumb.thumbnail((256,256));z.writestr('Thumbnails/thumbnail.png',png(thumb))
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        root=ET.fromstring(z.read('stack.xml'))
        reopened=[(e.get('name'),Image.open(io.BytesIO(z.read(e.get('src')))).convert('RGBA')) for e in root.find('stack')]
        rebuilt=compose(list(reversed(reopened)),size)
        assert np.array_equal(np.asarray(merged),np.asarray(rebuilt))
        assert np.array_equal(np.asarray(merged),np.asarray(Image.open(io.BytesIO(z.read('mergedimage.png'))).convert('RGBA')))
    return {'sha256':sha(path),'size':list(size),'reopenedPixelExact':True,'layerNames':[name for name,_ in layers]}

images,layers_by_pose,poseproof={},{},{}
for pose in [1,4]:
    original=Image.new('RGBA',SIZE,(0,0,0,255))
    original.paste(Image.open(INPUTS/f'{pose}-original.png').convert('RGBA'),(0,TOP))
    mask=Image.new('L',SIZE)
    mask.paste(Image.open(INPUTS/f'{pose}-old-equipment-ownership-mask.png').convert('L'),(0,TOP))
    erasure=Image.new('RGBA',SIZE);erasure.putalpha(mask)
    base=compose([('original',original),('equipment-only-erasure',erasure)],SIZE)
    expected=Image.open(INPUTS/f'{pose}-source-kept-base.png').convert('RGBA')
    assert np.array_equal(np.asarray(base),np.asarray(expected))
    foreground=np.asarray(base)[:,:,:3].max(2)>=15
    sa=np.asarray(static).copy()
    column_overlap=int((column_alpha&foreground).sum())
    sa[foreground,3]=0
    assert np.all(sa[foreground,3]==0)
    fixed_back=Image.fromarray(sa)
    fixed_back.save(DRAFT/f'{pose}-fixed-covered-housings-depth.png')
    colour,colour_details=colour_finish(base,Image.open(INPUTS/f'{pose}-exact-palette-layer.png'))
    colour.save(DRAFT/f'{pose}-source-tonal-colour-layer.png')
    contour=Image.open(INPUTS/f'{pose}-retained-coloured-contour-layer.png').convert('RGBA')
    back=Image.open(HERE/f'working-unit/{pose}-equipment-back.png').convert('RGBA')
    front=Image.open(HERE/f'working-unit/{pose}-equipment-front-with-existing-depth.png').convert('RGBA')
    layers=[('Intact native original at integer (0,+40); no body extraction',original),('Positive old-moving-equipment ownership only',erasure),('Existing chromatic fields: canonical palette with original max-channel/chroma shading',colour),('Existing coloured contours retained as neutral linework',contour),('Fixed covered resistance columns and chassis, behind retained foreground',fixed_back),('Rigid 3D far work arm and supports, reviewed depth',back),('Rigid 3D short pads and near work arm, reviewed trainer depth',front)]
    scene=compose(layers,SIZE)
    untouched=(np.asarray(colour)[:,:,3]==0)&(np.asarray(contour)[:,:,3]==0)&(np.asarray(fixed_back)[:,:,3]==0)&(np.asarray(back)[:,:,3]==0)&(np.asarray(front)[:,:,3]==0)
    assert np.array_equal(np.asarray(scene)[untouched],np.asarray(base)[untouched])
    # Exact gear-only unit bytes are retained from the bounded physical draft.
    assert np.array_equal(np.asarray(front)[:,:,3],np.asarray(Image.open(INPUTS/f'prior-{pose}-equipment-front-with-existing-depth-alpha.png')))
    scene.save(DRAFT/f'{pose}-native.png')
    images[pose]=scene;layers_by_pose[pose]=layers
    poseproof[str(pose)]={'sourceBaseRebuiltPixelExact':True,'nativeOriginalPlacement':[0,TOP],'newColumnFootprintsOverlapExistingForegroundPixels':column_overlap,'newStaticEquipmentNeverOverwritesRetainedForeground':True,'backHousingDepthInterpretation':'Retained source floor frame and, in pose4, far trainer occlude back housing. Raw common-camera equipment is preserved for visual depth review; original human depth is not calibrated.','allPixelsOutsideExistingColourAndEquipmentExact':True,'sourceColourSupportReferenceSha256':sha(INPUTS/f'{pose}-exact-palette-layer.png'),'sourceTonalColourMapping':colour_details,'newColourLayerSha256':sha(DRAFT/f'{pose}-source-tonal-colour-layer.png'),'reviewedContourLayerByteIdentity':sha(INPUTS/f'{pose}-retained-coloured-contour-layer.png'),'workingUnitFrontRgbaSha256':hashlib.sha256(front.tobytes()).hexdigest(),'nativeSha256':sha(DRAFT/f'{pose}-native.png')}

crop=tuple(json.loads((INPUTS/'prior-sequence-plan.json').read_bytes())['commonCrop'])
editables={}
for pose in [1,4]:
    framed=images[pose].crop(crop)
    framed.save(DRAFT/f'{pose}-framed.png')
    for suffix,layers in [('full',layers_by_pose[pose]),('framed',[(name,im.crop(crop)) for name,im in layers_by_pose[pose]])]:
        path=DRAFT/f'{pose}-{suffix}.ora';editables[path.name]=ora(path,layers)
    assert np.array_equal(np.asarray(framed),np.asarray(compose([(name,im.crop(crop)) for name,im in layers_by_pose[pose]],framed.size)))
order=[1,1,4,4,1,1]
hashes={}
for beat,pose in enumerate(order,1):
    path=DRAFT/'frames'/f'{beat}.webp'
    expected=images[pose].crop(crop)
    expected.save(path,lossless=True,method=6)
    assert np.array_equal(np.asarray(expected),np.asarray(Image.open(path).convert('RGBA')))
    hashes[path.relative_to(HERE).as_posix()]=sha(path)
beats=[{'t':0,'label':'Set','cue':'Keep your back supported and hips seated.'},{'t':0,'label':'Brace','cue':'Brace your torso and grip the handles.'},{'t':1,'label':'Squeeze','cue':'Straighten your legs and squeeze your quads.'},{'t':1,'label':'Hold','cue':'Keep your hips down and hands gripping.'},{'t':0,'label':'Return','cue':'Bend your knees slowly; control the resistance.'},{'t':0,'label':'Reset','cue':'Return to bent knees without losing control.'}]
assert all(len(b['cue'].split())<=7 for b in beats)
catalogue=json.loads((HERE/'catalogue.json').read_bytes())
plan={'exerciseId':'leg-extension','name':catalogue['name'],'version':'anatomy-v3-2026-10-15-material-endpoint-leg-extension-v1','physicalPoses':2,'sourcePoseOrder':order,'positions':[0,0,1,1,0,0],'commonCrop':list(crop),'dimensions':list(images[1].crop(crop).size),'primary':[catalogue['muscleGroup']],'secondary':catalogue.get('secondaryMuscles',[]),'setup':[catalogue['instructions'][0]],'beats':beats,'frameHashes':hashes,'scope':'Unregistered two-endpoint equipment-only candidate. Repeated beat paths hold actual bent/extended states; no intermediate image, smooth trajectory or six unique pose claim.','findings':['Independent generic covered selectorized apparatus, not an exact branded replica.','A constructed common apparatus camera is used, not an original human-camera/depth recovery.','Covered resistance routing and unseen cams/belts/weights are not verified.','Original source body/seat/head/hand variations remain; human pixels are not fitted.','The held middle source2 and earlier long-pad diagnostic are not delivered.'],'releaseApproved':False,'completionCredit':False}
(HERE/'sequence-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
proof={'status':'unregistered-static-equipment-and-editable-package','exerciseId':'leg-extension','scope':'Two source endpoints only; apparatus geometry and pixel integrity, no parent visual or release acceptance inferred.','camera':g['proof']['camera'],'workingUnitProof':'working-unit/construction-proof.json','workingUnitProofSha256':sha(HERE/'working-unit/construction-proof.json'),'staticGeometry':{'axesWorld':[N.tolist(),UP.tolist(),F.tolist()],'closedBoxEquation':'C + a*N + b*UP + c*FORWARD, fixed dimensions; true common-camera visible faces.','floorBeamEquation':'Rigid cuboid between constant common-height endpoints; worldUp dot beamAxis=0.','housings':static_records,'seatFrameJoinWorld':seat_join.tolist(),'staticRawRgbaSha256':hashlib.sha256(np.asarray(static).tobytes()).hexdigest(),'sameStaticMeshBothStates':True,'coveredRoutingVerified':False},'poses':poseproof,'crop':list(crop),'dimensions':plan['dimensions'],'editables':editables,'frameHashes':hashes,'allSixLosslessPathsDecodeExactly':True,'anatomicalTransforms':0,'newImageRequests':0,'productionChanges':False,'releaseApproved':False,'completionCredit':False}

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

(HERE/'construction-and-preservation-proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'nativePoses':2,'framePaths':6,'orasReopenedExact':4,'crop':crop,'dimensions':plan['dimensions'],'newImageRequests':0,'releaseApproved':False}))
