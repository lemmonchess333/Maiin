# First usability batch — 6 September 2026

Branch: `codex/usability-first-batch`, based on `origin/main` at `6c35eae6`.
Scope: the first implementation batch requested after the app-improvement review.
Existing unfinished workout changes in the other checkout were left untouched.

## Changes

- Run: the free-run picker, planned launch card and expanded setup cancel action return to `/program?tab=run`. This changes the destination tab; it does not introduce persistent setup drafts or change active-run exit handling.
- Sharing: remembering is unchecked when the sheet opens. Sharing or declining without opting in affects one session. Dismissing the sheet never saves a default, even after the checkbox was selected. Explicit remembered choices remain supported, independently for runs and workouts; existing stored defaults remain intact. Copy explains automatic future sharing and where to change it. The remember label has a 44px minimum touch target.
- Units: Settings names the preference “Body weight unit” and explains that lifting loads use kilograms. Nutrition current weight, goal weight, weekly pace and target-drift/recalculation text use the selected unit. Goal edits step by 0.5 kg or 1 lb and retain the existing 30–250 kg storage bounds. Pace presets and nutrition calculations remain in kilograms. The weight trend uses the same conversion helper as Home and Nutrition.

## Verification

Clean baseline `npm run verify`: lint passed with 99 warnings and no errors; production build passed. Tests: 661 files passed, 4 failed, 7 skipped; 7,991 tests passed, 4 failed, 341 skipped.

Measured baseline failures:

- `leaderboard.test.ts`: timezone subprocess could not open the tsx IPC socket (`listen EPERM`).
- `performanceEngine.test.ts`: the same subprocess/socket restriction.
- `personalTrajectory.test.ts`: previous-week boundary, expected 0 and received 42.
- `layoffDetection.test.ts`: re-entry expiry, expected `none` and received `detrained`.

The initial focused pass passed 50 tests across navigation, sharing, nutrition units, unit settings and weight trends. One further run-specific sharing regression was added before the full verification run.

Final `npm run verify`: lint passed with the same 99 warnings and zero errors; production build passed. Tests: 662 files passed, 4 failed, 7 skipped; 8,002 tests passed, 4 failed, 341 skipped. The exact four failing cases match the clean baseline. All 51 tests in the changed-area suites pass, including the 11 net additional cases. `git diff --check` passed. The required command was executed, but its overall exit is nonzero because of those baseline failures.

## Browser and release limits

Vite initially failed while enumerating network interfaces; binding only to loopback started the server. The cloud browser refused the local preview with `ERR_BLOCKED_BY_CLIENT`. No browser restriction was bypassed. Consequently, rendered mobile layouts and light/dark visual checks of the changed build remain unverified. Component and router tests are not a live or native-device walkthrough.

No production app records, social posts, paid food requests, subscriptions or permissions were changed. This branch is not a deployment.
