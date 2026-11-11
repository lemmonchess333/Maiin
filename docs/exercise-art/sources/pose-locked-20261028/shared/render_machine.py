import sys, math
from pathlib import Path
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from elliptical_machine import build_machine, pose_machine, targets

bpy.ops.wm.read_factory_settings(use_empty=True)
moving=build_machine()

world=bpy.data.worlds.new('black exercise stage')
bpy.context.scene.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.008,0.008,0.012,1)

for name,loc,power,size in (
    ('wide key',(1.0,-2.8,3.7),760,3.8),
    ('top fill',(-1.5,-0.4,2.8),500,3.2),
    ('rear rim',(-1.2,2.0,1.8),600,2.3),
):
    bpy.ops.object.light_add(type='AREA',location=loc)
    light=bpy.context.object
    light.name=name
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size

bpy.ops.object.camera_add(location=(2.2,-4.7,1.7))
camera=bpy.context.object
direction=Vector((0.0,0.0,0.90))-camera.location
camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=2.75
bpy.context.scene.camera=camera

scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.view_layers[0].cycles.use_denoising=False
scene.render.resolution_x=640
scene.render.resolution_y=640
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'

for index in range(6):
    pose_machine(moving,index/6)
    scene.render.filepath=str(Path(__file__).resolve().parent / f'machine-{index+1}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED',index+1,targets(index/6),flush=True)
