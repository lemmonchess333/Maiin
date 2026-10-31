"""Image-space audit of the final Elliptical six-phase handoff."""
import hashlib,json,math
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
root=Path(__file__).resolve().parent
anchors=json.loads((root/'final-anchors.json').read_text())
assert anchors['width']==anchors['height']==1080
assert len(anchors['frames'])==6
fixed=anchors['frames'][0]['fixed']
assert all(row['fixed']==fixed for row in anchors['frames'])
images=[];files=[]
for i in range(1,7):
    path=root/f'final-{i}.png'
    webp=root/f'final-{i}.webp'
    im=Image.open(path).convert('RGB')
    wp=Image.open(webp)
    assert im.size==wp.size==(1080,1080)
    assert max(max(im.getpixel(p)[c] for p in ((0,0),(1079,0),(0,1079)))-min(im.getpixel(p)[c] for p in ((0,0),(1079,0),(0,1079))) for c in range(3))<=2
    gray=im.convert('L')
    bounds=gray.point(lambda a:255 if a>28 else 0).getbbox()
    assert bounds and bounds[0]>10 and bounds[1]>90 and bounds[2]<1070 and bounds[3]<1000,bounds
    images.append(im)
    files.append({'frame':i,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                  'bytes':path.stat().st_size,'webpBytes':webp.stat().st_size,
                  'boundsAboveLuma28':bounds})
assert len({row['sha256'] for row in files})==6
step_rms=[]
for i in range(6):
    diff=ImageChops.difference(images[i],images[(i+1)%6])
    step_rms.append(round(sum(ImageStat.Stat(diff).rms)/3,3))
assert all(value>2 for value in step_rms)
assert step_rms[-1] < 1.5*max(step_rms[:-1]),step_rms
card=Image.open(root/'card-frame-4.png').convert('RGBA')
assert card.size==(1080,1080)
assert card.getpixel((0,0))[3]==0 and card.getpixel((540,540))[3]==255
assert Image.open(root/'card-frame-4.webp').getpixel((0,0))[3]==0
report={'frames':files,'adjacentRmsRgb':step_rms,
        'seamRmsRgb':step_rms[-1],
        'fixedScreenAnchors':fixed,
        'cardCornerAlpha':0,
        'cardCenterAlpha':255,
        'sixUniqueImageHashes':True}
(root/'frame-qa.json').write_text(json.dumps(report,indent=2))
print('FRAME_QA_PASSED')
print('stepRms',step_rms)
print('bounds',[row['boundsAboveLuma28'] for row in files])
