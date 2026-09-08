# Exercise artwork batch 02 — 6 September 2026

Seven new six-frame draft sequences are assembled: hammer curl, front raise, goblet squat, push-ups, barbell back squat, barbell curl and flat dumbbell bench press. They contain **42 separate native-resolution PNG files (29 unique poses)**. Together with the earlier dumbbell-curl pilot, eight exercises now have complete draft sequences. This is not completion of the 141-exercise migration and is not release approval.

The exact selection, order, captions, reused poses, dimensions, byte counts and SHA-256 hashes are in `BATCH_REVIEW_MANIFEST.json`. Prompts and immediate reference paths are in `BATCH_GENERATION_LOG.json`. Superseded candidates remain available for comparison. No production artwork or source code changed in this batch.

## Production approach

Each new pose was generated or reference-edited individually at native resolution. No contact sheets were cropped or upscaled. Matching return poses are copied into separate numbered files, explicitly identified in the manifest; this avoids paying to regenerate physically identical positions and prevents new character drift on the return. The squat has a distinct drive pose and returns to the standing master. The other six sets show a late return pose at frame 6 and close the loop through frame 1.

The character is a bald faceless white/light-grey anatomical male with fine dark contours, white low-top shoes and a black background. Primary muscles use deeper purple, secondary contributors lilac and stabilisers subtle pale emphasis. This is a qualitative teaching convention, not a measured activation scale. Highlight placement must be reviewed, not inferred correct merely because it is purple.

Masters are intentionally text-free. Their uppercase numbered captions are metadata for accessible app rendering. Standalone captioned exports still require deterministic typography and visual QA. A generation request is not evidence that its requested joint angles were achieved; several intermediate poses moved farther than requested, so the metadata uses qualitative movement beats.

## Review findings

| Exercise | Draft coverage | Remaining checks |
| --- | --- | --- |
| Hammer curl | Six frames; four unique poses | Neutral-wrist dumbbell axis, handle length and upper-arm proportions. Initial early pose superseded. |
| Front raise | Six frames; four unique poses | Intermediate pose spacing, shoulder-height endpoint and stable soft elbow bend. |
| Goblet squat | Six frames; four unique poses | Depth, knee tracking, femur/torso foreshortening and cupped dumbbell grip. |
| Push-ups | Six frames; four unique poses | Plank/neck line, elbow stacking and palm registration. Near-hand bounding region changes by up to 8 px and includes wrist, so it is not a passed contact-shape test. |
| Barbell back squat | Six frames; five unique poses | Corrected bar support, projected proportions, parallel/depth labels and plate silhouettes. |
| Barbell curl | Six frames; four unique poses | Elbow-pivot registration, upper-arm length, bar/plate silhouettes and grip width. |
| Dumbbell bench press | Six frames; four unique poses | Wrist-over-elbow alignment, elbow path/depth, near upper-arm shape and dumbbell consistency. |

Read-only image-bound diagnostics for the first four sets are in `BATCH_ANCHOR_DIAGNOSTICS.json`. Shoe boundaries in the standing sets were generally within about 1 px. Bounding-box agreement does not establish identical anatomy or correct form. All seven sets remain `draft-awaiting-review`.

## Rejected incomplete pilots

**Lat pulldown:** the initial stack had inconsistent plate counts. The revised master was visually usable as a reference, but the early pull grew the stationary plate block and lifted the selected packet too far for the displayed 1:1 cable payout. A targeted two-reference repair still changed the fixed block. Both early candidates are rejected. Do not keep retrying this same full-scene method; establish a registered physical machine construction before continuing.

**Deadlift:** the early lift moved both planted shoes upward by roughly 32 px. A two-reference repair did not restore their positions. The sequence is incomplete and rejected for release. Its proposed movement ladder also differs from the current authored six beats and must be reconciled before integration.

## Delivery and validation

The 42 selected native masters total 42,555,337 bytes before Git deduplication. They are development references under `docs/`, outside the public asset bundle. Do not ship these native PNGs directly or claim that the app download grew by this amount. Delivery-format conversion, measured byte budgets and mobile rendering review remain required.

`NODE_OPTIONS=--require=/tmp/tropos-no-network.cjs npm run verify` completed with exit 0. The temporary guard blocks TCP while allowing Unix IPC, keeping the test run offline. Lint and production build passed. Tests: **673 files passed, 7 skipped; 8,060 tests passed, 341 skipped, zero failures**. Existing lint warnings remain. The build's artwork audit reported no errors. These checks validate the application snapshot and do not approve the new draft images.

No fresh mobile playback review was possible: the connected browser blocks this local preview with `ERR_BLOCKED_BY_CLIENT`. That limitation was not bypassed. No merge, deployment or production replacement is included in this draft batch.

## Technique references used for scene planning

- [ACE: hammer curl](https://www.acefitness.org/resources/everyone/exercise-library/10/hammer-curl/) — neutral grip and controlled elbow flexion.
- [ACE: front raise](https://www.acefitness.org/resources/everyone/exercise-library/54/front-raise/) — front-raise setup and movement.
- [ACE: goblet squat](https://www.acefitness.org/resources/everyone/exercise-library/362/goblet-squat/) — chest-held dumbbell and squat setup.
- [ACE: push-up](https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/) — push-up technique reference.
- [ACE: back squat](https://www.acefitness.org/resources/everyone/exercise-library/11/back-squat/) — barbell squat reference.
- [NASM: lat-pulldown biomechanics](https://www.nasm.org/resource-center/blog/training/the-biomechanics-of-the-lat-pulldown-muscles-grip-and-form) — muscle roles and controlled pull. The numerical cable-state check is our geometric inference from the pictured routing.
- [ACE: dumbbell chest press](https://www.acefitness.org/resources/everyone/exercise-library/19/chest-press/) — flat-bench and planted-foot setup. Current app catalogue cues also informed the exact chosen variations.

Next production work should finish the seven sets' registration and technique reviews, fix failed frames, reconcile their captions with authored exercise cues, then convert and integrate passing sets. Continue through the remaining exercise inventory using the same explicit draft/review/release separation.
