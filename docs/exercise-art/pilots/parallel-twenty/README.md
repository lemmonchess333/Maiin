# Twenty additional exercise drafts

The 20 originally assigned catalogue exercises were attempted, with mountain-climbers added as a substitute for the incomplete single-leg calf raise. **20 have six-frame candidate sets (120 frame files), plus two partial calf-raise frames. None are release-approved.** These use the shared anatomy-v3 athlete and remain outside public assets and runtime registries.

| Exercise | Native frame files | Distinct pose files | Status |
| --- | --- | --- | --- |
| cross-body-hammer-curl | 6/6 | 3 | six-frame-draft |
| reverse-barbell-curl | 6/6 | 3 | six-frame-draft |
| ez-bar-curl | 6/6 | 3 | six-frame-draft |
| zottman-curl | 6/6 | 6 | six-frame-draft |
| reverse-flyes | 6/6 | 3 | six-frame-draft |
| shrugs | 6/6 | 3 | six-frame-draft |
| db-rdl | 6/6 | 3 | six-frame-draft |
| decline-db-press | 6/6 | 3 | six-frame-draft |
| bodyweight-lunge | 6/6 | 4 | six-frame-draft |
| single-leg-calf-raise | 2/6 | 2 | incomplete-pilot |
| barbell-step-ups | 6/6 | 4 | six-frame-draft |
| front-squat | 6/6 | 4 | six-frame-draft |
| diamond-push-ups | 6/6 | 4 | six-frame-draft |
| pike-push-up | 6/6 | 4 | six-frame-draft |
| inverted-row | 6/6 | 4 | six-frame-draft |
| pull-ups | 6/6 | 4 | six-frame-draft |
| dead-bug | 6/6 | 5 | six-frame-draft |
| toe-touches | 6/6 | 3 | six-frame-draft |
| bicycle-crunch | 6/6 | 4 | six-frame-draft |
| russian-twist | 6/6 | 4 | six-frame-draft |
| mountain-climbers | 6/6 | 5 | six-frame-draft |

Exact prompts, cues, masters, rejected attempts and individual reviews accompany the sets. BATCH_MANIFEST.json records frame hashes, dimensions and review text. Return/hold reuse is stated in the exercise records; the Zottman sequence separately renders grip changes. These are discrete instructional frames, not a verified continuous animation.

## Review and remaining work

See QA-*.md and each exercise review for concrete findings. Known blockers include support/equipment drift, some grip or phase ambiguities, and the incomplete calf-raise set. Six existing files do not establish technique or release approval. Correct those findings before activation.

## Validation

All 202 saved PNGs across this batch and the repair folder decoded successfully. Lint, art audits, build and the full active test suite passed: 9,697 tests passed, 347 skipped. Code checks do not validate exercise technique. App-player/mobile/light-dark playback remains unverified because the browser blocked the local review URL.

Prior draft repairs are separately versioned under ../repairs-20260921. Original sets are preserved. The published branch keeps this batch separate from the other chat's rebuild and does not activate any asset in the app.
