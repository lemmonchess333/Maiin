# Live audit follow-up — 6 September 2026

Branch: `codex/live-audit-fixes-2026-09-06`, based on `origin/main` at `076fd668`.
The older `Maiin` worktree and its unfinished edits were left untouched.
Implementation and testing were performed locally. Publishing this branch does not mean it has been merged or deployed. No public social post or paid food-photo analysis was performed in this fix pass.

## Implemented

| Observed problem | Change | Verification |
| --- | --- | --- |
| Resume selects completed set 1 | Recover the next unfinished set, preferring the saved exercise and wrapping if needed | Cursor regression tests |
| Finishing the last listed exercise skips earlier unfinished work | Completion is based on all set states, not array position; navigation wraps to remaining work | Cursor regression tests; live phone retest pending |
| Legitimate partial workouts still need an exit | Explicit Finish early confirmation leads to review of completed work | Shared confirmation UI; live retest pending |
| One partial food day produces a weight-loss prediction | Missing days are chart gaps; today is excluded; past logged days are labelled estimates; remove weight forecast and goal-progress claims | Render/data tests for empty, today-only and sparse logging |
| WebGL failure crashes the whole run screen | Isolate optional map in an error boundary; a map chunk failure does not reload an active run | Actual map constructor mocked to throw; sibling controls remain usable; supported-map cleanup tested |
| Tile errors claim GPS is still recording | Describe map failure without asserting GPS status or assuming the cause is offline mode | Code review |
| Autocomplete error overlaps a successful meal submission | Deactivate optional suggestions and dismiss their stale error when submitting; ignore submission while already parsing | Code review; live meal-entry retest pending |
| Share prompt counts all planned exercises | Count and share only exercises with recorded sets, using the same entries for muscle groups | Programme writer regression test |
| Completed programme card presents planned estimates as actual totals | Remove those misleading totals and link to recorded workout history | Build/type checking; live retest pending |

Meal presence is not evidence of a complete food diary. No new completeness flag, TDEE formula, or inferred meal-completeness heuristic was introduced. Historical logged-day gaps are explicitly estimates, not proof of deficit or weight change.

Removed the now-unused goal-alignment helper and its old example/property tests, which asserted the claims intentionally removed from the UI. Removed the unused planned-volume label helper and its corresponding test. These remain recoverable from Git history. New rendered-chart tests cover the replacement behaviour.

## Baseline before edits

`npm run verify`: lint passed (99 warnings, zero errors); build passed.
Test baseline: 659 files passed, 4 failed, 7 skipped; 7,993 tests passed, 4 failed, 341 skipped.

- `leaderboard.test.ts`: timezone subprocess blocked by `listen EPERM` for the tsx IPC socket.
- `performanceEngine.test.ts`: same subprocess permission restriction.
- `personalTrajectory.test.ts`: previous-week boundary assertion (expected 0, received 42).
- `layoffDetection.test.ts`: re-entry window assertion (expected none, received detrained).

Permission restrictions were not bypassed. A passing mocked location test is not proof of real GPS accuracy or background delivery.

## Final verification

`npm run verify` rerun after the code changes: lint passed with the same 99 warnings and zero errors; production build passed. Tests: 661 files passed, 4 failed, 7 skipped; 7,991 tests passed, 4 failed, 341 skipped. The four failures are the same baseline tests listed above. All 15 added regression cases passed. Seventeen tests of retired helper behaviour were removed alongside those helpers, explaining the lower total test count. `git diff --check` passed.

The changed UI has not been re-tested on a deployed build. No claim is made that the whole app, GPS distance accuracy, or native background tracking is fully verified.

## Real-device running acceptance check — still required

Use a disposable account and a short, safe outdoor walk. Do not operate the phone while crossing roads or driving. Label the saved activity as a QA test. No repeated food analyses are needed.

1. Install the updated test build. Record device, OS, native-app versus Safari/PWA, build identifier, and permission choice.
2. First deny location: verify clear recovery instructions and usable back/stop controls. Then enable location through the normal system prompt or settings. Do not treat the map loading as proof of a GPS fix.
3. Start Free Run outdoors. Check acquiring-GPS state, first fix, elapsed time, and increasing distance once moving.
4. Walk a short known route with the app foregrounded. Pause, move briefly while paused, resume; verify paused movement is not added and timer behaviour matches the labels.
5. On the native app, lock the screen for 60–90 seconds while walking; unlock and inspect continuity. Repeat briefly while another app is foregrounded. Check for missing route segments, duplicated points, implausible pace and distance jumps.
6. Stop and save once. Compare run summary, History, Analytics and shoe mileage; reload and confirm a single saved activity.
7. Test denied/unavailable GPS and unavailable map independently. A map failure must not erase the session or claim that location is recording.

The native iOS project declares the location background mode and includes the background-geolocation source. That establishes configuration, not device verification. In `src/pages/Run.tsx`, `handleHidden` explicitly calls `gps.stop()` for outdoor runs on web, but not on native. Consequently, allowing browser location does not enable hidden-tab or locked-screen recording in this app. Keep the browser foregrounded for its test; use the native build for the background test. The remote audit browser cannot stand in for the user's moving phone.

Do not mark background running verified until these device checks pass on the intended shipping build. Full device/browser coverage, unit consistency, easier-week feedback, and default-sharing behaviour remain separate follow-up work.
