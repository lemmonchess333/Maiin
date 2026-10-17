"""One common rigid shoulder-harness illustration; unchanged intact human sources.

This is a custom feasible-gear draft based on real shoulder harness principles,
not a stock Titan replica, anatomical fit, calibrated clearance or release pass.
"""
from pathlib import Path
import math
import json
import hashlib
import numpy as np
from PIL import Image,ImageDraw

BASE=Path(__file__).resolve().parent
WORK=BASE.parents[1]
OUT=BASE/'custom-compact-harness-one-correction'
OUT.mkdir(exist_ok=False)
SUP=4
SIZE=(1536,1024)
SCALE=0.36
AZ=math.radians(20);EL=math.radians(9.25)
X=np.array([math.cos(AZ),math.sin(AZ)*math.sin(EL)])
Y=np.array([math.sin(AZ),-math.cos(AZ)*math.sin(EL)])
Z=np.array([0,-math.cos(EL)])
WIDTH=300.0
PAD_Y=45.0
BAR_Y=165.0;BAR_Z=70.0
def baseproject(p):return SCALE*(X*p[0]+Y*p[1]+Z*p[2])
anchor=np.array([735.0,326.0])-baseproject((-WIDTH/2,BAR_Y,BAR_Z))
geometry={'kind':'custom compact rigid shoulder harness','frameDepthMm':330.2,'frameHeightMm':338.4,
    'adjustedShoulderSpacingMm':WIDTH,'paddedArches':'two curved load-bearing shoulder supports',
    'barDiameterMm':28,'padFrontDeltContactPlaneYmm':PAD_Y,'barCenterYFrontMm':BAR_Y,'barCenterZAboveShoulderContactMm':BAR_Z,
    'cradleInnerRadiusMm':14,'cradleWallMm':6,'cradleRiser':'solid plate connecting cradle bottom to same curved steel frame',
    'frontUprightsAndLowerCrossBrace':True,
    'stockReplica':False,'sameGeometryForBothStates':True}

def make_layer(pose,front):
    layer=Image.new('RGBA',(SIZE[0]*SUP,SIZE[1]*SUP),(0,0,0,0));d=ImageDraw.Draw(layer)
    def project(p):
        q=baseproject(p)+anchor
        theta=pose['rotationRadians'];a=np.array([[math.cos(theta),-math.sin(theta)],[math.sin(theta),math.cos(theta)]])
        q=a@(q-np.array([735.0,326.0]))+np.array(pose['nearCatchPixels'])
        return tuple(float(v*SUP) for v in q)
    def line(points,width,colour):
        d.line([project(p) for p in points],fill=colour,width=max(1,round(width*SCALE*SUP)),joint='curve')
    def metal(points,width):
        line(points,width+4,(140,147,155,255));line(points,width,(43,47,52,255))
        line(points,max(1,width*.12),(93,99,106,255))
    def archz(y):return -66*(1-math.sqrt(max(0,1-(y/165.1)**2)))
    for x in (-WIDTH/2,WIDTH/2):
        ys=np.linspace(0,165.1,81) if front else np.linspace(-165.1,0,81)
        pad=[(x,float(y)+PAD_Y,archz(float(y))) for y in ys]
        line(pad,68,(124,130,137,255));line(pad,62,(34,36,39,255))
        metal([(x,float(y)+PAD_Y,archz(float(y))+38) for y in ys],42)
        if front:
            # Full rigid cheek/riser connects the supported cradle to the arch.
            riser=[(x-8,108+PAD_Y,-12),(x+8,108+PAD_Y,-12),(x+8,132+PAD_Y,56),(x-8,132+PAD_Y,56)]
            d.polygon([project(p) for p in riser],fill=(52,57,63,255),outline=(149,155,163,255),width=SUP)
            # Two continuous J-cheeks cradle the bar; no floating supports.
            for dx in (-8,8):
                arc=[(x+dx,BAR_Y+20*math.cos(a),BAR_Z+20*math.sin(a))
                     for a in np.linspace(math.pi,2*math.pi,61)]
                metal(arc,6)
                metal([(x+dx,100+PAD_Y,70),(x+dx,100+PAD_Y,89)],6)
                metal([(x+dx,140+PAD_Y,70),(x+dx,140+PAD_Y,89)],6)
            metal([(x,165.1+PAD_Y,-28),(x,165.1+PAD_Y,-300.4)],42)
    if front:
        metal([(-WIDTH/2,165.1+PAD_Y,-300.4),(WIDTH/2,165.1+PAD_Y,-300.4)],42)
        # The original bar is retained at its grip coordinates; show its central
        # segment in front of the neck as required by the front-loaded harness.
        shaft=[(-180,BAR_Y,BAR_Z),(180,BAR_Y,BAR_Z)]
        line(shaft,30,(64,67,72,255));line(shaft,26,(139,143,150,255));line(shaft,8,(210,212,216,255))
    return layer.resize(SIZE,Image.Resampling.LANCZOS)

poses=[{'name':'standing','source':'1-rack-grip-candidate.png',
    'sha256':'4138d453c00c9de84930655df5281bea91ddc53d1364c3e6ed10a80b60deb902',
    'rotationRadians':0.0,'nearCatchPixels':[735.0,326.0],
    'unchangedForegroundHandWindows':[[658,300,725,355],[835,312,907,371]],
    'foregroundArmPolygons':[[[663,309],[700,305],[712,315],[720,329],[733,348],[745,379],[738,401],[725,407],[712,393],[707,374],[698,353],[687,341],[670,339]],[[836,328],[845,319],[863,319],[883,327],[899,344],[909,368],[922,387],[921,410],[905,415],[893,398],[888,381],[879,358],[872,350],[853,348],[838,342]]]},
    {'name':'bottom','source':'2-squat-candidate.png',
    'sha256':'e6f6b16212becfabf17e24c48fdd79fcac5a9f993148d8d38746c23f58056673',
    'rotationRadians':math.radians(-1.18),'nearCatchPixels':[735.0,487.0],
    'unchangedForegroundHandWindows':[[658,458,725,514],[835,470,907,529]],
    'foregroundArmPolygons':[[[663,467],[700,463],[712,473],[720,487],[733,506],[745,537],[738,559],[725,565],[712,551],[707,532],[698,511],[687,499],[670,497]],[[836,486],[845,477],[863,477],[883,485],[899,502],[909,526],[922,545],[921,568],[905,573],[893,556],[888,539],[879,516],[872,508],[853,506],[838,500]]]}]
rows=[]
for pose in poses:
    source=WORK/'front-squat'/'thruster-original-source-review-20261014'/pose['source']
    assert hashlib.sha256(source.read_bytes()).hexdigest()==pose['sha256']
    original=Image.open(source).convert('RGBA');pixels=np.array(original)
    back=make_layer(pose,False);front=make_layer(pose,True)
    # Back half of real apparatus is hidden by the original opaque athlete/gear;
    # only original near-black surrounding background exposes that layer.
    back_visible=np.array(back)
    back_visible[:,:,3]=np.where(pixels[:,:,:3].max(axis=2)<=8,back_visible[:,:,3],0)
    back=Image.fromarray(back_visible)
    composed=Image.alpha_composite(original,back)
    composed=Image.alpha_composite(composed,front)
    # Restore same-source foreground grip windows at identical coordinates only;
    # this is occlusion ordering, never a moved/rescaled hand or a different hand.
    arm_regions=Image.new('L',SIZE,0);arm_draw=ImageDraw.Draw(arm_regions)
    for polygon in pose['foregroundArmPolygons']:
        arm_draw.polygon([tuple(point) for point in polygon],fill=255)
    rgb=pixels[:,:,:3].astype(np.int16)
    neutral_foreground=(rgb.max(axis=2)>=120)&((rgb.max(axis=2)-rgb.min(axis=2))<50)
    arm_mask=Image.fromarray(np.where((np.array(arm_regions)>0)&neutral_foreground,255,0).astype('uint8'))
    composed.paste(original,(0,0),arm_mask)
    arm_mask.save(OUT/(pose['name']+'-unchanged-foreground-arm-mask.png'))
    back.save(OUT/(pose['name']+'-back-equipment.png'))
    front.save(OUT/(pose['name']+'-front-equipment.png'))
    composed.convert('RGB').save(OUT/(pose['name']+'-native.png'))
    changed=np.any(np.array(composed)[:,:,:3]!=pixels[:,:,:3],axis=2)
    equipment_scope=(np.array(back)[:,:,3]>0)|(np.array(front)[:,:,3]>0)
    assert not np.any(changed & ~equipment_scope)
    rows.append({**pose,'sourcePath':str(source),'changedPixels':int(changed.sum()),
        'changedOutsideActualEquipmentAlpha':int(np.sum(changed & ~equipment_scope)),
        'humanReposedOrWarped':False,'noBodyPixelMovement':True,
        'sameCoordinateHandOcclusionRestoration':True,
        'nativeSha256':hashlib.sha256((OUT/(pose['name']+'-native.png')).read_bytes()).hexdigest()})
report={'status':'single-construction-native-eligibility-draft-awaiting-review','geometry':geometry,
    'geometrySha256':hashlib.sha256(json.dumps(geometry,sort_keys=True).encode()).hexdigest(),
    'projection':{'scalePixelsPerMm':SCALE,'azimuthDegrees':20,'elevationDegrees':9.25,
        'cameraAndBodyCalibrated':False,'commonProjectionAcrossPoses':True},
    'poses':rows,'anatomicalTransforms':0,'newImageGenerationRequests':0,'originalArtworkModified':False,
    'compositorCorrection':'First compositor altered near-black background; original proof preserved in siblingcustom-harness-native-proof. This run changes only actual equipment-alpha pixels, same geometric construction, no pose/fit correction.',
    'nominalNeckClearance':'Pad fronts atY45mm and shaftcenterY165mm. A conservative nominal100mmneck-front envelope leaves51mmshaft-surface clearance; this is explicit shared equipment/anatomical-depth interpretation, NOT a calibrated3D reconstruction of the2Dsource neck. Source-facing overlap is intentional foregroundshaft/behindneck depth, never necksupport. Native judgment required.',
    'singleGlobalCorrection':'One shorter338.4mm common frame replaces the thigh-colliding533.4mm frame. Bar/pad relative geometry and both sourcepose placements remain identical; foreground-arm occlusion now restores source-neutral arm pixels only inside traced source-coordinate polygons, not whole rectangles. Original longframe/allrawproofs preserved.',
    'findings':['Custom shoulder-harness assisted variant; not ordinary direct-delt rack or stockTitanreplica.',
        'Existing low elbows retained; load is borne by padded arches, solid cradles and connected frame.',
        'Hand windows remain at their original coordinates; projected overlap is disclosed and must be reviewed against legitimate depth ordering.',
        'Source palette still original; no final exact-palette finishing or mobile review yet.'],
    'strictChecks':None,'productionEligible':False,'completionCredit':False}
(OUT/'native-eligibility-draft.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'output':str(OUT),'rows':rows},indent=2))
