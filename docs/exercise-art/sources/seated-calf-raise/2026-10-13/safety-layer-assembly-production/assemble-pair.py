from pathlib import Path
import math, json, hashlib
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent / 'direct-raised-photo-production' / '3-raised-direct-original.png'
size = (1024, 1536)
original = Image.open(SRC).convert('RGBA')
# Semantic equipment regions only. The shaft polygon stays inside its metal
# surface, avoiding the original far shoe's silhouette at the left boundary.
mask = Image.new('L', size, 0)
d = ImageDraw.Draw(mask)
d.polygon([(518,579),(540,1115),(567,1115),(548,579)], fill=255)
d.ellipse((514,568,551,583), fill=255)
d.polygon([(433,578),(512,594),(510,611),(429,594)], fill=255)
d.ellipse((418,568,439,592), fill=255)
d.ellipse((502,586,518,616), fill=255)
rgba = np.array(original)
rgba[:,:,3] = np.array(mask)
layer = Image.fromarray(rgba)
layer.save(ROOT / 'safety-assembly-source-layer.png')
# Equipment-only rigid swing about the existing base hinge. This is an
# illustrative screen-plane construction, not a calibrated 3D measurement.
angle = 24.0
theta = math.radians(angle)
c, s = math.cos(theta), math.sin(theta)
px, py = 550.0, 1120.0
inverse = (c,s,px-c*px-s*py,-s,c,py+s*px-c*py)
released = layer.transform(size, Image.Transform.AFFINE, inverse,
                           resample=Image.Resampling.BICUBIC)
released.save(ROOT / 'shared-disengaged-safety-layer.png')
common = Image.open(ROOT / '3-raised-without-safety.png').convert('RGBA')
base_mask = Image.new('L', size, 0)
ImageDraw.Draw(base_mask).rectangle((0,1078,1023,1535), fill=255)
# Body-free rear upright/floor region. Its boundary stays left of the
# complete generated shoes; copying its background also removes the old
# floor-foot position rather than leaving a double rim at a horizontal seam.
rear_region=[(140,835),(308,835),(310,965),(345,990),(360,1005),(369,1015),(371,1035),
             (373,1078),(300,1107),(130,1110),(130,990)]
ImageDraw.Draw(base_mask).polygon(rear_region,fill=255)
base = common.copy(); base.putalpha(base_mask)
base.save(ROOT / 'shared-floor-base-layer.png')
# Neutral equipment bearing housing covers the small source redraw of the
# rear journal while retaining a single stationary visible shaft/cap.
bearing = Image.new('RGBA', size, (0,0,0,0))
bd=ImageDraw.Draw(bearing)
bd.polygon([(151,795),(176,784),(212,794),(212,850),(181,866),(152,853)],
           fill=(69,70,70,255),outline=(33,34,34,255),width=2)
# Restrained neutral metal shading within the equipment face; body pixels
# are never sampled, transformed or shaded by this operation.
face_mask=Image.new('L',size,0)
ImageDraw.Draw(face_mask).polygon([(154,797),(177,788),(209,797),
                                 (209,848),(181,862),(155,850)],fill=255)
yy,xx=np.indices((size[1],size[0]))
v=np.clip(88-0.18*(xx-154)-0.13*(yy-797),68,96).astype(np.uint8)
sh=np.zeros((size[1],size[0],4),dtype=np.uint8)
sh[:,:,0]=v;sh[:,:,1]=v+1;sh[:,:,2]=v+1;sh[:,:,3]=np.array(face_mask)
bearing=Image.alpha_composite(bearing,Image.fromarray(sh))
bd=ImageDraw.Draw(bearing)
bd.line([(153,795),(177,787),(209,797)],fill=(143,144,144,255),width=2)
bd.line([(153,851),(181,862),(210,848)],fill=(44,45,45,255),width=2)
cap_mask=Image.new('L',size,0)
ImageDraw.Draw(cap_mask).ellipse((161,800,198,835),fill=255)
cap=common.copy();cap.putalpha(cap_mask)
bearing=Image.alpha_composite(bearing,cap)
bearing.save(ROOT/'shared-rear-bearing-layer.png')
hinge_mask = Image.new('L', size, 0)
ImageDraw.Draw(hinge_mask).ellipse((524,1093,579,1158), fill=255)
hinge = common.copy(); hinge.putalpha(hinge_mask)
hinge.save(ROOT / 'shared-ground-hinge-front-layer.png')
rail_mask=Image.new('L',size,0)
ImageDraw.Draw(rail_mask).polygon([(378,1054),(600,1005),(600,1019),(381,1074)],fill=255)
rail=common.copy();rail.putalpha(rail_mask)
rail.save(ROOT/'shared-platform-front-face-layer.png')
rows=[]
for stem in ['1-lower','2-near-top','3-raised']:
    source = Image.open(ROOT / (stem+'-without-safety.png')).convert('RGBA')
    out = Image.alpha_composite(source,base)
    out = Image.alpha_composite(out,bearing)
    out = Image.alpha_composite(out,rail)
    out = Image.alpha_composite(out,released)
    out = Image.alpha_composite(out,hinge)
    out.convert('RGB').save(ROOT / (stem+'-assembly-draft.png'))
    source_rgb=np.array(source.convert('RGB'))
    out_rgb=np.array(out.convert('RGB'))
    diff=np.any(source_rgb!=out_rgb,axis=2)
    # These are observed image differences, not semantic anatomy approval.
    rows.append({'pose':stem,'source':stem+'-without-safety.png',
                 'changedPixels':int(diff.sum()),'bodyTransform':False,
                 'sourceCoordinatesUnchanged':True,'status':'Provisional native review required'})
    out.convert('RGB').crop((310,845,625,1078)).save(ROOT/(stem+'-feet-native.png'))
    out.convert('RGB').crop((140,765,285,900)).save(ROOT/(stem+'-rear-joint-native.png'))
    out.convert('RGB').crop((405,1070,660,1200)).save(ROOT/(stem+'-hinge-native.png'))
(ROOT/'assembly-provenance.json').write_text(json.dumps({
    'method':'Whole connected generated source plus shared equipment layers',
    'equipmentSource':str(SRC),'safetySourceRegions':'Explicit semantic polygon/ellipses in assemble-pair.py',
    'equipmentRotationDegrees':angle,'equipmentPivot':[px,py],
    'anatomicalTransforms':False,'anatomicalGrafts':False,
    'limits':'Safety swing is screen-plane illustrative equipment construction, not calibrated 3D. Source-layer and native overlap review required.',
    'rows':rows,
    'sourceSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [SRC,ROOT/'1-lower-without-safety.png',ROOT/'3-raised-without-safety.png']}
},indent=2)+'\n')
black=Image.new('RGBA',size,(0,0,0,255))
Image.alpha_composite(black,layer).convert('RGB').save(ROOT/'safety-source-layer-black-preview.png')
Image.alpha_composite(black,released).convert('RGB').save(ROOT/'safety-released-layer-black-preview.png')
print(json.dumps(rows))
