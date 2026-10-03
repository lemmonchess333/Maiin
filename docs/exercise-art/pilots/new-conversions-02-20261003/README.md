# New exercise conversions, batch 2 — 3 October 2026

Three previously unconverted exercise IDs now have six-frame native drafts. This follows the owner's priority to work through new conversions, leaving existing guides and repair sets alone.

- **Nordic Hamstring Curl:** secured-ankle, controlled partial-range Nordic with crossed arms, straight hips and a hamstring-led return. Three unique poses in six separate files: upright, early lean, deeper lean, control, return, upright. No floor push-off or assistance band is claimed.
- **Hip Adduction Machine:** inner-thigh pads, comfortable wide start, inward squeeze, controlled outward return. Three unique poses in six separate files: wide, midway, closed, control, midway return, wide. This is distinct from Hip Abduction Machine; its existing draft was not changed.

- **Sissy Squat:** bodyweight with a fixed balance post, heel raise, knees forward and torso leaning back through a moderate range. Three unique poses in six files; the generated camera is more frontal than planned, so the leg/hip alignment is harder to judge.

Plans were authored from the exact catalogue entries before generation. Each set has a canonical master, identity/source hashes, cue hashes, explicit pose reuse and review findings. `MANIFEST.json` is registered in the draft audit and account-free fixture at `/e2e/fixtures/form-art.html`. All cues contain at most seven words. No code-based compositing, warping, rescaling or cropping was applied to the native images.

## Findings retained before release

The Nordic early-lean frame shifts both measured platform-bolt patches upward by 22px (the far bolt also shifts 1px left). The deeper pose was generated directly from the fixed master rather than propagating the drifting intermediate; its measured platform patches have zero best-fit translation. Body length and knee/ankle geometry still need review. The patch errors are nonzero and a zero translation is not proof of unchanged pixels or anatomy.

Hip Adduction's tower seam is stable in the sampled patches, but the closed pose moves the near round floor-foot patch approximately 60px left and 14px up. A stationary machine support must not travel with the moving footrest. The closed frame also introduces more visible tower details; no stack or cable-physics approval is claimed. Pad/lever geometry, limb dimensions and the obscured far-hand grip remain unresolved.

Sissy Squat has a stable sampled post base and at most 1px support-hand translation, but its near forefoot patch moves up to 3px left and 1px down. The reaching support arm appears longer as the body moves away. Joint alignment and proportions remain unapproved.

These are **drafts, not production releases**. The measured failures are recorded without starting another extended repair cycle. Production coverage stays at 60 of 141 guides. Existing artwork and repair trials are unchanged.

## Review and reproducibility

All nine final-batch browser checks passed: dark/light playback for each exercise, exact source dimensions and endpoint hashes, cues, real 6→1 autoplay wrap, 44px controls, no horizontal overflow or page errors, and reduced-motion stepping. Screenshots are under `evidence/`, with statistics in `BROWSER_VALIDATION.json`. Native and mobile visual review retains the findings above.

`measure.mjs` performs read-only 21×21 RGB patch matching. Search radii are 32px for Nordic, 96px for the adduction machine and 8px for Sissy Squat, recorded in each result. These are diagnostics, not automatic release approval.

```sh
node docs/exercise-art/pilots/new-conversions-02-20261003/measure.mjs
npm run check:form-drafts
npx playwright test --config playwright.form-art.config.ts --grep 'nordic-hamstring-curl|hip-adduction-machine|sissy-squat'
```

Repository verification passed with 10,876 tests / 978 test files; 367 tests and 8 files were skipped. Sissy Squat was added as draft data during that run, then the final batch passed the draft audit, changed-file lint and all nine browser checks. Commit hooks run the final typecheck. Bundle size remains 335 chunks / 5,881.9 kB. See `VALIDATION.json` for the exact scope.
