from pathlib import Path
from PIL import Image
import numpy as np,json,hashlib
R=Path(__file__).parent
master=Image.open(R/'sources/1.png').convert('RGB')
regions=[(0,650,1536,1024),(1080,450,1260,650)]
records=[]
for n in range(1,4):
 im=Image.open(R/'sources'/f'{n}.png').convert('RGB')
 for box in regions:im.paste(master.crop(box),box[:2])
 im.save(R/'frames'/f'{n}.png')
 a=np.asarray(im).astype(int);b=np.asarray(master).astype(int)
 errors=[int(np.abs(a[t:d,l:r]-b[t:d,l:r]).max()) for l,t,r,d in regions]
 assert max(errors)==0
 records.append({'frame':n,'fixedRegionMaxErrors':errors,'sha256':hashlib.sha256((R/'frames'/f'{n}.png').read_bytes()).hexdigest()})
for dst,src in [(4,3),(5,2),(6,1)]:(R/'frames'/f'{dst}.png').write_bytes((R/'frames'/f'{src}.png').read_bytes())
(R/'composition.json').write_text(json.dumps({'method':'Fixed base and ankle-restraint regions copied from setup; native athlete pixels retained.','fixedRegions':regions,'frames':records,'releaseApproved':False},indent=2)+'\n')
print('Three distinct poses, full horizontal endpoint, exact fixed base and restraint regions.')
