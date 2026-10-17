"""Outside-repository retained Bike two-position draft; no new image requests.

Preserves original whole scenes. Finishing changes only existing purple muscle
pixels; role polygons classify that existing chroma, never draw body geometry.
One documented whole-scene integer offset and one common crop; no scaling/fitting.
No production/registry/release/counter writes or forward-trajectory claim.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import hashlib, io, json, shutil, zipfile
import xml.etree.ElementTree as ET
import numpy as np
from collections import deque
import argparse

R=Path(__file__).resolve().parent
OLD=R.parent/'direct-photo-cycle-production'
REPO=R.parents[1]/'Maiin-burpees'
P=(123,114,233);S=(149,144,224);C=(119,119,119)
NAMES=['3-lower-direct-original.png','6-upper-direct-original.png']
HASHES=['d472dff2a1ecae8c2db250870f37e9611ddf72b3c72fcc1772c55ce0327ec2c8','5ab3dda61201910648ef64c9e894e0e4a301aef5efb1c237ecbb746e6f54bfda']
OFFSETS=[(0,0),(-1,16)]
VALUE_ANCHORS=[{1:229,2:173},{1:239,2:174}]
# The union crop contains both entire equipment silhouettes, every visible body
# and trainer pixel, both original grips/pedals. The upper far shoe remains
# naturally hidden by the original opaque housing; no invented hidden anatomy.
CROP=(48,32,977,1464)
ORDER=[1,1,2,2,1,1]
sha=lambda path:hashlib.sha256(Path(path).read_bytes()).hexdigest()

def save(path,data):path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def png(im):
 b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()
def mask(polygons):
 im=Image.new('L',(1024,1536));d=ImageDraw.Draw(im)
 for poly in polygons:d.polygon(poly,fill=255)
 return np.asarray(im)>0
def source_component(chroma,seed):
 # Strong source-colour connectivity, then only a2px source-colour antialias
 # fringe. This cannot cross the broad neutral gap to the adjacent quad field.
 eligible=chroma>12;seen=np.zeros(eligible.shape,bool);q=deque([seed]);seen[seed[1],seed[0]]=True
 while q:
  x,y=q.popleft()
  for xx,yy in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
   if 0<=xx<1024 and 0<=yy<1536 and eligible[yy,xx] and not seen[yy,xx]:seen[yy,xx]=True;q.append((xx,yy))
 grown=np.asarray(Image.fromarray(np.uint8(seen)*255).filter(ImageFilter.MaxFilter(5)))>0
 return grown & (chroma>6)
def translate(im,offset):
 out=Image.new('RGBA',im.size,(0,0,0,255));out.paste(im,offset);return out
def ora(path,layers,merged):
 tree=ET.Element('image',{'w':str(merged.width),'h':str(merged.height),'name':'Retained canonical Stationary Bike: two opposed positions, not a sampled forward trajectory'})
 stack=ET.SubElement(tree,'stack')
 with zipfile.ZipFile(path,'w') as z:
  z.writestr('mimetype','image/openraster')
  for i,(name,layer) in enumerate(reversed(layers)):
   src=f'data/{i}.png';z.writestr(src,png(layer));ET.SubElement(stack,'layer',{'name':name,'src':src,'x':'0','y':'0','opacity':'1.0','visibility':'visible','composite-op':'svg:src-over'})
  z.writestr('stack.xml',ET.tostring(tree));z.writestr('mergedimage.png',png(merged))
 with zipfile.ZipFile(path) as z:
  check=Image.new('RGBA',merged.size)
  for layer in reversed(list(ET.fromstring(z.read('stack.xml')).find('stack'))):check.alpha_composite(Image.open(io.BytesIO(z.read(layer.attrib['src']))).convert('RGBA'))
  assert check.tobytes()==merged.tobytes()

# These boundaries lie in neutral gaps around existing coloured muscle regions;
# only source-blue pixel weights can change, not the drawn polygon silhouettes.
calfPolygons=[
 [[(461,682),(494,681),(520,695),(542,718),(555,746),(559,778),(558,803),(546,825),(515,815),(481,778),(458,729)]],
 [[(438,649),(490,649),(510,670),(540,690),(574,720),(575,900),(434,900)],[(622,833),(657,836),(705,887),(700,974),(568,974),(568,873),(600,855)]]
]
farHamLower=[[(476,677),(530,677),(575,681),(610,678),(606,688),(594,697),(577,707),(549,703),(512,698),(478,692)]]
parser=argparse.ArgumentParser();parser.add_argument('--only-pose',type=int,choices=[1,2]);args=parser.parse_args()
previous=json.loads((R/'finishing-audit.json').read_text()) if args.only_pose else None
evidence=[]
for name,expected in zip(NAMES,HASHES):
 if not (R/name).exists():
  assert sha(OLD/name)==expected;shutil.copy2(OLD/name,R/name)
 assert sha(R/name)==expected
for name in ['provenance.json','PAIR-REVIEW.md','static-scene-inspection.json','pair-playback-trace.json','lower-photo-prompt.txt','upper-photo-prompt.txt','front-service-rejection.json','HOLD.md','photographed-source-evidence.json']:
 target=R/'historical-evidence'/name;target.parent.mkdir(exist_ok=True)
 if not target.exists():shutil.copy2(OLD/name,target)
 if (OLD/name).is_file():assert target.read_bytes()==(OLD/name).read_bytes()

for n,name in enumerate(NAMES,1):
 if args.only_pose and n!=args.only_pose:
  evidence.append(previous['poses'][n-1]);continue
 base=Image.open(R/name).convert('RGBA');a=np.asarray(base);rgb=a[:,:,:3].astype(float)
 assert base.size==(1024,1536)
 # Existing source chroma only, inside the actual lower-body fields.
 domain=np.zeros(a.shape[:2],bool);domain[530:1170,350:850]=True
 delta=rgb[:,:,2]-np.minimum(rgb[:,:,0],rgb[:,:,1])
 chroma=np.clip((delta-6)/22,0,1)*domain
 calf=mask(calfPolygons[n-1])
 if n==1:
  nearHam=source_component(delta,(698,802));nearCalf=source_component(delta,(620,1000))
  yy0,xx0=np.where(nearHam);assert xx0.min()>600 and yy0.min()>710
  yy0,xx0=np.where(nearCalf);assert yy0.min()>880
  calf|=nearCalf;ham=(nearHam|mask(farHamLower)) & ~calf
  classes=np.where(calf,0,np.where(ham,2,1))
 else:
  # The raised-position quad is a separate actual source field. All other
  # remaining thigh fields are hamstrings after source-calf masks above.
  quad=source_component(delta,(550,600));yy0,xx0=np.where(quad);assert yy0.max()<645
  classes=np.where(calf,0,np.where(quad,1,2))
 np.save(R/f'{n}-source-role-labels.npy',classes)
 out=base.copy();layers=[('intact-retained-original-whole-scene',base)]
 gray=rgb.mean(axis=2).astype(np.uint8)
 neutral=np.zeros(a.shape,np.uint8);neutral[:,:,:3]=gray[:,:,None];neutral[:,:,3]=np.uint8(chroma*(classes==0)*255)
 neutral=Image.fromarray(neutral);out.alpha_composite(neutral);layers.append(('neutralize-only-existing-calf-colour-preserve-source-luminance',neutral))
 value=rgb.max(axis=2)
 anchors={}
 for label,colour,kind in [('primary-quadriceps',P,1),('secondary-hamstrings',S,2)]:
  # The spatial brightness map is inherited from the source itself. One fixed
  # per-role normalization anchors its median to the required palette colour;
  # no new positional gradient or hand-painted contour is introduced.
  # Freeze the first corrected source-derived anchors. Correcting a calf mask
  # must never retune the already-reviewed quadriceps/hamstring colour fields.
  anchor=VALUE_ANCHORS[n-1][kind];anchors[label]=anchor
  role=np.zeros(a.shape,np.uint8);role[:,:,:3]=np.uint8(np.clip(np.rint(np.array(colour)[None,None,:]*value[:,:,None]/anchor),0,255));role[:,:,3]=np.uint8(chroma*(classes==kind)*255)
  layer=Image.fromarray(role)
  out.alpha_composite(layer);layers.append((label,layer));layer.save(R/f'{n}-{label}.png')
 out.save(R/f'{n}-native-finished.png');neutral.save(R/f'{n}-calf-neutralization.png')
 changed=np.any(np.asarray(out)!=a,axis=2)
 assert not np.any(changed & (chroma==0)) and np.array_equal(np.asarray(out)[:,:,3],a[:,:,3])
 normalized=translate(out,OFFSETS[n-1]);normalized.save(R/f'{n}-normalized-whole.png')
 # Any clipped source pixels are pure black background, not anatomy/gear.
 dx,dy=OFFSETS[n-1];nonblack=np.max(rgb,axis=2)>8
 yy,xx=np.where(nonblack)
 assert np.all((xx+dx>=0)&(xx+dx<1024)&(yy+dy>=0)&(yy+dy<1536))
 assert np.all((xx+dx>=CROP[0])&(xx+dx<CROP[2])&(yy+dy>=CROP[1])&(yy+dy<CROP[3]))
 framed=normalized.crop(CROP);framed.save(R/f'{n}-framed.png')
 # Transparent layer padding for the whole-scene offset; opaque original black
 # base supplies canvas fill. No coordinate change is applied to any body part.
 def framedLayer(im,isBase=False):
  bg=Image.new('RGBA',im.size,(0,0,0,255) if isBase else (0,0,0,0));bg.paste(im,OFFSETS[n-1]);return bg.crop(CROP)
 ora(R/f'{n}-framed.ora',[(label,framedLayer(im,i==0)) for i,(label,im) in enumerate(layers)],framed)
 evidence.append({'pose':n,'source':name,'sourceSha256':sha(R/name),'nativeDimensions':[1024,1536],'wholeSceneOffset':list(OFFSETS[n-1]),'commonCrop':list(CROP),'framedDimensions':list(framed.size),'allSourceNeutralPixelsOutsideExistingChromaExact':True,'sourceAlphaExact':True,'sourceNonblackPixelsClipped':0,'sourceAnatomicalScalingFittingWarpingGrafting':False,'equipmentPixelsChanged':False,'changedColourPixels':int(changed.sum()),'existingChromaPixels':int((chroma>0).sum()),'sourceValueAnchors':anchors,'exactPrimaryPixels':int(np.all(np.asarray(out)[:,:,:3]==P,axis=2).sum()),'exactSecondaryPixels':int(np.all(np.asarray(out)[:,:,:3]==S,axis=2).sum()),'nativeFinishedSha256':sha(R/f'{n}-native-finished.png'),'framedSha256':sha(R/f'{n}-framed.png'),'oraSha256':sha(R/f'{n}-framed.ora'),'oraReopenedPixelExact':True})
(R/'final-frames').mkdir(exist_ok=True)
encoded={}
if args.only_pose:
 for pose in [1,2]:
  if pose!=args.only_pose:encoded[pose]=(R/f'final-frames/{ORDER.index(pose)+1}.webp').read_bytes()
for beat,pose in enumerate(ORDER,1):
 im=Image.open(R/f'{pose}-framed.png')
 if pose not in encoded:
  data=io.BytesIO();im.save(data,format='WEBP',lossless=True,quality=100,method=4);encoded[pose]=data.getvalue()
 (R/f'final-frames/{beat}.webp').write_bytes(encoded[pose])
 assert Image.open(R/f'final-frames/{beat}.webp').convert('RGBA').tobytes()==im.convert('RGBA').tobytes()
save(R/'finishing-audit.json',{'status':'corrected colour draft only; native/independent/mobile/equipment review pending','exerciseId':'bike','physicalPoses':2,'sourcePoseOrder':ORDER,'poses':evidence,'primary':['Quads'],'secondary':['Hamstrings'],'neutralizedExistingExtraFields':['Calves'],'newGradient':False,'sourceContourMethod':'Source-derived per-pixel brightness retained with one fixed palette-anchor normalization per role; original neutral contours remain exact. No new positional gradient. Existing calf colour desaturated by original source luminance only. First coarse-mask flat-field draft retained separately and not approved.','claimedForwardTrajectory':False,'claimedSmoothRevolution':False,'claimedSixUniquePoses':False,'completionCredit':False})
save(R/'framing.json',{'sourceDimensions':[1024,1536],'wholeSceneOffsets':OFFSETS,'commonCrop':CROP,'framedDimensions':list(framed.size),'scale':1,'individualBodyTransforms':False,'visibleSourcePixelsClipped':0,'upperFarTrainer':'Naturally occluded by original housing, not reconstructed or claimed fully visible.'})
print(json.dumps({'candidate':str(R),'poses':evidence,'sourcePoseOrder':ORDER,'completionCredit':False},indent=2))
