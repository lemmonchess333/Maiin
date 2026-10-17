# Burpee corrections — built-in imagegen, 4 October 2026

All calls reference the frozen6-jump-black.png master and canonical athlete-anatomy-v3.png. Exact prompts are preserved in this task's tool history. No CLI/API fallback used.

203b72f9: localized lowering of original3-low-hands-aligned.png, retaining the small figure inside x490..1130,y740..938 on1536x1024. Preserve limb/head dimensions, fixed palms/toes, black negative space and canonical muscle colours. Rejected: insufficient depth.

ed28387c: requested chest resting on ground, deeply folded elbows pointing backward/upward, no black gap beneath chest, same small figure, same camera and fixed contacts. Result achieved depth. Authorized uniform44px downward placement correction is in align.cjs, with no rescaling or shape edits.

eb0a15bd: local shoe/ankle articulation correction on3-grounded-aligned.png, with plank as supplemental reference. Requested near toe913to904 and far909to900, unchanged palms/chest/body scale. Candidate toe bottoms901/898; palms935/922. Final stationary contact repairs then restored master contact pixels; native and mobile light/dark review passed as recorded in burpees.json.

## Reproducing the deterministic steps

From the repository root, copy `docs/exercise-art/masters/burpees/sources/*.png` into a scratch directory and copy `docs/exercise-art/masters/burpees/1.png` there as `6-jump-black.png`. Run the contact-repair, framing and measurements `.cjs` scripts in that order, each with the scratch directory as its first argument. They use the repository's `sharp` dependency and never modify the stored sources. The release record contains the delivered lossless WebP hashes; the provenance record contains the repaired PNG hashes and contact rectangles. Moving anatomy was generated, not warped in these scripts.
