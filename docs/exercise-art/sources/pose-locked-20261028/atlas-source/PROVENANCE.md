# Tropos atlas source provenance

## CC0 source files

| File                                   | Source and license page                                                                                                                                                                                                                                | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `assets/human-base-rigged.glb`         | [Innerscene body source](https://www.innerscene.com/tools/library/3d-parts/human-base-mesh-with-editable-53-bone-rig-8e7c8ab1), [direct GLB](https://www.innerscene.com/api/library/human-base-mesh-with-editable-53-bone-rig-8e7c8ab1/download)       | `7135e03b6259e970458deff3e0458610914d7c35164cae12611101361e4a5749` |
| `assets/full-body-muscular-system.glb` | [Innerscene muscle source](https://www.innerscene.com/tools/library/3d-parts/full-body-muscular-system-superficial-layer-8e9b43f6), [direct GLB](https://www.innerscene.com/api/library/full-body-muscular-system-superficial-layer-8e9b43f6/download) | `f21c9847430edac29619b3a0a544856c9e8fb435ee06fa964674a99b9a74bc04` |

Both source pages state: “Public domain (CC0). Free to use, modify and
redistribute for any purpose, including commercially, with no credit
required.” The body source is MakeHuman/MPFB-derived; the [MakeHuman asset
license](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md)
also dedicates its bundled assets to CC0 and makes no claim over exports.

## Regeneration method

Blender 4.3.2 imports the body as a 70,985-vertex continuous mesh and a
53-bone armature and one unshaded `Icosphere` guide. The muscle GLB has a
70,985-vertex continuous fascia reference and 156 named muscle/tendon meshes.
The body and fascia each have 107,024 faces and 321,072 UV loops. Every
corresponding loop UV matches exactly. Their vertex indices differ, but
the identical UV layout permits selected-to-active baking onto the original
coherent body's texture coordinates.

`01_bake.py` copies 130,170 skin weights from the original body to the fascia
through exact UV-loop vertex correspondence, then uses Blender's
nearest-face interpolated vertex-group transfer to give each named muscle the
53-bone armature modifier. That evaluated neutral staging matches the
approved raw bake. It uses 136 visible named muscle/tendon objects plus the
unshaded guide sphere, matching the original source selection.
Blender Cycles bakes diffuse color and tangent normals with a 6 cm maximum
ray distance, 1.5 cm cage extrusion and 8-pixel margin. `02_uv_regions.py`
exports original-body pelvis, front-chest and axilla UV regions.
`03_process.py` replaces missing projection with white/neutral pixels,
extracts restrained normal-gradient contours, and creates exercise-specific
violet masks. Front Squat's quad mask is filled and feathered; its hard
lavender core block and chest ray smudges are removed. `04_verify.py` writes
input/output SHA-256 hashes and validates the build.

The atlas is applied to the original continuous 53-bone body. The named
muscle meshes are not included in render scenes because their independently
transferred skin weights tear under full-body IK.

## Approved 1024px derived outputs

| File                                          | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `front_squat-modesty-contour-color-1024.png`  | `f4132316c74b789983996fe3c4c106ea66e227f6190303e5521ef3b36c241d26` |
| `front_squat-clean-normal-1024.png`           | `ea5fad64d2a10bc0bd706851c5f303f0f96e8f49c3b52e32c23c5dc66344613a` |
| `assault_bike-modesty-contour-color-1024.png` | `5b3896aeda6a9ce5ebbbc3d0b7e916e697c3fa1be8163a773d64248bacd382a3` |
| `elliptical-modesty-contour-color-1024.png`   | `a2245c90a69e5f45f57e10e96445837f32682a0954860823589de32b0aaf5752` |
| `anatomy-modesty-normal-1024.png`             | `21a2b93b283c49080c2835a174190e3cc8b253ebd577dff0ac35f8d0b275a971` |

Replaying `03_process.py` on the original approved 1024px raw bakes
reproduced these final images with mean absolute error below 0.000004 pixel
values (0–255), attributable to a handful of one-value rounding differences.
An end-to-end 256px bake and a full 1024px direct-GLB bake both passed
`ATLAS_VERIFY_OK` for all 12 required images. Against the approved 1024px
render assets, the rebuilt Front Squat clean normal and shared modesty normal
were byte-identical. The Front Squat color atlas differed in 3 pixels, with a
maximum channel difference of 1 and mean absolute error 0.000000715 (0–255).
Assault Bike color differed in 2,490 of 1,048,576 pixels (maximum channel
difference 8; mean absolute error 0.001864); Elliptical color differed in
2,376 pixels (maximum channel difference 5; mean absolute error 0.001465).
These raster rounding differences do not change the reviewed released frames;
the approved atlas hashes above identify the exact files used for release.
`fidelity-report.json` records the per-image rebuilt and approved hashes and
pixel differences for the full-resolution rebuild.
