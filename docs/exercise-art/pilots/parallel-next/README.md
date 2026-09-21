# Parallel exercise production — 21 September 2026

Branch: `codex/next-exercise-agents-20260921`.
Canonical reference: `docs/exercise-art/identity/athlete-anatomy-v3.png`.

Two production agents worked independently, supported by two read-only coverage/reference agents. Existing rebuild exercises were excluded: dumbbell curl, hammer curl, front raise, Cuban press, goblet squat, bodyweight squat, lateral raise, barbell curl, overhead press, barbell shrug.

## Results

| Exercise | Actual output | Status |
| --- | --- | --- |
| glute-bridge | One master/start pose | Next pose rejected by image service; sequence incomplete |
| overhead-extension | Three candidate poses and rejected correction | Body drift/arm geometry issues; sequence incomplete |
| lunges | Master and first-step candidate | Rear-foot drift/leg-selection issues; sequence incomplete |

No new set is approved or integrated into the app. See each exercise REVIEW.md and provenance/ledger for prompts, cues, references and defects. Do not fill missing poses with duplicates merely to claim completion.

Next untouched candidates: chest-supported-db-row and bulgarian-split. They have not been generated in this batch. Exercise assignments reflect inspected repo state, not a live cross-chat lock.

## Verification

The required npm run verify was attempted. Lint and build completed. Unit tests reported a RunMapLazy timeout before the runtime connection reset; the run did not complete. No claim of a passing full verification or of a pre-existing test defect is made. This batch changes candidate assets/documents only, outside public and runtime registries.
