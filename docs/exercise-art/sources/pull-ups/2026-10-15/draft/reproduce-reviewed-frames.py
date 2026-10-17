"""Reproduce reviewed frames from the two native editable stacks and fixed rack.

No pose/model creation and no per-limb operation. Run from its archived folder
with --out <a separate output folder>; existing reviewed assets are untouched.
"""
from pathlib import Path
from PIL import Image
import io,json,zipfile,xml.etree.ElementTree as ET,argparse,hashlib
import numpy as np
P=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path);parser.add_argument('--verify-only',action='store_true');args=parser.parse_args()
if not args.verify_only and args.out is None:raise SystemExit('Provide --out or use --verify-only.')
out=args.out.resolve() if args.out else None
if out is not None:
 if out==P.resolve() or out.is_relative_to(P/'final-frames'):raise SystemExit('Use a separate output folder.')
 out.mkdir(parents=True,exist_ok=True)
def reopen(path):
 with zipfile.ZipFile(path) as z:
  root=ET.fromstring(z.read('stack.xml'));im=Image.new('RGBA',(int(root.attrib['w']),int(root.attrib['h'])))
  for element in reversed(list(root.find('stack'))):im=Image.alpha_composite(im,Image.open(io.BytesIO(z.read(element.attrib['src']))).convert('RGBA'))
  assert np.array_equal(np.array(im),np.array(Image.open(io.BytesIO(z.read('mergedimage.png'))).convert('RGBA')))
  return im
master=Image.open(P/'originals/fixed-rig-1-master.png').convert('RGBA')
params=[((512,1405),(256,73)),((512,1408),(256,48))];crop=(112,397,912,1472);poses=[]
for n,(size,origin) in enumerate(params,1):
 native=reopen(P/f'{n}-native.ora');scene=master.copy();scene.paste((0,0,0,255),(256,0,768,1536));scene.paste(native.resize(size,Image.Resampling.LANCZOS),origin);frame=scene.crop(crop).convert('RGB');poses.append(frame)
for i,n in enumerate([1,1,2,2,1,1],1):
 target=P/'final-frames'/f'{i}.webp' if args.verify_only else out/f'{i}.webp'
 if not args.verify_only:poses[n-1].save(target,format='WEBP',lossless=True,quality=100,method=6)
 assert Image.open(target).convert('RGB').tobytes()==poses[n-1].tobytes()
folder=P/'final-frames' if args.verify_only else out
print(json.dumps({'mode':'verify-only-no-files-written' if args.verify_only else 'reproduce','output':str(folder),'physicalPoses':2,'sourceOrder':[1,1,2,2,1,1],'sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in folder.glob('*.webp')}},indent=2))
