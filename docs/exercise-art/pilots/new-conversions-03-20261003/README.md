# New exercise conversions, batch 3 — 3 October 2026

Three previously unconverted IDs now have six native draft slots each. These are first-pass conversions, with unresolved visual findings retained. Existing guides and repair sets were left alone.

- **Glute-Ham Raise:** upright, modest forward lean, deeper lean, then controlled return. The first intermediate generation leaned farther than requested and was selected as the endpoint; a later generation supplies the modest lean. Knee contact and body proportions need review.
- **Donkey Calf Raise:** corrected horizontal lower-back cushion, intended heel rise and controlled return. The initial side-hip pad was rejected and retained separately. The chosen setup still lacks the intended below-platform stretch, and midway/top poses are too similar. The images do not yet satisfy the planned full-range cues.
- **Pistol Squat:** single-leg stance, midway lowering and deep lowering on the same working leg. The working foot moves upward between poses and cannot be approved as a fixed contact.

Each sequence uses three unique poses in six separate PNGs, ordered **1,2,3,3,2,1**. Plans precede generation; provenance pins the canonical athlete, exercise master, chosen sources and cue hashes. `GENERATION_LOG.json` preserves exact prompts and reference paths, including rejected attempts. All cues have at most seven words. Native files have not been composited, warped, resized or recoloured.

## Findings before release

All three sets contain a black-to-white native background change between poses, visibly interrupting playback. This is a scene-continuity failure, even though player controls and the 6→1 wrap pass. The drafts remain unapproved and outside production.

Read-only patch matching reports:

| Exercise          | Sampled patch result                                                   | Limitation                                                                  |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Glute-Ham Raise   | Base and footplate bolts: 0px best-fit translation                     | Nonzero pixel errors; does not validate body lengths or knee mechanics      |
| Donkey Calf Raise | Handle-base edge: −2px horizontal, −9px vertical; floor bolt up to 1px | Fixed machine geometry changes; calf range and pad travel remain unverified |
| Pistol Squat      | Heel/toe move up 32–33px midway and 66–67px at depth                   | Planted foot fails fixed-contact requirement                                |

Patch matching uses a 21×21 RGB window within a recorded search radius. It is diagnostic, not a release gate by itself. See each `registration.json` and rerun `measure.mjs` for source hashes and residual errors. The white diagnostic flattening does not alter opaque native images or normalize their backgrounds.

## Validation

Nine mobile browser checks passed: light/dark playback, exact source hashes and dimensions, captions and cues, actual 6→1 wrap, touch controls, overflow, page errors and reduced-motion stepping. Screenshots are in `evidence/`; statistics are in `BROWSER_VALIDATION.json`. Automated playback success does not override the visual findings above.

```sh
node docs/exercise-art/pilots/new-conversions-03-20261003/measure.mjs
npm run check:form-drafts
npx playwright test --config playwright.form-art.config.ts --grep 'glute-ham-raise|donkey-calf-raise|pistol-squat'
```

Production coverage remains **60 of 141 guides**. No production assets or exercise registry entries changed. Repository verification results are recorded in `VALIDATION.json`.

Full repository verification passed: 978 test files and 10,876 tests, with 8 files and 367 tests skipped. Bundle budget passed at 335 chunks / 5,881.9 kB. The draft audit reports 25 sets, 150 frames, 90 unique poses and no integrity errors.
