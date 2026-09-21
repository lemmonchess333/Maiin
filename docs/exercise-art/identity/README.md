# One athlete, fixed exercise masters

Owner direction, 21 September 2026: use one individual throughout, wearing
ordinary gym shorts instead of tight white underwear or an unshorted anatomical
pelvis. New master: `athlete-shorts-v2.png`.

## Identity

Bald faceless muscular white/light-grey illustrated man, fine dark contours,
white trainers, loose opaque charcoal shorts with waistband and mid-thigh hems.
Same proportions, muscle detail, head, hands and feet in every exercise. No
briefs, compression wear, bare feet, clothing changes or anatomy through fabric.
Covered muscles are explained in captions rather than by removing clothing.

## Reference chain

1. Use the global athlete image as the identity and clothing reference.
2. Derive one exercise setup image and save it at
   `docs/exercise-art/masters/<exact-exercise-id>/1.png`.
3. Attach both the global athlete and that exercise master to every frame edit.
   The nearest usable pose can be a third input. Never chain only from the
   previous frame: this accumulates drift.
4. Keep scene camera, scale, equipment and fixed body contacts unchanged.
5. Review identity, clothing, equipment and mechanics across all six frames.
   Hashes establish provenance, not visual correctness.

`MASTER_REGISTRY.json` maps all 141 in-scope catalogue IDs. A required path is a
planned destination, not a claim that a master already exists. Status explicitly
separates absent masters, legacy masters and new draft masters.

## Audit and current progress

All 17 released first frames were inspected together on 21 September. None
matches the required loose shorts. Bench press, dips, lateral raise, overhead
press, rope triceps pushdown and skull crushers also show bare feet. The other
11 first frames use trainers. This audit covers first frames only; it is not an
approval of the remaining 85 images or any biomechanics.

Cuban Press has a new v2 exercise master and six draft frame files built from
four generated poses. The return goalpost and row poses reuse the exact outward
poses with separate return captions; this avoids unnecessary identity drift.
All selected images show charcoal shorts and white trainers. Upper-arm muscle
highlighting and shoulder shape still need refinement before strict approval.

The production prompt now rejects the old athlete version and an unrelated
exercise master. Its CLI also requires both reference PNGs to exist. Historical
v1 scene plans remain marked v1 and cannot silently seed new artwork. Existing
released artwork is retained pending replacement; this change does not claim
that the whole library has already been rebuilt.

Additional v2 draft masters: dumbbell curl, hammer curl and front raise. Their
remaining frame sequences have not yet been rebuilt. The global identity image
and all four exercise masters have SHA-256 provenance in the registry.

Validation: npm run verify passed: lint, both artwork audits, production build,
9,697 unit tests (347 skipped). Browser playback remains unverified: Playwright
could not download its Chromium executable.
