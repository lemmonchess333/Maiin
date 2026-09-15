# RDL finish-standing endpoint repair

The sixth selected frame previously reused `2-early.png`, even though its
caption and cue said FINISH STANDING and Return tall. It now reuses the
original upright `1-master.png` at the separate path `6-return.png`.

No image was regenerated, resized, stretched or cropped. The native
1024 by 1536 canvas, athlete, plate geometry, shoes and muscle colours are
exactly the original upright pixels. Both files contain 663740 bytes and
SHA-256 `4c8cf219385b9c11d0916c3f38891cae6438a5c116584eb9564551ecfb304f60`.
The first five selected frames and all other exercise frames are unchanged.
The manifest now records `reusedFrom: 1` and `progress: 0` for frame 6.

The two endpoints are identical, eliminating the positional change at 6-to-1.
The 5-to-6 change is consequently larger; six instructional stills are not
represented as a smooth interpolated animation. Existing calf/proportion,
bar/plate and comfortable-depth findings remain. This fixes one demonstrated
cue/image mismatch, not the entire RDL's outstanding visual review.

Regression tests pin the independently identified upright source hash,
actual endpoint bytes, native dimensions, six separate paths and the
intervening hinge poses. The real-player light/dark checks also compare
screenshots of the displayed first and sixth images, excluding captions.
These tests must run on the exact PR head before merge.

The recent 1448 by 1086 generated row and RDL candidates were not selected:
they do not match the existing native canvases. The row candidate also
retains the visible chest-opening problem. No production registry, authored
production cues, release gate or workflow permissions are changed here.
Tracks the RDL endpoint finding in issue #2333.
