# Batch 04: deterministic registration and deadlift draft

Ten complete six-slot drafts now exist, including the earlier dumbbell curl. The shared manifest contains the nine newer sets: 54 separate frame paths, 37 unique selected poses and 54,270,770 native PNG bytes. Newly approved/released sets remain zero. These files do not enter the production build.

## Changes

- Bodyweight squat: replaced the too-deep middle pose with the better-spaced candidate. A rigid 32 px downward translation and bounded copies of the master shoes restore both fixed shoe regions. The separate rising file reuses that corrected position. Full frame, ankle crops and a six-frame comparison strip were inspected. Small contour changes at the blended ankle joins remain a review concern.
- Deadlift: assembled six separate files from four distinct poses. The early pose moves down 32 px; the rebuilt knee-passing pose moves left 8 px/down 32 px. No body or equipment resizing. A colour-only mask reduces the overemphasised abdominal stabilisers at lockout. Return frames reuse the corresponding lift positions. The real development review player consumes this set through the manifest.
- Lat pulldown: two rebuilt machine states now use an identical stationary twelve-plate block and the same translated four-plate selected packet. Guides, their upper support and the cable are deterministic. At the early pull, handle-down 136 px corresponds to selected-packet-up 136 px. Athlete pixels were not changed. The exercise remains incomplete because the later pose experiments changed bar width/grip and stopped the pull too high.
- Added reproducible registration and colour-refinement scripts, input/output hashes, pixel diagnostics and compact draft video previews.

## Measured evidence and limits

The recorded shoe ROIs are contact strips, not full dimensions. At the bodyweight-squat master and corrected middle frame, far/near sole bottoms are 1388/1446; the copied shoe bounds match exactly. This is construction evidence, not independent proof of correct anatomy.

For the deadlift master, early, knee and standing frames, the far sole bottoms are 1325/1325/1326/1326 and near bottoms 1359/1360/1360/1360. The standing far-shoe left edge is 2 px different from the master. Do not claim every anchor is approved because sole heights are close. Grip spacing, plate silhouettes, head/limb dimensions and hip/knee mechanics still need review.

The lat machine's fixed block and moving packet each have zero differing bytes against their corresponding source regions. This proves the layer construction preserves plate artwork/count; it does not independently certify every attachment or cable route. The guide support/connector appearance still needs review.

Draft videos are 512×768 step-sequence previews made with ffmpeg, without synthesized in-between poses. Full-resolution masters remain separate 1024×1536 PNGs. These videos and static comparison strips are not live browser/mobile testing. The previously blocked cloud-browser route was not bypassed. Mobile light/dark playback, reduced motion and final cue agreement remain unapproved.

## Size experiment

Native-resolution WebP quality 90 conversion of six frames totals 276,172 bytes for bodyweight squat and291,146 bytes for deadlift, versus 5,279,817 and5,655,998 bytes for their PNG sets. These are measured encoding sizes, not a release decision or a guarantee of acceptable compression on every exercise. No full-library bundle was added to the app.

## Verification

`NODE_OPTIONS=--require=/tmp/tropos-no-network.cjs npm run verify` completed with exit 0: lint, existing-art audit, draft audit, build and tests passed. Vitest: 673 files passed, 7 skipped; 8,062 tests passed, 341 skipped; zero failures (94.27 seconds).

The final asset/manifest additions and small script edits were then checked with a fresh full lint, `npm run check:form-drafts`, the separate fixture TypeScript configuration and `git diff --check`. The final draft audit reports nine newer sets, 54 frames, 37 unique poses and no integrity errors. These checks do not grant visual release approval.

## Recovery and publication status

Workspace maintenance removed the checkout and uncommitted work during this batch. The saved baseline was restored from `codex/exercise-art-batch-03` at `e71691e28fe3bbd8ec1dd2147fdac28a2a3f78cc`. Deterministic corrections were reproduced; two missing deadlift poses were rebuilt. Five earlier generated candidates could not be recovered through Library search and are not included or counted as saved outputs. The current generation log records the two rebuilt outputs; seven built-in image calls were made across the interrupted work. No CLI/API image generation was used.

Automatic approval review rejected uploading the draft payload to the public GitHub repository. A read-only check confirmed the connected account owns `lemmonchess333/Maiin` and has push/admin permission; a retry was still rejected because the reviewer requires explicit approval for this payload and public destination. No remote checkpoint, push, PR, merge or deployment succeeded for batch 04. The pending changes are packaged for review; the remote baseline remains batch 03.

## Reproduce and continue

From the baseline repository with dependencies installed:

```sh
node scripts/register-form-drafts.mjs
node scripts/register-lat-machine.mjs
node scripts/refine-deadlift-highlight.mjs
npm run check:form-drafts
npx tsc -p e2e/fixtures/tsconfig.form-art.json
```

All originals remain intact. The manifest names the selected six files and their cues. `BATCH_04_REGISTRATION.json`, `BATCH_04_COLOUR_REFINEMENT.json`, `BATCH_04_CABLE_REGISTRATION.json`, `BATCH_04_ANCHOR_DIAGNOSTICS.json` and `BATCH_04_GENERATION_LOG.json` preserve the relevant recipes and findings.

Next: correct lat-pulldown bottom-pose/bar/grip geometry using the registered machine; repair the shrug's moving shoulders/arms without shortening limbs; resolve the remaining invariants in complete drafts; perform actual mobile theme/playback review before promotion. Continue the exact-ID catalogue queue only with this same evidence standard.
