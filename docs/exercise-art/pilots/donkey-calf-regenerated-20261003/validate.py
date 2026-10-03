"""Check the fixed machine pixels and rigid-link geometry; not human technique."""
from pathlib import Path
from PIL import Image
import numpy as np,json,math,hashlib
R=Path(__file__).parent
composition=json.loads((R/'composition.json').read_text());master=np.asarray(Image.open(R/'frames/1.png').convert('RGB'))
lengths=[];records=[]
for f in composition['frames']:
 n=f['frame'];p=R/'frames'/f'{n}.png';a=np.asarray(Image.open(p).convert('RGB'));errors=[]
 for x1,y1,x2,y2 in f['fixedRegions']:
  errors.append(int(np.abs(a[y1:y2,x1:x2].astype(int)-master[y1:y2,x1:x2].astype(int)).max()))
 assert max(errors)==0
 length=math.dist(f['pivot'],f['padMount']);lengths.append(length)
 corners=[a[:16,:16],a[:16,-16:],a[-16:,:16],a[-16:,-16:]];maximum=max(int(c.max()) for c in corners);assert maximum<16
 records.append({'frame':n,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'fixedRegionMaxErrors':errors,'backgroundCornerMax':maximum,'pivotToPadMountPixels':length})
assert max(lengths)-min(lengths)<1e-9
for dst,src in [(4,3),(5,2),(6,1)]:assert (R/'frames'/f'{dst}.png').read_bytes()==(R/'frames'/f'{src}.png').read_bytes()
(R/'MECHANICS_VALIDATION.json').write_text(json.dumps({'passed':True,'scope':'Exact stationary machine pixels; analytic rigid lever length and fixed pivot; identical reverse-pose reuse. No anatomical approval.', 'releaseApproved':False,'frames':records},indent=2)+'\n')
print('Fixed supports, lever length, backgrounds and return reuse pass')
