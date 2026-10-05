# Encoded playback continuity evidence

The checker detects an empty or unusually bright artwork stage in **every encoded frame** of a caller-declared complete exercise cycle. It is read-only with respect to video and application files. It writes one JSON report and does not approve a release.

The fixed profile is `profile.json`, SHA-256 `58e497f016aa70082ef7fd5640952664d72378bed5f7d3cf14ac4aa937751020`. Use the identical profile and helper for before/after evidence. Do not adapt thresholds or move the ROI after seeing a repaired result.

## Region and decision rule

The native encoded video is 392×852. The artwork-only rectangle is **[20,330,350,260]** as `[left,top,width,height]`; it ends at y590, above the caption around y648 and the controls below y678. It contains the athlete and bench in both themes. A different encoded size is unsupported and fails closed.

FFmpeg decodes every encoded frame to RGB24 without scaling or time resampling. The crop occurs after RGB conversion so chroma subsampling cannot round its coordinates. FFprobe supplies original presentation timestamps, packet durations and codec metadata. The decoded frame count must exactly match the probed frame count. Both counts, tools/commands, source hash, profile/helper hashes and per-frame RGB hashes are retained.

A bright artwork pixel has **R+G+B≥240** (mean channel value≥80). Each reviewed frame must contain **4%–20%** bright pixels within the 91,000-pixel rectangle. Any isolated frame outside that interval fails; there is no smoothing, averaging, grace period or automatic removal of a bad frame. An encoded presentation interval over 80ms also fails, to avoid claiming continuous observation through a capture gap.

In the actual failing V2 recordings, all six independently confirmed blank stages contain **0** such pixels. Visible athlete frames contain **7,566–8,196** pixels, or **8.31%–9.01%**. The fixed lower threshold is 3,640 pixels, below half the smallest visible count yet far above the blank value. The upper threshold is 18,200 pixels, over twice the largest normal count; a bright page flash therefore fails as well. These thresholds are an operational continuity screen for this artwork and layout, not an anatomical or pose classifier.

## Reproduction and after-repair use

Install the repository's Node dependencies and FFmpeg/FFprobe on the analysis machine. From the repository root:

```sh
node docs/exercise-art/releases/2026-10-05/playback/check-continuity.mjs \
  /path/to/dark-continuous-playback.webm \
  docs/exercise-art/releases/2026-10-05/playback/baseline/dark-range.json \
  /path/to/output/dark-continuity.json
```

The baseline exits **1 intentionally**, because it reproduces the known failure. Exit0 means no threshold failure in the declared encoded interval; exit1 with a saved failing report means continuity failed. Malformed input, missing tools, changed pins, unsupported dimensions or incomplete frame coverage produce an error, never a passing report.

For the new recording, provide a new range declaration with its actual video SHA-256, the unchanged profile SHA-256, explicit start/end presentation times and a written reason for choosing them. Pin and cite the new CI video/transition evidence. A minimal declaration is:

```json
{
  "videoSha256": "<actual-new-WebM-SHA256>",
  "profileSha256": "58e497f016aa70082ef7fd5640952664d72378bed5f7d3cf14ac4aa937751020",
  "startSeconds": 0.88,
  "endSeconds": 8.52,
  "pageLoadExcluded": true,
  "reason": "Replace these example times and explain how native video review and the new transition evidence establish one complete cycle, including6-to-1, after page load."
}
```

Times in that example belong to the old video and must not be copied blindly. The checker requires at least the nominal7.2-second cycle duration, but duration alone does not prove correct source order or a complete cycle. A frame is included if its presentation interval overlaps the declared half-open range `[start,end)`. No encoded frame within that range can be skipped.

## Failing baseline

The source is actual CI run [37361829827](https://github.com/lemmonchess333/Maiin/actions/runs/37361829827), artifact11367177702. Each VP8 WebM records one scoped Bulgarian real-timer test. Requested viewport393×852 was encoded as392×852 at25fps.

| Theme | All decoded frames | Reviewed frames | Blank zero-based indices | Original PTS, seconds |
| ----- | -----------------: | --------------: | ------------------------ | --------------------- |
| Dark  |                228 |             191 | 44,105,167,196           | 1.76,4.20,6.68,7.84   |
| Light |                230 |             191 | 46,107                   | 1.84,4.28             |

The reviewed interval is `[0.88,8.52)`, covering full frames from0.88 through8.48s. Prior independent native review confirmed setup/shallow/deep/bottom/deep/shallow/returned setup and inspected every transition with adjacent frames. Every flagged stage is empty for one encoded frame; immediate neighbors show the athlete and bench. `baseline/comparison.json` binds the exact reproduction to the previous all-frame diagnostic and its superseding native review.

Dark video SHA-256: `3d444fdab99ece95cc4a86d5dea0ef2e3d7c9014604fe9c65184bdd4be16d1a1`.

Light video SHA-256: `ccc296b231ff2a98d3f0bb6463c5b0dd0143b689235c18618320255917784790`.

## Evidence limits

The report preserves all encoded-frame metrics, including frames outside the declared review interval; those outside frames do not affect the stated cycle gate. Range selection and sequence completeness remain explicit reviewer assertions. An unchanged pose, incorrect cue, partially wrong athlete, or wrong movement can retain adequate stage content and requires separate review.

At25fps, an event entirely between recorded frames is unobservable. The result therefore means **no failing encoded frame in the declared range**, not proof of every physical display refresh. Native visual review of every transition remains required. A passing numerical result does not approve the player or release.
