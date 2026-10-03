from pathlib import Path
from PIL import Image
import numpy as np,json,hashlib
R=Path(__file__).parent
master=Image.open(R/'sources/1.png').convert('RGB'); w,h=master.size
fixed=[(0,420,530,700),(0,986,530,1536),(0,1340,1024,1536),(855,405,1024,1536),(508,1298,575,1331)]
contacts=[]
records=[]
for n,lift in [(1,0),(2,8),(3,64)]:
 im=Image.open(R/'sources'/f'{n}.png').convert('RGB')
 for box in fixed:im.paste(master.crop(box),box[:2])
 # Same seven selected plates and sleeves move rigidly; lower stack remains fixed.
 box=(293,700,478,986)
 rods=master.crop((293,700,478,710)).resize((185,286),Image.Resampling.NEAREST)
 im.paste(rods,box[:2])
 im.paste(master.crop((293,790,478,986)),(293,790-lift))
 # Cage outside the moving stack retains exact master pixels.
 for box in [(0,700,293,986),(478,700,530,986)]:im.paste(master.crop(box),box[:2])
 im.save(R/'frames'/f'{n}.png')
 arr=np.asarray(im);base=np.asarray(master)
 errors=[int(np.abs(arr[t:b,l:r].astype(int)-base[t:b,l:r].astype(int)).max()) for l,t,r,b in fixed+contacts]
 assert max(errors)==0,(n,errors)
 records.append({'frame':n,'selectedStackLiftPixels':lift,'fixedRegions':fixed,'fixedContacts':contacts,'maxPixelErrors':errors,'sha256':hashlib.sha256((R/'frames'/f'{n}.png').read_bytes()).hexdigest()})
for dst,src in [(4,3),(5,2),(6,1)]:(R/'frames'/f'{dst}.png').write_bytes((R/'frames'/f'{src}.png').read_bytes())
(R/'composition.json').write_text(json.dumps({'method':'Generated upright standing poses retain native athlete and shoe pixels. Exact fixed-frame regions and one rigid selected weight-stack layer preserve equipment. No body warping or resizing.','frames':records},indent=2)+'\n')
print('Fixed frame pixels and rigid stack layer pass; native body/foot poses retained.')
