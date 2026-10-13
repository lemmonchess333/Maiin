from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
from collections import deque
import numpy as np,json,io,zipfile,xml.etree.ElementTree as ET,hashlib
p=Path(__file__).resolve().parent;s=p.parent/'arm-window-production'
delts={
 'top':[[(532,373),(548,360),(566,365),(584,386),(589,404),(577,418),(552,424),(536,410),(530,391)],[(749,351),(765,343),(783,354),(783,375),(772,391),(753,386),(746,370)]],
 'middle':[[(527,392),(540,376),(559,378),(576,393),(582,418),(567,432),(545,431),(529,417)],[(746,362),(768,355),(788,373),(788,395),(772,408),(750,397),(741,382)]],
 'bottom':[[(519,385),(527,372),(550,369),(571,378),(585,395),(581,413),(565,422),(540,416),(522,402)],[(735,383),(753,384),(771,397),(777,414),(764,428),(747,417),(735,401)]]
}
def polygon_mask(points,size):
 im=Image.new('L',(size[0]*4,size[1]*4));d=ImageDraw.Draw(im)
 for pts in points:d.polygon([(x*4,y*4)for x,y in pts],fill=255)
 return np.asarray(im.resize(size,Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.7))).astype(float)/255
def png(im):
 b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()
audit=[]
for name in ['top','middle','bottom']:
 original=Image.open(s/'1-master.png').convert('RGBA');layers=[('Original folded master and fixed scene',original)]
 if name!='bottom':layers.append(('Generated connected upper scene selected at original coordinates',Image.open(p/f'{name}-selected-source-layer.png').convert('RGBA')))
 layers.append(('Original-size plate restoration and neutral shaft joins; equipment only',Image.open(p/f'pose-{name}-equipment-layer.png').convert('RGBA')))
 merged=Image.new('RGBA',original.size)
 for _,layer in layers:merged=Image.alpha_composite(merged,layer)
 expected=Image.open(p/f'pose-{name}-equipment.png').convert('RGBA');assert merged.tobytes()==expected.tobytes(),name
 rgb=np.asarray(merged)[:,:,:3].astype(float);gray=rgb.max(2);difference=rgb[:,:,2]-rgb[:,:,:2].min(2)
 scope=np.zeros(gray.shape);scope[230:500,500:850]=1
 chroma=np.clip((difference-15)/20,0,1)*scope
 binary=(difference>25)&(gray>90)&(scope>0);seen=np.zeros(binary.shape,bool);primary=Image.new('L',merged.size);pmarr=np.zeros(binary.shape,np.uint8);components=[]
 for yy,xx in np.argwhere(binary):
  if seen[yy,xx]:continue
  seen[yy,xx]=True;queue=deque([(yy,xx)]);pts=[]
  while queue:
   y,x=queue.popleft();pts.append((y,x))
   for dy,dx in [(1,0),(-1,0),(0,1),(0,-1)]:
    y1,x1=y+dy,x+dx
    if 0<=y1<binary.shape[0] and 0<=x1<binary.shape[1] and binary[y1,x1] and not seen[y1,x1]:seen[y1,x1]=True;queue.append((y1,x1))
  if len(pts)<90:continue
  coords=np.asarray(pts);values=difference[coords[:,0],coords[:,1]];role='primary visible triceps' if float(values.mean())>110 else 'secondary chest/source cap'
  if role.startswith('primary'):pmarr[coords[:,0],coords[:,1]]=255
  components.append({'pixels':len(pts),'bbox':[int(coords[:,1].min()),int(coords[:,0].min()),int(coords[:,1].max()+1),int(coords[:,0].max()+1)],'meanSourceChroma':float(values.mean()),'role':role})
 primary=Image.fromarray(pmarr).filter(ImageFilter.MaxFilter(3));pm=np.asarray(primary).astype(float)/255*chroma
 dm=polygon_mask(delts[name],merged.size)*(gray>125)*scope*(1-pm)
 # Existing colour masks are source-derived; positive deltoid masks are traced
 # anatomical projection inferences, subject to native review, not segmentation certification.
 sm=np.maximum(chroma*(1-np.asarray(primary).astype(float)/255),dm*np.clip((260-gray)/35,0,1))*(1-pm)
 neutral=Image.fromarray(np.concatenate([np.uint8(np.repeat(gray[:,:,None],3,2)),np.uint8(chroma[:,:,None]*255)],2),'RGBA')
 merged=Image.alpha_composite(merged,neutral);layers.append(('Neutralise source tint before exact palette; preserve inherited neutral highlights',neutral))
 for label,col,m in [('Primary triceps #7B72E9',(123,114,233),pm),('Secondary chest and anterior deltoids #9590E0',(149,144,224),sm)]:
  layer=Image.new('RGBA',merged.size,col+(0,));layer.putalpha(Image.fromarray(np.uint8(m*255)));merged=Image.alpha_composite(merged,layer);layers.append((label,layer))
 median=np.asarray(Image.fromarray(gray.astype('uint8')).filter(ImageFilter.MedianFilter(5))).astype(float)
 detail=np.clip((median-gray-4)/22,0,1)*np.maximum(pm,sm)
 contour=Image.new('RGBA',merged.size,(119,119,119,0));contour.putalpha(Image.fromarray(np.uint8(detail*255)));merged=Image.alpha_composite(merged,contour);layers.append(('Inherited grey contour detail',contour))
 merged.save(p/f'final-{name}.png');merged.crop((505,235,845,495)).resize((1020,780),Image.Resampling.NEAREST).save(p/f'{name}-colour-native.png')
 root=ET.Element('image',{'w':str(merged.width),'h':str(merged.height),'name':f'JM Press {name}'});stack=ET.SubElement(root,'stack')
 with zipfile.ZipFile(p/f'{name}-editable.ora','w')as z:
  z.writestr('mimetype','image/openraster')
  for i,(label,layer)in enumerate(reversed(layers)):
   loc=f'data/{i}.png';z.writestr(loc,png(layer));ET.SubElement(stack,'layer',dict(name=label,src=loc,x='0',y='0',opacity='1.0',visibility='visible',**{'composite-op':'svg:src-over'}))
  z.writestr('stack.xml',ET.tostring(root));z.writestr('mergedimage.png',png(merged))
 with zipfile.ZipFile(p/f'{name}-editable.ora')as z:
  reopened=Image.new('RGBA',merged.size)
  for el in reversed(list(ET.fromstring(z.read('stack.xml')).find('stack'))):reopened=Image.alpha_composite(reopened,Image.open(io.BytesIO(z.read(el.attrib['src']))).convert('RGBA'))
  assert reopened.tobytes()==merged.tobytes()
 changed=np.any(np.asarray(merged)!=np.asarray(expected),2);assert not changed[scope==0].any();assert not changed[512:].any()
 out=np.asarray(merged)[:,:,:3]
 audit.append({'pose':name,'editableReopenedExact':True,'outsideUpperBodyColourScopeChanged':0,'fixedLowerSceneChanged':0,'exactPrimaryPixels':int(np.all(out==(123,114,233),2).sum()),'exactSecondaryPixels':int(np.all(out==(149,144,224),2).sum()),'sourceComponents':components,'deltoidMasks':delts[name],'anatomyTransforms':False,'status':'Native muscle-ownership/contour review pending','sha256':hashlib.sha256((p/f'final-{name}.png').read_bytes()).hexdigest()})
(p/'colour-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
print(json.dumps([{k:q[k]for k in ['pose','editableReopenedExact','exactPrimaryPixels','exactSecondaryPixels']} for q in audit],indent=2))
