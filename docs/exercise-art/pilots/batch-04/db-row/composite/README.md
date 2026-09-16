# Row controlled-endpoint candidate

The selected six-frame row remains an **inactive, reduced-range draft**.
It is not a finished full-range guide or a strict anatomy approval.

## Selection change, 16 September 2026

The former extreme top image is no longer selected. It showed substantially
more shoulder elevation and chest exposure than the preceding images.
Its exact bytes are preserved in `rejected-twisted-top.png`. The former
contact sheet and animation are preserved as `legacy-sequence-preview.jpg`
and `legacy-sequence-preview.webp`; they are not previews of the current
selection.

The current order uses the original setup, early and middle source poses:

1. Setup and hang.
2. Begin pulling.
3. Conservative endpoint.
4. Brief hold at that same endpoint.
5. Controlled lower through the early position.
6. Return to the original full hang.

There are six separate native 1536 by 1024 PNG paths, but three distinct
positions. Load rise is 0, 125, 237, 237, 125 and 0 pixels. This is a
shorter demonstrated range than the old 372-pixel extreme. The cue wording
no longer claims that the elbow passes the ribs or the weight reaches the
hip. A corrected full-range endpoint still needs to be produced and reviewed.

No new generated pixels, resizing, warping or colour changes enter this
selection. The first three PNGs are unchanged. Frames 4, 5 and 6 are exact
copies of 3, 2 and 1 respectively. The 6-to-1 pose does not jump.

## Reproduction and measured scope

Run `python3 docs/exercise-art/pilots/batch-04/db-row/composite/build.py`
with Pillow, NumPy and SciPy. Both the old and revised builder were executed
locally: the old builder reproduced all six original PNG hashes, and the
revised builder reproduced the selected three-pose sequence byte-for-byte.
The source hashes, fixed scene-region checks and canonical dumbbell
construction are unchanged. The old top source still supplies the small
unoccluded bench patch behind the hanging arm; its body pose is not selected.

The revised builder writes current local comparison/animation previews and
`measurements.json`. The committed legacy previews remain historical only.
The account-free real player reads the selected files and cues from
`BATCH_REVIEW_MANIFEST.json`.

Named head, support-hand, supported-leg/shoe, standing-shoe and bench
regions match the master pixels. The canonical dumbbell's sampled plate
interiors remain rigid translations. These checks do not establish correct
finger anatomy, full equipment outlines, a motionless torso or a suitable
full range. Retained shoulder/chest projection and arm/grip anatomy still
need technique review. Browser checks must be rerun on the exact changed
head, and are not physical-device approval.

[ACE's single-arm row](https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/)
describes ending the pull before rotating the torso. That informs the cue
intent; it does not certify the generated artwork or this candidate's range.

Production registrations and all release gates are unchanged. Refs #2333.
