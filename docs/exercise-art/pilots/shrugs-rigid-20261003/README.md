# Shrugs rigid-equipment repair

This set builds on the fixed-leg candidate in `../shrugs-composite-20261003/`. The original generated poses and rejected measurements remain unchanged. The legs below y860 remain pixel-identical to setup.

The first rigid grip-patch trials copied neighboring thigh pixels and produced wrist/occlusion artifacts. A contour refinement still left seams at the partly hidden rear plate. The rejected peak and historical implementation are retained under `rejected/`; neither is delivered. A later background-clearing experiment also damaged outlines and was discarded.

The accepted method uses one new transparent dumbbell asset, generated with the canonical athlete and exercise master as style/projection references. Its heads and shaft are assembled into two fixed camera projections: far 194×114 and near 214×114. Those layers are translated only; there is no per-frame scaling or rotation. Original hands and the far thigh remain foreground where they occlude the grip/rear head. Opaque interior alpha is normalized above 240/255 so texture does not vary with the background. The remaining antialiased edges retain transparency.

All four fixed-body patches show zero drift and zero channel difference. Nine translated comparisons of the far front, near front and near rear face interiors have zero changed channels. The hidden far rear plate is supported by shared layer construction and visual review, not a claimed pixel observation through the thigh.

Three native poses are stored as six frames in order 1,2,3,3,2,1. Full-pose and 2× grip review covers shoulders, straight elbows, neutral neck, grips, occlusion and the fixed legs. Production review and delivery evidence are in `../../releases/2026-10-03/shrugs.json` and `SHRUGS.md`.

Reproduce with `build.mjs`, `measure-fixed-supports.mjs` and `measure-rigidity.mjs` in this directory. `sources.json` and the compositor pin the parent-frame and equipment-source hashes. Build/diagnostic records do not grant release approval; the separate final review record does.
