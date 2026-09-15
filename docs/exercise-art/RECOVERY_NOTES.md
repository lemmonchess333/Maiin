# Recovered originals: conventional deadlift

This restores a six-slot conventional-deadlift candidate from the older
`codex/exercise-art-registration-04` branch without merging that branch or
replacing the current batch manifest. The original 17 production guides,
five inactive merged sequences, and their later repairs are unchanged.

## Exact source, not a new generation

The six PNGs in `pilots/recovered-deadlift/` match both the Library archive
`tropos-exercise-art-batch-04.zip` and the source branch's Git blob IDs.
`RECOVERED_DRAFTS.json` records the old paths, immutable blob IDs, SHA-256,
bytes, native dimensions, selected order and original cues. The canvas is
1024 by 1536 throughout. Six separate paths represent four unique poses;
frames 5 and 6 reuse 3 and 2, respectively.

The recovery manifest is consumed by the existing account-free form-art
fixture and the normal `check:form-drafts` command. Duplicate exercise IDs
are checked across both manifests. Recovery does not replace or repoint any
production artwork and adds no native PNGs to `public/`.

## Review outcome

The recovered set was inspected as a six-frame contact sheet. It is a
complete candidate, not a strict passing review. Preserve the original
findings about grip spacing, plate silhouettes, body proportions and
hip/knee mechanics. Frame 6 is the early-lift position on return, not the
floor endpoint; the 6-to-1 transition still needs actual player inspection.
Its authored draft cues also differ from the production deadlift ladder.

Do not activate it by changing a status alone. First reconcile the cue
ladder, resolve the visual findings, inspect all six transitions in the
real player, then prepare versioned delivery assets and release evidence.

## Verification scope

Local checks decoded all six PNGs and verified native dimensions, byte
counts, SHA-256, immutable Git blob IDs and return-pose reuse. These checks
do not establish correct technique or mobile playback. The coding sandbox
could not resolve GitHub's hostname for a checkout, so no fresh local
full-repository build or test-suite pass is claimed; the PR's exact-head
CI results must be checked separately.

Tracks the selective recovery item in issue #2333. No new image generation
was used for this checkpoint. The other recovered candidates and the five
inactive merged sets remain separate work, not silently marked completed.
