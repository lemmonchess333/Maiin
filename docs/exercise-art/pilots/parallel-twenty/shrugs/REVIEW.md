# shrugs candidate

Six native frames using three distinct joint configurations with explicit endpoint/return reuse. Not release approved.

- Minor contour shifts remain; static inspected, playback not verified.

Playback/mobile QA pending.

## Measured follow-up — 3 October 2026

The existing three unique native poses were inspected again without changing
any source files. Read-only patch matching finds a screen-left sole shift of
+3px horizontally at midpoint and +2px at peak, exceeding the existing 1px
release limit. This makes the former “minor contour shifts” finding concrete;
the set remains unreleased.

Peak knee-contour matches move −9px vertically on the screen left and −8px on
the right. Those patches also respond to shading and redraw differences, so
these are consistency findings, not proof of anatomical joint displacement
or changed bone lengths. Dumbbell dimensions remain unverified.

Source hashes and results are in `fixed-support-review-20261003.json`.
Reproduce with:

```sh
node docs/exercise-art/pilots/parallel-twenty/shrugs/measure-fixed-supports.mjs
```

The next repair needs a stationary lower body and rigid dumbbell geometry.
No new generation or code-based image repair was performed in this follow-up.

A later [fixed-leg composite candidate](../../shrugs-composite-20261003/README.md) eliminates measured sole/knee drift in separate files. Equipment and upper-body review remain open; these original sources are unchanged and unreleased.

The later `shrugs-rigid-20261003` repair resolves the equipment findings in separate assets; see `docs/exercise-art/releases/2026-10-03/SHRUGS.md`. These historical sources and measurements remain unchanged.
