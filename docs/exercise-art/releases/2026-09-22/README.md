# Weighted push-up artwork release

This release adds six native 1536 × 1024 frames to the exact `weighted-push-ups` catalogue ID, with seven-word cues for the weighted variation. The three distinct poses are top, midpoint and bottom; frames 4, 5 and 6 intentionally reuse 3, 2 and 1 for the pause and return. Frame 1 is also the exercise master, avoiding a redundant download.

The images use the canonical anatomy-v3 figure. Every lossless WebP was decoded and compared byte-for-byte in RGB against its reviewed source PNG. The review JSON binds the released files, reference and final cues by SHA-256. The provenance file records the source PNG and canonical reference hashes and the reproducible sole-measurement method.

Native visual review covered body alignment, continuous limbs, planted hands/toes, plate support and muscle hierarchy. Measured sole anchors move at most one native pixel, and their two measured spans do not change. The outermost near-finger threshold varies by two native pixels; this is disclosed in the review and was not visible as hand sliding at mobile size. Moving wrist bounding boxes were excluded from invariant measurements.

The real frame player was reviewed at a 390 × 844 browser viewport in light and dark themes, including every caption and the 6→1 transition. Final shorter cues were rechecked through the exact catalogue lookup. All six images load, the page does not overflow, and the controls meet the 44-pixel minimum. Player tests cover reduced-motion manual access, loading failures and playback control; this is not a claim of a physical-device test.

The canvas regression test now recognizes standard lossless VP8L headers, retaining its size and shared-canvas assertions. Catalogue checks verify that the weighted release does not replace generic or diamond push-up artwork.
