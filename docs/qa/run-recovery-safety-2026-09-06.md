# Safer saved-run recovery — 6 September 2026

Branch: `codex/run-recovery-safety`, based on main at `a09f19ad5a018b3a907075ff8272987a10a6dc4c`.

## Problems and changes

- The saved-run prompt previously forced Resume, Start new or Discard. Back to Run and Escape now return to `/program?tab=run` while leaving the recoverable snapshot untouched.
- Start new and Discard previously cleared the snapshot immediately. Both now use the shared confirmation dialog, explicitly explaining that the previous run will be cleared without saving it to history. Cancelling returns to the recovery chooser.
- Distance was converted to the selected unit but always suffixed with `km`. The label now uses the same selected unit as the value: 1,609.344 metres displays as `1.00 mi` or `1.61 km`.
- Recovery actions use the shared Button primitive with at least 44px touch targets. Resume retains the running colour; the existing dark run-stage treatment is preserved. Confirmation uses the shared themed surface.

Existing storage schema, expiry, run recording and GPS behaviour are unchanged. This adds a safe exit, not a new run archive or a longer recovery window.

## Verification

The clean baseline and changed build each ran `npm run verify` in separate worktrees.

| Check | Clean baseline | Changed build |
| --- | --- | --- |
| Lint | 0 errors, 99 warnings | 0 errors, 99 warnings |
| Production build | Passed | Passed |
| Test files | 663 passed, 4 failed, 7 skipped | 664 passed, 4 failed, 7 skipped |
| Tests | 8,005 passed, 4 failed, 341 skipped | 8,016 passed, 4 failed, 341 skipped |

The same four cases fail in both worktrees:

- `leaderboard.test.ts`: timezone subprocess cannot open the tsx IPC socket (`listen EPERM`).
- `performanceEngine.test.ts`: the same subprocess permission restriction.
- `personalTrajectory.test.ts`: previous-week boundary, expected 0 and received 42.
- `layoffDetection.test.ts`: re-entry expiry, expected `none` and received `detrained`.

The overall verification command therefore exits nonzero in both cases. No new failing cases appeared.

The two focused suites pass all 14 cases (11 new). They render the real recovery and confirmation components, check miles/kilometres against known values, and exercise the real Run route with device I/O stubbed. Route tests write and read actual run-resume storage to establish that Back, Escape and cancellation preserve the snapshot, while confirmed replacement clears it. `git diff --check` passed.

## Limits and release state

This batch is committed locally, not deployed. The previous cloud-browser attempt rejected the local preview with `ERR_BLOCKED_BY_CLIENT`; the changed build has not had a rendered light/dark or mobile walkthrough. Automated DOM tests do not verify native back gestures, GPS accuracy or background recording. The implementation reuses the existing dialog and button primitives, but those limits remain explicit.
