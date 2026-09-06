# Barbell shrug: authorized compositing continuation

The user explicitly authorized code-based alignment/compositing in this thread.
This permission covers these pixel repairs; no image API or new model was used.

## Result

Six separate 1024 × 1536 PNGs in `pilots/barbell-shrug/composite-v1/`.
The review manifest now includes this tenth overall draft exercise (nine in the
batch manifest plus the original dumbbell-curl pilot). Original rejected shrug
candidates are preserved. Nothing under `public/` or the production registry changed.

The method uses only the original shrug master, with displacement of
0 / 12 / 24 / 36 / 24 / 12 pixels. Positions 5 and 6 reuse 3 and 2. The body
is never globally scaled or translated. A spatial displacement field moves the
shoulders and load; fixed-region compositing restores the central core and legs.
The head is an occluding original layer. The bar and grip patches are restored
after blending so their sampled pixels remain exact.

Reproduce with `python scripts/compose-shrug-draft.py` (Pillow, NumPy, SciPy).
The script emits measurements and hashes beside its output. Regeneration changes
must be reflected in the draft manifest; integrity checks do not approve art.

## Measured checks

`composite-v1/measurements.json` records zero changed pixels in each frame for:

- Head sample: x410–529, y15–204.
- Central core: x440–574, y475–659.
- Entire lower region: x0–1023, y865–1535, including both shoe soles.
- Shaft, both plate and both grip samples, compared with the source translated
  by the authored frame's lift distance.

The original sole bottoms remain 1418 and 1478 pixels. Canvas, camera direction,
load sequence and return-pose hashes remain consistent. These checks are local
pixel comparisons, not certification of every joint, limb length or contour.

## Visual findings and release status

The first hard-mask prototype had visible shoulder and thigh seams and was
rejected. A second fixed-leg boundary left a visible horizontal thigh join and
was also rejected. The selected version blends those boundaries. Enlarged neck
and thigh crops were inspected, together with the separate intermediate poses.
A hard horizontal clipping of the upper trapezius was caught and removed.

The repaired draft no longer has the prior whole-leg/foot drift. However,
shoulder and neck transitions still use image deformation; the upper-thigh
strip revealed by the rising bar also deforms. The whole pelvis is NOT asserted
to be pixel-locked. Anatomical precision at these joins still requires acceptance.
Do not promote this set to approved solely from the zero-error measurements.

The local Vite review server starts with `--host 127.0.0.1`. The connected cloud
browser rejects its fixture URL with `ERR_BLOCKED_BY_CLIENT`. No browser-access
workaround was attempted, and actual mobile light/dark playback is unverified.
The downloadable GIF is a standalone sequence preview, not app-browser evidence.

## Validation

- Draft fixture TypeScript check and `git diff --check`: passed.
- Full `npm run verify` with the existing offline TCP guard: exit 0; lint,
  released-art audit, draft audit and production build passed. Vitest: 673 files
  passed, 7 skipped; 8,062 tests passed, 341 skipped, zero failures (95.32 s).
- Final image hash audit after the last pixel correction: passed; nine manifest
  draft sets, 54 separate paths, 37 unique poses, zero errors.

This is a completed repair draft with remaining visual findings, not a completed
catalogue migration or production release.
