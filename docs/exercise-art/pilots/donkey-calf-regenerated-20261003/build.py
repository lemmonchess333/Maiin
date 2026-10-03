"""Keep the regenerated athlete; use a single rigid machine lever and fixed supports."""
from pathlib import Path
from PIL import Image,ImageDraw
import math,json
R=Path(__file__).parent
master=Image.open(R/'sources/1.png').convert('RGB');w,h=master.size
pivot=(1231,374);mount=(865,350)
def maskpoly(points):
 m=Image.new('L',(w*4,h*4));ImageDraw.Draw(m).polygon([(x*4,y*4) for x,y in points],fill=255)
 return m.resize((w,h),Image.Resampling.LANCZOS)
armmask=maskpoly([(819,318),(831,319),(843,337),(1212,354),(1243,359),(1247,377),(1214,393),(848,368),(846,387),(820,389)])
d=ImageDraw.Draw(armmask);d.ellipse((1036,264,1175,442),fill=255);d.rectangle((1100,338,1183,370),fill=255)
arm=master.convert('RGBA');arm.putalpha(armmask);arm.save(R/'rigid-arm.png')
padmask=maskpoly([(690,327),(816,320),(822,327),(822,352),(817,361),(686,360),(678,353),(678,339)])
pad=master.convert('RGBA');pad.putalpha(padmask);pad.save(R/'rigid-pad.png')
records=[]
for n,angle in [(1,0),(2,3.1),(3,5.2)]:
 result=Image.open(R/'sources'/f'{n}.png').convert('RGB')
 if n>1:
  # Remove the independently generated linkage, including its drifting pivot.
  ImageDraw.Draw(result).rectangle((822,200,1270,460),fill=(0,0,0))
  # Remove the independently generated cushion without removing the back below it.
  ImageDraw.Draw(result).rectangle((681,298 if n==2 else 283,838,343 if n==2 else 328),fill=(0,0,0))
  rotated=arm.rotate(-angle,resample=Image.Resampling.BICUBIC,center=pivot)
  result.paste(rotated,(0,0),rotated)
  theta=math.radians(angle);vx,vy=mount[0]-pivot[0],mount[1]-pivot[1]
  position=(pivot[0]+vx*math.cos(theta)-vy*math.sin(theta),pivot[1]+vx*math.sin(theta)+vy*math.cos(theta))
  dx,dy=round(position[0]-mount[0]),round(position[1]-mount[1])
  result.paste(pad,(dx,dy),pad)
 else:position=mount;dx=dy=0
 # Stationary machine post and pivot cap hide the lever's attachment end.
 regions=[(0,780,w,h),(1209,317,1262,780),(0,506,450,780)]
 for box in regions:result.paste(master.crop(box),box[:2])
 result.save(R/'frames'/f'{n}.png')
 records.append({'frame':n,'leverRotationDegrees':angle,'pivot':pivot,'padMount':position,'padTranslation':[dx,dy],'fixedRegions':regions})
for dst,src in [(4,3),(5,2),(6,1)]: (R/'frames'/f'{dst}.png').write_bytes((R/'frames'/f'{src}.png').read_bytes())
(R/'composition.json').write_text(json.dumps({'method':'Single source lever and plate rotate rigidly around fixed rear pivot; constant pad follows lever endpoint through articulated mount. Athlete body is not warped or resized.','frames':records},indent=2)+'\n')
