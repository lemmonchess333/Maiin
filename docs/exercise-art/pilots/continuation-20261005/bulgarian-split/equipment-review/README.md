# Bulgarian split squat: native equipment diagnostic

This is a **blocked diagnostic, not release approval**. It supplements the body,
grip, anchor and playback review. Stable bench dimensions do not prove stable
dumbbell geometry.

Run `python docs/exercise-art/pilots/continuation-20261005/bulgarian-split/equipment-review/measure.py`
from the repository root to reproduce `report.json`. The script reads existing
source images and writes only the report in this directory. It retains source
hashes, explicit native ROIs, annotated contour endpoints and the RGB values
around those endpoints. It does not resize, alter or generate candidate images.

## What was measured

The near dumbbell is the one in the athlete's right-image hand. Its closest head
is the left-image head of that dumbbell. Two annotated native image chords were
inspected for each candidate:

| Source                      | Horizontal visible-contour chord |  Span | Vertical visible-contour chord |  Span |
| --------------------------- | -------------------------------- | ----: | ------------------------------ | ----: |
| setup.png                   | y536, x575 through x641          | 67 px | x604, y499 through y574        | 76 px |
| shallow.png                 | y559, x573 through x641          | 69 px | x602, y522 through y597        | 76 px |
| deep-grip-repair.png        | y635, x583 through x649          | 67 px | x606, y599 through y673        | 75 px |
| bottom.png                  | y692, x583 through x655          | 73 px | x610, y654 through y731        | 78 px |
| bottom-join-repair.png      | y692, x583 through x655          | 73 px | x610, y654 through y731        | 78 px |
| bottom-secondary-repair.png | y692, x583 through x655          | 73 px | x610, y654 through y731        | 78 px |

Endpoints are inclusive. Antialiasing and dark contours introduce roughly
**+/-1 px uncertainty per boundary**, so each span has approximately +/-2 px
uncertainty. This is an explicit review estimate, not a calibrated confidence
interval. The chord values are not complete mathematical object bounding boxes
or measurements of real-world load size. The representative vertical chord is
not claimed to capture every bevel's furthest extent.

The bottom head has a wider projected chord. The other head of that same
dumbbell appears narrower in bottom, so the evidence does not establish uniform
load growth; orientation or regenerated shape can contribute. It nevertheless
does **not** support a claim that the equipment dimensions pass a sub-percent
invariant threshold. The smaller vertical difference is within the combined
endpoint uncertainty and should not be overinterpreted independently.

Both full handle lengths are obscured by the hands. The far-side dumbbell's
inner head is also occluded by the working thigh. No complete handle or fully
visible far-dumbbell invariant should be invented from the exposed fragments.

## Grip and highlight inspection

The final `deep-grip-repair.png` restores a continuous far forearm, wrist, hand
and handle beside the working thigh. The near grip stays attached. Setup,
shallow and bottom also show attached grips. The repair is locally successful;
it does not confer equipment-size approval.

The working front quadriceps remain the strongest purple and the supporting
rear thigh remains neutral. `bottom-secondary-repair.png` adds lighter lilac to
the visible underside of the working front thigh.

## Colour-edit provenance

The actual edit parent of `bottom-secondary-repair.png` is **`bottom.png`**, not
the separate `bottom-join-repair.png` image. Its original shoe placement is
therefore expected and must not be reported as a new defect introduced by the
colour edit. The report compares equipment and head ROIs against the actual
parent and shows RGB changes outside the intended colour area. Such changes
establish re-rendering, not a new measured scaling defect.

Importing only the intended colour patch preserves the selected body's and
equipment's original pixels. Contact repair is a separate operation. A bounded
rigid-equipment repair may address the projected head variation, but its actual
outputs still require measurement, visible grip/occlusion review and playback
review before approval.
