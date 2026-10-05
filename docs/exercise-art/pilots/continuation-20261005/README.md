# 5 October exercise-art continuation

This is the bounded continuation of the interrupted **Bulgarian Split Squat**
(`bulgarian-split`) task. **It remains an inactive draft with native equipment
findings and blocked mobile review.** The branch starts at
`0180a3043b8fe2eb26c345a00c0d7404d86530ed` on `main`. The earlier
`codex/continue-exercise-art-oct02` branch was already contained in that base.

The owner's screenshot showed a later left-facing athlete with the bench on the
right, stopped while correcting the supporting rear-thigh highlight. The native
screenshot candidate was not available in the recovered repository. The new
master recreates that composition; it is not represented as recovered original
pixels. The canonical identity remains
`docs/exercise-art/identity/athlete-anatomy-v3.png`.

## Movement and selection

The intended sequence uses four distinct joint configurations in six full native
1536 × 1024 PNG files. Matching positions on the ascent reuse the same artwork,
with separate app-rendered instructions. The final part of standing occurs on
the real frame 6 → frame 1 transition.

| Frame | Pose                          | Caption         | Cue                                                   |
| ----- | ----------------------------- | --------------- | ----------------------------------------------------- |
| 1     | Setup                         | SET UP          | Plant front foot; rest your rear instep.              |
| 2     | Shallow descent               | BEGIN LOWERING  | Bend your front knee; lower with control.             |
| 3     | Deeper descent                | LOWER FURTHER   | Keep your front heel planted while descending.        |
| 4     | Bottom                        | REACH DEPTH     | Reach comfortable depth without bouncing or shifting. |
| 5     | Same configuration as frame 3 | DRIVE UP        | Drive through your front foot; rise steadily.         |
| 6     | Same configuration as frame 2 | CONTINUE RISING | Continue rising; keep feet and grips fixed.           |

`MANIFEST.json` and `bulgarian-split/provenance.json` identify the actual selected
files and bind image and cue hashes. The numeric progress values are authored
beat positions, not measured percentages of joint range. `plan.json` records the
intended movement, fixed supports and equipment invariants.

## Native repair record

- The setup keeps the working front quadriceps purple and the supporting rear
  thigh/hip neutral. The visible working hamstring uses lighter lilac where it
  becomes exposed; this is a qualitative muscle-role convention.
- The first attempted middle poses were too close to the bottom and obscured
  the far grip. New generation from the frozen setup produced a distinct
  intermediate body configuration; a local edit exposed its hand and handle.
- Raw bottom candidates redrew the planted shoe, rear instep and bench. The
  nondestructive contact compositor restores frozen supports and documents the
  generated ankle bridges, masks and bounded local alignment. Failed joins are
  retained for comparison.
- A separate equipment review measured changes in the dumbbell projection. A
  rigid-layer trial preserved sampled weight-face interiors exactly but left
  jagged or cutout contours at the hand/thigh boundaries. That trial was rejected
  for the main sequence. The selected draft retains the cleaner generated
  equipment contours and explicitly carries the unresolved dimension finding.
  Support registration alone cannot approve equipment, anatomy or the movement.

All raw generation attempts and exact prompts remain in `GENERATION_LOG.json`
and `bulgarian-split/sources/`. Construction reports intentionally retain
`releaseApproved: false`; approval requires a separate final visual decision.

## Review and verification

The account-free fixture includes `bulgarian-split (draft)`. Its focused
Playwright checks cover six-frame dark/light playback and reduced motion with
manual stepping. The Bulgarian-specific endpoint assertion preserves the
partial return in frame 6 and still checks the timer-driven 6 → 1 transition.
Existing exercise assertions are unchanged.

The unmodified base passed the complete `npm run verify` gate: 1,041 test files
passed, 8 skipped; 11,812 tests passed, 370 skipped; zero failures. Baseline and
post-change verification are recorded separately in
[`validation/README.md`](./validation/README.md).

The post-change combined run passed lint, both artwork audits, the cycle check,
TypeScript/production build and the distribution-size check before its execution
session was lost during unit testing. A separate retry of only the unit stage
exited successfully with unchanged tested inputs. Its retained log has no final
Vitest summary, so no final test counts are claimed. The interrupted combined
command's exit remains unknown; its earlier passed stages and the successful
unit retry are recorded separately.

Actual mobile playback is blocked in this environment. Playwright 1.60.0's
standard Chromium and headless-shell installers received invalid empty ZIPs;
there is no installed compatible browser. The supported system-package fallback
also failed at APT's privilege transition. A separately packaged Chromium
alternative failed during its normal extraction step, before launch. No browser
setting, access control or test gate was bypassed.
`validation/browser-blocker.md` preserves the exact commands and failures.

The [looping native-sequence preview](./bulgarian-split-preview.gif) shows the
selected artwork in order, including frame 6 → frame 1. It is not evidence of
app playback, light/dark presentation or reduced-motion behaviour.

Current draft records do not grant a production release or count this exercise
as migrated. Released coverage remains 64 of 141 guides. The next repair should
resolve the equipment-to-body contours while preserving rigid geometry, then run
and inspect the unchanged mobile suite in a browser-equipped environment.

Reproduce from the repository root:

```sh
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/composite/build.mjs
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/composite/build-deep.mjs
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/rigid-equipment/build-colour-only.mjs
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/measure-registration.mjs
npm run check:form-drafts
node docs/exercise-art/pilots/continuation-20261005/build-preview.mjs
npx playwright test --config playwright.form-art.config.ts e2e/form-art-review.pw.ts --grep 'bulgarian-split:'
npm run verify
```
