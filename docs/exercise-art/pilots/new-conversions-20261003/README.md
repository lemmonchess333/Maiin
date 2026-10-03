# New exercise conversions — 3 October 2026

This batch follows the owner's direction to move to exercises that had no conversion, rather than spending another pass on existing repairs. Side Plank and all released artwork are unchanged.

Two new six-frame native PNG drafts are available in the account-free review player at `/e2e/fixtures/form-art.html`:

- **Cuban Press:** four unique poses, ordered setup → elbows up → rotate → press → lower → reverse rotation. The final lowering segment completes across frame 6→1; the two endpoints intentionally differ. Light dumbbells and the catalogue's segmented technique are retained.
- **Hip Abduction Machine:** three unique poses, ordered start → open → comfortable wide position → hold → controlled return → start. Outer thigh pads are used; this is not hip adduction. The enclosed tower makes no claim about visible cable payout or stack travel.

Both sets have exercise plans, canonical identity/master hashes, source provenance, captions, cues of seven words or fewer, per-frame hashes and explicit return-pose reuse. `MANIFEST.json` is included in the normal draft integrity audit and review fixture. No `public/` assets or release registry entries changed. Production remains 60 of 141 released guides.

## Review findings

Cuban Press's shoe patches have at most 1px measured displacement, but the overhead image visibly enlarges the dumbbells and lengthens the arms. Hip Abduction's full-open near floor-foot patch moves +3x/+1y, and pad/lever geometry, limb lengths and obscured far-hand contact remain unresolved. Neither set is approved for release. These findings are recorded instead of starting an extended repair cycle.

`measure.mjs` reproduces the 21×21 RGB patch diagnostics with a ±4px translation search. The method does not certify anatomy, equipment dimensions or machine physics. No code-based warping, compositing, rescaling or cropping was applied to the native files.

The first Cuban master lacked overhead room; the selected master was reframed by image generation before any movement frames. An enlarged rotation candidate was excluded and replaced by a local-edit retry. The first abduction master placed one pad inside the knees; that setup was corrected before the adjacent frames. These were new-conversion setup corrections, not edits to older exercise guides.

## Validation

All six targeted browser checks passed: both themes for both exercises, actual six-frame stepping and autoplay wrap, source dimensions, captions, 44px controls, no horizontal overflow or page errors, plus reduced-motion stepping. Screenshots are under `evidence/`; browser statistics are in `BROWSER_VALIDATION.json`. Native and mobile review retains the findings above; passing player checks does not approve the illustrations.

Run:

```sh
node docs/exercise-art/pilots/new-conversions-20261003/measure.mjs
npm run check:form-drafts
npx playwright test --config playwright.form-art.config.ts --grep 'cuban-press|hip-abduction-machine'
```

The required repository verification passed: 10,876 tests and 978 files, with 367 tests and 8 files skipped; lint, both artwork audits and build passed. The bundle budget passed unchanged at 335 chunks / 5,881.9 kB. See `VALIDATION.json`.
