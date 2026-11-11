import bpy, sys
from pathlib import Path
root = Path(__file__).resolve().parent
sys.path.insert(0, str(root))
from apply_anatomy_material import apply_anatomy_material
from style_human import apply_style
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'human-base-rigged.glb'))
body=bpy.data.objects['Avery | anatomical body']
arm=bpy.data.objects['Avery | anatomical body.rig']
apply_anatomy_material(body,exercise='front_squat')
art=apply_style(arm,body)
assert art['head'].parent_bone == 'head'
assert art['shoes']['l'].parent_bone == 'foot_l'
assert art['shoes']['r'].parent_bone == 'foot_r'
assert sum(p.material_index==1 for p in body.data.polygons)>500
arm.rotation_mode='XYZ'
arm.rotation_euler.z=1.57
bpy.context.view_layer.update()
print('BUNDLE_SMOKE_PASS',len(body.data.vertices),len(body.data.polygons))
