"""Blender 4.3+: bake CC0 muscle detail to the shared fascia/body UV.

Usage: blender -b -t 4 --python 01_bake.py -- ASSET_DIR OUT_DIR [SIZE]
"""

import bpy
import sys
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:]
asset_dir = Path(args[0]).resolve()
out_dir = Path(args[1]).resolve()
size = int(args[2]) if len(args) > 2 else 1024
out_dir.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(asset_dir / 'human-base-rigged.glb'))
body = bpy.data.objects['Avery | anatomical body']
armature = bpy.data.objects['Avery | anatomical body.rig']
bpy.ops.import_scene.gltf(filepath=str(asset_dir / 'full-body-muscular-system.glb'))
fascia = bpy.data.objects['MakeHuman CC0 | continuous fascial reference']

assert len(body.data.vertices) == len(fascia.data.vertices) == 70985
assert len(body.data.loops) == len(fascia.data.loops) == 321072
body_uv = body.data.uv_layers.active.data
fascia_uv = fascia.data.uv_layers.active.data
assert all(tuple(a.uv) == tuple(b.uv) for a, b in zip(body_uv, fascia_uv)), 'Body/fascia UV mismatch'

# Reconstruct the original approved bake staging exactly. Although the final
# render uses only the coherent original body, the neutral source bake was
# taken after body weights were copied to the matching fascia UV topology and
# transferred by nearest surface to each named muscle mesh. The evaluated
# armature modifiers alter neutral source positions enough to change bake
# coverage; omitting this stage does not reproduce the approved raw maps.
mapping = {}
for source_loop, target_loop in zip(body.data.loops, fascia.data.loops):
    source = source_loop.vertex_index
    target = target_loop.vertex_index
    previous = mapping.get(target)
    assert previous is None or previous == source, 'Conflicting UV-loop vertex mapping'
    mapping[target] = source
assert len(mapping) == len(fascia.data.vertices)
for group in body.vertex_groups:
    fascia.vertex_groups.new(name=group.name)
for target, source in mapping.items():
    for weight in body.data.vertices[source].groups:
        fascia.vertex_groups[weight.group].add([target], weight.weight, 'REPLACE')

staging_muscles = [obj for obj in bpy.data.objects
                   if obj.type == 'MESH' and obj not in (body,fascia)
                   and obj.name != 'Icosphere']
for index, obj in enumerate(staging_muscles):
    for group in body.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    transfer = obj.modifiers.new('Fascia nearest-surface weights', 'DATA_TRANSFER')
    transfer.object = fascia
    transfer.use_vert_data = True
    transfer.data_types_verts = {'VGROUP_WEIGHTS'}
    transfer.vert_mapping = 'POLYINTERP_NEAREST'
    transfer.layers_vgroup_select_src = 'ALL'
    transfer.layers_vgroup_select_dst = 'NAME'
    transfer.mix_mode = 'REPLACE'
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    arm_modifier = obj.modifiers.new('Armature', 'ARMATURE')
    arm_modifier.object = armature
    if index % 30 == 0:
        print('STAGING_WEIGHTS', index, len(staging_muscles), flush=True)
fascia_modifier = fascia.modifiers.new('Armature', 'ARMATURE')
fascia_modifier.object = armature
print('STAGING_COMPLETE', len(mapping), len(staging_muscles), flush=True)

facial_words = ('zygomatic', 'orbicularis', 'frontalis', 'masseter', 'temporalis')
muscles = [obj for obj in bpy.data.objects
           if obj.type == 'MESH' and obj not in (body, fascia)
           and not any(word in obj.name.lower() for word in facial_words)]
assert len(muscles) == 137, f'Expected 137 visible muscle/tendon objects; got {len(muscles)}'
for obj in muscles:
    if obj.name == 'Icosphere':
        continue  # Body GLB has an unshaded 2 m sphere; preserve as in the original neutral bake.
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
body.hide_render = True
body.hide_set(True)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 8
scene.render.bake.use_selected_to_active = True
scene.render.bake.max_ray_distance = .06
scene.render.bake.cage_extrusion = .015
scene.render.bake.margin = 8
scene.render.bake.use_pass_direct = False
scene.render.bake.use_pass_indirect = False
scene.render.bake.use_pass_color = True
scene.render.bake.normal_space = 'TANGENT'

def material(name, rgb):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb, 1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .72
    return mat

white = material('bake muscle white', (.93,.93,.94))
generic_primary = material('bake generic purple', (.42,.35,.85))
exercise_white = material('bake exercise white', (.90,.90,.90))
exercise_primary = material('bake exercise primary', (.19,.15,.82))
exercise_secondary = material('bake exercise secondary', (.52,.49,.78))

groups = {
    'front_squat': (
        ('rectus femoris', 'vastus', 'gluteus'),
        ('rectus abdominis', 'external oblique', 'longissimus', 'spinalis', 'gastrocnemius', 'soleus'),
    ),
    'assault_bike': (
        ('rectus femoris', 'vastus', 'gluteus'),
        ('pectoralis major', 'deltoid anterior', 'biceps brachii', 'gastrocnemius', 'soleus'),
    ),
    'elliptical': (
        ('rectus femoris', 'vastus', 'gluteus'),
        ('deltoid anterior', 'trapezius', 'latissimus dorsi'),
    ),
}

def assign_colors(group=None):
    for obj in muscles:
        if obj.name == 'Icosphere':
            continue  # It had no assigned material in the original bake staging scene.
        name = obj.name.lower()
        obj.data.materials.clear()
        if group is None:
            primary = any(word in name for word in ('rectus femoris', 'vastus', 'gluteus'))
            obj.data.materials.append(generic_primary if primary else white)
        else:
            primary_words, secondary_words = groups[group]
            if any(word in name for word in primary_words):
                obj.data.materials.append(exercise_primary)
            elif any(word in name for word in secondary_words):
                obj.data.materials.append(exercise_secondary)
            else:
                obj.data.materials.append(exercise_white)

def bake(kind, filename):
    mat = bpy.data.materials.new('target ' + filename)
    mat.use_nodes = True
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    mat.node_tree.nodes.active = node
    image = bpy.data.images.new(filename, width=size, height=size, alpha=False)
    image.generated_color = (.5,.5,1,1) if kind == 'NORMAL' else (0,0,0,1)
    if kind == 'NORMAL':
        image.colorspace_settings.name = 'Non-Color'
    node.image = image
    fascia.data.materials.clear()
    fascia.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in muscles:
        obj.hide_set(False)
        obj.select_set(True)
    fascia.hide_set(False)
    fascia.select_set(True)
    bpy.context.view_layer.objects.active = fascia
    print('BAKE_START', filename, len(muscles), flush=True)
    bpy.ops.object.bake(type=kind)
    path = out_dir / filename
    image.filepath_raw = str(path)
    image.file_format = 'PNG'
    image.save()
    print('BAKE_DONE', path, flush=True)

assign_colors()
bake('DIFFUSE', f'anatomy-color-{size}.png')
bake('NORMAL', f'anatomy-normal-{size}.png')
for exercise in groups:
    assign_colors(exercise)
    bake('DIFFUSE', f'{exercise}-raw-color-{size}.png')
