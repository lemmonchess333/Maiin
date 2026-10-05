# Bulgarian Split Squat continuation checkpoint

**Native artwork review passes; app activation is pending the repaired player's recorded browser review.** The player and recording-test changes are published on `codex/continue-exercise-art-oct05`. The full repository gate passes. The prepared app entry and delivery remain unapplied.

## Completed work

The selected sequence is setup, shallow descent, deeper descent, bottom, deeper ascent and shallow ascent. Standing completes on the real 6→1 transition. Six separate 1536×1024 PNGs preserve the exact matching return poses: 3=5 and 2=6, while 1 differs from 6. The [native-sequence preview](../../pilots/continuation-20261005/bulgarian-split-preview.gif) shows those authored poses; actual player evidence is recorded separately.

One transparent dumbbell source supplies fixed near and far projections across all poses. Original hands and foreground anatomy preserve the grips and occlusion. The deep pose also includes the accepted 204-pixel ankle contour refinement. All four native poses and their grip/ankle details passed independent review. The original master and failed trials remain intact.

[Geometry evidence](geometry/README.md) binds all six selected frames to their measured supports. All 48 complete anchor-search windows match their measured originals exactly. Maximum anchor drift is 1px per axis; maximum support-span drift is 0.720590%, within the unchanged 1% limit. Equipment dimensions remain invariant and all 18 exposed-face checks match their fixed layers exactly.

The player now awaits decoding before scheduling the next pose, clears readiness when an image node is replaced, ignores obsolete decode promises, and requests synchronous image presentation. Twelve focused tests cover the existing controls/timing plus delayed decoding, remount readiness, rejection/retry and stale promises. This implementation still requires actual video evidence that the observed flash is gone.

## Verification and the remaining browser gate

| Evidence                                                                                           | Result and scope                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Full repository gate](verification/passed-checkpoint/README.md)                                   | Exit 0; 11,817 tests passed, 370 skipped, zero failures. Lint, both art audits, cycle check, production build and size check passed. All 6,525 tracked inputs stayed unchanged.                                                    |
| [V2 browser run 37361829827](https://github.com/lemmonchess333/Maiin/actions/runs/37361829827)     | 86 automated tests passed, but actual all-frame review found six empty artwork frames. The sampled-state pass was explicitly superseded. Exact [before-fix evidence](playback/before/README.md) is preserved.                      |
| [Player-fix run 37364543031](https://github.com/lemmonchess333/Maiin/actions/runs/37364543031)     | Source job passed; browser job was cancelled without a runner, steps or playback artifact. The cause is not exposed. [Raw evidence](playback/cancelled-attempt/preserved-evidence.json) is preserved.                              |
| [Lint-corrected run 37366511568](https://github.com/lemmonchess333/Maiin/actions/runs/37366511568) | Ended at 20:10:26 UTC on 5 October with both jobs cancelled before runner assignment or any executed step. The artifact list is empty. Exact [raw evidence](playback/lint-cancelled-attempt/preserved-evidence.json) is preserved. |

The full repository gate binds local source commit `1dd2ba9ecd7968263eedbef73b9528ba1da048b0` and its published equivalent `303aa373309c44a4b76f351fc5898f2d7c87c314` to the identical tree `f18238472d2e7640ec7587c47511c69c3a4cadde`. Later evidence-only files do not change those tested application inputs. The earlier lint failure and its correction are retained separately under `verification/initial-gate/`.

GitHub's [official incident update](https://www.githubstatus.com/incidents/3q1yb5m7ltvb) at 19:50 UTC on 5 October reports continued delays assigning hosted runners. That provides context for the unassigned jobs; it does not establish either cancelled run's specific cause. Neither post-fix attempt produced a browser recording or visual signoff. No workflow, runner setting or test threshold was changed to get past it.

The [fixed continuity checker](playback/README.md) reproduces all six original empty frames and assesses every encoded frame in a declared complete cycle. Its helper and profile are pinned for the next comparison. Its numeric result supplements native inspection of every transition; it does not classify anatomy or approve a release. The original videos use a 393×852 browser viewport encoded as 392×852 at 25fps. Reduced-motion captures cover default dark only. This is Chromium fixture evidence, not an installed mobile-app or production-deployment claim.

## Ready to continue

The [prepared integration](prepared/README.md) contains the exact two-file patch, draft review record, verified lossless-delivery hashes and concrete next steps. The six candidate WebPs total 2,856,426 bytes and decode to the selected PNG pixels exactly. They have not been written to `public/`.

After a clean recorded-player review, complete the hash-bound review record, generate the registry and standard card, inspect the actual card dimensions/backgrounds, and run the released-player and repository checks on the integrated inputs. Current coverage remains 64 released sets out of 141 in scope. No PR, merge or production deployment is part of this checkpoint.
