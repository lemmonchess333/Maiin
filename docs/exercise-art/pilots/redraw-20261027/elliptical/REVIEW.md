# Elliptical redraw review

Status: draft only; do not route or release.

`1.png` is a polished side-view starting frame with two supported shoes and
two hands on the moving handles. It came from
`/workspace/generated_images/exec-60c9850c-37c2-4b85-85c9-8d4273a7de6b.png`.

An opposite-stride edit at
`/workspace/generated_images/exec-1c281516-a699-4e9a-a5bb-73c88495d669.png`
raised the back foot slightly, but did not exchange the foot and handle
positions; it also rotated the athlete's torso. A targeted edit that asked to
rotate just the front moving handle around its fixed pivot produced
`/workspace/generated_images/exec-7970a582-7c09-42ed-bf30-cd8b409047c6.png`.
The handle stayed in place. An earlier midpoint edit using original source
frames at `/workspace/generated_images/exec-74e7b4ed-c943-48fd-be15-7158ae5226d7.png`
also reproduced the first pose rather than an intermediate one.

The needed foot and handle cycle is absent from the illustrated drafts; a
static loop would give false mechanics. Do not fill out six frames by repeating
these images. The procedural fallback already has linked opposing handles
and pedals, but a better pose-controllable drawing method is needed for an
illustrated release.

Follow-up pose tests: `2-opposite-with-rig-guide.png` received both the
polished draft and opposite-phase procedural frame as references, but kept the
same extended front arm and retracted rear arm. `3-pose-guide-only.png` and
`3a-pose-guide-start.png` rendered two procedural frames independently in a
more detailed style; their machine base, flywheel, head, and pole locations
change too much to work as an animation. `4-six-panel-storyboard.png` kept
the machine and camera more consistent, but repeated nearly the same stride
and handle positions across all six panels. None passes release review.
