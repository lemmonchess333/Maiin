# Assault Bike redraw review

Status: draft only; do not route or release.

`1.png` is a polished side-view starting frame with both shoes supported by
pedals and both hands on separate push/pull grips. It came from
`/workspace/generated_images/exec-79e9e72f-5b50-4d89-8104-10035ff9b2f9.png`.

`2-initial.png` changes the pedal and leg positions, but the two handle tops
and arms remain almost stationary. Attempts to correct this with explicit
handle endpoint coordinates produced
`/workspace/generated_images/exec-d28898d9-8922-48e6-87cb-e42627ebabd8.png`
and an opposite-pose redraw at
`/workspace/generated_images/exec-7cb0ae5c-30bf-40cf-b6df-5ca85cd0db07.png`.
Neither exchanged the push/pull handle positions. A further fresh pose-first
generation, with no detailed-bike frame as input, at
`/workspace/generated_images/exec-702a8aa2-3302-4b86-b0d3-59937b860a5b.png`
also returned the same extended near arm and retracted far arm.

The pedal and handle cycles disagree in every attempted illustrated sequence.
Do not fill out six frames by repeating these images. The procedural fallback
now uses two opposite-phase handles linked to the pedal cycle; a better
pose-controllable drawing method is still needed for an illustrated release.
