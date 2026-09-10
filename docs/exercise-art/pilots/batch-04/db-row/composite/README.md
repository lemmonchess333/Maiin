# Dumbbell row draft repair

These six separate 1536 × 1024 PNGs replace the selected draft sequence.
They remain inactive: generated anatomy, contact and mobile player review
are unresolved. No production artwork registration changes here.

The earlier first pull rose about 205 pixels, almost reaching the middle
pose. The recovered early source gives a distinct 125-pixel rise. The four
selected load positions rise 0, 125, 237 and 372 pixels, followed by the
middle and early poses on the return. Frame 6 still returns to the full
hang at the loop boundary; this is not a certified seamless animation.

## Reproduction

Run `python3 docs/exercise-art/pilots/batch-04/db-row/composite/build.py`
from the repository root with Pillow, NumPy and SciPy installed. The script
pins all four native source hashes, builds each frame independently, verifies
the encoded PNG pixels and writes them atomically. It then creates the
comparison and animation previews from those frames. No deliverable frame
is cropped or enlarged from a contact sheet.

The master supplies the fixed scene. A small unoccluded bench patch from the
top source fills the area behind the hanging forearm. Only the working
shoulder, chest and arm region uses the generated poses. The head, support
hand, supported lower leg/shoe, standing shoe and named bench regions retain
the master's pixels exactly.

One master dumbbell layer is translated by integer offsets, without scaling
or rotation: `(0, 0)`, `(34, -125)`, `(84, -237)`, `(137, -372)`, then the
middle and early offsets again. The near plate sits in front of the hand;
the far plate and handle respect body occlusion. One far-face sector hidden
by the original hand is completed once with the face's median shade, then
reused. That reconstructed sector is not original source detail. Interior
patches on both plate faces remain pixel-identical under each translation;
this does not establish correct fingers or full equipment outlines where
the body occludes them.

## Provenance and remaining review

The original early source was generated with the built-in image tool using
the master and an annotated joint guide. It survived workspace maintenance
and was recovered byte-for-byte; `generation.json` records its identity and
the retained guide measurements. The prior local builder and metadata did
not survive, so this implementation was reconstructed from the recorded
method and verified again against current main. It is not represented as
the lost commit's exact bytes or the original prompt's verbatim text.

The guide requested about 90 pixels of lift; the generated pose instead
registers at 125 pixels. It is selected for improved spacing, not claimed
to obey the guide exactly. Static six-frame and grip-region inspections are
complete. Shoulder excursion, chest exposure, projected arm lengths and
hand/handle occlusion still need technique review. Fixed scene pixels do
not prove a motionless torso.

[ACE's single-arm row](https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/)
supports same-side hand/knee support and stable spinal alignment, with the
pull ending before torso rotation is needed. The cue text describes that
intent; it does not approve the generated motion.

Actual sequential playback, including 6→1, at mobile sizes in both light
and dark themes remains unverified. `sequence-preview.webp` is a downloadable
review aid, not evidence from the app's player. Strict visual approval stays
false until those reviews and the remaining technique findings are resolved.
