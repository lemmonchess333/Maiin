"""Colour-only layer over the intact, globally placed top source."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
source_path = HERE / "top-whole-frame-placement.png"
source = Image.open(source_path).convert("RGB")
a = np.asarray(source).astype(np.float32)
chroma = a.max(axis=2) - a.min(axis=2)
existing_tint = (a[:,:,2] > a[:,:,0]+15) & (a[:,:,2] > a[:,:,1]+15) & (chroma > 20)
# Positive ownership windows only label already-coloured compartments.
# No neutral anatomical, hand, weight, head or trainer pixel is selected.
fields = [
    {"name":"far-triceps","box":[385,520,455,701],"role":"primary"},
    {"name":"near-triceps","box":[573,520,675,820],"role":"primary"},
    {"name":"far-front-deltoid","box":[410,701,475,790],"role":"secondary"},
    {"name":"far-front-deltoid-upper-edge","box":[455,698,475,701],"role":"secondary"},
    {"name":"near-front-deltoid","box":[500,670,573,860],"role":"secondary"},
]
palette = {"primary":(123,114,233),"secondary":(149,144,224)}
layer = np.zeros((1856,1024,4),dtype=np.uint8)
covered = np.zeros((1856,1024),dtype=bool)
rows = []
local_chroma = np.asarray(Image.fromarray(chroma.astype(np.uint8)).filter(ImageFilter.MaxFilter(5))).astype(float)
for field in fields:
    x0,y0,x1,y1 = field["box"]
    mask = np.zeros_like(covered)
    mask[y0:y1,x0:x1] = existing_tint[y0:y1,x0:x1]
    assert not (covered & mask).any()
    covered |= mask
    core = np.asarray(Image.fromarray((mask*255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))) == 255
    alpha = np.zeros_like(chroma)
    alpha[mask] = np.minimum(1, chroma[mask] / np.maximum(1,local_chroma[mask]))
    alpha[core] = 1
    layer[mask,:3] = palette[field["role"]]
    layer[:,:,3][mask] = np.maximum(1,np.rint(alpha[mask]*255)).astype(np.uint8)
    rows.append({**field,"selectedExistingTintPixels":int(mask.sum()),"opaqueCorePixels":int(core.sum())})
uncovered = existing_tint & ~covered
ys,xs = np.where(uncovered)
missing = {"pixels":int(uncovered.sum()),"bounds":None if not xs.size else [int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]}
assert missing["pixels"] == 0, missing
overlay = Image.fromarray(layer)
final = Image.alpha_composite(source.convert("RGBA"),overlay)
out = np.asarray(final.convert("RGB"))
assert np.array_equal(out[~covered],a.astype(np.uint8)[~covered])
overlay.save(HERE/"top-colour-layer.png")
final.convert("RGB").save(HERE/"top-candidate-colours.png")
final.crop((360,400,720,900)).save(HERE/"top-arms-native-colour-review.png")
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
report={"scope":"Colour candidate, native/playback review still required","source":source_path.name,
        "sourceSha256":sha(source_path),"palette":{k:'#%02X%02X%02X'%v for k,v in palette.items()},
        "fields":rows,"allExistingTintAccountedFor":missing,"allOutsidePixelsUnchanged":True,
        "anatomicalWarpOrGraft":False,"sourceContoursAndNeutralShadingUnchanged":True,
        "layerSha256":sha(HERE/"top-colour-layer.png"),"outputSha256":sha(HERE/"top-candidate-colours.png")}
(HERE/"top-colour-proposal.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
print(json.dumps(report,indent=2))
