# Exercise animation audit — 27 October 2026

## Scope and method

Reviewed all six displayed frames for each of the 152 approved exercise sets
(912 frames). Each set was checked as a sequence for grip, equipment and camera
continuity, contact with the floor or machine, movement against the catalogue
instructions, and the return to the first frame. Suspect poses were inspected
at source resolution and at phone size. The approved WebP files and frame
hashes remain unchanged; the Cuban Press cue review was amended to match its
setup frame. The integrity check still covers all 152.

This is a visual review of the released set, not a claim that every possible
exercise variation or every generated anatomy detail has been validated.

## Changes shown in the app

The following released artwork is withheld at runtime through
`src/lib/formArtQuarantine.ts`. The existing motion renderer is shown instead;
the source release stays available for a future coherent redraw. Its matching
card cutout is also withheld so the app does not show a contradictory still.

| Exercise | Released artwork issue | Replacement check |
| --- | --- | --- |
| Assault Bike | Handles stay static while pedalling. | Handles and pedals move together. |
| Bench Dips | Feet lose floor support. | Hands stay on bench; heels stay grounded. |
| Bench Press | Shows an incline bench for a flat press. | Flat bench and full press path. |
| Burpees | Floor poses are too small to read at phone size. | Larger continuous floor-to-jump rig; full head kept in frame. |
| Clean and Press | Final shoulder pose jumps to a floor start on loop. | Continuous floor, rack, and overhead path; plate remains in frame. |
| Close Grip Bench Press | Shows an incline bench for a flat press. | Flat bench, narrow grip, full bar and plates. |
| Dumbbell Bench Press | Shows an incline bench for a flat press. | Flat bench with two attached dumbbells. |
| Front Squat | Uses an incorrect rack/torso arrangement. | Independent front rack and squat path. |
| Hip Abduction Machine | Side camera hides the outward knee motion. | Seated front view; knee pads follow both knees. |
| Inverted Row | Heels appear unsupported. | Fixed bar grip and grounded heels throughout. |
| Seated Cable Row | Torso swings between deep hinge and recline. | Upright seat, fixed foot support and cable contact. |
| Smith Bench Press | Shows an incline bench for a flat press. | Flat bench with Smith rails and moving carriage. |

The picker detail sheet now has more vertical room for the animation and its
controls. The procedural renderer uses the full 360 px stage instead of a
190 px cap. Twenty-two released sets, including Barbell Upright Row and Rack
Pull, use a single measured camera across all six frames for at least 10%
safe enlargement. A frame bounds check retains space around the equipment.
Straight Arm Pulldown instructions now match the depicted two high handles;
Cuban Press's opening cue matches weights beside the thighs. The form-art
review fixture can also open a quarantined exercise.

## Screenshot examples retained after closer review

Cuban Press, Front Raise, Reverse Pec Deck and Rack Pull have connected grips
and consistent equipment through their six frames. The apparent extra Front
Raise weight is the far hand's complete second dumbbell in perspective.
Muscle Ups keeps its crossbar and both rack uprights in the same pixels across
all six frames; a scaled contact sheet made the posts look absent. Those sets
were retained rather than replaced with less accurate drawings.

## Remaining artwork work

| Exercise | Observed issue | Reason the current art remains active |
| --- | --- | --- |
| Man Maker | Camera changes between floor, squat and press phases. | Redraw attempts lost dumbbell separation or skipped part of the move. |
| Elliptical | Six frames repeat two similar poses. | The current machine reads more clearly than the tested fallback at phone size. |
| Hack Squat | Frames 2–5 repeat a near-identical hold. | The tested moving fallback distorted the torso/track; it was reverted. |
| Swimming | Alternating arm phase is unclear in the side view. | Redraw attempts crossed the arm through the head or changed equipment/anatomy. |

No substitute above has been shipped as a correction without passing visual
review. These four sets need coherent full-sequence native artwork, with one
camera and stable anatomy/equipment, before replacing the current release.

## Verification

Runtime replacement IDs have tests for a valid motion guide and for withholding
their placard and cutout. Movement-specific tests check fixed contacts and
equipment. The framing test checks all 132 enlarged frames for a visible stage
margin. Twelve focused suites passed: 543 tests.

`npm run verify` passed lint, verifier tests, both art audits, circular dependency
check, production build and bundle-size check. Its broad unit stage encountered
unrelated failures, so it was stopped after confirming three representative
suites failed with exactly the same counts on a separate unchanged `HEAD` copy:
Run Summary 8/25, Space Post 10/11, and badge awards 4/4. The picker test
affected by this change was updated and passes 7/7.
