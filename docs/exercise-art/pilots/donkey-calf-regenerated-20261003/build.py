"""Keep the regenerated athlete; use a single rigid machine lever and fixed supports."""
from pathlib import Path
from PIL import Image,ImageDraw
import math,json
import numpy as np
R=Path(__file__).parent
master=Image.open(R/'sources/1.png').convert('RGB');w,h=master.size
pivot=(1231,374);mount=(865,350)
def smooth_mask(outer,inner):
 xx,yy=np.meshgrid(np.arange(w),np.arange(h))
 l,t,r,b=outer;il,it,ir,ib=inner
 def ramp(a):
  a=np.clip(a,0,1);return a*a*(3-2*a)
 return ramp((xx-l)/(il-l))*ramp((r-xx)/(r-ir))*ramp((yy-t)/(it-t))*ramp((b-yy)/(b-ib))
def translate_contact(image,delta,outer,inner):
 a=np.asarray(image).astype(float);weight=smooth_mask(outer,inner)
 yy,xx=np.indices((h,w));sx=np.clip(xx-delta[0]*weight,0,w-1);sy=np.clip(yy-delta[1]*weight,0,h-1)
 x0=np.floor(sx).astype(int);y0=np.floor(sy).astype(int);x1=np.minimum(x0+1,w-1);y1=np.minimum(y0+1,h-1)
 fx=(sx-x0)[...,None];fy=(sy-y0)[...,None]
 out=(a[y0,x0]*(1-fx)+a[y0,x1]*fx)*(1-fy)+(a[y1,x0]*(1-fx)+a[y1,x1]*fx)*fy
 return Image.fromarray(np.uint8(np.clip(np.rint(out),0,255)))
def align_forefoot(image):
 a=np.asarray(image).astype(float);b=np.asarray(master).astype(float)
 def sole(im,x):
  ys=np.flatnonzero(im[720:766,x].max(axis=1)>170)
  if len(ys):return float(720+ys[-1])
  ys=np.flatnonzero(im[680:766,x].max(axis=1)>170)
  return float(680+ys[-1]) if len(ys) else 755.
 start=sole(b,723);end=sole(a,790);deltas=[]
 for x in range(680,791):
  target=sole(b,x) if x<=723 else start+(end-start)*(x-723)/67
  deltas.append(target-sole(a,x))
 deltas=np.convolve(np.pad(deltas,(2,2),mode='edge'),np.ones(5)/5,mode='valid')
 yy=np.arange(h);out=a.copy()
 for x in range(675,797):
  if x<680:delta=deltas[0]*(x-675)/5
  elif x<=790:delta=deltas[x-680]
  else:delta=deltas[-1]*(797-x)/7
  weight=np.clip((yy-670)/50,0,1)*np.clip((795-yy)/22,0,1)
  sy=np.clip(yy-delta*weight,0,h-1)
  for c in range(3):out[:,x,c]=np.interp(sy,yy,a[:,x,c])
 return Image.fromarray(np.uint8(np.clip(np.rint(out),0,255)))
def pin_contact(image,outer,inner):
 a=np.asarray(image).astype(float);b=np.asarray(master).astype(float);weight=smooth_mask(outer,inner)[...,None]
 return Image.fromarray(np.uint8(np.clip(np.rint(a*(1-weight)+b*weight),0,255)))
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
 if n>1:
  result=translate_contact(result,(0,1 if n==2 else 6),(310,430,525,526),(327,460,474,507))
  contact=maskpoly([(328,470),(360,465),(376,460),(401,469),(417,476),(436,476),(445,480),(474,483),(474,509),(328,509)])
  result.paste(master,(0,0),contact)
  result=translate_contact(result,(5,3),(660,695,778,790),(680,735,725,762))
  result=align_forefoot(result)
  result=pin_contact(result,(685,746,726,772),(687,750,723,768))
  # Restore the newly exposed step below the raised forefoot, then stationary base pixels.
  clean_step=Image.open(R/'sources/3.png').convert('RGB')
  result.paste(clean_step.crop((629,763,758,795)),(629,763))
  for box in regions:result.paste(master.crop(box),box[:2])
 result.save(R/'frames'/f'{n}.png')
 records.append({'frame':n,'leverRotationDegrees':angle,'pivot':pivot,'padMount':position,'padTranslation':[dx,dy],'fixedRegions':regions,'fixedContacts':[(373,476,394,495),(448,488,465,505),(687,750,724,763)],'localContactTranslation':{'hand':[0,1 if n==2 else 6],'forefoot':[5,3]}})
for dst,src in [(4,3),(5,2),(6,1)]: (R/'frames'/f'{dst}.png').write_bytes((R/'frames'/f'{src}.png').read_bytes())
(R/'composition.json').write_text(json.dumps({'method':'Single source lever and plate rotate rigidly around fixed rear pivot; constant pad follows lever endpoint. Hands and forefeet use exact master pixels, after small local contact translations and smooth perimeter blending. Whole body is not resized.','frames':records},indent=2)+'\n')
