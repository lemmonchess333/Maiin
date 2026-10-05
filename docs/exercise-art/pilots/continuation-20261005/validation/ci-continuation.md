# CI continuation: export coverage and focused playback

Base inspected: `1573294b22f551762caf6458c016e739c63af5ce` on
`codex/continue-exercise-art-oct05`. The user authorized pushing the draft and
continuing on 5 October 2026. This is not production-release authorization.

## Measured handoff gap

Form artwork review run `37369539446` completed its `review-sources` job, but
its `review-player` job was cancelled. The player log download returned
BlobNotFound; the cancellation cause is not inferred from that response.

The source artifact `11370715227` was downloaded and inspected. Its 39 files
include five older exercise sets and do not include the current Bulgarian
manifest or any of its selected frames. The exporter at this base selects only
those five older targets. Therefore the successful source job is not evidence
that Bulgarian sources were packaged. Historical evidence is left unchanged.

## Changes

- Export both explicit manifests, retaining the five existing exercise sets and
  adding the current six Bulgarian frame paths. Require exactly one occurrence
  of each requested exercise across the manifests. Carry the Bulgarian review,
  provenance and V2 selection record into the artifact unchanged.
- Validate all input bytes before writing output, reject nonempty output to
  prevent stale mixed exports, and preserve the existing order, hash, dimension,
  distinct-path and return-pose checks. Exporting never grants visual approval.
- Add 18 dependency-free regression tests using explicitly synthetic PNGs. The
  tests passed locally with zero failures. They check inclusion, exact copies,
  metadata retention, missing/duplicate selections, corruption, order, dimensions,
  invalid reuse, path traversal, symlinks and output safety. Python compilation
  and workflow YAML structural checks also passed locally.
- Add a branch-scoped focused player job running the five existing Bulgarian
  tests, including dark/light continuous video capture and reduced-motion/manual
  stepping. Require five passes and zero skipped, flaky or failed tests. Record
  the tested commit, runtime and input hashes; run `npm run verify`; retain the
  resulting evidence as a separate artifact. The full player job is unchanged.

No native image, cue, manifest selection, technique assertion, production asset,
release registry or deployment workflow is changed by this continuation. The
workflow has read-only repository permissions and requests no production secrets.

## Remaining review

The added tests validate the exporter, not browser playback. Inspect the new
GitHub Actions results and their exact-commit artifacts before marking the player
review complete. Full-repository verification and visual playback approval are
not claimed by the local Python tests or by this note. Native source selection
continues to be governed by `v2-selection.json` and `REVIEW.md`.
