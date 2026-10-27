# Close Grip Bench Press redraw (draft)

The six `1.png`–`6.png` frames have a single flat pad, planted shoes, a visibly narrow grip and a byte-identical return (`1=6`, `2=5`, `3=4`). They remain quarantined because the bottom shaft does not touch the lower chest required by the catalogue and the frame 3 cue. At x750–800 in native frame 3, the visible shaft ends about 18–29 px above the pectoral surface.

Three imagegen bottom-pose corrections were tried. The strongest, `3-candidate.png`, preserves fixed bench bases and shoe bounding boxes within 1 px, but still leaves approximately 14 px of space over the pectorals at x750–800. A second edit increased the gap; an alternate flat-bench source shifted the whole bench/shoes about 30 px upward relative to the existing top pose. Neither was promoted into `3.png`/`4.png`.

Review images: `/tmp/redraw-close-grip-flat-sheet.png`; generated attempts `exec-4cda0fb6-7bd2-4ddc-988c-f58e58be6933.png`, `exec-4e21feeb-dfce-4113-a800-6a145879fdf1.png`, `exec-3e5e7de5-0caf-4753-9346-c81fc86b20b3.png`, `exec-85ea5b9a-e6f6-42b4-9f8a-9a4076e2856f.png` under `/workspace/generated_images/`. A release needs real lower-chest contact, the same flat pad and shoes, and a smooth top-to-bottom loop.
