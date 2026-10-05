# Bulgarian split squat: transparent rigid-equipment candidate

The four native candidates in `final/` pass independent native equipment, grip
and contour review. They use one new transparent dumbbell asset, two fixed camera
projections, original foreground hands/knee and the independently reviewed local
deep-ankle refinement. `releaseApproved` remains false. Actual player evidence and
whole-release gates are separate from this construction record.

This work is isolated from the frozen sources and rejected first rigid trial.
The initial baseline commit `8191b80d` and published checkpoint `f6bfffc3` have the
same tree. All input paths in the builders point to immutable source files, so
changing the selected draft frame copies cannot silently change a rebuild.

## Why this construction works differently

The previous trial extracted dark gear already flattened against white anatomy.
Moving those edges carried white fringes, and replacing a wider head with a
smaller one exposed anatomy that was absent from the source. Clearing those
pixels produced visible cutouts. Those rejected files are untouched.

One built-in ImageGen call produced `dumbbell-source.png`: a complete faceted,
octagonal dumbbell with real alpha and no attached anatomy. The exact prompt,
three style/projection references, raw image hash and native dimensions are in
`generation.json` and `equipment-asset-prompt.txt`. The raw image is preserved.

`build.mjs` normalizes nearly opaque interior alpha once and assembles the front
head, rear head and shaft into two fixed projections. This one-time projection
construction follows the documented shrugs workflow. The projections are then
integer-translated only: no per-frame resizing or rotation. Their slightly larger
silhouette covers the old equipment without erasing background or inventing
hidden anatomy. Setup's candidate equipment therefore changes inside its gear
regions; the frozen exercise master and setup source remain untouched.

Original generated hands and their fine contours remain foreground. The far
thigh/knee similarly occludes its weight. A first deep mask also included a small
white thigh wedge below the hand. The native fingertip lower contour was traced
to exclude that thigh from the hand guard. The first deep image and coordinate
review are retained under `trials/` and `qa/`; no new body generation was needed.

## Final deep combination

`combine-ankle.mjs` joins the reviewed gear deep with
`../ankle-refinement-v2/deep.png`. Relative to the common original deep, the two
changes are disjoint. It copies exactly 204 ankle pixels inside `[845,596,20,12]`;
every other pixel remains the reviewed gear image. The accepted ankle contour and
the clean grip/equipment contours pass a final independent native check together.

The final full-size paths and SHA-256 hashes are in `combination.json` and
`native-review.json`. The former records 0 overlap between ankle and gear, 0
changed gear channels after the merge, and 0 changed channels outside the accepted
ankle patch relative to the reviewed gear frame.

## Diagnostics and review scope

`diagnostics.json` keeps the original limits: at most 1 native pixel of per-axis
fixed-anchor drift and at most 1% relative dimension drift. It reports:

- 12 exposed gear-face comparisons exactly equal to their fixed translated layer.
- 32 support-patch comparisons exactly equal to the corresponding frozen source.
- Zero changed channels outside declared equipment and accepted ankle regions.
- Zero changed original foreground-hand channels.
- Fixed alpha-bearing head/shaft dimensions with no per-pose scale or rotation.

The near front head's fixed alpha extent is 80 × 84 pixels, and the far front
head's is 73 × 80 pixels. These are the constructed camera projections. They are
not claims of real-world load measurements. Different hand/knee occlusion can
hide different portions of the same rigid equipment; hidden dimensions are
construction evidence. The independent review checks complete silhouettes and
grips rather than relying on matching interior patches alone.

The three previous failure regions remain explicitly recorded without relaxing
their review: `[594,651,12,18]`, `[605,729,25,6]` and `[687,710,66,34]`. No old strip,
rim or cutout is visible in the reviewed candidates. Full native and 3× before/
after crops are preserved in `qa/`.

Reproduce from the repository root:

```bash
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/rigid-equipment-v2/build.mjs --all
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/rigid-equipment-v2/combine-ankle.mjs
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/rigid-equipment-v2/measure.mjs
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/rigid-equipment-v2/record-evidence.mjs
```

This bounded task did not run repository-wide tests or alter the original frames,
manifest, plan, provenance, tests, source images or rejected V1 files. Parent
integration may later select the exact final images into an inactive draft; this
folder does not grant production approval.
