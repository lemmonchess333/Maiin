from PIL import Image, ImageDraw
from pathlib import Path
import argparse, subprocess
parser=argparse.ArgumentParser(description='Reproduce display-only screening sheets from the pinned original checkout.')
parser.add_argument('--repo',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();R=args.repo.resolve();O=args.output.resolve()
assert subprocess.check_output(['git','-C',str(R),'rev-parse','HEAD'],text=True).strip()=='5dabd5e45fb83e8a0dc57d2d0933102fe5bcf926', 'Use the pinned original source head'
O.mkdir(parents=True,exist_ok=True)
ids=['seated-row','reverse-grip-cable-pushdown','calf-raise','standing-calf-raise','cable-curl','cable-crunch','lat-pulldown','single-arm-cable-pushdown','single-arm-lat-pulldown','overhead-cable-tricep-extension','leg-press','hip-thrust','seated-calf-raise','shoulder-press-machine','incline-bench','smith-bench-press','smith-shoulder-press','front-squat','clean-and-press','thrusters']
for ident in ids:
 s=Image.new('RGB',(1800,650),'#18181c');d=ImageDraw.Draw(s)
 for j in range(1,7):
  p=R/f'public/form-frames/{ident}/{j}.webp'
  if not p.exists(): continue
  im=Image.open(p).convert('RGB');im.thumbnail((300,600));x=(j-1)*300+(300-im.width)//2;y=35+(600-im.height)//2;s.paste(im,(x,y));d.text(((j-1)*300+10,10),f'{ident} | {j}',fill='white')
 s.save(O/f'{ident}-all-six.png')
