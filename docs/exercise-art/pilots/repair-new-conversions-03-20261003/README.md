# Repair of the newly generated batch — 3 October 2026

**Calf raise superseded:** the owner rejected this calf-raise layout. Its active selection now uses the [regenerated side-view sequence](../donkey-calf-regenerated-20261003/README.md); original repair evidence below remains historical.

The owner's latest instruction was to fix the generated exercises first. This pass replaces the selected draft frames for Glute-Ham Raise, Donkey Calf Raise and Pistol Squat. The previous native generations and their findings remain preserved in the original batch and `sources/`.

## Changes

- **All three:** consistent black backgrounds eliminate the white-frame flashes. Image generation performed the background edits; original sources remain untouched.
- **Pistol Squat:** the middle and deep poses move rigidly onto the original floor reference. The working sole and lower shoe uses exact master pixels, with a contour-aligned 70-row calf bridge. This uses the previously authorized fixed-contact compositing approach. The bridge is locally resampled; the whole body is not resized.
- **Glute-Ham Raise:** the middle pose's background is repaired. The base and footplate regions use exact setup pixels, keeping the sampled bolts and ankle restraint stationary.
- **Donkey Calf Raise:** a corrected setup shows overhanging lowered heels; separate neutral and raised positions replace the indistinguishable intermediate/top poses. The lower machine base, handle support and lower upright use exact setup pixels. A rejected intermediate that repeated the raised pose is retained.

Each set still has six separate native files, with three distinct poses in order **1,2,3,3,2,1**. Existing cues are unchanged. The original batch's `MANIFEST.json` selects these repaired paths, so the account-free review fixture and draft audit use the repaired sequence without duplicate exercise IDs.

## Evidence and remaining review

`validate.py` compares every pixel in the declared fixed regions and checks four 16×16 background-corner patches in all 18 frames. All fixed-region maximum errors are **zero**, and all corner channels stay below 16. The sampled heel/toe and machine-anchor translations are also zero in `registration.json`. These checks establish only the explicitly measured regions.

Native and mobile review confirms the background change is gone and Pistol Squat's shoe remains in place. The calf-raise poses now visibly progress from lowered heel to neutral to raised heel. The generated calf-machine rear step edge still needs rigidity review; body proportions, knee/pad mechanics and the locally resampled Pistol Squat calf bridge are not approved. Exact copied supports do not prove correct anatomy or full machine physics.

**These remain unreleased drafts.** Production coverage stays at 60/141 guides. No production assets or registry entries changed.

All nine mobile checks passed: both themes, source hashes and dimensions, cue/step order, actual 6→1 autoplay wrap, touch targets, overflow/page errors and reduced motion. Screenshots are in `evidence/`; `BROWSER_VALIDATION.json` records the run. Full repository results are recorded separately in `VALIDATION.json`.

## Reproduce

```sh
python docs/exercise-art/pilots/repair-new-conversions-03-20261003/build.py
python docs/exercise-art/pilots/repair-new-conversions-03-20261003/validate.py
node docs/exercise-art/pilots/repair-new-conversions-03-20261003/measure.mjs
npm run check:form-drafts
npx playwright test --config playwright.form-art.config.ts --grep 'glute-ham-raise|donkey-calf-raise|pistol-squat'
```

`GENERATION_LOG.json` records prompts, generated-source hashes and reference snapshots. Each exercise's provenance records source, builder, master, identity and cue hashes. Rebuilding requires Pillow and NumPy; no remote image calls are made by the builder.
