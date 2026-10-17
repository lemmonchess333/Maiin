"""One separate endpoint-only rigid 3D working-unit construction.

Original source-kept canvases are never resampled or modified. This creates new
equipment meshes under one explicitly specified orthographic camera, then a
scoped contact draft. It is not a release or measured human-depth calibration.
"""
from pathlib import Path
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent/'inputs'
OUT = HERE.parent/'working-unit'
OUT.mkdir(exist_ok=False)
SIZE, TOP, S, AA = (1536,1104),40,750.,2
AXIS_ANGLE, RATIO, RADIUS_PX = math.radians(9.3),.8,221.
d = np.array([math.cos(AXIS_ANGLE),math.sin(AXIS_ANGLE)])
major2 = np.array([d[1],-d[0]])
h = math.sqrt(1-RATIO**2)
N = np.array([h*d[0],h*d[1],-RATIO])
U = np.array([major2[0],major2[1],0.])
V = np.array([RATIO*d[0],RATIO*d[1],h])
# This common vertical is perpendicular to the common rotary axes and projects
# vertically in the native image. No different camera is used for either leg.
UP = np.array([0.,-1.,N[1]/N[2]])
UP /= np.linalg.norm(UP)
FORWARD = np.cross(N,UP)
FORWARD /= np.linalg.norm(FORWARD)
T = np.vstack([d/RATIO,major2])
Q = T.T@T
RADIUS = RADIUS_PX/S
PAD_RADIUS, PAD_LENGTH = 50/S,70/(S*h)
sources = json.loads((HERE/'source-kept-pilot-provenance.json').read_bytes())
points = {}
centres = {}
angles = {}
for side,guess in [('far',np.array([600.,475.])),('near',np.array([700.,495.]))]:
    raw = {pose:np.array(sources['poses'][str(pose)]['geometry'][side]['rollerFront']) for pose in [1,4]}
    axial = 50 if side=='far' else 0
    points[side] = {pose:point-axial*d for pose,point in raw.items()}
    a,b = [T@points[side][pose] for pose in [1,4]]
    delta=b-a
    chord=np.linalg.norm(delta)
    assert RADIUS_PX > chord/2
    perp=np.array([-delta[1],delta[0]])/chord
    off=math.sqrt(RADIUS_PX**2-chord**2/4)
    candidates=[np.linalg.solve(T,(a+b)/2+sign*off*perp) for sign in [-1,1]]
    centre=min(candidates,key=lambda c:np.linalg.norm(c-guess))
    centres[side]=centre
    angles[side]={}
    for pose in [1,4]:
        vec=points[side][pose]-centre
        x=float(vec@major2/RADIUS_PX)
        y=float(vec@d/(RATIO*RADIUS_PX))
        assert abs(x*x+y*y-1)<1e-10
        angles[side][pose]=math.atan2(y,x)

# Put the two knee axes at one physical height. The independent axes need not
# be collinear: their small fore/aft offset is explicitly measured below.
world_centres={}
for side in ['far','near']:
    x,y=centres[side]/S
    z=-(UP[0]*x+UP[1]*y)/UP[2]
    world_centres[side]=np.array([x,y,z])
depth_origin=float(world_centres['near'][2])
for side in world_centres: world_centres[side][2]-=depth_origin

def sha(data): return hashlib.sha256(data).hexdigest()
def project(point): return np.array([S*point[0],S*point[1]+TOP])
def unit(a): return a/np.linalg.norm(a)

def cylinder(a,b,radius,base=100,segments=64):
    axis=unit(b-a)
    helper=np.array([0.,0.,1.]) if abs(axis[2])<.9 else np.array([0.,1.,0.])
    u=unit(np.cross(axis,helper));v=np.cross(axis,u)
    ring=[radius*(math.cos(k*2*math.pi/segments)*u+math.sin(k*2*math.pi/segments)*v) for k in range(segments)]
    faces=[]
    for k in range(segments):
        j=(k+1)%segments
        normal=unit(ring[k]+ring[j])
        if normal[2]<1e-10:
            faces.append(([a+ring[k],b+ring[k],b+ring[j],a+ring[j]],normal,base))
    if -axis[2]<1e-10: faces.append(([a+r for r in reversed(ring)],-axis,base+7))
    if axis[2]<1e-10: faces.append(([b+r for r in ring],axis,base+7))
    return faces

def render(faces):
    from material_finish import render as shade_material
    return shade_material(faces,SIZE,AA,project)

assert np.allclose(np.column_stack([U,V,N]).T@np.column_stack([U,V,N]),np.eye(3),atol=1e-12)
assert abs(UP@N)<1e-12
proof={'status':'constructed-rigid-endpoint-working-unit-contact-review-only',
       'camera':{'type':'orthographic','projection':'(750*X,750*Y+40)','pixelsPerMetre':S,
                 'cameraDepthAxis':[0,0,1],'nearerDepth':'smaller Z',
                 'rotaryAxisWorld':N.tolist(),'rotaryPlaneBasis':[U.tolist(),V.tolist()],
                 'worldUp':UP.tolist(),'worldForward':FORWARD.tolist(),
                 'sourceCameraRecoveredFromMetadata':False},
       'equations':{'rotation':'E(theta)=C+R*(U*cos(theta)+V*sin(theta))',
                    'circleProjection':'v^T Q v=Rpx^2; Q=(d*d^T)/0.8^2+major*major^T',
                    'cylinder':'E+a*N+t*N+r*(U*cos(phi)+V*sin(phi)), with fixed a,L,r per side',
                    'endcapProjection':'true circular caps project at minor/major=0.8, minor direction9.3deg'},
       'fixedPhysicalDimensionsMetres':{'bothWorkArmRadii':RADIUS,'bothPadRadii':PAD_RADIUS,'bothPadLengths':PAD_LENGTH},
       'posesUsed':[1,4],'middlePose2Delivered':False,
       'sourcePoseOrderIfLaterAccepted':[1,1,4,4,1,1],
       'joints':{},'poses':{},'inputHashes':{},
       'limitations':['This is a constructed common-camera model, not a recovered original human mesh or measured camera calibration.',
                      'Native knee-axis proximity, actual shin contact and source-preserving depth/occlusion require independent visual acceptance.',
                      'Fixed posts are a local working-unit support draft. Resistance housings/complete product finishing are not certified.',
                      'Original ownership-cleared source bases are reused byte-exact. No new anatomy, hidden-body reconstruction, garment edit or pose-specific body fitting occurs.'],
       'newImageRequests':0,'productionChanges':False,'completionCredit':False}
for side in ['far','near']:
    axis_offset=-140 if side=='far' else 30
    pivot=world_centres[side]+axis_offset/(S*h)*N
    proof['joints'][side]={'circleCentreNative':centres[side].tolist(),
                          'worldCentre':world_centres[side].tolist(),
                          'externalPivotNative':(project(pivot)-[0,TOP]).tolist(),
                          'externalPivotWorld':pivot.tolist(),
                          'axialWorkArmOffsetMetres':axis_offset/(S*h)}
separation=world_centres['near']-world_centres['far']
proof['independentKneeAxisSeparationMetres']={'lateral':float(separation@N),'foreAft':float(separation@FORWARD),'height':float(separation@UP)}
for pose in [1,4]:
    base_path=HERE/f'{pose}-source-kept-base.png'
    base=Image.open(base_path).convert('RGBA')
    assert base.size==SIZE
    proof['inputHashes'][base_path.name]=sha(base_path.read_bytes())
    back_faces=[];front_faces=[];pad_faces=[]
    details={}
    for side in ['far','near']:
        centre=world_centres[side]
        theta=angles[side][pose]
        endpoint=centre+RADIUS*(U*math.cos(theta)+V*math.sin(theta))
        target=points[side][pose]
        error=float(np.linalg.norm(project(endpoint)-[0,TOP]-target))
        axis_offset=-140 if side=='far' else 30
        pivot=centre+axis_offset/(S*h)*N
        attachment=endpoint+axis_offset/(S*h)*N
        arm=cylinder(pivot,attachment,.018,140,32)+cylinder(pivot-.025*N,pivot+.025*N,.027,145,64)
        # Posts share this camera and a single physical vertical, not hand-drawn
        # projected shortening. They remain behind the intact source scene.
        foot=pivot-.55*UP
        back_faces+=cylinder(pivot,foot,.023,115,32)
        back_faces+=cylinder(foot-.35*FORWARD,foot+.35*FORWARD,.024,115,32)
        (back_faces if side=='far' else front_faces).extend(arm)
        front_offset=50 if side=='far' else 0
        front=endpoint+front_offset/(S*h)*N
        rear=front-PAD_LENGTH*N
        back_faces+=cylinder(attachment,rear,.009,135,32)
        pad_faces+=cylinder(rear,front,PAD_RADIUS,68,96)
        details[side]={'thetaRadians':theta,'thetaDegrees':math.degrees(theta),
                       'endpointWorld':endpoint.tolist(),'endpointProjectionErrorPx':error,
                       'worldArmRadius':float(np.linalg.norm(attachment-pivot)),
                       'padRearWorld':rear.tolist(),'padFrontWorld':front.tolist(),
                       'padRearNative':(project(rear)-[0,TOP]).tolist(),
                       'padFrontNative':(project(front)-[0,TOP]).tolist(),
                       'worldPadLength':float(np.linalg.norm(front-rear)),
                       'padPlanePerpendicularToRotaryAxis':bool(abs(U@N)<1e-12 and abs(V@N)<1e-12)}
        assert error<1e-8 and abs(np.linalg.norm(attachment-pivot)-RADIUS)<1e-12
    back=render(back_faces)
    ba=np.asarray(back).copy()
    source_foreground=np.asarray(base)[:,:,:3].max(2)>=15
    ba[source_foreground,3]=0
    back=Image.fromarray(ba)
    front=render(front_faces+pad_faces)
    unoccluded=front.copy()
    if pose==4:
        # Exact existing pilot whole-trainer foreground guard, unchanged native
        # coordinates. Raw unoccluded equipment is retained for collision review.
        guard=Image.new('L',SIZE)
        poly=[(207,383),(248,385),(276,407),(307,436),(349,452),(379,477),(383,531),(360,571),(312,571),(271,540),(238,495),(214,446)]
        ImageDraw.Draw(guard).polygon([(x,y+TOP) for x,y in poly],fill=255)
        fa=np.asarray(front).copy();fa[np.asarray(guard)>0,3]=0
        front=Image.fromarray(fa)
    back.save(OUT/f'{pose}-equipment-back.png')
    front.save(OUT/f'{pose}-equipment-front-with-existing-depth.png')
    unoccluded.save(OUT/f'{pose}-equipment-front-unoccluded.png')
    scene=Image.alpha_composite(Image.alpha_composite(base,back),front)
    scene.save(OUT/f'{pose}-native-contact-draft.png')
    untouched=(np.asarray(back)[:,:,3]==0)&(np.asarray(front)[:,:,3]==0)
    assert np.array_equal(np.asarray(scene)[untouched],np.asarray(base)[untouched])
    proof['poses'][str(pose)]={'geometry':details,'sourceBasePixelsOutsideNewGearExact':True,
                             'existingTrainerGuardApplied':pose==4,
                             'unoccludedGearRetainedForIndependentCollisionReview':True,
                             'nativeDraftSha256':sha((OUT/f'{pose}-native-contact-draft.png').read_bytes())}
proof['rotationAnglesDegrees']={side:abs(math.degrees(angles[side][4]-angles[side][1])) for side in angles}
(OUT/'construction-proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'output':str(OUT),'pivots':proof['joints'],'physicalDimensions':proof['fixedPhysicalDimensionsMetres'],
                  'axisSeparation':proof['independentKneeAxisSeparationMetres'],'nativeDrafts':2,
                  'releaseApproved':False,'newImageRequests':0}))
