# Week adjustment feedback — 6 September 2026

Branch: `codex/adjust-week-save-feedback`, following the saved-run recovery batch (`4c4ecd5a` locally; released separately through PR #2171).

## Changes

- Show an announced Saving changes or Restoring your week status while a command is pending.
- Keep the sheet and preview in place while saving. Disable Back, other adjustment choices and conflicting writes until the request settles.
- Share a synchronous pending guard across ease, re-plan and undo, including older toast callbacks. Repeated taps on a toast's Undo cannot submit another restoration while the first is running.
- Recover from an unexpected undo rejection, show an error and enable retry. Preserve the eased-week marker on failure. Record successful-undo analytics only after success.
- Keep the three action buttons' accessible names while their loading spinner replaces their visible text.

No scheduling, workout-generation or server command semantics changed. Existing successful-save counts and server refusal messages are preserved.

## Verification

The unchanged starting tree's measured `npm run verify` result was 8,016 passing tests, 4 failing and 341 skipped; 664 files passed, 4 failed and 7 skipped. Lint passed with 99 warnings and no errors, and production build passed.

The changed build ran `npm run verify`: lint passed with the same 99 warnings and zero errors; production build passed; 8,021 tests passed, 4 failed and 341 skipped. File counts were unchanged. The exact four failing cases were compared programmatically against the baseline:

- `leaderboard.test.ts`: timezone subprocess could not open the tsx IPC socket (`listen EPERM`).
- `performanceEngine.test.ts`: the same subprocess permission restriction.
- `personalTrajectory.test.ts`: previous-week boundary, expected 0 and received 42.
- `layoffDetection.test.ts`: re-entry expiry, expected `none` and received `detrained`.

The overall command exits nonzero because those cases fail in both trees. No additional failures appeared. All 22 week-adjustment tests pass, including five new deferred-request, duplicate-Undo and retry cases. `git diff --check` passed.

## Integration with the recovery correction

The live verification of PR #2171 found a browser Back-history regression when switching from the recovery chooser to a confirmation. The correction in PR #2172 keeps one dialog mounted and shares confirmation controls, with two additional tests using the real BackDismissProvider. That correction was included in this follow-up branch before handback.

The combined tree ran `npm run verify` again: lint passed (99 warnings, zero errors), production build passed, and 8,023 tests passed, 4 failed and 341 skipped. The same exact four baseline cases were confirmed programmatically; no new failures appeared.

## Release limits

This follow-up is committed locally and has not been deployed. Rendered light/dark and mobile checks remain pending because the earlier cloud-browser local-preview attempt was blocked. DOM tests exercise the actual components but do not establish native gesture or device coverage.
