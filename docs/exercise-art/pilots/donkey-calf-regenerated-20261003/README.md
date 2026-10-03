# Regenerated Donkey Calf Raise — 3 October 2026

The rejected calf raise is replaced by a reviewed side view with near-vertical legs, a stable hip hinge, a short forefoot step, overhanging heels and a rigid rear loading lever. The selected sequence is lowered heels → neutral ankles → raised heels → hold → neutral return → lowered heels. The six original catalogue cues are unchanged.

## Contact refinement and approval

Both grips and the forefoot sole now retain exact setup pixels. Small local hand translations and forefoot flexion connect these contacts smoothly to the regenerated wrists and elevated heels. The whole body is not resized. The exposed step stays visible beneath the forefoot, and the final ankle join has no sharp contour seam. Earlier drifting frames, a failed contour join and a rejected generation that changed camera scale remain in `before-contact-refinement/`.

One source lever-and-plate layer rotates about a fixed rear pivot at 0°, 3.1° and 5.2°. The same cushion follows its endpoint through an articulated mount. The rear post, base and front supports retain setup pixels. Native full frames and enlarged contact views were inspected alongside production playback in both mobile themes.

The selected set is approved in [the production review](../../releases/2026-10-03/donkey-calf-raise.json). Six lossless 1536×1024 WebPs and a transparent 480×342 card are registered for release. The earlier draft validation files document the previous checkpoint; current release verification is in [DONKEY_CALF_VALIDATION.json](../../releases/2026-10-03/DONKEY_CALF_VALIDATION.json).

## Validation and reproducibility

All six targeted browser checks passed: production delivery and draft playback in light/dark themes, cue order, loop behavior, touch controls, overflow/page errors and reduced motion. Current screenshots are in `../../releases/2026-10-03/donkey-calf-evidence/`.

`MECHANICS_VALIDATION.json` checks exact stationary regions and contact rectangles, constant pivot-to-pad length and reverse-pose reuse. `registration.json` measures contact patches within those rectangles; the older whole-shoe shape comparison is preserved in `before-contact-refinement/registration.json`. Mechanical diagnostics supplement the visual approval; they do not independently establish anatomical correctness.

Source, master, identity, cue and builder hashes are in `provenance.json`. Original generation prompts are in `GENERATION_LOG.json`; the rejected contact generation is in `CONTACT_REFINEMENT_LOG.json`. The previous canonical setup is archived as `masters/donkey-calf-raise/superseded-20261003.png`.

```sh
python docs/exercise-art/pilots/donkey-calf-regenerated-20261003/build.py
python docs/exercise-art/pilots/donkey-calf-regenerated-20261003/validate.py
node docs/exercise-art/pilots/donkey-calf-regenerated-20261003/measure.mjs
npm run check:form-drafts
npx playwright test --config playwright.form-art.config.ts --grep 'donkey-calf-raise'
```

The deterministic builder uses Pillow and NumPy. Running these scripts makes no remote image calls.
