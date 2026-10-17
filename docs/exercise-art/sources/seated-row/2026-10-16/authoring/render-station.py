"""One shared selectorised cable station, intact original athletes.

New equipment pixels only are antialiased. People are copied at native scale.
Cable payout includes tangent lengths and pulley arcs, not vertical pixels.
"""
from pathlib import Path
import math,json,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
P=Path(__file__).resolve().parent;OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=False)
SIZE=(1536,1088);PAD=np.array([0,48]);AA=3
yaw,pitch=np.radians([45,6]);SCALE=450.
C=SCALE*np.array([[math.cos(yaw),math.sin(yaw),0],[math.sin(pitch)*math.sin(yaw),-math.sin(pitch)*math.cos(yaw),-math.cos(pitch)]])
DEPTH=-np.cross(C[0],C[1])/SCALE**2
ORIGIN=np.array([1170.,590.]);GROUND=-.60
def project(w):return ORIGIN+C@np.array(w)+PAD
def at(p,y=0):
    x,z=np.linalg.solve(C[:,[0,2]],np.array(p)-ORIGIN-C[:,1]*y)
    return np.array([x,y,z])
def unit(v):return v/max(float(np.linalg.norm(v)),1e-12)
MATERIAL={'steel':np.array([67,70,75]),'alloy':np.array([133,137,142]),'rubber':np.array([37,40,44]),'plate':np.array([72,75,81])}
LIGHT=unit(np.array([-.35,-.6,.9]))
class Mesh:
    def __init__(self):self.faces=[]
    def face(self,ps,kind='steel'):
        ps=np.array(ps);normal=unit(np.cross(ps[1]-ps[0],ps[2]-ps[0]));light=abs(float(normal@LIGHT))
        col=np.clip(MATERIAL[kind]*(.65+.55*light),12,190).astype(int)
        self.faces.append((float(ps.mean(0)@DEPTH),ps,tuple(col)))
    def box(self,centre,axes,dimensions,kind='steel'):
        c=np.array(centre);axes=np.array(axes);half=np.array(dimensions)/2
        vs=np.array([c+np.array(sign)*half@axes for sign in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]])
        for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:self.face(vs[list(ids)],kind)
    def cylinder(self,a,b,r,kind='steel',n=24):
        a,b=np.array(a),np.array(b);axis=unit(b-a);u=unit(np.cross(axis,[0,0,1] if abs(axis[2])<.9 else [0,1,0]));v=np.cross(axis,u)
        ring=[r*(math.cos(t)*u+math.sin(t)*v) for t in np.linspace(0,2*math.pi,n,endpoint=False)]
        for i in range(n):j=(i+1)%n;self.face([a+ring[i],a+ring[j],b+ring[j],b+ring[i]],kind)
        self.face([a+x for x in reversed(ring)],kind);self.face([b+x for x in ring],kind)
    def beam(self,a,b,w=.06,h=.05,kind='steel'):
        a,b=np.array(a),np.array(b);axis=unit(b-a);u=unit(np.cross(axis,[0,0,1] if abs(axis[2])<.9 else [0,1,0]));v=np.cross(axis,u)
        self.box((a+b)/2,[axis,u,v],[np.linalg.norm(b-a),w,h],kind)
    def render(self):
        im=Image.new('RGBA',(SIZE[0]*AA,SIZE[1]*AA));draw=ImageDraw.Draw(im)
        for depth,ps,col in sorted(self.faces,reverse=True,key=lambda f:f[0]):
            points=[tuple(project(p)*AA) for p in ps]
            draw.polygon(points,fill=(*col,255));draw.line(points+[points[0]],fill=(*tuple(max(12,c-15) for c in col),255),width=AA,joint='curve')
        return im.resize(SIZE,Image.Resampling.LANCZOS)
IDENTITY=np.eye(3)
seat=at([400,568]);foot=at([815,666]);angle=math.radians(37)
FOOT_U=np.array([math.cos(angle),0,math.sin(angle)]);FOOT_V=np.array([0,1,0]);FOOT_N=np.cross(FOOT_U,FOOT_V)
def apparatus(top):
    m=Mesh()
    # Fixed low bench and its grounded frame.
    rear=seat[0]-.10;front=foot[0]+.18
    for y in [-.13,.13]:
        m.beam([rear,y,GROUND+.07],[front,y,GROUND+.07],.07,.055)
        m.beam([seat[0],y,GROUND+.07],[seat[0],y,seat[2]-.045],.065,.05)
        m.beam([foot[0]-.05,y,GROUND+.07],[foot[0]-.05,y,foot[2]-.04],.05,.04)
    for x in [rear,front]:
        m.beam([x,-.34,GROUND+.045],[x,.34,GROUND+.045],.09,.065)
        for y in [-.34,.34]:m.box([x,y,GROUND+.025],IDENTITY,[.14,.12,.05],'rubber')
    m.box(seat-[0,0,.04],IDENTITY,[.40,.40,.08],'rubber')
    m.box(seat-[0,0,.087],IDENTITY,[.36,.36,.025],'alloy')
    # One broad angled bracing plate; original trainers remain intact.
    m.box(foot-[0,0,.018],[FOOT_U,FOOT_V,FOOT_N],[.60,.46,.036],'steel')
    for u in np.linspace(-.24,.24,7):
        a=foot+u*FOOT_U-.218*FOOT_V+.005*FOOT_N;b=foot+u*FOOT_U+.218*FOOT_V+.005*FOOT_N
        m.cylinder(a,b,.004,'alloy',10)
    # Tower, ten plates total: three moving and seven left on the base.
    for x in [.15,.56]:
        m.box([x,.15,(GROUND+1.30)/2],IDENTITY,[.05,.065,1.30-GROUND])
        m.box([x,.15,GROUND+.025],IDENTITY,[.22,.45,.05],'rubber')
    for z in [GROUND+.07,1.30]:m.box([.355,.15,z],IDENTITY,[.46,.065,.055])
    m.box([.34,0,GROUND+.08],IDENTITY,[.39,.35,.06])
    for x in [.23,.45]:m.cylinder([x,0,GROUND+.10],[x,0,1.25],.011,'alloy')
    for k in range(10):
        z=top-(k+.5)*.05 if k<3 else -(k+.5)*.05
        m.box([.34,0,z],IDENTITY,[.30,.23,.047],'plate')
    m.cylinder([.34,-.13,top-.125],[.34,-.19,top-.125],.012,'alloy')
    # Same fixed redirect pulley and upper return pulley, both in XZ plane.
    for centre,r in [(np.array([0,0,0]),.035),(np.array([.30,0,1.20]),.04)]:
        m.cylinder(centre+[0,-.027,0],centre+[0,.027,0],r,'rubber',36)
        m.cylinder(centre+[0,-.035,0],centre+[0,.035,0],.010,'alloy',20)
    m.beam([0,0,0],[.15,.15,.10],.045,.04)
    m.beam([.30,0,1.20],[.355,.15,1.20],.045,.04)
    return m.render()
P0=np.array([0.,0.]);U=np.array([.30,1.20]);r0=.035;r1=.04
D=U-P0;alpha=math.atan2(D[1],D[0])-math.acos((r0+r1)/np.linalg.norm(D));normal=np.array([math.cos(alpha),math.sin(alpha)])
Pout=P0+r0*normal;Uin=U-r1*normal;beta=math.atan2(-normal[1],-normal[0])%(2*math.pi)
def route(eye,top):
    E=at(eye)[[0,2]];delta=E-P0;dist=np.linalg.norm(delta);direction=math.atan2(delta[1],delta[0]);spread=math.acos(r0/dist)
    candidates=[direction-spread,direction+spread];incoming=min(candidates,key=lambda a:math.sin(a))
    arc0=(alpha-incoming)%(2*math.pi);arc1=beta
    points=[E,P0+r0*np.array([math.cos(incoming),math.sin(incoming)])]
    points.extend(P0+r0*np.array([math.cos(t),math.sin(t)]) for t in np.linspace(incoming,incoming+arc0,35))
    points.append(Uin)
    points.extend(U+r1*np.array([math.cos(t),math.sin(t)]) for t in np.linspace(beta,0,55))
    points.append(np.array([.34,top]))
    variable=math.sqrt(dist**2-r0**2)+r0*arc0
    total=variable+float(np.linalg.norm(Uin-Pout))+r1*arc1+(1.20-top)
    return {'points':[p.tolist() for p in points],'incomingTangentRadians':incoming,'lowerWrapRadians':arc0,'upperWrapRadians':arc1,'variableHandleBranchMetres':variable,'totalMetres':total,'freeEyeWorldXZ':E.tolist()}
EYES={'A':[827,444],'B':[502,423]}
initial={k:route(eye,.03) for k,eye in EYES.items()};payout=initial['B']['variableHandleBranchMetres']-initial['A']['variableHandleBranchMetres']
tops={'A':.03,'B':.03+payout};assert 0<payout<1.12 and tops['B']<1.13
records=[]
for label in ['A','B']:
    source=P.parent/'draft/source-layers'/f'{label}-whole-athlete-and-bar.png';person=Image.open(source).convert('RGBA')
    core=apparatus(tops[label]);cable=Image.new('RGBA',(SIZE[0]*AA,SIZE[1]*AA));draw=ImageDraw.Draw(cable)
    cable_route=route(EYES[label],tops[label]);coords=[tuple(project([q[0],0,q[1]])*AA) for q in cable_route['points']]
    draw.line(coords,fill=(32,34,38,255),width=5*AA,joint='curve');draw.line(coords,fill=(158,162,167,255),width=2*AA,joint='curve')
    cable=cable.resize(SIZE,Image.Resampling.LANCZOS)
    body=Image.new('RGBA',SIZE);body.paste(person,tuple(PAD))
    # A shared foreground strap set covers the original strap occlusions.
    front=Image.new('RGBA',(SIZE[0]*AA,SIZE[1]*AA));draw=ImageDraw.Draw(front)
    for polygon in []:  # Native flexible straps retained in athlete/source-equipment layer.
        ps=[tuple((np.array(p)+PAD)*AA) for p in polygon]
        draw.polygon(ps,fill=(42,45,49,255));draw.line(ps+[ps[0]],fill=(93,97,103,255),width=2*AA)
    front=front.resize(SIZE,Image.Resampling.LANCZOS)
    result=Image.new('RGBA',SIZE,(0,0,0,255))
    for layer in [core,cable,body,front]:result=Image.alpha_composite(result,layer)
    for name,im in [('equipment',core),('cable',cable),('athlete',body),('front-straps',front),('native',result)]:im.save(OUT/f'{label}-{name}.png')
    records.append({'state':label,'sourceAthleteSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'wholeAthleteScale':1,'wholeAthleteTranslation':PAD.tolist(),'selectedStackTopWorldZ':tops[label],'selectedPlateCount':3,'unselectedPlateCount':7,'totalPlateCount':10,'cableRoute':cable_route})
assert abs(records[0]['cableRoute']['totalMetres']-records[1]['cableRoute']['totalMetres'])<1e-12
value={'status':'new-controlled-hinge-seated-row-equipment-and-palette-draft-awaiting-native-review','variation':'Controlled torso-hinge seated cable row','camera':{'type':'orthographic illustrative construction, not recovered body calibration','yawDegrees':45,'pitchDegrees':6,'rollDegrees':0,'pixelsPerMetre':SCALE,'projectionRows':C.tolist(),'screenOrigin':ORIGIN.tolist()},'canvas':list(SIZE),'bodyRescaleWarpOrGraft':False,'physicalStates':2,'fixedBench':seat.tolist(),'fixedFootplate':{'centre':foot.tolist(),'tiltDegrees':37,'dimensions':[.60,.46,.036]},'fixedPulleyCentresXZ':[P0.tolist(),U.tolist()],'routing':'Fixed lower redirect, fixed upper return, vertical selected stack end: 1:1 including exact tangent length and both pulley wrap arcs. All cable lies in the same world XZ plane.','handlePayoutMetres':payout,'selectedStackLiftDifferenceMetres':tops['B']-tops['A'],'states':records,'heldAttachmentFinding':'Retained original held-bar/hand pixels, including their native source pose variations. No calibrated rigid-bar certification.','maskFindings':'Extraction masks and common foreground straps require direct native boundary/contact review before packaging.','newImageRequests':0,'productionEligible':False,'completionCredit':False}
with (OUT/'construction-proof.json').open('x',encoding='utf8') as f:json.dump(value,f,indent=2)
print(json.dumps({'payoutMetres':payout,'stackTops':tops,'constantCableLengthMetres':records[0]['cableRoute']['totalMetres'],'canvas':SIZE,'nativeReviewRequired':True}))
