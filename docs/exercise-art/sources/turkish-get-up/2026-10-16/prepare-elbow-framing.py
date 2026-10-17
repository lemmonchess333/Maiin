from pathlib import Path
from PIL import Image
import hashlib,json
P=Path(__file__).resolve().parent
s=P/'elbow-contact-generated-full.png';im=Image.open(s).convert('RGBA')
assert im.size==(1512,1040)
# Uniform framing of the entire authored source, including its background.
# This is not an inverse preview zoom, anatomical warp or individual-part fit.
im=im.resize((756,520),Image.Resampling.LANCZOS)
c=Image.new('RGBA',(1024,704),(0,0,0,255));c.paste(im,(195,165));c.save(P/'native-extraction/B-elbow-supported-native.png')
c.crop((380,390,640,575)).save(P/'native-extraction/B-torso-colour-review.png')
for n,box in {'A':(410,490,590,590),'C':(400,395,560,570),'D':(440,300,625,470),'E':(530,265,640,470),'F':(690,260,780,470)}.items():
    Image.open(P/f'native-extraction/{n}-native.png').crop(box).save(P/f'native-extraction/{n}-torso-colour-review.png')
(P/'elbow-source-framing.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(s.read_bytes()).hexdigest(),'sourceDimensions':[1512,1040],'wholeImageUniformFraming':0.5,'framedDimensions':[756,520],'integerPlacement':[195,165],'canvas':[1024,704],'inversePreviewZoomClaim':False,'individualBodyPartTransforms':0,'rationale':'Frame the entire new landscape source on the common scene canvas while preserving all internal proportions. No body-part fitting, head/shoe graft or anatomical warping.','sourceReview':'New connected elbow-supported roll; actual open hand and forearm rest along floor, elbow beneath free shoulder.','strictCertified':False,'completionCredit':False},indent=2)+'\n',encoding='utf8')
