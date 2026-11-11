# Pose-locked anatomical art source

Front Squat, Assault Bike, and Elliptical share this 1.68 m, 53-bone Blender figure. Import
`human-base-rigged.glb`, then apply the baked anatomy material and visual finish
at the neutral rest pose, before moving the armature or creating IK controls:

```python
from apply_anatomy_material import apply_anatomy_material
from style_human import apply_style

body = bpy.data.objects['Avery | anatomical body']
arm = bpy.data.objects['Avery | anatomical body.rig']
apply_anatomy_material(body, exercise='front_squat')
style = apply_style(arm, body)
```

Use `exercise='assault_bike'` or `'elliptical'` for the other color maps. The
material helper selects the matching `*-modesty-contour-color-1024.png` atlas.
Assault Bike and Elliptical use `anatomy-modesty-normal-1024.png` at normal
strength 0.12; Front Squat uses the cleaned
`front_squat-clean-normal-1024.png` at 0.35, plus color-driven emission 0.30
in `front_squat_scene.py`. The style helper
trims source face/toes, attaches a featureless head and CC0 laced trainers to
their bones, and shades an opaque fitted pelvis region directly on the coherent
body mesh with a restrained 0.22 fabric emission lift. Its material slot must
be preserved if scene code later replaces other body materials. Avoid the
separately rigged 157 muscle meshes:
they tear under full multi-bone IK. The baked color/normal maps convey the
anatomical detail while the original body stays contiguous.

The original rig and derived atlas originate from CC0 MakeHuman models:
https://www.innerscene.com/tools/library/3d-parts/human-base-mesh-with-editable-53-bone-rig-8e7c8ab1
https://www.innerscene.com/tools/library/3d-parts/full-body-muscular-system-superficial-layer-8e9b43f6

The sneaker pair is CC0:
https://grab3d.com/models/props/sneaker/

This is the source for the approved 2026-10-28 pose-locked loops. Any newly
rendered frames still require per-frame form, contact, muscle-map, and 6→1
loop review before release.

Scene entrypoints resolve assets relative to this directory:

```bash
blender -b -t 4 --python front_squat_scene.py -- 0.0 --out ./front-squat-stand.png
blender -b -t 4 --python assault_bike_scene.py -- --preview360
blender -b -t 4 --python elliptical_scene.py -- --preview360
```

`front_squat_scene.py` renders one specified depth per call; the other two
scene scripts render fixed six-phase loops by default. Run those in a copy of
this source directory if generated frames should be kept separate from source
files. Front Squat uses an intentional crossed-arm rack with the bar on the
anterior deltoids. Its six depths are `[0, .28, .65, 1, .65, .28]`, returning
to standing; `styled-shelf-mask.json` fixes the same shoulder support vertices
throughout. Its default render is Eevee, 64 samples, 1024px, normal strength
0.35 and atlas-color emission strength 0.30. `--transparent` enables the
frame-4 card render. `SHA256SUMS` records the packaged inputs.
