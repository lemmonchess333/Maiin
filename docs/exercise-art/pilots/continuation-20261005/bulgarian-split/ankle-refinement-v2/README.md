# Bulgarian deep-pose ankle refinement v2

This candidate reduces the residual upper rear-calf/ankle shelf in checkpoint
`8191b80d770fe8c614fb7c9b4441e71f0c9a39fa`. Independent native and 3× review
prefers the local contour improvement. **It is not selected into the six-frame
draft and does not approve the equipment, full movement, player or release.**

The original selected frame, source PNGs, prior compositor evidence, manifest,
plan and provenance remain unchanged. Everything written by this experiment is
inside this directory.

## Exact candidate and construction

`deep.png` is native 1536 × 1024, SHA-256
`70daa4b66c316751ccf68c48582d75d1cd84b87bb113053a44197e4ee73753e4`.
The pinned input is immutable `../composite/deep.png` (the original selected frame 3), SHA-256
`eb30ff85c3adbe6b603fbafee826f48d125ec92e100651bf725e8ee1979e7fa2`.

The existing selected image supplies the complete repair. The builder identifies
its upper contour at each column using the first 100/255 neutral brightness
crossing. It repositions only that contour band vertically toward the graded
line between the unchanged endpoints at x844 and x865. This is a bounded layer
alignment in the established fixed-contact compositing workflow. There is no
whole-frame transform, no equipment transform, no resynthesis and no anatomy
imported from another pose. Maximum local displacement is 2.813 native pixels.
The blend fades inward across rows 603–608; every pixel at row 608 and below is
unchanged.

The declared region is x845–864, y596–607 inclusive, a 20 × 12 rectangle. It stays
within the original finding's ±3px annotation bounds. Exactly **204 pixels / 572
RGB channels** change. All 1,572,660 remaining pixels are exact. `import-mask.png`
shows the declared weighted layer; `changed-pixels.png` shows actual changes.
The latter is smaller because some sampled pixels quantize to the existing RGB.

## Preservation and review

`report.json` records every column displacement, exact changed bounds and
channel-wise checks. The protected rear shoe/contact, lower rear ankle, front
shoe/floor contact, bench, hands and equipment have **zero changed channels**.
The contour change affects neither the shoe outline nor the laces-down contact.

The eight complete 91 × 91 support-search windows also match the pinned baseline
pixel-for-pixel. This proves that every existing 31 × 31, ±30px translation
comparison retains exactly the same error and result. The report preserves those
baseline measurements with their source-file hash; it does not pretend to rerun
a new search. The 1px per-axis bound and 1% projected-span bound are unchanged.
The front shoe span remains 144.055545px (0.6988% from the master); the bench floor
foot span remains 446.753847px (0%). These are projected support diagnostics,
not physical body or equipment dimensions.

The comparison at `qa/baseline-candidate-3x.png` shows baseline left and candidate
right. `qa/candidate-native.png` retains the native crop. Full-frame native and
both crops were inspected. Independent reviewer `/root/movement_review` found
the abrupt horizontal shelf reduced to a continuous graded upper contour, with
a natural directional bend remaining and no new open gap, doubled outline,
detached edge or lower-ankle cut. The reviewer independently confirmed the changed
pixel count, eight unchanged support patches and the exact rear shoe/contact
rectangle. `independent-review.json` binds that local judgment to the output hash.

The wider draft's equipment and actual-player findings remain open. Local visual
acceptance and exact support preservation do not clear those findings.

## Reproduce

From the repository root:

```sh
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/ankle-refinement-v2/build.mjs
```

The builder pins the baseline image, frozen registration evidence and independent
review's candidate hash. It fails if those inputs change, if the native canvas or
displacement bound changes, or if any protected pixel changes. The second build
reproduced the same output SHA-256. A syntax check and local formatting check were
also run. No full repository tests, commit, push, selected-frame refresh or
release action were performed by this experiment.
