# Bulgarian split squat fixed-contact candidate

This directory contains a reproducible, non-destructive contact-layer candidate for the new facing-left, bench-right Bulgarian split squat. It follows the user-authorized fixed-contact compositing workflow recorded in `../../../shrugs-composite-20261003/README.md`.

**Both ankle bridges and the targeted tongue-junction corrections pass local visual review. The full movement and release remain unapproved.** The body and dumbbells retain the pinned multiregion source; separate later depth, highlighting and rigid-equipment changes are outside this contact candidate.

## Reproduce and measure

From the repository root:

```sh
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/composite/build.mjs
node docs/exercise-art/pilots/continuation-20261005/bulgarian-split/measure-registration.mjs
```

The build verifies the pinned input hashes and writes only inside this directory. It keeps the native 1536×1024 canvas. The generated front-ankle layer alone receives a documented horizontal alignment of 0–8px. The whole pose, camera and supports are not transformed, and the original PNGs remain unchanged.

| Input                                             | SHA-256                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/exercise-art/masters/bulgarian-split/1.png` | `0ddf3560366a6d9790c051a2e514cdc6d0785229dfa3ee0476151209b8676702` |
| `../sources/bottom-repair-multiregion.png`        | `e2a7a41b2c30e2214ce3e7ab5164b5f02daa59d0494746efe66a4c06152653bb` |
| `../sources/bottom-join-repair.png`               | `9fa275180ef8f7e12bfcb52be12173828b3e423d210524f4b6d0e16a8d90abba` |

`composition.json` records the exact regions, masks, source and output hashes, pixel checks and review findings. Coordinates use the native top-left origin. Rectangles are `[left, top, width, height]`, with exclusive right/bottom boundaries.

## Layer construction

The original moving source supplies the body and dumbbells. The frozen master supplies the front shoe, rear shoe and bench. Bench rectangles cover `[809,640,591,91]` and `[760,690,665,295]`. A saved source-derived rear-calf mask preserves the anatomy that occludes the bench. Its seed, region, color criteria, connectivity and dilation are recorded in the report.

The preliminary front support region `[320,820,260,180]` blends toward the master over y820–850. The preliminary rear support region `[832,530,180,137]` blends over x832–848. Those initial joins failed native review. Their weights remain in `fixed-layer-mask.png`, and `bottom-before-join.png` retains the rejected image.

The generated repair is imported only through the following localized regions:

| Region      | Import and boundaries                                                                                                                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Front ankle | `[426,768,125,120]`; alpha rises over y768–788 and returns to zero over y882–888. A traced frozen-shoe boundary protects the tongue, collar and shoe. The adjacent `[537,848,20,48]` region retains the master's background around the collar.           |
| Rear ankle  | `[828,578,38,99]`; alpha rises over x828–833 and returns to zero over x860–866. This narrow selection joins where original and generated contours agree, excluding the changed calf and knee farther left. The rear shoe and exposed bench remain fixed. |

The front region expands the prompted box by 4px left, 2px above and 7px below to cover antialiasing and end inside the ankle opening. Frozen shoe protection excludes the tongue and collar from that expansion.

Only the generated front-ankle sample is aligned horizontally:

`dx(y) = 8 × smoothstep(clamp((y − 778) / 62, 0, 1))`

The build samples the generated input at `(x − dx(y), y)`, using linear interpolation between adjacent horizontal pixels, then blends through the declared mask. No original body, dumbbell, fixed shoe or bench pixels receive that transform. The repair-import and protected-support masks are saved and hashed.

## Preservation evidence

The current output preserves **275,675 fixed-layer pixels** exactly and **1,277,178 original moving pixels** exactly. There are **20,011 declared join pixels**, including the preliminary joins and localized import. The protected-support mask contains **261,183 pixels**. Counts include background pixels owned by each layer, not just foreground objects.

Every channel in the pure fixed and moving regions is checked against its source. Protected support pixels are checked against the master. The final image is also checked against the preliminary image outside the two declared repair rectangles. All difference counts are zero. These are preservation checks, not automatic anatomy or release approval.

## Native visual review

The full candidate and both enlarged QA strips have been inspected independently. The strips show **frozen master / rejected preliminary / generated repair / current bounded import** from left to right. They are QA-only 2× nearest-neighbor enlargements; enlarged pixels never enter the candidate.

The front join has no conspicuous black gap, rectangular cut, doubled outer contour, or obvious bend/width jump from the local alignment. The two previously noted dark fragments have been resolved with two mask-only ownership refinements: `[476,852,6,5]` replaces old ankle/background above the tongue crest with the existing aligned generated anatomy; `[488,860,13,20]` preserves the master tongue and its narrow adjacent region, suppressing the parallel donor contour. These refinements change exactly **182 pixels** from the retained `be44…` candidate, with **zero changes elsewhere**. The actual tongue outline remains fixed.

Independent review verified the final `97ede66ab06894d36c2712222aba62a997c0b0a63c82e7b09903eef1956ec32f` output. Both targeted artifacts are gone. A faint pale shading transition remains immediately behind the tongue in the enlarged crop, but it does not read as an open seam or detached bridge at native size.

The rear join has no obvious cut seam, doubled outline, detached ankle, or intrusion into the shoe or bench. Its mild slope change remains visually plausible. The complete generated repair is never selected: changes outside the declared import regions do not enter the result.

Rejected and superseded stages remain available:

| File                                   | Rejection reason                                                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bottom-before-join.png`               | Front doubled/cut outline over y820–850 and rear step over x832–848.                                                                                                                    |
| `bottom-join-untranslated.png`         | Protected unshifted import retains a duplicated tongue edge because generation moved the front collar left.                                                                             |
| `bottom-join-eightpx-collar-ghost.png` | Earlier integer-sampled alignment retained an extra generated shoe edge outside the frozen collar. Current composition protects those surroundings and uses smooth horizontal sampling. |

The earlier deep-versus-bottom proportion concern referred to the first rejected deep pose. The continuation selects a replacement deep and separately reviews secondary highlighting and rigid equipment. This contact-only result does not extend approval to those later candidates. Technique, grips, proportions, highlighting, smooth playback and mobile light/dark presentation require review of the selected final sequence.

## Deep rear-contact candidate

`build-deep.mjs` independently builds `deep.png` from the frozen master and `../sources/deep-grip-repair.png`. It does not use bottom anatomy or write bottom outputs. The final deep contact SHA-256 is `eb30ff85c3adbe6b603fbafee826f48d125ec92e100651bf725e8ee1979e7fa2`; its exact construction and review live in `deep-composition.json`.

The deep source's own ankle bridge occupies `[834,578,26,106]` and aligns upward by 0–7px, with a smooth ramp over x834–848. A source-anatomy guard keeps the local alignment on the calf and reveals frozen bench/background where it moves. The support region `[848,530,172,142]` transitions diagonally to the master: its blend starts at `x = 848 + 6 × smoothstep(clamp((y − 600) / 36, 0, 1))` and spans 6px. All pixels are fully fixed by x860. A small `[848,578,12,24]` master-background/upper-contour guard removes the earlier protruding donor point.

The final deep output preserves **23,384 fixed pixels** and **1,547,763 untouched moving pixels**, with **1,717 join pixels**. Fixed, untouched moving, and all pixels outside the declared regions have zero channel differences against their respective sources. The entire master shoe, collar, laces, sole and bench contact are retained; the body and gear elsewhere remain the deep-grip source exactly.

Independent native full-image and 3× crop review verifies a continuous calf into the fixed shoe, with no open gap, doubled outline or detached bridge. A short angular shelf remains on the upper calf-to-ankle contour around `[848,599,13,5]`, with ±3px visual uncertainty. It is clearest enlarged and discernible natively when looking at that junction. The lower contour remains continuous. This residual finding is retained, and full artwork/release approval stays false. The first vertical-blend trial is retained as `deep-before-diagonal-join.png`; the following candidate with a small upper protrusion is retained as `deep-before-top-contour-refinement.png`.

## Registration diagnostics

`../registration.json` measures available raw and composite candidates using eight native 31×31 RGB patches and exhaustive ±30px integer searches. It records both zero-offset error and best translation. The existing release bound remains **1px per axis**.

The current bottom composite matches all eight reference patches at `(0,0)`, with zero RGB error. A raw generation can still redraw a region without moving its best patch match, so these diagnostics never substitute for visual checks. The diagnostic includes the generated join repair and `deep-grip-repair.png` alongside earlier sources. Additional selected native PNGs can be passed as positional arguments; their paths are resolved from the repository root.

Two named projected support spans are derived from each candidate's measured patch centres: `frontShoeSupportSpan = hypot(frontHeel − frontToe)` and `benchFloorFootSpan = hypot(benchNearBaseCorner − benchFarBaseCorner)`. They supplement body and equipment checks; they are not guessed physical, skeletal or equipment dimensions. The existing dimension-drift bound remains **1%**.

For the final contact candidate, the front span is **143.055933px** and the bench span **446.753847px**, both with **0% drift**. The recorded `deep-grip-repair.png` source at SHA `5c084a014496a630b1c540f693bf58b3241854cf36f33863e6374651aaa37a3d` has a rear-laces best match of **−4/−1px**, outside the 1px anchor bound, despite both projected spans staying within 1%. Its contact issue remains visible in the diagnostics; passing the span checks does not clear it.

All approval fields remain false. Nothing in this directory registers or releases artwork to the app.
