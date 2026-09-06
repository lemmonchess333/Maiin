# Dumbbell curl pilot — draft review, 7 September 2026

Six frame files now exist at native 1024×1536. Five unique joint configurations
use one athlete, scene and pair of dumbbells. This batch used six generation
calls: one master, four pose edits, and one colour correction. The first pose
edit was too far flexed for the requested early beat and was assigned to the
mid-curl position. This was a cue/pose review decision, not a new generation.

| Slot | File under `pilots/db-curl/` | State |
|---|---|---|
| 1 — Set up | `1-master.png` | Near-straight arms, supinated grip |
| 2 — Initiate curl | `2-early-candidate.png` | Small lift, elbows bend |
| 3 — Mid curl | `3-mid-candidate.png` | Weights in front of the waist |
| 4 — Top contraction | `4-top-colour-candidate.png` | Weights by the shoulders |
| 5 — Controlled lower | `5-lower-candidate.png` | Same pose as 3, on return |
| 6 — Finish return | `6-return-candidate.png` | Near-bottom, distinct from 1 |

The first top candidate incorrectly whitened the oblique highlight. Its
replacement restores the master colour hierarchy. The old candidate is retained
as evidence and is not selected for the six-slot preview.

## What was actually checked

All generated originals were visually inspected. Head, torso, legs and shoes
appear substantially steadier than the previous squat attempt. Read-only white
region diagnostics measured far-shoe sole y=1418 across all six; near-shoe sole
varied from y=1478 to 1479; head top varied from y=13 to 14. These support scene
registration within a pixel at those boundaries, not a claim that every pixel,
muscle or joint is identical. `measurements.json` contains the inputs/results.

The movement is recognisable, both hands keep their dumbbells, and the sixth
pose is a partial return. Frame 5 deliberately reuses frame 3's pixels: the
same pose occurs in both directions, while the app caption identifies lowering.

## Still required before release

- Full mobile playback review in both themes, including loop timing and 6→1.
- Review the projected dumbbell shapes and grip orientation across the lift.
  Initial automated dark-region bounds hit several ROI edges and are **not**
  accepted as invariant dimension measurements. Equipment thickness/diameter
  must be checked with better landmarks and the camera's expected projection.
- Review elbow centres and forearm foreshortening against the written strict
  variation; the generation's requested angle is not a measured joint angle.
- Complete comparison of character proportions and shading with the canonical
  row athlete, including the amount of stabiliser tint at mobile size.
- Decide compressed delivery files and complete the hash-bound release review.

The browser could not open the local preview; no playback approval is invented.
The set is not in the release registry and does not replace the current guide.

Technique was checked against [Mayo Clinic's dumbbell curl demonstration](https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/biceps-curl/vid-20084675):
a controlled elbow bend and return, with the elbow held close and wrist steady.
The specific six positions, camera and illustrative loading are our production
choices, not a sequence prescribed by that source.
