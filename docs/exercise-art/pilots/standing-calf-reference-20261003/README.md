# Upright standing calf raise — owner reference correction

The owner clarified the intended calf raise with a screenshot of an upright shoulder-pad machine. The earlier work targeted the separate Donkey Calf Raise entry. This guide follows the supplied standing variation and is registered under both **Calf Raise** (`calf-raise`) and **Standing Calf Raise** (`standing-calf-raise`), whose catalogue instructions describe the same shoulder-pad machine.

The three native poses show lowered heels, neutral ankles and raised heels, then hold and return. The athlete stays upright under shoulder pads, with forefeet supported on the step and heels overhanging it. Charcoal athletic shorts follow the supplied reference; grayscale anatomy, white shoes and purple calf highlights retain the app's visual language.

The final builder retains native athlete and shoe pixels. It pins selected stationary machine regions and uses the same selected stack layer at three elevations. A local foot-registration trial was discarded because it introduced resampling artifacts; the final visual contact review checks supported forefeet and natural shoe flexion, and does not claim pixel-exact shoe contacts. `composition.json` records which machine regions are pixel-exact. The first neutral generation and an intermediate that rose too high are retained in `sources/`.

Six lossless1024×1536 WebPs per catalogue ID and two transparent320×480 cards use the same reviewed sequence. Native full frames and enlarged feet were inspected. All six targeted mobile browser checks passed, covering light/dark delivery, cues, cards, controls and reduced motion. See [browser evidence](../../releases/2026-10-03/standing-calf-evidence/BROWSER_VALIDATION.json) and the [production release record](../../releases/2026-10-03/STANDING_CALF_RAISE.md).

`GENERATION_LOG.json` preserves generation prompts and source paths; `provenance.json` records source and builder hashes. Rebuild with `python docs/exercise-art/pilots/standing-calf-reference-20261003/build.py`. Full repository verification and GitHub's required unit check must pass before merge.
