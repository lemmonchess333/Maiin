# Workout record access — 6 September 2026

Follow-up to logging-consistency PR #2168. This batch is separate from that
deployment.

## Findings and changes

- Completed programme days link to `/history`, but the live History screen
  offered only aggregates. Added a collapsible Saved workouts list with actual
  document links, ten records at a time. It reuses History's existing complete
  subscription, includes older records, and explicitly labels its all-date scope.
- Moving from an existing workout route to a missing or failed record retained
  the previous workout and share controls. Key the detail component by account
  and route ID so record and sharing state reset together. The document ID also
  now wins over a legacy embedded `id` field.
- Lifetime lifting volume used a separate multiplication loop that counted timed
  holds as reps. It now uses the same `workoutTonnageKg` helper as period totals.

## Verification

- Focused rendered tests: 7 passed. Includes two new route-transition cases
  (missing record and injected read failure) and one new history pagination/link
  case. Existing detail rendering and share-deduplication cases still pass.
- Full `npm run verify`: lint passed (0 errors, 99 warnings), build passed;
  7,997 tests passed, 341 skipped, four failed. The same four failures were
  measured on the unchanged logging-consistency parent: two timezone subprocess
  IPC permission failures, personalTrajectory's prior-week boundary, and
  layoffDetection's re-entry expiry. They are not waived CI gates.
- `git diff --check` passed.
- New list still needs a fresh light/dark browser review before deployment.

## Completed-set correction investigation

The current data flow does not support a safe generic `editWorkout` operation:

| Affected state | Current behaviour | Required correction behaviour |
| --- | --- | --- |
| Workout record | Owner writes are allowed by rules | Validate changed sets and recompute saved totals together |
| Challenge standing | `onWorkoutCreated` credits; `onWorkoutDeleted` reverses | Apply a revision-aware delta, safe under retries and out-of-order delivery |
| Lifetime volume | Accrual is idempotent per workout ID | Reconcile old contribution with corrected contribution |
| Lifting progression | `onLogExercise` runs when the final set completes | Define correction semantics without replaying progression twice or overwriting later sessions |
| PR state | Session tracks set PRs, volume bests and fired milestones | Rebuild affected bests from surviving evidence; define badge retention explicitly |
| Shared feed | Posts are separate documents | Update linked post statistics or clearly mark stale/unlinked historical shares |

No unrestricted completed-set editor was added. A safe next implementation needs
an authenticated, revision-checked correction command plus integration tests for
retries, conflicts, partial failures, timed exercises and later progression. This
is a correctness dependency, not a new permission requirement.

## Live coverage limits

No additional food-photo calls, public shares or synthetic saved sessions during
this investigation. Real GPS and background tracking remain device-only checks;
the cloud browser's location failure is not evidence about a phone run.
