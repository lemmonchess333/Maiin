from PIL import Image, ImageDraw
from pathlib import Path
import json
import argparse, subprocess
parser=argparse.ArgumentParser(description='Reproduce display-only screening sheets from the pinned original checkout.')
parser.add_argument('--repo',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();R=args.repo.resolve();O=args.output.resolve()
assert subprocess.check_output(['git','-C',str(R),'rev-parse','HEAD'],text=True).strip()=='5dabd5e45fb83e8a0dc57d2d0933102fe5bcf926', 'Use the pinned original source head'
O.mkdir(parents=True,exist_ok=True)
ids=['bench-press','overhead-press','barbell-row','dips']
for ident in ids:
 s=Image.new('RGB',(1800,600),'#18181c');d=ImageDraw.Draw(s)
 for j in range(1,7):
  im=Image.open(R/f'public/form-frames/{ident}/{j}.webp').convert('RGB');im.thumbnail((300,550))
  x=(j-1)*300+(300-im.width)//2;y=35+(550-im.height)//2;s.paste(im,(x,y));d.text(((j-1)*300+10,10),f'{ident} | {j}',fill='white')
 s.save(O/f'{ident}-all-six.png')
ids=sorted(p.stem for p in (R/'public/form-art').glob('*.webp'))
for k in range(0,len(ids),24):
 sub=ids[k:k+24];s=Image.new('RGB',(1600,1400),'#18181c');d=ImageDraw.Draw(s)
 for j,ident in enumerate(sub):
  im=Image.open(R/f'public/form-art/{ident}.webp').convert('RGBA');im.thumbnail((250,290));bg=Image.new('RGBA',im.size,'#18181c');bg.alpha_composite(im)
  x=(j%6)*266+(266-im.width)//2;y=(j//6)*350+35+(290-im.height)//2;s.paste(bg.convert('RGB'),(x,y));d.text(((j%6)*266+8,(j//6)*350+8),f'{k+j+1}: {ident}',fill='white')
 s.save(O/f'catalogue-{k//24+1}.png')
(O/'catalogue-ids.json').write_text(json.dumps(ids,indent=2))
print(len(ids),'cards')
