# Front Squat redraw draft

This six-frame draft removes the rectangular cage that crossed the athlete's
torso in the old released illustrations. The bar crowds the throat while the
elbows stay low instead of forming a high front rack. The feet also shift
slightly as the athlete descends and ascends.

Frames 1–4 are separate imagegen edits: standing, quarter squat, half squat,
and deep squat. Frames 5 and 6 intentionally repeat the half and quarter poses
so the loop returns toward standing without a jump. The generated PNGs are
1254 × 1254 pixels, and the source identity is
`docs/exercise-art/identity/athlete-anatomy-v3.png`.

Phone-size review: `/tmp/front-squat-draft-sheet.png`. The sequence is visually
coherent, but it is **not release-approved** because the rack teaches poor form.
Measured shoe bottom positions
vary by up to 2 pixels; the visible left weight-plate height ranges from
288–294 pixels (about 2%), exceeding the strict 1% hardware-invariant check.
An imagegen-only attempt to correct the deep plate overshot to 309 pixels and
was rejected. A second attempt using the standing plate as a hardware reference
also changed the athlete's face and the whole plate geometry, so it was
rejected. A further pose-controlled rack edit also left the elbows low and
bar near the neck; see `docs/exercise-art/pilots/front-squat-rack-20261027/`.
Existing approved artwork and runtime routing remain untouched.
