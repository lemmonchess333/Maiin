# Batch 04 — 7 September 2026

Four new exercises have six separate native PNG draft frames each: seated
dumbbell shoulder press, 30-degree incline dumbbell press, bench-supported
single-arm dumbbell row, and barbell Romanian deadlift. Frames 5 and 6 reuse
the corresponding outward poses with return cues. No collage was cropped
into deliverable frames.

All 24 frames are registered in the existing account-free review fixture and
integrity manifest. Their plans, generation prompts, rejected candidates and
individual review findings are under `../pilots/batch-04/`. The fixture now
distinguishes unreleased drafts from exercises with production artwork.

The catalogue still has 124 exercise IDs without released artwork. Of those,
four have the new complete draft sequences, two have blocked master-only
attempts, and 118 have not been attempted in this batch. This checkpoint does
not activate any new production guide or count drafts as approved.

## Findings that prevent approval

- Shoulder press: stable shoe/bench registration in static comparisons, but
  overhead weight extents and projected arm lengths need review.
- Incline press: the first bottom candidate changed near/far arm ordering and
  is excluded. Its replacement retains ordering, but the selected middle and
  bottom positions are close and the lower depth/arm path need technique review.
- Dumbbell row: support landmarks are stable, but early/middle poses are too
  close and the dumbbell appears smaller after the hanging master.
- Romanian deadlift: the original bottom frame moved the near sole upward
  31 pixels. A foot-only image edit did not solve this. A continuous lower-shin
  warp restores the selected candidate's near sole to y=1330 while translating
  the shoes rigidly. Both plate regions and all pixels above y=990 remain
  exactly unchanged. Calf continuity, lower-leg proportions, knee bend, neck
  alignment and bar/plate consistency across the set still need review.

The read-only `ANCHOR_DIAGNOSTICS.json` records threshold bounds in named
regions. These are image diagnostics, not proof of anatomical dimensions:
some regions include adjoining limbs or bench pixels, and projected equipment
extents can change with orientation. No numeric equipment approval is inferred.

All unique poses and six-frame comparison sheets were inspected. Actual
sequential playback, the loop boundary, mobile light/dark appearance and the
strict production review contract remain unverified. The earlier browser
block is not treated as a visual pass.

## Blocked generation

The built-in image tool generated glute-bridge and crunch masters, then
rejected their first movement edits at output moderation. No movement images
were produced by those calls and no bypass was attempted. The masters remain
unfinished and are excluded from the six-frame manifest.

## Next method

Small-motion prose instructions repeatedly produced larger movement than
requested. Two-reference interpolation improved the shoulder press but did
not reliably fix row spacing or RDL foot registration. Do not repeat those
failed prompts in bulk. A fixed-region alpha-blend repair doubled calf contours
and is excluded; the selected continuous-warp repair avoids that double image.
The reproducible `repair-rdl-anchors.py` and per-pilot diagnostics preserve both
attempts. Inspect the repaired sequence in playback before expanding production.

Technique sources and catalogue-specific variation choices are recorded in
each plan. Cue text describes the intended motion; it does not certify that a
generated candidate correctly shows it.
