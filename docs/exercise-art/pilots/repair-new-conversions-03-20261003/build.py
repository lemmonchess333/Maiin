"""Deterministic fixed-contact repair; original native generations retained."""
from pathlib import Path
from PIL import Image
import numpy as np
import json, hashlib
R=Path(__file__).parent
out=R/'pistol-squat'/'frames';out.mkdir(parents=True,exist_ok=True)
master=Image.open(R/'sources/pistol-squat/1.png').convert('RGB')
master.save(out/'1.png')
records=[]
for n,source,dx,dy in [(2,'2.png',1,33),(3,'repaired-background-3.png',3,63)]:
 im=Image.open(R/'sources/pistol-squat'/source).convert('RGB')
 # Rigid body translation: no scaling, rotation or anatomical warping.
 moved=Image.new('RGB',im.size,(0,0,0));moved.paste(im,(dx,dy))
 a=np.asarray(moved).astype(float);b=np.asarray(master).astype(float)
 # Sole and lower shoe fixed exactly. Short calf transition above the shoe.
 for y in range(1230,1300):
  t=(y-1230)/70;t=t*t*(3-2*t)
  # Align calf silhouettes before blending, avoiding a double contour.
  source_row=a[y,:500].copy();target_row=b[y,:500]
  sx=np.flatnonzero(source_row.max(axis=1)>40);tx=np.flatnonzero(target_row.max(axis=1)>40)
  assert len(sx) and len(tx)
  sl,sr=int(sx[0]),int(sx[-1]);tl,tr=int(tx[0]),int(tx[-1])
  left=sl*(1-t)+tl*t;right=sr*(1-t)+tr*t
  row=np.zeros((500,3));positions=(np.arange(500)-left)/(right-left)*(sr-sl)+sl
  for c in range(3):row[:,c]=np.interp(positions,np.arange(500),source_row[:,c],left=0,right=0)
  master_row=np.zeros((500,3));positions=(np.arange(500)-left)/(right-left)*(tr-tl)+tl
  for c in range(3):master_row[:,c]=np.interp(positions,np.arange(500),target_row[:,c],left=0,right=0)
  a[y,:500]=row*(1-t)+master_row*t
 a[1300:,:500]=b[1300:,:500]
 result=Image.fromarray(np.uint8(np.clip(a,0,255)))
 result.save(out/f'{n}.png')
 records.append({'frame':n,'source':str(R/'sources/pistol-squat'/source),'translation':[dx,dy],'fixedRegion':[0,1300,500,1536],'calfBlendRows':[1230,1300]})
for dst,src in [(4,3),(5,2),(6,1)]: (out/f'{dst}.png').write_bytes((out/f'{src}.png').read_bytes())
(R/'pistol-squat/composition.json').write_text(json.dumps({'method':'Rigid translation followed by exact master sole/lower-shoe region and contour-aligned calf transition with local row resampling; no whole-image rescaling.','operations':records,'releaseApproved':False},indent=2)+'\n')

for id,files,regions in [
 ('glute-ham-raise',['1.png','repaired-background-2.png','3.png'],[(0,650,1536,1024),(1080,450,1260,650)]),
 ('donkey-calf-raise',['repaired-1.png','repaired-2.png','repaired-3.png'],[(0,850,1536,1024),(0,220,340,850),(715,300,845,850)])
]:
 out=R/id/'frames';out.mkdir(parents=True,exist_ok=True)
 master=Image.open(R/'sources'/id/files[0]).convert('RGB')
 for n,source in enumerate(files,1):
  im=Image.open(R/'sources'/id/source).convert('RGB')
  for region in regions:im.paste(master.crop(region),region[:2])
  im.save(out/f'{n}.png')
 for dst,src in [(4,3),(5,2),(6,1)]: (out/f'{dst}.png').write_bytes((out/f'{src}.png').read_bytes())
 (R/id/'composition.json').write_text(json.dumps({'method':'Exact copies of stationary machine regions from selected setup; original body poses retained.','sources':files,'fixedRegions':regions,'releaseApproved':False},indent=2)+'\n')
