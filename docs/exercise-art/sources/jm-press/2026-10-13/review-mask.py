from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np, json, hashlib
p=Path(__file__).resolve().parent
source=p.parent/'arm-window-production'
base=Image.open(source/'1-master.png').convert('RGBA')
placed=Image.open(source/'1-top-corrected-placement-review.png').convert('RGBA')
mask=Image.open(source/'1-moving-mask.png').convert('L')
chest=[(590,349),(641,335),(694,332),(737,344),(760,392),(778,450),(794,485),(784,511),(646,511),(610,494),(584,471),(572,429)]
d=ImageDraw.Draw(mask)
d.polygon(chest,fill=255)
out=Image.composite(placed,base,mask)
mask.save(p/'top-selection-mask.png')
out.save(p/'top-selection-draft.png')
layer=placed.copy();layer.putalpha(mask);layer.save(p/'top-selected-source-layer.png')
pair=Image.new('RGBA',(750,300))
pair.paste(Image.open(source/'1-top-corrected-composite-draft.png').crop((475,235,850,535)),(0,0))
pair.paste(out.crop((475,235,850,535)),(375,0))
pair.resize((1500,600),Image.Resampling.NEAREST).save(p/'selection-native-comparison.png')
changed=np.any(np.asarray(base)!=np.asarray(out),axis=2)
assert not changed[np.asarray(mask)==0].any()
assert not changed[512:].any()
record={'sourceImagegenId':'23eb9742-3338-476b-b38f-be66913f8377','sourceSha256':hashlib.sha256((source/'1-top-window-corrected.png').read_bytes()).hexdigest(),'placement':[280,0],'sourceUniformUndoPreviewZoom':.5,'newGeneration':False,'anatomyTransforms':False,'individualLimbFitting':False,'newSelection':'Existing contiguous generated exposed upper-torso surface already inside window; replaces mask cuts through pectoral and abdominal contours. No synthesized or repainted anatomy.','chestSelection':chest,'outsideSelectionPixelsChanged':int(changed[np.asarray(mask)==0].sum()),'fixedLowerScenePixelsChanged':int(changed[512:].sum()),'status':'Native mask-selection review only; not approved.'}
(p/'selection-review.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print(json.dumps(record,indent=2))
