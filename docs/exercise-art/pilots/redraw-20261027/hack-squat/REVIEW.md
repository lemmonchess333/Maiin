# Hack Squat redraw review

Status: versioned release candidate for independent review. The six PNGs are
1254 × 1254, with one fixed side-view camera and a pure black background.

| Cue | Frame | Source imagegen output |
| --- | --- | --- |
| Set (top) | `1.png` | `/workspace/generated_images/exec-d6b4e46a-2ce6-4f8b-926c-8d25242d22a8.png` |
| Lower (middle) | `2.png` | `/workspace/generated_images/exec-0df188c0-478c-44f9-b5cc-e6788c04dfd4.png` |
| Bottom (deep) | `3.png` | `/workspace/generated_images/exec-ac7e7d2c-621d-4254-aaba-2adcf7eb3362.png` |
| Hold (deep) | `4.png` | Byte-identical copy of `3.png` |
| Rise (middle) | `5.png` | Byte-identical copy of `2.png` |
| Stand (top) | `6.png` | Byte-identical copy of `1.png` |

The fixed base, rear upright, footplate corner, and rail top had a best matching
translation of (0, 0) px between the three unique poses in a ±7 px search.
Both white shoes remain on the same angled footplate. The left shoe toe stayed
at x=160 and the heel contact edge at x=300 was y=854–855 across the poses.
The loaded carriage and athlete move along the angled rail. The 360 px
contact sheet is `phone-size-review.png`.

The only remaining gate is independent visual and route review before release.
