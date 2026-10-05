# Bulgarian split squat: bounded rigid-equipment trial

**Selected draft output: `bottom-contact-colour.png`.** It copies the frozen
contact composite (`97ede66a…ec32f`) and imports only 2,374 generated lilac pixels
inside the working hamstring. The original equipment and all body pixels outside
that colour mask stay unchanged. `colour-only-composition.json` contains the exact
source, mask and output hashes and the preservation measurements. Reproduce this
selected image with `build-colour-only.mjs`.

**The rigid alternatives in `poses/` and `trials/` are rejected and are not
selected for the six-frame draft.** Independent native review found harder,
jagged near-head edges in shallow/deep, a stepped/dotted strip at the bottom
head's upper-left edge, a residual old-edge line below it, and an unnaturally flat
black cutout below the rear head. Both grips remain attached, but the contours
do not pass. Exact interior samples cannot override these visual findings.

This directory continues the code layer workflow recorded in
`docs/exercise-art/COMPOSITE_REPAIR_REVIEW.md` and the rigid dumbbell precedent in
`docs/exercise-art/pilots/shrugs-rigid-20261003/README.md`. Every result here remains
`releaseApproved: false`. The source images, production assets and release
registry are untouched.

The independent native review found a closest dumbbell-head scanline of about
67 / 69 / 67 / 73 pixels across setup, shallow, deep and bottom. Each manually
identified boundary is uncertain by approximately one pixel. These are projected
image chords, not real load dimensions, and they cannot certify a 1% gate.

## Construction and evidence

`build.mjs` pins setup, shallow, the generated deep grip repair, and the separate
fixed-contact bottom composite by SHA-256. Setup remains byte-identical to the
frozen master. The master supplies the observed equipment. Two layers move only
by integer translation; there is no per-pose equipment scaling, rotation, camera
transform or body translation. The original generated hands, their fine contours,
and the far knee stay foreground where they occlude the equipment. Explicit masks
and all layer transforms are written alongside the candidate images.

The source gear was flattened against white anatomy and black background. A
bounded one-pixel white fringe is converted once into alpha before translation,
using the nearest dark gear pixel as the edge colour. Interior RGB remains native.
This fixed layer-edge treatment is recorded in the script; it is not a claim that
every output pixel is a verbatim master pixel. The untouched setup is still the
reference for independent face-patch comparisons.

`measure.mjs` verifies exact translated RGB in three exposed face interiors and
checks that the compositor's protected shoes and bench pixels remain unchanged.
It explicitly does not assign a measured width to a shaft or rear head hidden by
a hand or thigh. Outer shape review remains necessary even if all interior patches
and support pixels match.

Reproduce from the repository root:

```bash
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/rigid-equipment/inspect.mjs
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/rigid-equipment/build.mjs
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/rigid-equipment/measure.mjs
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/rigid-equipment/build-colour-only.mjs
```

## Rejected trial and remaining boundary work

`build-first-rejected.mjs` and `trials/bottom-first-rejected.png` retain the first
hard mask trial. Its source edge carried a bright fringe into a black background.
The later matte treatment removes that obvious bright line, but independent
review still rejects the contours. The small far-head contour was corrected to
retain the master's full top edge rather than clipping its upper facet. The
broader clearing prototype is preserved under `rejected/`; narrowing that mask
does not resolve the remaining near-head boundary defect.

The master-sized near dumbbell also uncovers a narrow strip that the larger raw
bottom head had hidden. The code leaves this gap visible. It does not synthesize
anatomy by stretching neighboring skin pixels. Two image-generated bridge edits
failed: the first reframed the whole scene, and a second attempt with a stable
target and native close-up still changed the body and near-weight position.
They remain under `../sources/equipment-edge-rejected-rescale.png` and
`../sources/equipment-edge-context-rejected-pose.png`. No pixels from either were
imported or rescaled to mimic preservation. Root therefore selected the original
equipment in the contact-and-colour output and kept its measured size variation
as an explicit release blocker.

The core exposed strip is approximately x594–606, y651–669. There is also an old
edge remnant below the near head around x605–630, y729–735. These are visible
boundary findings, not passed measurements. Native review of the rejected rigid
set is complete; actual mobile playback remains unverified. No candidate in this
directory is ready for release merely because its diagnostic script exits
successfully. The selected non-rigid bottom avoids those new contour defects but
does not resolve the original equipment-invariance finding.
