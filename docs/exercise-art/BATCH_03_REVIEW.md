# Batch 03: corrections, review integration and precision limits

The account-free fixture now offers all nine complete draft exercises: the earlier dumbbell curl, the seven batch-02 sets and the new bodyweight squat. No new set has been approved or shipped. The eight newer selections contain 48 separate frame paths and 33 unique poses. The original batch-02 report is a historical snapshot; the current manifest is authoritative for selection.

## Completed work

- Front raise: generated a smaller initial raise (`2-early-v2.png`) and reused it for the separate return file (`6-return-v2.png`). Both are selected. Static inspection shows a smaller initial movement than the superseded early pose; exact angles are not certified.
- Bodyweight squat: generated a six-slot draft from the canonical goblet-squat athlete, keeping both arms forward and the feet planted. Four original poses are selected; return files reuse matching positions. A more evenly spaced middle-pose candidate and its registration repair were rejected for foot drift.
- Hammer curl: generated an equipment-only middle-pose candidate to address shrinking dumbbell heads. It remains unselected: closer is not the same as a verified physical match.
- Barbell shrug: planned the movement and generated a master, middle/top candidates and a tightly scoped correction. Every moving candidate changed the fixed lower-body registration, so this pilot is incomplete and rejected.
- Added exercise-specific cues and progress values to all newer draft selections. The review player reads the manifest directly, displays the recorded findings and resets the cue when switching exercises. Production authored cues and artwork are unchanged.
- Added `check:form-drafts` to `verify`. It checks exact catalogue IDs, six separate paths, order/captions, cues/progress, native PNG dimensions, bytes/hashes and return-pose reuse. Passing integrity never grants visual approval.
- Added a separate TypeScript configuration for the development fixture and draft checker; the regular production build does not cover the fixture.

## Measured failures

Read-only measurements and ROI definitions are in `BATCH_03_ANCHOR_DIAGNOSTICS.json`. Threshold-based bounds are diagnostics, not an anatomy review.

| Candidate | Far/near sole bottom, native pixels | Result |
| --- | --- | --- |
| Bodyweight squat master | 1388 / 1446 | Reference |
| Selected early, middle, bottom | 1388–1389 / 1446 | Sole bounds remain within 1 px |
| Better-spaced middle v2 | 1358 / 1413 | Rejected: fixed feet moved up 30–33 px |
| Whole-figure registration attempt | 1378 / 1433 | Rejected: still 10–13 px too high |
| Barbell shrug master | 1418 / 1478 | Reference |
| First shoulder-lift edit | 1386 / 1446 | Rejected: both soles move up 32 px |
| Top shrug edit | 1355 / 1415 | Rejected: both soles move up 63 px from master |
| Explicit lower-half lock edit | 1386 / 1446 | Rejected: the supposedly locked region still moved |

The bodyweight-squat original middle and bottom positions are close in depth. Their uneven spacing remains a review finding, not silently waived. Goblet-squat static inspection also suggests slightly shrinking dumbbell extent in deeper poses. Hammer-curl end-head silhouettes change visibly; projected shape and physical dimensions need careful distinction.

## Why another prompt alone is insufficient

The built-in image editor repeatedly changes non-moving regions despite nearest-frame references, numeric coordinates, two-image pose references, an explicit whole-figure translation and a restricted edit-region instruction. More of the same prompting is not evidence that the camera, body or machine will become registered. Do not bulk-generate the remaining catalogue under the assumption these defects will disappear later.

The next proposed method is deterministic registration and compositing of generated artwork. It has **not** been performed in this batch. The session's image-editing rules require the user's explicit instruction before switching from the image tool to code-based image edits.

For the proposed method:

1. Preserve original masters and record hashes; create new sibling assets.
2. Measure at least two genuinely fixed contact regions and invariant dimensions. Apply a rigid translation only when their offsets agree and no body rescaling is required.
3. For stationary equipment, preserve its original geometry as a fixed layer. Position moving components from the authored physical state ladder, maintaining hand/cable contact.
4. For fixed body regions, use carefully bounded compositing only where the pose genuinely requires those regions to remain stationary. Check every join for broken anatomy or visible seams.
5. Regenerate anatomically wrong poses; registration cannot repair a wrong joint path, limb length or grip.
6. Produce exactly six standalone final images, then review the whole loop, cues and mobile themes. Do not weaken release gates to pass a candidate.

No CLI/API image generation, code-based pixel changes, browser-access workaround, production replacement, merge or deployment was performed.

## References and reproduction

Validation completed with exit 0 using the same temporary TCP-blocking preload:
`NODE_OPTIONS=--require=/tmp/tropos-no-network.cjs npm run verify`.
Lint, released-art audit, draft integrity audit and production build passed.
Vitest: **673 files passed, 7 skipped; 8,062 tests passed, 341 skipped, zero
failures**, duration 175.27 seconds. The draft audit reported eight newer sets,
48 frame paths, 33 unique poses, 48,451,980 native bytes and no integrity errors.
`npx tsc -p e2e/fixtures/tsconfig.form-art.json` and `git diff --check` also passed.
These checks do not substitute for the still-blocked visual/mobile release review.

- [ACE bodyweight squat](https://www.acefitness.org/resources/everyone/exercise-library/135/bodyweight-squat/) informed the stance and squat plan.
- [Muscle & Strength barbell shrug](https://www.muscleandstrength.com/exercises/barbell-shrug.html) describes the overhand grip and shoulder-elevation movement. The app catalogue's no-rolling/no-rocking cues were preserved.
- `BATCH_03_SCENES.json` records movement plans before generation.
- `BATCH_03_GENERATION_LOG.json` records every built-in generation/edit prompt and its input/output paths.
- `BATCH_REVIEW_MANIFEST.json` contains the selected image hashes, cues, rejected findings and current coverage.
- The previously blocked cloud-browser local preview remains unreviewed. No fresh mobile playback pass is claimed.
