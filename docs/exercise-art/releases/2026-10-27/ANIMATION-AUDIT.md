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

## Follow-up repairs

The four findings left open by the first review were addressed in a second
phone-size, full-loop pass. The original releases remain available for audit.

| Exercise | Correction | Contact and camera check |
| --- | --- | --- |
| Man Maker | New dated frames for the squat, overhead press and return to floor; the first three floor phases remain from the prior release. | One side camera and two distinct dumbbells. The displayed press shares both planted shoes with the squat; the returning grounded bell ends use the reviewed floor frame. Release metadata and the runtime composition are checked together. |
| Elliptical | Continuous six-pose motion guide with separate moving handles, pedals and a rigid machine frame. | Both hands follow their own lever grips; both soles stay supported. The machine stays fixed and the cycle has steady timing. |
| Hack Squat | Six-phase motion guide with rigid rails, moving loaded carriage and a fixed footplate. | Shoes stay planted, hands hold the shoulder handles and the full figure remains in one camera at every phase. |
| Swimming | Overhead motion guide with alternating reach and pull, plus a close two-leg flutter. | Hands clear the head; the 120-sample stroke loop closes smoothly and fits one fixed camera. |

The older Elliptical, Hack Squat and Swimming six-frame sets are withheld at
runtime while their reviewed motion guides play. Man Maker uses a new versioned
release; its previous approved images and hashes remain unchanged. The
replacement guides were also reviewed at phone size in dark and light themes.

## Verification

Runtime replacement IDs have tests for a valid motion guide and for withholding
their placard and cutout. Movement-specific tests check fixed contacts and
equipment. The framing test checks all 132 enlarged frames for a visible stage
margin. Twelve focused suites passed: 543 tests.

`npm run verify` passed lint, verifier tests, both art audits, circular dependency
check, production build and bundle-size check. Its broad unit stage encountered
failures in the local Node 24 environment, so it was stopped after confirming three representative
suites failed with exactly the same counts on a separate unchanged `HEAD` copy:
Run Summary 8/25, Space Post 10/11, and badge awards 4/4. The picker test
affected by this change was updated and passes 7/7. The first Node 22 CI run
also found eleven assertions that expected artwork now intentionally withheld
at runtime. Those expectations were revised, and the Home gym onboarding tile
now uses another approved bench illustration.

## Form and motion quality pass

After the first release, the 12 procedural replacements, 22 reframed sets and
the eight screenshot examples were checked again at phone size. The approved
illustrations for Cuban Press, Barbell Upright Row, Front Raise, Reverse Pec
Deck, Straight Arm Pulldown and Rack Pull retained coherent grips and equipment;
Man Maker's six-pose release also retained planted shoes and grounded weights.
Their approved frame bytes remain unchanged.

| Guide | Improvement |
| --- | --- |
| Close Grip Bench Press | Widened the hands from roughly one-third to just inside shoulder width; wrists now remain close to the tucked elbows. |
| Inverted Row | Moved the fixed shaft through the rendered fist, removing the visible air gap at both ends of the pull. |
| Elliptical | Kept each shoe level on its moving pedal, cleared the low pedal from the base and closed the ankle seam. |
| Hack Squat | Angled the fixed footplate and planted both shoes on it; the carriage and knee path remain on their rails. |
| Swimming | Widened the recovery arm path and brought the legs closer together with a visible alternating flutter. |
| Burpees | Replaced the reversed replay with a forward squat–plank–push-up–squat–jump–landing cycle. |
| Stationary Bike, Spin Bike and Assault Bike | Added moving crank arms and pedal platforms beneath both shoes; the assault fan turns with the stroke. |
| Seated Cable Row and Hip Abduction Machine | Replaced vertical drive/return captions with cues that match the actual pull and outward press. |

Geometry tests now check the rendered grip, foot/platform contacts, full-cycle
seams and movement-specific key positions. Phone-size sequences were inspected
in dark and light themes. The release review records remain the source of truth
for the unchanged approved still artwork.
