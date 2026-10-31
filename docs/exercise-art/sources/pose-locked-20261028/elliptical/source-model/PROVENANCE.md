# Temporary rig prototype provenance (2026-10-27)

This directory is a local art prototype. Do not copy its assets into a
release without reviewing the final poses, form, and presentation.

## Sources and license

- `human-base-rigged.glb`: downloaded from
  `https://www.innerscene.com/api/library/human-base-mesh-with-editable-53-bone-rig-8e7c8ab1/download`.
  Source page:
  `https://www.innerscene.com/tools/library/3d-parts/human-base-mesh-with-editable-53-bone-rig-8e7c8ab1`.
  The page states "Public domain (CC0). Free to use, modify and redistribute
  for any purpose, including commercially, with no credit required." It
  describes a MakeHuman/MPFB-derived anatomical body and 53-bone rig.
  SHA-256: `7135e03b6259e970458deff3e0458610914d7c35164cae12611101361e4a5749`.
- `full-body-muscular-system.glb`: downloaded from
  `https://www.innerscene.com/api/library/full-body-muscular-system-superficial-layer-8e9b43f6/download`.
  Source page:
  `https://www.innerscene.com/tools/library/3d-parts/full-body-muscular-system-superficial-layer-8e9b43f6`.
  The page likewise states CC0 permission to use, modify, and redistribute
  commercially, and describes an original Innerscene superficial-muscle model.
  SHA-256: `f21c9847430edac29619b3a0a544856c9e8fb435ee06fa964674a99b9a74bc04`.
- Underlying MakeHuman asset license:
  `https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md`.
  Its section C expressly covers base meshes, targets, textures, poses,
  and other bundled assets under CC0 1.0; section D makes no claim over
  exported models or renders. Third-party assets have their own terms.
- `sneaker.glb`: downloaded from
  `https://grab3d.com/dl/sneaker/sneaker.glb`. Source page:
  `https://grab3d.com/models/props/sneaker/` and machine-readable metadata:
  `https://grab3d.com/api/v1/models/sneaker.json`. Both identify the model as
  CC0-1.0, available for commercial reuse without attribution. The source
  describes procedurally built, unbranded shoes; downloaded GLB is a single
  18,024-vertex mesh containing both trainers, at 0.285 x 0.331 x 0.127 m
  overall. SHA-256:
  `64a3cc3d2ff77aa4f77d7bd38d54ac91cb4bed0eae888f7cc253e3fe7545fdb6`.

## Blender import and rigging

Blender 4.3.2 imported the body as `Avery | anatomical body` (70,985
vertices) with the `Avery | anatomical body.rig` armature (53 bones, including
finger chains) and an Armature modifier. A 55-degree upper-arm pose moved
12,138 body vertices, with 0.32 m maximum displacement.

The muscle file imported 157 mesh objects, including 156 individually named
muscle/tendon meshes and a continuous fascia reference, totaling 143,809
vertices; it has no armature. The fascia and rigged body each have 70,985
vertices, 107,024 faces, and 321,072 UV loops. Every corresponding UV loop
matched exactly. Matching source and target vertices by loop index mapped all
70,985 fascia vertices to a unique body vertex with no conflicts, although
their vertex indices differ. `rig_muscles.py` copies all 130,170 body skin
weights through this map, then uses Blender's nearest-face interpolated
vertex-group transfer from fascia to the named muscle meshes. It adds the
53-bone armature modifier to each muscle mesh and saves
`rigged-muscles.blend`.

## Retarget validation and current baked approach

The separate muscle-mesh rig was tested under arm rotations and full-body IK.
It fails full-body IK: individual muscles visibly detach from the arms,
thighs, and torso. `rigged-muscles.blend`,
`rigged-muscles-retarget.blend`, and their preview renders must not be used as
final exercise art. The aligned UV loops permit a safer method: bake muscle
color and tangent-space normal detail to the fascia UV, then apply those
images to the _original_ continuous 53-bone body mesh, which already deforms
coherently. No transferred skin weights are used at render time.

`bake_texture.py` and `bake_normal.py` use Blender 4.3.2 Cycles
selected-to-active bake with 6 cm maximum ray distance, 1.5 cm cage
extrusion, and an 8-pixel margin. The target is the continuous fascia UV;
this UV has the same 321,072 loops as the original rigged body. Source
muscle meshes have anatomical gaps and some invalid normal rays; the
`anatomy-clean-*` maps replace their missing color with opaque anatomy white
and invalid normal texels with neutral (0.5, 0.5, 1.0). The material helper
`apply_anatomy_material.py` attaches both maps to the original imported body.
`baked-neutral.png` and `baked-pose.png` demonstrate that the albedo and
normal detail follow a 65-degree upper-arm pose without detached muscle
meshes. Full exercise IK sequences remain subject to the exercise agents'
visual QA.

`bake_exercise_colors.py` specifies the named muscle groups for Front Squat,
Assault Bike, and Elliptical and bakes one atlas per exercise. The final
opaque white/violet atlas cleanup is in `clean_exercise_atlases.py`. These
files are derived from the two CC0 source GLBs above.

The prototype uses white materials and violet quadriceps, and hides named
facial muscle meshes. Neutral and arm-pose renders are
`rigged-muscles-neutral.png` and `rigged-muscles-arms.png`. These are visual
feasibility checks, not approved exercise art. Further work must verify
joint deformation and exact contact under each exercise pose, replace
facial/genital details with the app's faceless figure style, add shoes and
equipment, and check all six frames plus the loop at phone size.
