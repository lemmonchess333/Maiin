"""Reopen retained native ORAs and verify exact crop/export pixels, without mutation."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
import io,json,zipfile,xml.etree.ElementTree as ET,hashlib
P=Path(__file__).resolve().parent
package=json.loads((P/'frame-package.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def reopen(path):
 with zipfile.ZipFile(path) as z:
  root=ET.fromstring(z.read('stack.xml'));canvas=Image.new('RGBA',(int(root.attrib['w']),int(root.attrib['h'])))
  layers=list(root.find('stack'))
  for layer in reversed(layers):
   assert layer.tag=='layer' and layer.get('visibility','visible')=='visible'
   im=Image.open(io.BytesIO(z.read(layer.attrib['src']))).convert('RGBA')
   canvas.alpha_composite(im,(int(layer.get('x',0)),int(layer.get('y',0))))
  assert canvas.tobytes()==Image.open(io.BytesIO(z.read('mergedimage.png'))).convert('RGBA').tobytes(),path
  return canvas
poses=[]
finishing=json.loads((P/'colour-finishing-provenance.json').read_text())
def mask(size,poly):
 big=Image.new('L',(size[0]*4,size[1]*4));d=ImageDraw.Draw(big);d.polygon([(x*4,y*4) for x,y in poly],fill=255)
 return np.array(big.resize(size,Image.Resampling.LANCZOS),dtype=float)/255
def correction(rgb,alpha):return Image.fromarray(np.dstack((np.uint8(np.clip(rgb,0,255)),np.uint8(np.clip(alpha*255,0,255)))),'RGBA')
for n,row in enumerate(package['poses'],1):
 native=reopen(P/f'{n}-native.ora');framed=reopen(P/f'{n}-framed.ora')
 assert native.size==tuple(row['nativeSize'])
 assert native.crop(row['commonCrop']).tobytes()==framed.tobytes()
 assert framed.tobytes()==Image.open(P/f'{n}-framed.png').convert('RGBA').tobytes()
 original=P/'originals'/row['originalName'];assert sha(original)==row['originalSha256']
 source=Image.open(original).convert('RGBA');a=np.array(source)[:,:,:3].astype(float)
 coverage=np.clip(np.minimum((a[:,:,2]-a[:,:,0]-2)/10,(a[:,:,0]-a[:,:,1]-3)/10),0,1)
 back=finishing['semanticMasksOriginalSourceCoordinates']['centralBack'][str(n)]
 lats=finishing['semanticMasksOriginalSourceCoordinates']['excludedSecondaryLat'][str(n)]
 primary=mask(source.size,back)*(1-mask(source.size,lats));shade=np.repeat(a.max(axis=2)[:,:,None],3,axis=2)
 expected=Image.alpha_composite(Image.alpha_composite(source,correction(shade/255*np.array((149,144,224)),coverage)),correction(shade/255*np.array((123,114,233)),coverage*primary))
 assert expected.tobytes()==native.tobytes(),'original-source colour recipe differs'
 assert np.array_equal(np.array(native)[:,:,:3][coverage==0],np.uint8(a)[coverage==0])
 assert np.array_equal(np.array(source)[:,:,3],np.array(native)[:,:,3])
 poses.append(framed.convert('RGB'))
for i,n in enumerate(package['sourcePoseOrder'],1):
 webp=P/'final-frames'/f'{i}.webp'
 assert sha(webp)==package['frames'][i-1]['sha256']
 assert Image.open(webp).convert('RGB').tobytes()==poses[n-1].tobytes()
assert Image.open(P/'reference.png').convert('RGB').tobytes()==poses[package['reference']-1].tobytes()
print(json.dumps({'status':'exact','sourceColourRecipeReproducedFromOriginals':True,'sourceNeutralRGBAndAlphaExact':True,'nativeOras':2,'framedOras':2,'losslessFrames':6,'referenceExact':True,'physicalPoses':2,'size':[package['width'],package['height']]}))
