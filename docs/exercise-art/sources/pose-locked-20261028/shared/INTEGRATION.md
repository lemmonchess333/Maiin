# Tropos pose-locked anatomy integration

Use Blender 4.3.2 or later. The original coherent body and its 53-bone armature
come from `human-base-rigged.glb`. The separately weighted muscle meshes tear
under full-body IK and are only used to bake the atlases.

Import the neutral rig before rotating or posing it. Apply the anatomy atlas
first, then the visual style; the style appends an opaque pelvis material slot
to the same body mesh and adds a faceless head plus CC0 trainers bound to the
head and foot bones.

```python
from pathlib import Path
import sys
import bpy

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from apply_anatomy_material import apply_anatomy_material
from style_human import apply_style

bpy.ops.import_scene.gltf(filepath=str(ROOT / 'human-base-rigged.glb'))
body = bpy.data.objects['Avery | anatomical body']
arm = bpy.data.objects['Avery | anatomical body.rig']
apply_anatomy_material(body, exercise='front_squat')
style = apply_style(arm, body)
```

Use `exercise='assault_bike'` or `'elliptical'` for those atlases. The material
helper selects each exercise's `*-modesty-contour-color-1024.png`. Front Squat
uses `front_squat-clean-normal-1024.png` at strength 0.35; the cardio exercises
use `anatomy-modesty-normal-1024.png` at strength 0.12. The Front Squat scene
also connects its atlas color to the material's emission input at strength
0.30 to soften raised-arm shadow. Keep the pelvis material index if scene code
later replaces other body materials.

Render two opposite phases at phone size before all six. Confirm equipment
contact, fixed/linked foot positions, shoulder and knee form, muscle tint,
head/shoe attachment, and the 6→1 loop. The approved scene scripts and fixed
machine geometry are in the sibling exercise source directories. The CC0
asset licenses, download URLs, and hashes are recorded in `PROVENANCE.md`;
atlas regeneration sources are in `../atlas-source/`.
