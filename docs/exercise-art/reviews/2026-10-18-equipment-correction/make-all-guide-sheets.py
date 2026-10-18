from PIL import Image, ImageDraw, ImageChops
from pathlib import Path
import json
import argparse, subprocess
parser=argparse.ArgumentParser(description='Reproduce display-only screening sheets from the pinned original checkout.')
parser.add_argument('--repo',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();R=args.repo.resolve();O=args.output.resolve()
assert subprocess.check_output(['git','-C',str(R),'rev-parse','HEAD'],text=True).strip()=='5dabd5e45fb83e8a0dc57d2d0933102fe5bcf926', 'Use the pinned original source head'
O.mkdir(parents=True,exist_ok=True)
ids=sorted(p.name for p in (R/'public/form-frames').iterdir() if p.is_dir())
font=None
bounds={}
for k in range(0,len(ids),6):
 sub=ids[k:k+6];s=Image.new('RGB',(1800,2400),'#18181c');d=ImageDraw.Draw(s)
 for n,ident in enumerate(sub):
  ims=[Image.open(R/f'public/form-frames/{ident}/{j}.webp').convert('RGB') for j in range(1,7)]
  bs=[im.convert('L').point(lambda a:255 if a>55 else 0).getbbox() for im in ims];bs=[b for b in bs if b]
  bb=(min(b[0] for b in bs),min(b[1] for b in bs),max(b[2] for b in bs),max(b[3] for b in bs));bounds[ident]=bb
  for j,im in enumerate(ims):
   im=im.crop(bb);im.thumbnail((296,355));x=j*300+(300-im.width)//2;y=n*400+35+(355-im.height)//2;s.paste(im,(x,y));d.text((j*300+5,n*400+8),f'{k+n+1}. {ident} | {j+1}',fill='white')
 s.save(O/f'all-guides-{k//6+1:02}.png')
(O/'all-guides-inventory.json').write_text(json.dumps({'ids':ids,'display_crop_bounds':bounds},indent=2))
print(len(ids),'guides')
