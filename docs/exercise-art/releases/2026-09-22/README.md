# Reviewed artwork releases

Incline bench and barbell floor press each add six native 1536 × 1024 lossless WebP frames under their exact catalogue IDs. Both use three reviewed poses with intentional pause/return reuse (4=3, 5=2, 6=1), matching cues of at most seven words, and frame 1 as the reference.

User-authorized master-copy corrections affect only fixed regions in bottom frames 3/4: the unobstructed incline rack, and the floor-press rack base and planted lower shoe. Provenance records the precise rectangles, before/after hashes and verification that no pixels outside those rectangles changed. Moving anatomy and the barbell were preserved. Unrounded scanline measurements meet the one-pixel anchor and one-percent fixed-dimension limits; every released image decodes to the reviewed PNG's exact RGB pixels.

Native review and all six frames plus the loop in the real mobile player passed in both themes at 390 × 844. Incline review confirms supported torso and upper-chest lowering. Floor press shows the near upper arm reaching the floor and the bar stopping above the chest; the far upper arm is partly occluded. These are qualitative illustration reviews, not calibrated measurements of every joint or plate projection. Hash-bound review files record the release evidence and these limits.

## Weighted push-up artwork

This release adds six native 1536 × 1024 frames to the exact `weighted-push-ups` catalogue ID, with seven-word cues for the weighted variation. The three distinct poses are top, midpoint and bottom; frames 4, 5 and 6 intentionally reuse 3, 2 and 1 for the pause and return. Frame 1 is also the exercise master, avoiding a redundant download.

The images use the canonical anatomy-v3 figure. Every lossless WebP was decoded and compared byte-for-byte in RGB against its reviewed source PNG. The review JSON binds the released files, reference and final cues by SHA-256. The provenance file records the source PNG and canonical reference hashes and the reproducible sole-measurement method.

Native visual review covered body alignment, continuous limbs, planted hands/toes, plate support and muscle hierarchy. Measured sole anchors move at most one native pixel, and their two measured spans do not change. The outermost near-finger threshold varies by two native pixels; this is disclosed in the review and was not visible as hand sliding at mobile size. Moving wrist bounding boxes were excluded from invariant measurements.

The real frame player was reviewed at a 390 × 844 browser viewport in light and dark themes, including every caption and the 6→1 transition. Final shorter cues were rechecked through the exact catalogue lookup. All six images load, the page does not overflow, and the controls meet the 44-pixel minimum. Player tests cover reduced-motion manual access, loading failures and playback control; this is not a claim of a physical-device test.

The canvas regression test now recognizes standard lossless VP8L headers, retaining its size and shared-canvas assertions. Catalogue checks verify that the weighted release does not replace generic or diamond push-up artwork.
