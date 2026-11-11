# Clean and Press return draft

This candidate reuses the already coherent original illustration camera and
equipment: old released frames 1, 2, 3, 5, 6, and 2 become draft frames 1–6
respectively. Frame 2's knee-height pull now repeats as the lowering frame 6,
creating a more balanced rack-to-knee-to-floor return while preserving exact
plate and shoe geometry. The existing original files are unchanged. An
imagegen-created below-knee alternative remains preserved at
`/workspace/generated_images/exec-7725c41a-7d3b-4551-8e65-b81a7494fdc9.png`
but was omitted because it increased the rack-to-hinge pose jump.

Phone-size review: `/tmp/clean-press-symmetric-sheet.png`. This remains a
**draft**, because the six-frame limit still makes the rack-to-knee transition
between frames 5 and 6 fairly large despite the improved loop. Do not remove
this exercise from runtime quarantine on this evidence alone.

## High-thigh return (approved with measured exceptions)

The `retry-high-thigh/` folder uses exact released WebPs for poses 1–5 and a
new imagegen PNG for pose 6, lowering the bar to high thigh on the same
1536×1024 camera. The old released files remain intact. The revised sequence
shows floor setup, pull, front rack, strict overhead press, front-rack return,
high-thigh lower, and a 6→1 hinge to the floor. The catalogue and player cues
now describe a strict press without a knee dip. All six dated frames and the
loop passed in the actual dark and light 393×852 player with one fixed
`{scale:1.4,x:0,y:-0.025}` camera, no overflow or player errors.

The release record measures sole contacts across all six poses: near/far sole
bottoms stay at y906/y896, with contact spans 98→97 px and 115→113 px only
in the new frame. It compares plate height only with the pose-matched rack
frames 3/5, because original lift poses already vary with perspective. At a
black-plate threshold of maximum RGB ≥20, the new frame's left plate is
181 versus 183 px (1.09%) and right plate 157 versus 160 px (1.875%). QA
accepted these specifically documented ≤2 px sole-span and ≤2% plate-size
exceptions: the differences render below one pixel at phone size and cause
no visible pop. The validator allowlists only these dimensions for this
release; its default 1% bound remains for other sets. The earlier imagegen
refinements with larger plate drift remain rejected trials.

The card retains frame 5, the front-rack pose. A 48 px comparison showed its
athlete and bar read more clearly than the narrower overhead frame 4 cutout.
