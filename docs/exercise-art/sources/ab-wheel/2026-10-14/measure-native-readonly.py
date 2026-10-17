"""Native source pixel measurements only. Never creates or changes an image."""
from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parent
files = ["master-brace-original.png", "roll-original.png", "reach-original.png"]


def white_region(image, box, threshold=160):
    pixels = [(x, y) for y in range(box[1], box[3]) for x in range(box[0], box[2])
              if min(image.getpixel((x, y))) >= threshold]
    ys = [y for x, y in pixels]
    low = max(ys)
    high = min(ys)
    low_xs = [x for x, y in pixels if y == low]
    high_xs = [x for x, y in pixels if y == high]
    return {"box": box, "threshold": threshold, "lastBrightRow": low,
            "lastRowXRange": [min(low_xs), max(low_xs)],
            "lastRowMidpoint": [(min(low_xs) + max(low_xs)) / 2, low],
            "firstBrightRow": high, "firstRowXRange": [min(high_xs), max(high_xs)]}


rows = []
for name in files:
    image = Image.open(root / name).convert("RGB")
    near_toe = white_region(image, [70, 798, 137, 832])
    far_toe = white_region(image, [166, 792, 218, 825])
    near_heel = white_region(image, [130, 629, 170, 681])
    far_heel = white_region(image, [212, 615, 259, 666])
    rows.append({"file": name, "size": list(image.size),
                 "sha256": hashlib.sha256((root / name).read_bytes()).hexdigest(),
                 "nearToe": near_toe, "farToe": far_toe, "nearHeel": near_heel, "farHeel": far_heel,
                 "nearTrainerProjectedBrightVerticalSpan": near_toe["lastBrightRow"] - near_heel["firstBrightRow"],
                 "farTrainerProjectedBrightVerticalSpan": far_toe["lastBrightRow"] - far_heel["firstBrightRow"]})
(root / "native-readonly-extraction.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
print(json.dumps(rows, indent=2))

def neutral_region(image, box, threshold=30):
    pixels = [(x, y) for y in range(box[1], box[3]) for x in range(box[0], box[2])
              if min(image.getpixel((x, y))) >= threshold
              and max(image.getpixel((x, y))) <= 140
              and max(image.getpixel((x, y))) - min(image.getpixel((x, y))) <= 12]
    xs, ys = zip(*pixels)
    left, right = min(xs), max(xs)
    return {"box": box, "threshold": threshold, "boundsInclusive": [left, min(ys), right, max(ys)],
            "leftmostFirstY": min(y for x, y in pixels if x == left),
            "rightmostFirstY": min(y for x, y in pixels if x == right)}

equipment = []
cap_boxes = [([625, 765, 650, 807], [910, 744, 936, 789]),
             ([1014, 781, 1045, 824], [1286, 753, 1310, 800]),
             ([1214, 797, 1243, 843], [1472, 782, 1495, 831])]
wheel_tangent_boxes = [([735, 675, 799, 712], [730, 865, 826, 899]),
                       ([1130, 689, 1197, 733], [1130, 880, 1226, 915]),
                       ([1330, 705, 1397, 754], [1310, 900, 1411, 936])]
for name, caps, tangents in zip(files, cap_boxes, wheel_tangent_boxes):
    image = Image.open(root / name).convert("RGB")
    near_cap = neutral_region(image, caps[0], 30)
    far_cap = neutral_region(image, caps[1], 30)
    left_pad = neutral_region(image, [230, 808, 258, 849], 40)
    right_pad = neutral_region(image, [575, 802, 600, 846], 40)
    wheel_rows = []
    for threshold in [16, 20, 24, 30]:
        top = neutral_region(image, tangents[0], threshold)
        bottom = neutral_region(image, tangents[1], threshold)
        wheel_rows.append({"threshold": threshold, "topY": top["boundsInclusive"][1],
                           "bottomY": bottom["boundsInclusive"][3],
                           "verticalTireBrightSpan": bottom["boundsInclusive"][3] - top["boundsInclusive"][1]})
    equipment.append({"file": name, "nearVisibleEndcap": near_cap, "farVisibleEndcap": far_cap,
                      "outerAxleProjectedHorizontalSpan": far_cap["boundsInclusive"][2] - near_cap["boundsInclusive"][0],
                      "padLeft": left_pad, "padRight": right_pad,
                      "padProjectedHorizontalSpan": right_pad["boundsInclusive"][2] - left_pad["boundsInclusive"][0],
                      "wheelTangentBrightnessMeasurements": wheel_rows})
(root / "equipment-readonly-extraction.json").write_text(json.dumps(equipment, indent=2) + "\n", encoding="utf-8")
print(json.dumps(equipment, indent=2))
