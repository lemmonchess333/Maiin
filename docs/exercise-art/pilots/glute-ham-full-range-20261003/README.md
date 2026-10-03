# Glute-Ham Raise full-range draft — 3 October 2026

A newly generated horizontal lowered pose replaces the earlier partial diagonal endpoint. The former deepest pose is now the intermediate. The selected six frames therefore cover upright → diagonal lower → horizontal lower → hold → diagonal return → upright. Existing catalogue-based cues are unchanged.

The original athlete pixels are retained without whole-body resizing or warping. The fixed floor frame and ankle-restraint regions are copied from the setup; every pixel in those declared regions matches. The existing batch3 manifest selects these new paths, so the review fixture and draft audit use the updated sequence without duplicate IDs.

The full range is now visible. Knee/lower-thigh contact with the curved pad, pad profile consistency and body mechanics still need review. This remains an unreleased draft; fixed machine patches and successful playback do not approve anatomy.

Three targeted draft browser checks passed: light/dark playback and reduced motion, including dimensions, endpoint hashes, cues, real autoplay wrap, touch controls, overflow and page errors. Evidence is retained with the [nine-test continuation run](../../releases/2026-10-03/pistol-ghr-evidence/BROWSER_VALIDATION.json).

`GENERATION_LOG.json` records the endpoint prompt and reference. `provenance.json` pins sources and builder. `composition.json` records fixed-region comparisons. Rebuild with `python docs/exercise-art/pilots/glute-ham-full-range-20261003/build.py`. Original partial-range frames remain archived in the previous repair directory.
