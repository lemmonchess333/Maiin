# Anatomical master rebuild — 21 September 2026

The owner requested rebuilding every exercise from the same anatomical master,
retaining fully visible legs and a smooth neutral pelvis. This is the active
catalogue-wide task. The registry contains 141 in-scope exercise IDs.

## Checkpoint

Six six-frame candidate sets (36 PNG files) are saved in
`ANATOMY_V3_DRAFTS.json`: dumbbell curl, hammer curl, front raise, Cuban press,
goblet squat and bodyweight squat. Each has a regenerated scene master in
`masters/<exercise-id>/1.png`, generated from `identity/athlete-anatomy-v3.png`.
The other 135 catalogue entries still need rebuilding. None of these new sets
has been released to production.

Use the `(v3 draft)` entries in the form-art review fixture. Legacy drafts remain
available separately. The native image bytes and both reference hashes are
recorded. Mechanically identical return configurations reuse the outward pose
in a separate PNG file with a distinct cue; no interpolation or warping.

## Open findings

- Curl sets: inspect upper-arm contours, elbow anchors and dumbbell dimensions.
- Front raise: inspect shoulder highlight shapes and dumbbell dimensions.
- Cuban press: top pose moves head and shoes slightly; correct before release.
- Goblet squat: feet drift upward; confirm supporting grip and squat depth.
- Bodyweight squat: feet drift upward and bottom pose shifts right; fails the
  fixed-foot gate and needs correction before release.

Several generated poses introduced a gray halo despite black-background
instructions. Dedicated background-only image edits corrected selected poses.
The full application verification passed (9,697 tests, 868 test files; lint and
build passed). The draft integrity audit passes. These checks do not establish
anatomical or visual approval. Mobile light/dark sequential playback remains
unverified because browser installation was unavailable in this environment.
