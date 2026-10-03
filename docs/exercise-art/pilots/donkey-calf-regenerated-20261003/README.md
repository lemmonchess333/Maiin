# Regenerated Donkey Calf Raise — 3 October 2026

The owner rejected the previous calf raise as mechanically unclear. This sequence replaces that layout with a newly generated side-view master: near-vertical legs, horizontal hip hinge, a short forefoot step, visibly overhanging heels, and a rear plate-loaded lever acting on an articulated lower-back cushion. The old machine and its repair remain archived.

The selected movement is lowered heels → neutral ankles → raised heels → brief hold → neutral return → lowered heels. Three distinct poses are stored as six separate native PNGs. The original catalogue cues remain unchanged. The six-frame selector in `new-conversions-03-20261003/MANIFEST.json` and the account-free player now use this version.

## Construction and review

A first master was rejected for insufficient headroom. A second master leaves room for the athlete to rise. The first top pose was rejected because it stretched the legs and detached the plate visually from the lever. A restrained generation became the neutral intermediate; the final top pose was derived incrementally from it.

Image generation still shifted the rear pivot. The final builder therefore preserves the regenerated athlete and uses one source lever-and-plate layer rotated about the fixed rear pivot, with the constant cushion following its endpoint through an articulated mount. The rotations are 0°, 3.1° and 5.2°. The whole body is neither warped nor resized by the builder. The rear post, lower base and lower front supports retain exact setup pixels. All backgrounds remain black.

The shortened step supports the forefeet while the heels visibly progress from below the step to above it. The side view makes ankle motion distinct from knee flexion. Native and mobile review found the loading mechanism and heel travel clearer than the rejected layout.

## Limits before release

The sampled rear pivot and floor bolt are pixel-exact. The generated near-hand patch still shifts up to 6px; forefoot-shape matching reaches the 12px search boundary as the shoe changes angle, with substantial residual error. Those patch results do not establish an exact fixed forefoot contact. Human proportions, hand/forefoot continuity and technique remain unapproved. These are explicit remaining findings, not covered by the rigid-machine checks.

**This is the selected regenerated draft, not a production release.** Production assets and coverage are unchanged. The previous canonical setup is archived as `masters/donkey-calf-raise/superseded-20261003.png`; historical provenance points to that snapshot.

## Validation and reproducibility

All three mobile checks passed: dark/light source dimensions and endpoint hashes, caption/cue order, actual 6→1 autoplay wrap, touch controls, overflow/page errors and reduced motion. Screenshots are in `evidence/`; results are in `BROWSER_VALIDATION.json`. Full repository results are in `VALIDATION.json`.

`MECHANICS_VALIDATION.json` records exact stationary-region comparisons, fixed pivot-to-pad-mount length and reverse-pose reuse. It does not grant anatomical approval. `registration.json` preserves the hand/forefoot diagnostics. Source, master, identity, cue and builder hashes are in `provenance.json`; exact prompts and reference snapshots are in `GENERATION_LOG.json`.

```sh
python docs/exercise-art/pilots/donkey-calf-regenerated-20261003/build.py
python docs/exercise-art/pilots/donkey-calf-regenerated-20261003/validate.py
node docs/exercise-art/pilots/donkey-calf-regenerated-20261003/measure.mjs
npm run check:form-drafts
npx playwright test --config playwright.form-art.config.ts --grep 'donkey-calf-raise'
```

The deterministic builder uses Pillow. Validation also uses NumPy. Native generations and rejected candidates are preserved; running these scripts makes no remote image calls.
