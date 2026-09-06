#!/usr/bin/env python3
"""Build the authorized barbell-shrug compositing DRAFT from one source.

Requires numpy, scipy and Pillow. No API calls. Never changes production art.
Rigid load/hand displacement is 0/12/24/36/24/12 native pixels. The neck,
shoulder and revealed-thigh transition is image deformation, not a biomechanical
model. Full lower-leg and head regions are restored exactly. Soft tissue joins
and upper-thigh deformation still need visual acceptance before release.
"""
from PIL import Image
import hashlib
import numpy as np
from scipy.ndimage import map_coordinates
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
p = ROOT / 'docs/exercise-art/pilots/barbell-shrug'
import tempfile
WORK = Path(tempfile.mkdtemp(prefix='shrug-composite-'))
assert hashlib.sha256((p/'1-master.png').read_bytes()).hexdigest() == 'f15ee5e946f71387617afe27efffe579006a327c1c87a9e87eb7f94f8da38f12', 'Source differs from the measured master; review the scene masks before regenerating.'
a=np.array(Image.open(p/'1-master.png').convert('RGB'));h,w=a.shape[:2];Y,X=np.mgrid[:h,:w]
def smooth(z):
 z=np.clip(z,0,1);return z*z*(3-2*z)
# Neck and head are stationary. All arms/bar are rigid; only their torso junctions deform.
leftedge=np.interp(Y[:,0],[0,240,280,360,420,500,600,680,720,820,900,1535],[410,410,420,425,415,423,401,377,355,350,350,350])[:,None]
rightedge=np.interp(Y[:,0],[0,240,280,360,420,500,600,680,720,820,900,1535],[590,590,575,575,586,595,612,614,594,594,594,594])[:,None]
arm=np.maximum(1-smooth((X-leftedge)/42),smooth((X-(rightedge-42))/42))
# Head/neck lock with broad, monotonic transition to shoulder elevation.
neckTop=np.interp(X[0],[0,400,440,480,525,555,580,640,1023],[170,170,235,260,245,190,170,170,170])[None,:]
upper=smooth((Y-neckTop)/90)
# The whole bar and plates translate, with a transition only on the hidden/revealed thigh strip.
bar=smooth((Y-655)/85)*(1-smooth((Y-805)/90))
shoulder=1-smooth((Y-300)/170)
g=np.maximum(arm,shoulder)*upper
g=np.maximum(g,bar)
g*=1-smooth((Y-860)/110)
g[Y<190]=0
g[Y>=970]=0
for d in [0,12,24,36]:
 sy=Y.astype(float)
 for _ in range(30):sy=Y+d*map_coordinates(g,[sy,X],order=1,mode='nearest')
 out=np.stack([map_coordinates(a[:,:,i],[sy,X],order=1,mode='constant',cval=0) for i in range(3)],2).astype('uint8')
 if d==0:out=a.copy()
 Image.fromarray(out).save(WORK / f'warp-{d}.png')
from PIL import ImageDraw,ImageFilter
# Fixed body pixels are composited back after the moving layers are sampled.
maskim=Image.new('L',(w,h)); dr=ImageDraw.Draw(maskim)
dr.polygon([(423,455),(590,455),(599,642),(611,678),(603,703),(375,703),(390,640),(409,575),(419,515)],fill=255)
station=np.asarray(maskim.filter(ImageFilter.GaussianBlur(5)))/255.
# Every point below the original fingers and within the legs is untouched.
station[:,350:710]=np.maximum(station[:,350:710],smooth((Y[:,350:710]-785)/80))
station[865:]=1
# Original head/neck silhouette is an occluding foreground layer.
headim=Image.new('L',(w,h));ImageDraw.Draw(headim).polygon([(380,0),(585,0),(573,185),(548,203),(548,215),(559,243),(532,263),(483,276),(446,290),(446,260),(424,218),(380,218)],fill=255)
head=np.asarray(headim.filter(ImageFilter.GaussianBlur(3)))/255.

for d in [12,24,36]:
 out=np.array(Image.open(WORK / f'warp-{d}.png'))
 out=np.round(out*(1-station[:,:,None])+a*station[:,:,None]).astype('uint8')
 out=np.round(out*(1-head[:,:,None])+a*head[:,:,None]).astype('uint8')
 # Restore the rigid shaft after fixed-core feathering near its upper edge.
 out[751-d:779-d,210:818] = a[751:779,210:818]
 out[721-d:790-d,616:669] = a[721:790,616:669]
 Image.fromarray(out).save(WORK / f'composite-{d}.png')
 Image.fromarray(out).resize((512,768)).save(WORK / f'preview-{d}.png')

import shutil, json
outdir = p / 'composite-v1'
outdir.mkdir(exist_ok=True)
labels = ['start', 'begin-shrug', 'continue-lift', 'top', 'lower', 'finish-lowering']
report = {'method': 'single-master displacement with fixed-region compositing',
          'releaseApproved': False, 'sourceSha256': hashlib.sha256((p/'1-master.png').read_bytes()).hexdigest(),
          'frames': []}
regions = {'head': (410, 15, 530, 205), 'lowerBody': (0, 865, 1024, 1536),
           'core': (440, 475, 575, 660)}
for i, (d, label) in enumerate(zip([0,12,24,36,24,12], labels), 1):
    src = p/'1-master.png' if d == 0 else WORK/f'composite-{d}.png'
    dest = outdir/f'{i}-{label}.png'
    shutil.copyfile(src, dest)
    arr = np.array(Image.open(dest).convert('RGB'))
    checks = {}
    for name, (x0,y0,x1,y1) in regions.items():
        checks[name] = int(np.count_nonzero(np.any(arr[y0:y1,x0:x1] != a[y0:y1,x0:x1], axis=2)))
    # This shaft crop is a rigid segment between both grips.
    for name, (x0,y0,x1,y1) in {'barShaftTranslated':(355,752,598,777), 'farPlateTranslated':(120,680,260,854), 'nearPlateTranslated':(735,678,883,855), 'farGripTranslated':(272,715,335,789), 'nearGripTranslated':(616,721,669,790)}.items():
        checks[name] = int(np.count_nonzero(np.any(arr[y0-d:y1-d,x0:x1] != a[y0:y1,x0:x1], axis=2)))
    assert not any(checks.values()), f'Fixed/rigid region drift in frame {i}: {checks}'
    report['frames'].append({'frame':i, 'path':str(dest.relative_to(ROOT)),
        'verticalLiftPixels':d, 'changedPixelsInFixedRegions':checks,
        'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
(outdir/'measurements.json').write_text(json.dumps(report, indent=2)+'\n')
shutil.rmtree(WORK)
print(json.dumps(report, indent=2))
