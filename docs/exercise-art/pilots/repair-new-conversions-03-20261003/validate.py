"""Validate fixed contact regions and scene-background continuity, not anatomy."""
from pathlib import Path
from PIL import Image
import numpy as np
import json,hashlib
R=Path(__file__).parent
regions={'pistol-squat':[(0,1300,500,1536)],'glute-ham-raise':[(0,650,1536,1024),(1080,450,1260,650)],'donkey-calf-raise':[(0,850,1536,1024),(0,220,340,850),(715,300,845,850)]}
rows=[]
for id,boxes in regions.items():
 master=np.asarray(Image.open(R/id/'frames/1.png').convert('RGB'))
 for n in range(1,7):
  p=R/id/'frames'/f'{n}.png';im=np.asarray(Image.open(p).convert('RGB'));assert im.shape==master.shape
  corners=[im[:16,:16],im[:16,-16:],im[-16:,:16],im[-16:,-16:]]
  maximum=max(int(c.max()) for c in corners);assert maximum<=15,(id,n,maximum)
  errors=[]
  for x1,y1,x2,y2 in boxes:
   errors.append(int(np.abs(im[y1:y2,x1:x2].astype(int)-master[y1:y2,x1:x2].astype(int)).max()))
  assert max(errors)==0,(id,n,errors)
  rows.append({'exerciseId':id,'frame':n,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'cornerMaximumChannel':maximum,'fixedRegionMaximumErrors':errors})
(R/'FIXED_REGIONS_VALIDATION.json').write_text(json.dumps({'releaseApproved':False,'scope':'Exact fixed-region comparison and four 16x16 dark background corner patches; does not validate anatomy, full equipment geometry or mechanics.','regions':regions,'frames':rows},indent=2)+'\n')
print('18 frames: dark background corners and all declared fixed regions pass')
