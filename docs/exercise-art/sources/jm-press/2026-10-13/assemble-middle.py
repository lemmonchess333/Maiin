from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib
p=Path(__file__).resolve().parent;s=p.parent/'arm-window-production'
base=Image.open(s/'1-master.png').convert('RGBA');candidate=Image.open(p/'middle-placement-review.png').convert('RGBA')
mask=Image.open(p/'top-selection-mask.png').convert('L');d=ImageDraw.Draw(mask)
regions={
 'middle shaft':[(445,190),(885,139),(889,165),(447,218)],
 'connected near arm':[(553,160),(622,160),(642,313),(653,373),(670,453),(636,487),(559,479),(510,436),(517,389),(538,350),(547,289),(547,218)],
 'connected far arm':[(714,141),(786,141),(811,225),(825,308),(815,369),(816,435),(773,453),(735,420),(720,380),(698,351),(711,296),(716,239)]
}
for pts in regions.values():d.polygon(pts,fill=255)
head=Image.new('L',base.size);hd=ImageDraw.Draw(head);hd.polygon([(513,296),(512,278),(518,263),(531,252),(548,246),(565,249),(585,260),(598,278),(605,298),(605,318),(594,336),(572,344),(541,334),(523,322)],fill=255)
arm=Image.new('L',base.size);ad=ImageDraw.Draw(arm);ad.polygon([(572,180),(600,173),(622,197),(619,229),(623,266),(626,301),(614,345),(598,375),(566,399),(544,389),(539,364),(552,338),(562,297),(560,254),(564,214)],fill=255)
keep=(np.asarray(head)>0)&(np.asarray(arm)==0)
a=np.array(mask);a[keep]=0;mask=Image.fromarray(a)
out=Image.composite(candidate,base,mask);out.save(p/'middle-selection-draft.png');mask.save(p/'middle-selection-mask.png')
layer=candidate.copy();layer.putalpha(mask);layer.save(p/'middle-selected-source-layer.png')
changed=np.any(np.asarray(base)!=np.asarray(out),axis=2)
assert not changed[np.asarray(mask)==0].any();assert not changed[512:].any();assert not changed[keep].any()
(p/'middle-selection-review.json').write_text(json.dumps({'imagegenId':'1bd02da5-2de4-44ee-b8a5-a5230e7bba4a','sourceSha256':hashlib.sha256((p/'middle-window-original.png').read_bytes()).hexdigest(),'uniformUndoPreviewZoom':.5,'placement':[280,0],'newRegions':regions,'outsideMaskPixelsChanged':0,'fixedLowerScenePixelsChanged':0,'protectedHeadPixelsChanged':0,'anatomyTransforms':False,'status':'Native body/contact and equipment review required. Actual intermediate is early descent, not a calibrated half-travel claim.'},indent=2)+'\n',encoding='utf-8')
