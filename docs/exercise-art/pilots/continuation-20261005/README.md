# 5 October exercise-art continuation

This is the bounded continuation of the interrupted **Bulgarian Split Squat**
(`bulgarian-split`) task. **The selected V2 passes native review and remains an
inactive draft pending actual mobile player review.** The branch starts at
`0180a3043b8fe2eb26c345a00c0d7404d86530ed` on `main`. The earlier
`codex/continue-exercise-art-oct02` branch was already contained in that base.

The later [continuation checkpoint](../../releases/2026-10-05/README.md) records
the actual V2 browser finding, the player decode repair and the passing full
repository gate. V2's automated browser tests passed, but frame-by-frame video
inspection found brief empty stages. Repaired-player browser verification is
still pending; the app integration is prepared and remains unapplied. The
selection and construction records below retain their original review scope.

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

The current selection comes from `bulgarian-split/rigid-equipment-v2/final/`.
`validation/v2-selection.json` binds the four exact source hashes, six byte-for-byte
copies and native review evidence. The original canonical identity, scene master
and generated sources remain unchanged. Selected setup differs from the master
only within declared equipment regions; the draft schema does not require a
replacement master or equate frame 1 with the original master bytes.

`validation/v2-selection-checks.json` records the successful draft audit, exact
selection rebuild, unchanged historical generation events/sources and the
hash-bound six-frame GIF. These are selection-integrity checks only.

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
- A historical equipment review measured changes in the dumbbell projection. A
  rigid-layer trial preserved sampled weight-face interiors exactly but left
  jagged or cutout contours at the hand/thigh boundaries. That trial was rejected
  for the earlier selection. These failed V1 files and measurements remain intact.
- V2 uses one transparent faceted/octagonal dumbbell asset to construct fixed
  near/far projections once, then translates them without per-pose resizing or
  rotation. Original hand/body foreground preserves grips and thigh occlusion.
  The independent native review accepts all four final poses and their outer
  contours; fixed-layer diagnostics accompany that review.
- The deep pose combines those gear changes with the reviewed 204-pixel ankle
  refinement. Its former short upper-contour shelf is superseded by a connected
  graded outline. The gear and ankle edits are disjoint, and the master shoe and
  laces-down contact remain exact. See `bulgarian-split/ankle-refinement-v2/` and
  `bulgarian-split/rigid-equipment-v2/native-review.json`.

All raw generation attempts and exact prompts remain in `GENERATION_LOG.json`
and `bulgarian-split/sources/`. The new equipment prompt and raw transparent asset
are bound by `rigid-equipment-v2/generation.json`. Construction reports retain
`releaseApproved: false`; native acceptance does not supply actual-player or
production approval. Their `selected: false` fields describe construction-stage
candidates; the later inactive selection is recorded separately here.

## Review and verification

The account-free fixture includes `bulgarian-split (draft)`. Its focused
Playwright checks cover six-frame dark/light playback and reduced motion with
manual stepping. The Bulgarian-specific endpoint assertion preserves the
partial return in frame 6 and still checks the timer-driven 6 → 1 transition.
Existing exercise assertions are unchanged.

The historical unmodified base passed the complete `npm run verify` gate: 1,041 test files
passed, 8 skipped; 11,812 tests passed, 370 skipped; zero failures. Baseline and
post-change verification are recorded separately in
[`validation/README.md`](./validation/README.md).

The earlier V1 post-change combined run passed lint, both artwork audits, the cycle check,
TypeScript/production build and the distribution-size check before its execution
session was lost during unit testing. A separate retry of only the unit stage
exited successfully with unchanged tested inputs. Its retained log has no final
Vitest summary, so no final test counts are claimed. The interrupted combined
command's exit remains unknown; its earlier passed stages and the successful
unit retry are recorded separately. Those results bind the earlier selection;
they are not presented as validation of the new V2 hashes.

Earlier mobile playback attempts were blocked in this environment. Playwright 1.60.0's
standard Chromium and headless-shell installers received invalid empty ZIPs;
there is no installed compatible browser. The supported system-package fallback
also failed at APT's privilege transition. A separately packaged Chromium
alternative failed during its normal extraction step, before launch. No browser
setting, access control or test gate was bypassed.
`validation/browser-blocker.md` preserves the exact commands and failures.
Actual mobile review of the current V2 hashes remains **pending**. Updating the
selection or rebuilding its preview does not turn historical blocked attempts
into player evidence.

The published V1 checkpoint subsequently passed the existing GitHub artwork
workflow: 84 tests, including Bulgarian light/dark stepping, the real 6 → 1
boundary and reduced motion. Its original screenshots, exact source audit and
raw report are preserved under
[`validation/checkpoint-ci/`](./validation/checkpoint-ci/README.md). That run
belongs to the older frame hashes and does not approve the current V2 selection.
The V2 browser suite also records complete timed cycles in both themes and saves
the reduced-motion and post-wrap states for review.

The [looping native-sequence preview](./bulgarian-split-preview.gif) shows the
selected artwork in order, including frame 6 → frame 1. It is not evidence of
app playback, light/dark presentation or reduced-motion behaviour.

Current draft records do not grant a production release or count this exercise
as migrated. Released coverage remains 64 of 141 guides. The next step is actual
dark/light playback and reduced-motion/manual review of these exact selected
frames, including the timed 6 → 1 transition, followed by the final release gates.

Reproduce from the repository root:

```sh
node docs/exercise-art/pilots/continuation-20261005/validation/select-v2.mjs
npm run check:form-drafts
node docs/exercise-art/pilots/continuation-20261005/build-preview.mjs
npx playwright test --config playwright.form-art.config.ts e2e/form-art-review.pw.ts --grep 'bulgarian-split:'
npm run verify
```

The selection helper only copies the pinned final PNGs and updates current draft
metadata. It does not regenerate art, change cues, update the original master,
write runtime assets or edit historical validation. The V2 construction folder
documents its separate reproducible layer builders. Full verification and player
commands above are the required later gates, not claims that this selection task
has run or passed them.
