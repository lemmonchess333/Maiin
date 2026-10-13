from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,math,hashlib
p=Path(__file__).resolve().parent;s=p.parent/'arm-window-production'
base=Image.open(s/'1-master.png').convert('RGBA')
inputs={'bottom':base,'middle':Image.open(p/'middle-selection-draft.png').convert('RGBA'),'top':Image.open(p/'top-selection-draft.png').convert('RGBA')}
def axis(im):
 a=np.asarray(im.convert('RGB'));pts=[]
 for x in list(range(315,345))+list(range(996,1015)):
  col=a[:500,x];q=np.max(col,axis=1);neutral=np.max(col,axis=1)-np.min(col,axis=1)<30
  yy=np.flatnonzero((q>130)&neutral)
  assert len(yy)>2,(x,len(yy))
  pts.append((x,float(np.mean(yy))))
 coeff=np.polyfit(*np.asarray(pts).T,1)
 return [float(coeff[0]),float(coeff[1])]
source_axis=axis(base);source_angle=math.atan(source_axis[0]);plate_specs=[{'side':'near','x':400,'crop':[352,270,486,481],'outline':[(385,278),(416,281),(442,303),(460,337),(477,379),(478,413),(469,442),(453,461),(432,474),(410,475),(389,461),(369,433),(357,394),(356,357),(365,317),(377,291)]},{'side':'far','x':917,'crop':[860,195,1000,381],'outline':[(879,208),(902,201),(929,207),(954,231),(975,271),(984,314),(980,346),(966,365),(946,378),(922,379),(900,363),(884,336),(874,301),(872,264),(875,232)]}]
records=[]
for name,im in inputs.items():
 line=axis(im);angle=math.atan(line[0]);delta=angle-source_angle;c=math.cos(delta);sn=math.sin(delta)
 out=im.copy();equipment=Image.new('RGBA',im.size);allowed=Image.new('L',im.size);ed=ImageDraw.Draw(equipment);md=ImageDraw.Draw(allowed)
 placements=[]
 for spec in plate_specs:
  x=spec['x'];y=line[0]*x+line[1];crop=tuple(spec['crop']);patch=base.crop(crop)
  silhouette=Image.new('L',patch.size);sd=ImageDraw.Draw(silhouette);sd.polygon([(a-crop[0],b-crop[1]) for a,b in spec['outline']],fill=255)
  alpha=np.array(silhouette);alpha[np.max(np.asarray(patch)[:,:,:3],axis=2)<=2]=0;patch.putalpha(Image.fromarray(alpha))
  roi=(352,round(y-108),481,round(y+109)) if spec['side']=='near' else (868,round(y-99),993,round(y+102))
  # These isolated gear-only rectangles contain no athlete pixels in any pose.
  ed.rectangle(roi,fill=(0,0,0,255));md.rectangle((roi[0]-10,roi[1]-10,roi[2]+10,roi[3]+10),fill=255)
  x1,x2=roi[0],roi[2];y1,y2=line[0]*x1+line[1],line[0]*x2+line[1]
  ed.line([(x1,y1),(x2,y2)],fill=(76,78,82,255),width=16)
  ed.line([(x1,y1-1),(x2,y2-1)],fill=(166,168,172,255),width=12)
  ed.line([(x1,y1-4),(x2,y2-4)],fill=(234,235,236,255),width=3)
  ax=x-crop[0];ay=source_axis[0]*x+source_axis[1]-crop[1]
  affine=(c,sn,ax-c*x-sn*y,-sn,c,ay+sn*x-c*y)
  transformed=patch.transform(im.size,Image.Transform.AFFINE,affine,resample=Image.Resampling.BICUBIC,fillcolor=(0,0,0,0))
  equipment=Image.alpha_composite(equipment,transformed)
  fullalpha=np.asarray(transformed.getchannel('A'));m=np.array(allowed);m[fullalpha>0]=255;allowed=Image.fromarray(m);md=ImageDraw.Draw(allowed);ed=ImageDraw.Draw(equipment)
  placements.append({'side':spec['side'],'sourceCrop':crop,'sourceAxle':[x,source_axis[0]*x+source_axis[1]],'targetAxle':[x,y],'equipmentRotationRadians':delta,'equipmentRescale':False,'clearGearOnlyROI':roi})
 out=Image.alpha_composite(out,equipment)
 changed=np.any(np.asarray(out)!=np.asarray(im),axis=2);assert not changed[np.asarray(allowed)==0].any();assert not changed[512:].any()
 out.save(p/f'pose-{name}-equipment.png');equipment.save(p/f'pose-{name}-equipment-layer.png');allowed.save(p/f'pose-{name}-equipment-mask.png')
 records.append({'pose':name,'axis':line,'sourceAxis':source_axis,'placements':placements,'outsideEquipmentRegionPixelsChanged':0,'fixedLowerScenePixelsChanged':0,'anatomyTransforms':False,'sourcePlatePixelsReused':'Both original folded-master plates, unchanged size; only equipment rigid rotation/translation and neutral shaft joins.','sha256':hashlib.sha256((p/f'pose-{name}-equipment.png').read_bytes()).hexdigest()})
(p/'equipment-review.json').write_text(json.dumps({'scope':'User-authorized equipment finishing. Original plate crops contain no anatomy. Original source-body pixels outside isolated equipment regions are exact; masks and source provenance retained. Native rigidity/contact review still required.','poses':records},indent=2)+'\n',encoding='utf-8')
print(json.dumps([{'pose':q['pose'],'axis':q['axis'],'plateTargets':[r['targetAxle'] for r in q['placements']]} for q in records],indent=2))
