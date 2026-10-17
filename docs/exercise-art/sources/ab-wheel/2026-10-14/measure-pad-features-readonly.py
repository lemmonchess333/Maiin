"""Measure existing exposed pad pixels, never modifies source image pixels."""
from pathlib import Path
from PIL import Image
import json

root = Path(__file__).resolve().parent
files = ["master-brace-original.png", "roll-original.png", "reach-original.png"]
rows = []
for name in files:
    im = Image.open(root / name).convert("RGB")
    samples = []
    for threshold in [20, 25, 30, 35, 40, 45, 50]:
        points = []
        for y in range(845, 880):
            for x in range(350, 460):
                p = im.getpixel((x, y))
                if min(p) >= threshold and max(p) <= 140 and max(p)-min(p) <= 12:
                    points.append((x, y))
        if points:
            bottom = max(y for x, y in points)
            xs = [x for x, y in points if y == bottom]
            samples.append({"threshold": threshold, "bottomY": bottom,
                            "lastRowXRange": [min(xs), max(xs)],
                            "lastRowMidpoint": [(min(xs)+max(xs))/2, bottom]})
    rows.append({"file": name, "roi": [350,845,460,880], "samples": samples})
(root / "pad-feature-readonly-extraction.json").write_text(json.dumps(rows, indent=2)+"\n", encoding="utf-8")
print(json.dumps(rows, indent=2))

# Bright-neutral contour spans are diagnostics, not calibrated 3D radii.
# Requiring a run rejects single-pixel light human contour anti-aliases.
wheel_boxes = [([735,675,799,712],[730,865,826,899]),
               ([1130,689,1197,733],[1130,880,1226,915]),
               ([1330,705,1397,754],[1310,900,1411,936])]
wheel = []
for name, boxes in zip(files, wheel_boxes):
    im = Image.open(root/name).convert("RGB")
    values = []
    for threshold in [30,35,40,45,50]:
        for minimum_run in [5,10]:
            bounds = []
            for box in boxes:
                valid_rows = []
                for y in range(box[1],box[3]):
                    run = 0
                    for x in range(box[0],box[2]):
                        p = im.getpixel((x,y))
                        neutral = min(p)>=threshold and max(p)<=140 and max(p)-min(p)<=12
                        run = run+1 if neutral else 0
                        if run>=minimum_run:
                            valid_rows.append(y)
                            break
                bounds.append([min(valid_rows),max(valid_rows)] if valid_rows else None)
            if all(bounds):
                values.append({"threshold":threshold,"minimumRun":minimum_run,
                               "topY":bounds[0][0],"bottomY":bounds[1][1],
                               "brightContourVerticalSpan":bounds[1][1]-bounds[0][0]})
    wheel.append({"file":name,"topBottomROIs":boxes,"samples":values})
(root/"wheel-run-readonly-extraction.json").write_text(json.dumps(wheel,indent=2)+"\n",encoding="utf-8")
print(json.dumps(wheel,indent=2))
