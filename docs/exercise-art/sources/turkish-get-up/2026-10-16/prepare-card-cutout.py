"""Native alpha-only contour finishing under the owner's code-contour approval."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter,ImageChops
import numpy as np,json,hashlib
P=Path(__file__).resolve().parent;O=P/'candidate';source=O/'F-native.png';im=Image.open(source).convert('RGBA');a=np.array(im)
mask=Image.fromarray((np.max(a[:,:,:3],2)>80).astype('uint8')*255).filter(ImageFilter.MaxFilter(3))
holes=mask.copy();ImageDraw.floodfill(holes,(0,0),255);mask=ImageChops.lighter(mask,ImageChops.invert(holes))
out=a.copy();out[:,:,3]=np.array(mask);assert np.array_equal(out[:,:,:3],a[:,:,:3]);Image.fromarray(out).save(O/'card-native.png');mask.save(O/'card-contour-mask.png')
for name,bg in [('light',(237,237,240,255)),('dark',(23,23,27,255))]:
    Image.alpha_composite(Image.new('RGBA',im.size,bg),Image.fromarray(out)).save(O/f'card-{name}-review.png')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(O/'card-contour-proof.json').write_text(json.dumps({'source':source.name,'sourceSha256':sha(source),'imageSha256':sha(O/'card-native.png'),'dimensions':im.size,'allRgbBytesUnchanged':True,'alphaOnly':True,'bodyPartFittingOrTransforms':0,'method':'Native contour matte using bright body/load core, one-pixel contour growth and enclosed-hole fill; no body RGB replacement. Grey floor removed only from the separate card source. Six delivered guide frames unchanged.','reviewStatus':'native light/dark review pending','strictCertified':False},indent=2)+'\n',encoding='utf8')
