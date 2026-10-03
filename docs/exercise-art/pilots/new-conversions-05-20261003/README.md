# New conversions — batch 05

Ab Wheel Rollout and Kettlebell Swing were both previously unconverted catalogue IDs. This batch adds twelve native PNG frame slots, six distinct poses, six cues per exercise and explicit 1–2–3–3–2–1 return/hold reuse. No public artwork or release record changes.

## Ab Wheel Rollout

Setup, mid-range and extended kneeling rollout preserve the same visible wheel, pad, athlete style and black scene. The knees remain supported while the wheel moves forward. Native review finds small knee/pad redraws and a wheel-size consistency question. Read-only patch matching measures near-knee shifts up to 3px horizontally and 2px vertically, with a pad-corner shift of 2px. Those exceed the existing 1px release bound.

## Kettlebell Swing

The corrected backswing shows a clearer hip hinge and space for standing. The shallow initial candidate is retained separately. Ascent and chest-height float extend the hips with straight arms. The top frame moves both far-shoe contact patches 7px upward; near-shoe patches move 1px. Handle/grip visibility and the dynamic hip-driven timing need review. A timed sequence of stills does not itself prove correct momentum. Mobile inspection also finds the swing figure too small within the landscape canvas; a consistent tighter framing is required before release.

## Evidence and release status

Both remain review drafts. Per-exercise registration scripts measure source pixels without modifying them or granting approval. Their JSON results preserve patch differences and inferred translations. These measurements can respond to shading as well as shape changes and do not certify anatomy.

MANIFEST.json binds file hashes, dimensions, cues, order and reuse. GENERATION_LOG.json retains prompts and original output paths; provenance.json binds the durable native sources. The review fixture exposes both sets. Browser evidence covers both mobile themes, navigation, endpoint looping and reduced motion.
