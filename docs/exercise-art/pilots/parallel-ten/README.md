# Ten-exercise production batch

Worked on all ten assigned exercises using the shared anatomy-v3 athlete. **9 sets have six native frame files; no set is release-approved.** Exact prompts, cues, hashes, rejected attempts and review notes accompany each exercise.

| Exercise | Frame files | Unique poses | Review finding |
| --- | --- | --- | --- |
| chest-supported-db-row | 6/6 | 3 | Fixed bench-strut detail drifts; shoulder highlight too broad. |
| spider-db-curl | 6/6 | 3 | No major definite mechanical defect in independent still review; playback remains unverified. |
| incline-db-curl | 1/6 | 1 | Far grip hidden; corrective generation rejected by image service. Incomplete. |
| concentration-curl | 6/6 | 3 | Changed camera establishes inner-thigh brace; see final exercise review. |
| preacher-curl | 6/6 | 3 | Potential bar/grip width change requires review; perspective may contribute. |
| tricep-kickback | 6/6 | 3 | Clear extension and stable support in independent still review; playback remains unverified. |
| bulgarian-split | 6/6 | 4 | Stable feet/bench; uneven spacing between movement phases. |
| leg-extension | 6/6 | 4 | Fixed machine axle drifts. Mechanical rework required; not approved for instructional release. |
| seated-leg-curl | 6/6 | 4 | Machine pilot corrected; see final exercise review for movement-stage result. |
| chin-ups | 6/6 | 4 | Underhand grip consistent; slight torso perspective variation. Playback remains unverified. |

Return and hold frames reuse the same native pose only where physically appropriate. These are discrete instructional frames, not a rendered continuous animation. All files remain outside public assets and runtime registries.

## Validation

All recorded PNGs decoded and dimensions/hashes were verified. Lint and build passed; the full unit suite passed with 9,697 active tests and 347 skipped tests after local dependency isolation corrected the test environment. Code checks do not validate exercise technique.

Browser playback could not be reviewed because the browser blocked the local review URL (ERR_BLOCKED_BY_CLIENT). Actual app-player and mobile light/dark review remain unverified. See INDEPENDENT_REVIEW.md and individual review files for still-image findings.

## Continuation

Keep this batch separate from the other chat's existing exercise rebuild. Resolve mechanical findings before public activation; do not treat six existing files as approval. The remote draft branch contains only this batch, the prior parallel-next pilots and their canonical-reference dependencies; unrelated local rebuild commits were not published.
