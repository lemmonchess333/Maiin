# Continuation validation evidence

This directory preserves the measured baseline, final selected-draft checks and browser-provisioning findings for the 2026-10-05 Bulgarian Split Squat continuation. It does not approve or activate the artwork.

## Current status

| Scope                                                        | Result                                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean baseline at `0180a3043b8fe2eb26c345a00c0d7404d86530ed` | Full `npm run verify` passed: 1,041 test files and 11,812 tests passed; zero failures. Existing skips are recorded in the baseline summary.                                                                                               |
| Final combined `npm run verify`                              | Interrupted with an unknown command exit. Lint, both art audits, cycle detection, TypeScript/Vite build and dist-size checks passed before the execution session was lost during the unit stage.                                          |
| Unit-stage retry                                             | Exited successfully (0) after 1,092.43 seconds with unchanged tested inputs. The retained log has no final Vitest summary, so final test counts are unavailable. No assertions, projects, exclusions or repository configuration changed. |
| Bulgarian mobile player: dark, light, reduced motion         | Not run. Default-browser downloads, normal system-package setup and the bounded alternate-package extraction all failed before a browser/page started.                                                                                    |
| Final selected draft                                         | Frozen setup/shallow/deep/bottom/deep/shallow frames and seven-word cues are recorded in `final-selection.json`. The equipment variation and residual deep-ankle contour findings remain explicit.                                        |

`final-verify-interruption.json` and `final-verify.log.txt` preserve the interrupted command's actual outcome and completed stages. The combined command must not be described as an exit-0 run. Its unfinished unit stage completed in a separate retry. `unit-stage-retry-summary.json` records the successful exit, unchanged inputs and missing final count summary. The exact completion record is `unit-stage-retry-result.json.txt`; `unit-stage-retry-result.json` is its readable view, and `unit-stage-retry.log.txt` preserves the partial output. No baseline totals are presented as final-run totals.

`final-draft-audit-result.json`, `final-registration-lint-result.json` and `final-player-discovery-result.json` preserve the earlier focused results. The audit checked 30 draft sets, 180 frames and 107 unique poses with no integrity errors. Discovery found exactly three Bulgarian player tests; discovery did not execute them.

## Immutable captures and readable views

The original baseline summary is `baseline-summary.json.txt`; `baseline-summary.json` is its readable derived view. The original browser blocker is `browser-blocker.md.txt`; `browser-blocker.md` is a readable derived view that also records the later alternate attempt. `preserved-evidence.json` points the original SHA-256/byte-count entries to the raw `.txt` captures. Those raw captures must remain unchanged when formatting the readable files.

`tested-manifest.json.txt` and `tested-provenance.json.txt` preserve the exact bytes used by the final checks. `tested-input-captures.json` records their original paths, byte hashes and JSON-semantic hashes. The raw interrupted/retry input snapshots are `final-verify-start.json.txt` and `unit-stage-retry-start.json.txt`; their `.json` siblings are readable views. Later JSON formatting must preserve parsed semantics and all code, native-image, plan and cue values.

The baseline summary's absolute log paths identify the original capture workspace. Its small metadata/start/end/result records are included here. Long repetitive baseline logs are omitted. Captured text was checked for credential patterns before inclusion.

## Browser evidence

`browser-blocker.md` records the exact standard-download and system-package errors. `browser-alternative-metadata.md` distinguishes the initial read-only package inquiry from the later attempt. Only the small `browser-alt/README.md`, `browser-alt/launch.json` and `browser-alt/blank-launch.mjs` records are retained for that attempt; no package cache, temporary extraction directory or browser binary is included.

Actual mobile playback and reduced-motion/manual stepping remain unverified. Native images, the standalone sequence preview, passing structural audits and test discovery do not replace actual player evidence. The existing review bounds and 11 release checks are retained in `release-review-checklist.md`.

## Format-only normalization

`format-only-normalization.json` records the final presentation cleanup. Parsed JSON values must remain equal to the captured inputs, and code, native-image, plan and cue pins must remain unchanged. Raw `.txt` evidence is retained byte for byte.
