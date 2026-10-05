# Bulgarian selected V2 geometry evidence

All 48 complete 91×91 anchor search windows exactly match their hash-pinned measured originals. The 31×31, ±30px historical search therefore has identical inputs for every candidate translation. The helper transfers its deterministic coordinates after independently checking source/reference/report/algorithm hashes and recomputing zero/best SAD values. No historical report or image is modified.

The original bounds remain 1px per axis and 1% dimension drift. Maximum anchor drift is 1px. Maximum support-span drift is 0.720590%; fixed equipment layer drift is 0%. All selected PNGs are opaque 1536×1024. All 18 exposed equipment-face checks are exact.

| Slot | Pose    | Front shoe support span, px | Bench floor foot span, px | Fixed near / far layer width, px |
| ---- | ------- | --------------------------: | ------------------------: | -------------------------------: |
| 1    | setup   |                  143.055933 |                446.753847 |                        179 / 143 |
| 2    | shallow |                  144.086779 |                446.753847 |                        179 / 143 |
| 3    | deep    |                  144.055545 |                446.753847 |                        179 / 143 |
| 4    | bottom  |                  143.055933 |                446.753847 |                        179 / 143 |
| 5    | deep    |                  144.055545 |                446.753847 |                        179 / 143 |
| 6    | shallow |                  144.086779 |                446.753847 |                        179 / 143 |

Shallow slots 2/6 have frontHeel=(534,933), rearLacesPad=(931,646); deep slots 3/5 have frontToe=(389,938), benchRightPadCorner=(1374,676). All other anchor coordinates equal the reference. Full eight-anchor coordinates, exact hashes and per-window RGB hashes are in geometry.json.

Equipment widths use the alpha≥128 bounding box of each fixed RGBA projection, independently measured from the pinned layer. Front-head widths are 80px near and 73px far. These are construction dimensions through pose-dependent occlusion. They are paired with existing hash-bound native contour/grip review; interior equality alone is not a silhouette approval.

Reproduce with the repository root explicitly supplied; the output directory defaults to this evidence folder. No scratch path is assumed and no historical files are changed:

```sh
node docs/exercise-art/releases/2026-10-05/geometry/verify-geometry.mjs /absolute/path/to/Maiin /absolute/path/to/evidence-output
```

geometry.json SHA-256: 3ad0b703195df9632527aeacf030610a4a7ffe9f293a5d16eb4df678a0e6f40d

review-record-geometry.json contains six geometry objects, still bound to selected PNG hashes. A release review using WebP must retain WebP path/hash pins and separately cite verified lossless RGB equality to these PNGs. This evidence does not set review decision or release approval.
