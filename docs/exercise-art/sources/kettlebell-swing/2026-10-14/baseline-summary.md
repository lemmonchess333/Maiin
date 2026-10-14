# Fresh Kettlebell Swing baseline

Full normal `npm run verify`, before integration, on clean `main` at `af7ac48299e9a0daa35ce0effb72336e46d05adc`.
Started 2026-10-14T19:49:41.2672281Z; finished 2026-10-14T20:01:29.3738214Z. Node v24.19.0, npm 11.21.0.

Exit **1**. Lint, form-art audit, draft audit, circular-dependency check, build and dist-size checks passed. The full unit suite then failed:

- Test Files 51 failed | 1117 passed | 10 skipped (1178)
- Tests 81 failed | 13130 passed | 409 skipped (13620)
- Duration 495.81s (environment 45%, import 27%, tests 14%, setup 11%, transform 2%, worker 1%)

All 86 terminal FAIL headers are recorded verbatim in `baseline-failure-identities.json` and `.txt`; Vitest may group multiple cases under one header. The full unabridged log is `baseline-verify.log` (SHA256 `259bed672e39e9b38a43f205b54c444d1d0e8de46d3be423ff6d29098219bed9`). Compare the later full branch run against these exact identities, not only the count or an older baseline.

Initial status was empty. The run modified only the accepted `planSweep.golden.test.ts.snap`. It was restored from the exact byte backup `baseline-planSweep-before.snap`, returning to SHA256 `fb60028b126ee15f7175847f406172f91c0eb5893f1c1b3bc335f773986b5f11`. Final status was empty and HEAD unchanged. No production edits, skipped verification stages or repeated tests were performed for this capture.
