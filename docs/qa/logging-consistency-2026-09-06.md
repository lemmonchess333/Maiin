# Logging consistency follow-up — 6 September 2026

Base: `6c35eae64ee14bbab63a6a0b97e263b63699df3c` (deployed PR #2167).
Branch: `codex/logging-consistency-2026-09-06`.

## Live walkthrough

Used the existing authenticated disposable account in the cloud browser.
No food-photo analysis, purchases, public posts, or new accounts.

| Journey | Observed result |
| --- | --- |
| Resume lifting after closing | Goblet Squat working set 3 retained 27.5 kg × 8; remaining warm-ups stayed incomplete. |
| Navigate exercises and finish early | Logged one RDL working set at 62.5 kg × 8. Review showed exactly two working sets, two performed exercises and 720 kg. |
| Save workout | Lower A became completed; sharing preview also showed two exercises and 720 kg. Declined sharing without changing defaults. |
| Analytics aggregation | Session count became two and volume approximately 6.5k kg, consistent with the existing 5,770 kg fixture plus 720 kg. |
| Food serving edit | Existing QA TEST banana changed from two to three servings. Settled Food and Home totals agreed: 315 kcal, 3 g protein, 81 g carbs, 0 g fat. |
| Target consistency | Home and Food retained the same 2,633 kcal target after the second workout; exercise expenditure did not get added again. |
| Weight entry | 75.0 kg increased to 75.1 and back. Cancel preserved the saved value. Switching units showed 165.3 lb and an input labelled in lbs. Restored KG; no new weight saved. |
| Marathon replan | Re-plan from today retained QA TEST Marathon, 7 March 2027, week 1 of 26. It regenerated Saturday's original 12 km long run from the earlier eased week. |
| Move a scheduled run | Moved the 12 km run Saturday → Friday → Saturday. Distance and pace prescription remained intact; occupied run days were disabled and lifting days labelled as trade-offs. |

The synthetic Lower A record remains saved; banana remains three servings.
The run draft remains paused at zero distance. Race plan remains replanned, with
the long run returned to Saturday. KG/KM and dark mode retained.

## Fixes

1. **WorkoutSession row completion bypass.** Completing a row other than the
   current cursor previously only set `completed = true`. It skipped the shared
   validator, undo, PR and progression path. Both row checkmarks and the primary
   CTA now call the same completion function with an explicit set index.
2. **Food edit false success.** A rejected edit could fall through the catch,
   announce success, close the editor, and even continue changing portions.
   The failure branch now returns, leaving the editor open for retry. Existing
   multi-document edits are not made atomic by this change.
3. **Inert analytics buttons.** Informational StatCards without an action were
   rendered as buttons with press animation. They now render as static cards;
   cards with an action retain button semantics and motion-safe feedback.

## Verification

- Baseline `npm run verify`, before production edits: lint 0 errors/99 warnings;
  build passed; 7,991 tests passed, 4 failed, 341 skipped (672 files).
- Final `npm run verify`: lint 0 errors/99 warnings; build passed; 7,994 tests
  passed, 4 failed, 341 skipped (673 files).
- Three new rendered WorkoutSession tests cover invalid later-set rejection,
  undo for out-of-order work, and exactly-once progression after row completion.
  The first two failed against the original implementation and pass after the
  change; the progression test passes in both and guards the consolidated path.
- The four identical baseline/final failures: leaderboard and performanceEngine
  timezone subprocesses (`listen EPERM` for tsx IPC); personalTrajectory prior-week
  boundary; layoffDetection re-entry expiry. They are not waived CI gates.
- Existing target, adaptive-TDEE, race-plan and schedule suites ran within the
  full suite; these are automated scenarios, not longitudinal live evidence.
- `git diff --check` passed.

## Limits / remaining work

- The new fixes have not been deployed or retested live. No fresh visual
  screenshot comparison of these local changes was performed.
- Real GPS distance and locked-phone/background tracking still require a device.
- No live network-failure injection, offline/reconnect save test, or full
  26-week progression simulation through the UI in this pass.
- The completed-workout link opens Analytics, not individual set details. The
  analytics stat cards do not expose those records either. A direct route from
  a completed programme day to the corresponding saved workout needs a further
  navigation change; this pass verified aggregates and save/share previews.
- Completed sets remain locked after the short undo window; persistent editing
  deserves a separate pass covering PR/progression rollback before introducing
  an unrestricted edit control.
- Meal removal/restoration and full history editing were not exercised live
  in this pass. No claim that every feature has been tested.
