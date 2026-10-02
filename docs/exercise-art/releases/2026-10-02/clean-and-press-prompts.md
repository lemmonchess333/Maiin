# Clean and Press candidate prompt set (built-in imagegen)

The selected images were edited as a reference chain, with each target kept at 1536 × 1024 in the same black studio and side-three-quarter camera. Across every edit, the shared instructions were: one featureless white anatomical athlete; planted hip-width shoes; one continuous straight barbell with one equal plate per end; glutes, hamstrings and front deltoids strongest purple, quadriceps and triceps lighter, core pale; no extra limbs, plates, labels or crop.

1. `1-floor-from-pull-candidate.png` from `2-pull-wide-candidate.png`: bend knees and hinge hips farther into a neutral-back floor setup, keep both shoes anchored at the pull frame's floor, keep arms straight and hands just outside shins, lower both plates to floor contact.
2. `2-pull-wide-candidate.png` from `3-rack-wide-lowered-candidate.png`: show the preceding initial pull, knees moderately bent, hips behind ankles, straight arms, bar near the legs at the knee transition, while retaining the same camera and grounded shoes.
3. `3-rack-from-pull-candidate.png` from `2-pull-wide-candidate.png` with `3-rack-wide-lowered-candidate.png` as pose guidance: extend hips and knees to stand, catch bar below chin on front deltoids, elbows forward, hands outside shoulders, preserve the first image's shoe/floor coordinates.
4. `4-dip-from-pull-candidate.png` from `3-rack-from-pull-candidate.png`: shallow quarter-squat dip of roughly 15–25 degrees; heels planted, torso upright, bar held on front deltoids below chin, same shoes and bar.
5. `5-overhead-from-pull-candidate.png` from `4-dip-from-pull-candidate.png` with `5-overhead-wide-candidate.png` as pose guidance: drive to standing overhead lockout, fully extend elbows, stack wrists, keep both shoes fixed, retain all bar and plates with top margin.

The model did not obey precise pixel offsets in earlier placement attempts. The selected chain has 0px vertical sole drift and up to 2px horizontal edge drift; this was repaired at the stationary sole contacts before final review.

## Final floor correction

Background-only edits removed the textured reflective grey floor. Retained a seamless black background and faint contact shadows. All five poses keep their native canvas; narrow sole-strip copying from pose 2 stabilizes the fixed contact, with zero changes outside the recorded regions. Final measurements show zero anchor or sole-width drift. Frame 6 reuses the front-rack pose, with controlled lowering to the floor across the loop.
