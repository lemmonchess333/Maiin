# Final review of the 33 owner-released sets

All 33 sets received current six-frame source review and focused native detail inspection. Seven sets received repairs across two batches; the other 26 retain their reviewed source pixels. The canonical FA56 athlete, approved purple/lilac palette, original source shading and no-shorts requirement are preserved.

| Set                   | Repair                                                                             | Batch              |
| --------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| Barbell curl          | Consistent native plates, collars and sleeves                                      | Merged in PR #2903 |
| Single-leg calf raise | Fixed support and clean tread/contact edge, retaining synchronized body/heel poses | Merged in PR #2903 |
| Turkish get-up        | Correct kneeling/standing direction and loaded arm relative to the planted foot    | Merged in PR #2903 |
| Assault bike          | Fixed fan, base, foot rests and lever pivots                                       | This batch         |
| Stairmaster           | Uphill rear view with distinct support, swing and full-foot landing poses          | This batch         |
| Rowing machine        | Straighter finish with a supported moving seat and fixed machine                   | This batch         |
| Swimming              | Side-rolled breathing pose                                                         | This batch         |

The [per-set review ledger](library-review.json) binds each assessment to all six current frame hashes and a current contact sheet. Historical source findings and release records remain available. Owner-release status and null strict checks are unchanged; this is a qualitative illustration review, without a calibrated 3D certificate.

For the four sets in this batch, all 48 staged and all 48 registered frame selections were reviewed at a verified 390 × 844 viewport in both themes. Actual normal playback in dark mode and slower playback in light mode were checked through every source path and the cycle wrap. The stair muscle legend describes the visible rear-view fields: primary glutes, secondary hamstrings and calves; the exercise catalogue is unchanged.

Portable source archives independently reproduce the frozen native compositions and lossless exports byte for byte. The unchanged normal exporter regenerated all 152 registered cards, including the existing prepared swimming cutout. This batch changes 15 guide files and three cards; the other 897 guide files and 149 registered cards remain identical to merged main at `7e382a7b`.

The [integration record](batch2-registered-review.json), [delivery proof](batch2-delivery-proof.json), and [baseline verification evidence](verification/pr2903-and-final-baseline.json) record the checks and their scope. Final project verification and exact-commit CI results are reported in the pull request. The measured Windows baseline is not wholly green, and its original failing runs are preserved rather than relabelled as passing.
