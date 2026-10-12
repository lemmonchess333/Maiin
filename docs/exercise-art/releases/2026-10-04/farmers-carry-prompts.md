# Farmer’s Carry built-in imagegen prompts

Selected outputs are identified in farmers-carry-provenance.json. The first midstance result showed far-leg support and is used at frame4; a separate near-leg support edit supplies frame2. No pose was mirrored or warped.

## far-lead-prompt.txt

Edit IMAGE1 farmer's carry NEAR-LEG support into next FAR-LEG FORWARD STEP. Keep near leg (image-right hip) behind as trailing leg with heel lifted and toes touching down. Extend far leg (image-left hip) in a short forward step toward image-left, far heel lands and knee softly extended. Trace each thigh to correct knee/ankle, do not swap legs, no sideways crossover. Same natural short walking stride, not lunge/high-knee. Absolutely lock head/torso/pelvis position, arms, hands and BOTH dumbbells unchanged. Image2 frozen exercise master; image3 canonical identity. Only lower limbs articulate. Same1024x1536 camera and scale; purpleforearms, lightlilacquads/abs/traps. Smooth neutral featureless pelvis. No text, no scenery.

## lead-prompt.txt

Edit IMAGE1 farmer's carry master into a SHORT WALKING STRIDE facing left. Change ONLY legs below hips. Near leg (currently on viewer-right) takes a small step forward toward image-left: its heel touches the floor with toes slightly raised, knee softly extended. Far leg trails behind with heel lifted and toes supporting. Separate both shoes clearly in depth, not a wide lunge. Keep pelvis level and body upright, no hip sway. Upper body, head, arms, hands and both dumbbells remain exactly unchanged and pixel aligned; arms long, shoulders packed, weights steady. Isolated gait demonstration camera stays at same distance/angle relative upper body. Same1024x1536 fullbodyblackcanvas. IMAGE2 canonical identity. Same purple forearms, lilac traps/abs/quads, otherregionswhitegrey. Preserve neutralfeaturelesspelvis. No text and no floor props. Natural anatomy and realistic short carry step.

## master-prompt.txt

Use case precise-object-edit. IMAGE1 approved dumbbell-holding anatomical figure is edit target. Create farmer's carry MASTER by changing ONLY muscle highlighting: forearms strong purple for grip effort; trapezius, abdominal wall, quadriceps secondary LIGHT lilac. All other muscles neutral whitegrey. Do not shrug shoulders, bend arms, move feet, change anatomy/camera/canvas or change dumbbells. Keep both hex dumbbells hanging from straight vertical arms, same size and shape, exactly as IMAGE1. IMAGE2 canonical identity. Same1024x1536 black canvas, fullbody and white trainers unchanged. Smooth neutral featureless pelvis no detail. No text.

## midstance-prompt.txt

IMAGE1 is farmer's-carry initial walking stride, edit target. Advance only legs to next MID-STANCE: near supporting leg has foot flat directly under its hip, nearly straight knee; far leg swings forward underneath body with knee gently bent and shoe slightly above ground, about to pass supporting ankle. Short controlled walking step toward image-left, not high-knee marching or lunging. Upper body/pelvis level, head, arms, hands, dumbbells ALL remain pixel aligned exactly as IMAGE1; no swinging weights or shrugging. IMAGE2 frozen master, IMAGE3 canonical model. Same1024x1536 fullbodyblackcanvas, same headbodyproportions and camera. Purpleforearms lilacabs/traps/quads, neutralelse. Smooth featurelesspelvis. No text. Alter only hips/knees/ankles necessary for gait phase.

## near-midstance-prompt.txt

IMAGE1 standing farmer carry master. Change ONLY legs into NEAR-LEG MIDSTANCE walking toward image-left. The near leg is the leg currently on image-right, attached to near/right-visible hip: keep this near leg straight down supporting body, shoe flat just under that hip. The far leg (on image-left) bends its knee and swings slightly FORWARD toward image-left with its shoe just above the floor beside the supporting ankle. Do not swap which thigh connects to which knee; far leg stays behind the near leg when they overlap. No long stride, no cross-over sideways, no high knee. Preserve every pixel above the hips: head, torso, arms, hands, rigid hex dumbbells remain stationary; same1024x1536 blackcanvas. IMAGE2 is canonical reference. Whitegrey featureless anatomy purpleforearms and lightlilacabs/traps/quads. Neutral featureless pelvis. Samecamera, samebodyproportions. No text.

## next-step-prompt.txt

Edit IMAGE1 farmer carry far-leg support into NEAR-LEG PASSING phase. Far leg on image-left remains weight-bearing with foot flat. Bring the near leg (image-right hip) forward from behind: bend its knee softly so near shoe passes beside the supporting ankle with a little ground clearance, preparing the next forward step to image-left. Near foot should now be closer to center under pelvis, not out behind to the right. Trace near thigh/knee/ankle naturally in front of far leg when overlapping. Short quiet walking stride, not marching or lunging. LOCK upperbody head arms hands and dumbbells to IMAGE1 exactly. IMAGE2 frozen master, IMAGE3 canonical identity. Same1024x1536 blackcanvas and body size, sameforearmpurple lilactraps/abs/quads. Smooth neutral featureless pelvis. Only lowerlimb articulation, no text.

## Reproduction

Copy the five source PNGs from docs/exercise-art/masters/farmers-carry/sources into a scratch directory. Run farmers-carry-framing.cjs with that directory as its first argument to reproduce the six reviewed PNGs. farmers-carry-measurements.cjs measures the original source coordinates; delivered-frame coordinates subtract128 from x and add32 to y. Both scripts use the repository sharp dependency. No pose or anatomy repair is performed.
