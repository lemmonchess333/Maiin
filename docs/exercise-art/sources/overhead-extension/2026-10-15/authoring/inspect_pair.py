"""One retained-pair diagnostic; integer whole-frame placement only."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
bottom_path = SOURCE / "4-standing-master-v1.png"
top_path = SOURCE / "1-standing-top-format-v1.png"
bottom = Image.open(bottom_path).convert("RGB")
top = Image.open(top_path).convert("RGB")
assert top.size == bottom.size == (1024, 1856)
a, b = np.asarray(bottom), np.asarray(top)
# Use the entire unchanged lower-body silhouette, not individual limb fits.
aa, bb = (a.max(axis=2) > 100).astype(float), (b.max(axis=2) > 100).astype(float)
aa[:900] = 0
bb[:900] = 0
correlation = np.fft.irfft2(np.fft.rfft2(aa) * np.conj(np.fft.rfft2(bb)), s=aa.shape)
candidates = [(float(correlation[dy % 1856, dx % 1024]), dx, dy)
              for dy in range(-100, 101) for dx in range(-50, 51)]
score, dx, dy = max(candidates)
placed = Image.new("RGB", top.size, "black")
placed.paste(top, (dx, dy))
mask = b.max(axis=2) > 14
ys, xs = np.where(mask)
bounds = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
assert bounds[0] + dx >= 0 and bounds[1] + dy >= 0
assert bounds[2] + dx <= 1024 and bounds[3] + dy <= 1856
out = np.asarray(placed)
sx0, sy0, sx1, sy1 = max(0,-dx), max(0,-dy), min(1024,1024-dx), min(1856,1856-dy)
assert np.array_equal(out[sy0+dy:sy1+dy,sx0+dx:sx1+dx], b[sy0:sy1,sx0:sx1])
placed.save(HERE / "top-whole-frame-placement.png")
comparison = Image.new("RGB", (2048,1856), "black")
comparison.paste(bottom, (0,0))
comparison.paste(placed, (1024,0))
comparison.save(HERE / "intact-pair-comparison.png")
arm_box = (360,400,720,900)
arm_grid = placed.crop(arm_box)
draw = ImageDraw.Draw(arm_grid)
for x in range(400,701,50):
    draw.line([(x-360,0),(x-360,499)],fill=(0,95,65))
    draw.text((x-358,2),str(x),fill=(0,220,160))
for y in range(400,901,50):
    draw.line([(0,y-400),(359,y-400)],fill=(0,95,65))
    draw.text((2,y-398),str(y),fill=(0,220,160))
arm_grid.save(HERE/"top-arms-coordinate-grid-diagnostic.png")
regions = {"head": [405,550,560,740], "torso": [390,810,640,1090],
           "both-shoes": [285,1570,720,1800], "lower-body": [285,1080,720,1800]}
observations = {}
for name, box in regions.items():
    x0,y0,x1,y1 = box
    ma = a[y0:y1,x0:x1].max(axis=2)>100
    mb = out[y0:y1,x0:x1].max(axis=2)>100
    observations[name] = {"region":box, "silhouetteIoU":float((ma&mb).sum()/max(1,(ma|mb).sum()))}
    crop = Image.new("RGB", ((x1-x0)*2,y1-y0), "black")
    crop.paste(bottom.crop(box),(0,0))
    crop.paste(placed.crop(box),(x1-x0,0))
    crop.save(HERE / (name + "-native-comparison.png"))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
report = {"scope":"Diagnostic, not artwork acceptance or strict certification", "sources":
          {p.name:sha(p) for p in [bottom_path,top_path]}, "canvas":list(top.size),
          "wholeFrameTranslation":[dx,dy], "rescale":False, "anatomicalWarpOrGraft":False,
          "sourcePixelsCopiedExactly":True,"foregroundAbove14Clipped":False,
          "placementBasis":"One integer translation maximizing the complete lower-body silhouette overlap",
          "regions":observations, "outputSha256":sha(HERE/"top-whole-frame-placement.png")}
(HERE/"placement-diagnostic.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
print(json.dumps(report,indent=2))
