# Forearm Plank release

The exact catalogue exercise `plank` now has a reviewed guide using the
canonical anatomical athlete. This is a timed forearm plank, with a
knee-supported entry and controlled exit. It is not a push-up or a sequence
of repeated hip lifts.

## Six beats, two joint configurations

| Frame | Beat             | Physical state                                            |
| ----- | ---------------- | --------------------------------------------------------- |
| 1     | Set forearms     | Knees and forearms grounded, elbows below shoulders       |
| 2     | Brace first      | Same supported pose; establish abdominal tension          |
| 3     | Extend and lift  | Legs extended, knees raised, toes and forearms supporting |
| 4     | Find your line   | Same full plank; check head, hips and heels               |
| 5     | Hold and breathe | Same full plank for the prescribed hold duration          |
| 6     | Lower knees      | Return to the supported setup                             |

The source order is `1, 1, 3, 3, 3, 1`, stored as six separate native PNGs and
six separate delivery WebPs. Reuse is intentional for an isometric exercise.
No intermediate motion was invented to pad the sequence. The instructional
player cadence is not a workout timer; the cue says “Hold for time while
breathing normally.”

## Review and delivery

Native review covers both poses and the separately generated card derivative.
The full hold shows the canonical athlete, visible paired supports, a long
body line and stable muscle hierarchy. Knees bend for setup/exit and extend
for the hold. Shoe rotation and movement during that transition are intended.

Four fist/elbow patches were measured against the supported setup. The full
pose differs by −1px horizontally at the near fist, +1px at the far elbow,
and zero at the other two contacts; all vertical translations are zero.
Both measured forearm support spans vary by less than 1%. These measurements
meet the existing limits. Shading differences remain; patch matching is not
proof of every anatomical dimension. The read-only measurement script and
hash-bound results are in `../../pilots/plank-20261003/`.

The six 1536 × 1024 WebPs total 3,094,212 bytes. All decoded RGB pixels equal
their respective source PNGs; no per-frame crop, resize, warp or compositing
was applied. The card uses a separately reviewed transparent PNG derivative,
then the established exporter trims and scales it to 480 × 193. The card is
not represented as a pixel-identical copy of the full guide. Its source binding
is in `../../cutout-sources/plank.json`.

The actual production player and card were inspected at 393 × 852 in both
themes. Checks cover all six assets and cues, manual stepping, real 6→1
autoplay, matching endpoint files and displayed pixels, intentional identical
hold files, reduced motion, overflow and page errors. Screenshots and browser
results are under `plank-evidence/`. `plank.json` binds the final images,
reference, cues and review evidence; `PLANK_VALIDATION.json` records final
repository checks.

This is a branch integration, not a deployment. Crunches and Side Plank remain
unreleased with their existing findings; no failed candidate was promoted.
