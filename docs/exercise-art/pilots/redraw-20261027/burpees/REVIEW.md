# Burpees redraw draft

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
are visibly airborne in frame 6 above the same floor baseline. The jumping
athlete has bent knees to preserve the same physical head/body scale while
remaining fully inside the fixed square camera. The phone-size
contact sheet is
`/tmp/burpees-draft-sheet.png`.

**Not release-approved:** frame 1 has hands off the floor for landing, while
its existing placard cue says to plant palms at that moment; if this sequence
is approved, that cue needs to describe landing and reaching toward the floor.
The 1→2 step also covers both planting the palms and kicking the feet back.
The jump's bent knees should be reviewed for the intended burpee variation.
These need a final motion and cue review before runtime quarantine is removed.

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

Frame 4 is byte-identical to the straight-plank frame 2. Frame 6's shoes
end at row 1000, at least 52 px above the grounded shoe rows. The phone-size
5→6→1 loop review is `/tmp/burpees-loop-390.png`.
