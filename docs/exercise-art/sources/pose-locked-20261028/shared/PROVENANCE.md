# Pose-locked figure asset provenance

| Asset                                           | CC0 source                                                                                                                                     | SHA-256                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `human-base-rigged.glb`                         | [Innerscene MakeHuman/MPFB 53-bone body](https://www.innerscene.com/tools/library/3d-parts/human-base-mesh-with-editable-53-bone-rig-8e7c8ab1) | `7135e03b6259e970458deff3e0458610914d7c35164cae12611101361e4a5749` |
| `sneaker.glb`                                   | [Grab3D procedural sneakers](https://grab3d.com/models/props/sneaker/)                                                                         | `64a3cc3d2ff77aa4f77d7bd38d54ac91cb4bed0eae888f7cc253e3fe7545fdb6` |
| `../atlas-source/full-body-muscular-system.glb` | [Innerscene superficial muscle system](https://www.innerscene.com/tools/library/3d-parts/full-body-muscular-system-superficial-layer-8e9b43f6) | `f21c9847430edac29619b3a0a544856c9e8fb435ee06fa964674a99b9a74bc04` |

The source pages identify these assets as CC0 and permit modification and
commercial redistribution. The muscle source is baked to the coherent body's
UV and never rendered as a separate moving mesh because its layers tear under
full-body IK. The original 53-bone body mesh, face-free head shell, pelvis
material region, and foot-bone-bound trainers form the final moving figure.

| Derived atlas                                 | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `front_squat-modesty-contour-color-1024.png`  | `f4132316c74b789983996fe3c4c106ea66e227f6190303e5521ef3b36c241d26` |
| `front_squat-clean-normal-1024.png`           | `ea5fad64d2a10bc0bd706851c5f303f0f96e8f49c3b52e32c23c5dc66344613a` |
| `assault_bike-modesty-contour-color-1024.png` | `5b3896aeda6a9ce5ebbbc3d0b7e916e697c3fa1be8163a773d64248bacd382a3` |
| `elliptical-modesty-contour-color-1024.png`   | `a2245c90a69e5f45f57e10e96445837f32682a0954860823589de32b0aaf5752` |
| `anatomy-modesty-normal-1024.png`             | `21a2b93b283c49080c2835a174190e3cc8b253ebd577dff0ac35f8d0b275a971` |

`../atlas-source/` contains the original muscle GLB, regeneration scripts,
and the ordered bake instructions. `SHA256SUMS` verifies every packaged file.
