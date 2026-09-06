# Validation — recovery branch, 7 September 2026

## Final gate

`npm run verify` completed successfully with a local test-only preload that
rejects TCP socket connections before they open. This prevented the unit suite
from reaching external services.

- ESLint: 0 errors, 99 warnings (within the repository's configured limit).
- Artwork audit: 0 errors; 152 catalogue entries, 141 in scope, seven existing
  sets, zero newly approved sets, 3,483,250 released image bytes.
- TypeScript and production build: passed.
- Vitest: **673 files passed, seven skipped; 8,060 tests passed, 341 skipped,
  zero failures**. Test duration 99.45 seconds.
- `git diff --check`: passed.
- Account-free review fixture: ESLint passed after its final draft-selector edit.
- Calendar/date suites: 91 tests passed independently in each of UTC,
  Europe/London, America/New_York and Asia/Tokyo.

## Baseline and fixes

The first ordinary baseline test attempt was stopped by automatic approval
review because it tried to contact Firestore. No successful full clean baseline
is claimed for that attempt. Subsequent runs blocked outgoing TCP locally.

A detached clean worktree of main `ea6e786` reproduced four failures across five
focused files: two UTC/local fixture mistakes and two `tsx` CLI socket failures.
The clean comparison was 89 passed, four failed. Those same five files passed
95 tests after fixture repairs and two additional date-boundary checks. No app
training calculations were changed by these fixture repairs.

An early full run also timed out in a Kalman property test; it passed unchanged
in the clean focused comparison and in the final full run. It was not labelled
an existing code defect and no test was skipped or timeout increased.

The new curl exposed two real integration mismatches: overlong cues and the
old assertion that all six-frame sequences duplicate their first pose at the
end. Cues were shortened. The loop contract now also accepts a controlled
partial return, checking direction and closing distance; the curl's full
movement ladder and unreleased status are explicitly tested.

## Actual coverage and limits

Player tests cover loading both current/next frames, ordered looping, manual
pause/selection, slower playback, retry after preload failure, reduced motion,
hidden/inactive suspension and incomplete sequences. Integration tests cover
routing and accessible cue selection. Production/review tests cover wrong
variants, incomplete plans, stale asset/reference/cue hashes, failed visual
checks, fixed-anchor/dimension drift and invalid cable/stack movement.

Service-worker tests execute the real worker in a mocked local environment:
Firebase Hosting and Pages base paths, offline cache hits, API/write exclusion,
concurrent FIFO eviction, byte limits, invalid responses and quota failure.
They do not claim a live service-worker installation on a phone.

The cloud browser returned `ERR_BLOCKED_BY_CLIENT` for the local review URL.
No fresh visual screenshot, mobile interaction pass, animation playback approval,
merge or production deployment is claimed. The curl set remains draft.
