# Burpees redraw and side-jump review

Six full-resolution 1254 × 1254 PNGs show squat with palms planted, high
plank, push-up bottom, high plank, squat, and airborne jump. The art was
generated from the canonical athlete identity and the prior released burpee
illustration with a fixed square camera and black background.

Imagegen source files (retained in `/workspace/generated_images`):

- Frame 1: `exec-fa9aa66d-9b89-4cc2-9779-9f83cc1a0c5a.png`
- Frame 5: `exec-8ccaaeb2-9605-4013-8990-f4b6c530687a.png`
- Frames 2 and 4: `exec-5c3ba6ba-f293-4890-a9a7-c77c7f774f5a.png`
- Frame 3: `exec-cfe291b3-1635-45a3-8916-d144b2e7202c.png`
- Frame 6: `exec-9aed083c-a122-44b0-bc85-c38b2ef4c82b.png`

The active sequence now shows soft landing, plank, push-up bottom, plank,
crouch with planted palms, and airborne jump. Frame 1's shoe soles match
frame 5's exact image-row baselines (left y=1065, right y=1055). The crouch
palms remain near their plank positions while the feet kick back. Both shoes
are visibly airborne in frame 6 above the same floor baseline. The first
generated jump turned toward the camera, so it was replaced with a jump in
the same right-facing three-quarter view as the crouch and plank. That
replacement is `retry-side-jump/6.png`; `retry-side-jump/1.png` through
`5.png` are exact copies of the previously checked poses. The replacement
has two arms, two legs, no clipped edge, and white shoes ending at y=1008,
at least 47 px above the grounded shoe baseline. Its 240 px contact sheet
is `/tmp/burpees-retry-side-sheet.png`.

Frame 1 is a soft squat landing with hands reaching toward the floor, not
already planted. The release cue should read “Land softly in a squat; reach
both hands toward the floor.” Frame 2 then needs “Plant both palms, then
jump feet back into a straight plank.” This matches the visible order and
retains the six-frame loop. All six candidate frames and the 6→1 loop passed
393×852 phone player review in dark and light themes on 2026-10-27.

## Contact check at source resolution

Measurements use white shoe/palm pixels in fixed regions of the 1254 px
canvas, with the bottom eight rows used to locate each contact span.

| Frames | Contact | Bottom row | Bottom x span |
| --- | --- | ---: | ---: |
| 1 / 5 | left shoe | 1065 / 1065 | 410–513 / 410–512 |
| 1 / 5 | right shoe | 1055 / 1055 | 572–668 / 572–667 |
| 2 / 3 / 4 | shoes | 1052 / 1052 / 1052 | 151–234 / 150–234 / 151–234 |
| 2 / 3 / 4 | near palm | 1110 / 1110 / 1110 | 769–865 throughout |
| 2 / 3 / 4 | far palm | 1086 / 1086 / 1086 | 987–1098 throughout |

Frame 4 is byte-identical to the straight-plank frame 2. The released side
jump's shoes end at row 1008. The older front-facing jump ended at row 1000
and is retained only as the draft source in this folder. The earlier
5→6→1 loop comparison is `/tmp/burpees-loop-390.png`.
