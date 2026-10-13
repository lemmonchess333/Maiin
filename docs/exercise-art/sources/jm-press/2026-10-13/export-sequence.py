from pathlib import Path
from PIL import Image
import json,hashlib,io,zipfile,xml.etree.ElementTree as ET
import numpy as np
p=Path(__file__).resolve().parent;out=p/'final-frames';out.mkdir(exist_ok=True)
names=['top','middle','bottom','bottom','middle','top'];crop=(260,0,1095,1024);hashes=[]
for i,name in enumerate(names,1):
 im=Image.open(p/f'final-{name}.png').convert('RGB').crop(crop)
 im.save(out/f'{i}.webp',format='WEBP',lossless=True,quality=100,method=6)
 assert Image.open(out/f'{i}.webp').convert('RGB').tobytes()==im.tobytes()
 hashes.append({'frame':i,'pose':name,'sha256':hashlib.sha256((out/f'{i}.webp').read_bytes()).hexdigest()})
for name in ['top','middle','bottom']:
 with zipfile.ZipFile(p/f'{name}-editable.ora')as z:
  image=Image.new('RGBA',(1536,1024))
  for el in reversed(list(ET.fromstring(z.read('stack.xml')).find('stack'))):image=Image.alpha_composite(image,Image.open(io.BytesIO(z.read(el.attrib['src']))).convert('RGBA'))
  assert image.convert('RGB').crop(crop).tobytes()==Image.open(out/f'{names.index(name)+1}.webp').convert('RGB').tobytes()
card=Image.open(out/'1.webp').convert('RGB');rgb=np.asarray(card);rgba=card.convert('RGBA');rgba.putalpha(Image.fromarray(np.uint8(np.where(rgb.max(2)>=18,255,0))));rgba.save(p/'card-cutout.webp',format='WEBP',lossless=True,quality=100,method=6)
assert np.array_equal(np.asarray(Image.open(p/'card-cutout.webp').convert('RGBA'))[:,:,:3][rgb.max(2)>=18],rgb[rgb.max(2)>=18])
labels=['Set','Lower','Bottom','Hold','Extend','Finish'];cues=['Hold a shoulder-width grip above your chest.','Bend elbows; lower toward your upper chin.','Keep the bar above your throat.','Stay supported; keep the bar controlled.','Drive your elbows forward and up.','Finish with both arms naturally extended.'];times=[0,.3,1,1,.3,0]
beats=[{'t':t,'label':label,'cue':cue,'image':f'/final-frames/{i}.webp'} for i,(t,label,cue)in enumerate(zip(times,labels,cues),1)]
(p/'draft-beats.json').write_text(json.dumps(beats,indent=2)+'\n',encoding='utf-8')
record={'exerciseId':'jm-press','distinctPoses':3,'sourcePoseOrder':names,'crop':crop,'width':835,'height':1024,'frames':hashes,'reopenedEditableExportsExact':True,'losslessFramesExact':True,'cardOpaqueSourcePixelsExact':True,'cardSha256':hashlib.sha256((p/'card-cutout.webp').read_bytes()).hexdigest(),'disclosures':['Three physical poses across six separate playback paths.','Middle is early descent, not calibrated half travel; about.3progress used as qualitative cue phase.','No anatomical transforms or individual fitting; generated window uniformly returned from2x inspection zoom at(280,0).','Upper-torso neutral contour variations retained after contiguous selection/native pair review, not asserted pixel-identical to folded master.','Original full-size source plate pixels restored with equipment-only rigid rotation/translation; no plate rescaling.','Native full six-step and actual app/card/mobile/controls review still required before approval.'],'status':'Prepared outside production; not complete or registered.'}
(p/'export-review.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');print(json.dumps(record,indent=2))
