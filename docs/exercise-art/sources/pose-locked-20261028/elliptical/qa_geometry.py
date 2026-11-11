"""Render six mechanically linked Elliptical frames and an optional card cutout.

    blender -b -t 4 --python elliptical_release.py
    blender -b -t 4 --python elliptical_release.py -- --preview360
    blender -b -t 4 --python elliptical_release.py -- --transparent-frame4

The same machine, camera, body rig, clothing, and lighting persist for every
phase. Source assets and CC0 provenance are in source-model/ beside this file.
"""
from pathlib import Path

ROOT=Path(__file__).resolve().parent
exec((ROOT / 'render_machine.py').read_text().split('for index in range(6):')[0])
from bpy_extras.object_utils import world_to_camera_view
import json

camera.location=(3.0,-4.7,1.72)
camera.rotation_euler=(Vector((0,0,0.88))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=2.45
scene.view_layers[0].cycles.use_denoising=False
scene.render.resolution_x=360 if '--preview360' in sys.argv else 1080
scene.render.resolution_y=scene.render.resolution_x
scene.cycles.samples=24 if '--preview360' in sys.argv else 64

bpy.ops.import_scene.gltf(filepath=str(ROOT/'source-model'/'human-base-rigged.glb'))
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
body=next(o for o in bpy.data.objects if o.type=='MESH' and 'body' in o.name)
sys.path.insert(0,str(ROOT/'source-model'))
from apply_anatomy_material import apply_anatomy_material
from style_human_v2 import apply_style
apply_anatomy_material(body,exercise='elliptical')
styled=apply_style(arm,body)
for obj in list(bpy.data.objects):
    if obj.type=='MESH' and obj != body and obj.name.startswith('Icosphere'):
        bpy.data.objects.remove(obj,do_unlink=True)
styled_shorts=bpy.data.materials['Tropos opaque shorts fabric']
styled_shorts.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(0.12,0.13,0.15,1)

# The GLB faces -Y. A single rotation points it toward the +X console.
arm.rotation_mode='XYZ'
arm.rotation_euler.z=math.pi/2
arm.location=(0.055,0,0.13)
bpy.context.view_layer.update()

def target(name,point,pole=None,pole_angle=0):
    empty=bpy.data.objects.new(name+' IK target',None)
    bpy.context.scene.collection.objects.link(empty)
    empty.location=point
    empty.hide_render=True
    constraint=arm.pose.bones[name].constraints.new('IK')
    constraint.target=empty
    constraint.chain_count=2
    constraint.use_stretch=False
    if pole is not None:
        bend=bpy.data.objects.new(name+' knee pole',None)
        bpy.context.scene.collection.objects.link(bend)
        bend.location=pole
        bend.hide_render=True
        constraint.pole_target=bend
        constraint.pole_angle=pole_angle
    return empty

controls={}
for side,bone_side in (('near','r'),('far','l')):
    controls[side]={
        'ankle':target('calf_'+bone_side,(0,0,0.25),(0.3,0,0.8),
                       math.radians(-60 if bone_side=='r' else -120)),
        'wrist':target('lowerarm_'+bone_side,(0.3,0,1.3)),
        'bone_side':bone_side,
    }
    # Trainers inherit the original foot bones. Keep their soles level while
    # the ankle moves through the pedal's flat elliptical path.
    foot_name='foot_'+bone_side
    level=bpy.data.objects.new(foot_name+' level guide',None)
    bpy.context.scene.collection.objects.link(level)
    level.rotation_euler=(arm.matrix_world @ arm.data.bones[foot_name].matrix_local).to_euler()
    level.hide_render=True
    c=arm.pose.bones[foot_name].constraints.new('COPY_ROTATION')
    c.target=level
    c.target_space='WORLD'
    c.owner_space='WORLD'

# Curl the actual skin-weighted fingers and pronate the hand. This closes a
# fist around each moving tube without disconnected palm or wrist proxies.
for bone_side in ('l','r'):
    hand=arm.pose.bones['hand_'+bone_side]
    hand.rotation_mode='XYZ'
    hand.rotation_euler[0]=math.radians(-45)
    for finger in ('index','middle','ring','pinky'):
        for segment,angle in ((1,-75),(2,-85),(3,-75)):
            bone=arm.pose.bones[f'{finger}_0{segment}_{bone_side}']
            bone.rotation_mode='XYZ'
            bone.rotation_euler[0]=math.radians(angle)
    for segment,angle in ((1,50),(2,30),(3,20)):
        bone=arm.pose.bones[f'thumb_0{segment}_{bone_side}']
        bone.rotation_mode='XYZ'
        bone.rotation_euler[0]=math.radians(angle)

def pose(phase):
    machine=pose_machine(moving,phase)
    for side,rig in controls.items():
        foot=machine[side]['shoe_sole']
        hand=machine[side]['hand']
        rig['ankle'].location=(foot[0]-0.08,foot[1],foot[2]+0.07)
        rig['wrist'].location=(hand[0]-0.075,hand[1],hand[2])
        calf=arm.pose.bones['calf_'+rig['bone_side']]
        calf.constraints['IK'].pole_target.location=(foot[0]+0.35,foot[1],foot[2]+0.66)
    bpy.context.view_layer.update()
    return machine

def screen(point):
    u,v,_=world_to_camera_view(scene,camera,Vector(point))
    return [round(u*scene.render.resolution_x,2),round((1-v)*scene.render.resolution_y,2)]

def hook_center(bone_side):
    center=Vector((0,0,0))
    for finger in ('index','middle','ring','pinky'):
        center+=arm.matrix_world @ arm.pose.bones[f'{finger}_03_{bone_side}'].tail
    return center/4

import json
checks=[]
for index in range(6):
 phase=index/6
 pos=pose(phase)
 deps=bpy.context.evaluated_depsgraph_get()
 obj=body.evaluated_get(deps)
 mesh=obj.to_mesh()
 world=obj.matrix_world
 skin=[world@v.co for v in mesh.vertices]
 row={'frame':index+1,'phase':phase}
 for side,rig in controls.items():
  gx,gy,gz=pos[side]['hand']
  bar_radius=.031
  bar=[v for v in skin if gz-.095<=v.z<=gz+.07 and abs(v.x-gx)<.20 and abs(v.y-gy)<.20]
  surface=min(abs(math.hypot(v.x-gx,v.y-gy)-bar_radius) for v in bar)
  core=sum(1 for v in bar if math.hypot(v.x-gx,v.y-gy)<bar_radius)
  shoe=styled['shoes'][rig['bone_side']]
  sh=shoe.evaluated_get(deps);sm=sh.to_mesh()
  shoe_bottom=min((sh.matrix_world@v.co).z for v in sm.vertices)
  sh.to_mesh_clear()
  pad_top=pos[side]['pedal'][2]+.024
  hook=hook_center(rig['bone_side'])
  grip=Vector(pos[side]['hand'])
  print('HOOK_DELTA',index+1,side,tuple(round(v,4) for v in hook-grip),flush=True)
  row[side]={'handToGripSurfaceMetres':round(surface,4),
             'skinVerticesInsideGrip':core,
             'shoeToPadMetres':round(shoe_bottom-pad_top,4),
             'shoeBottomZ':round(shoe_bottom,4),
             'padTopZ':round(pad_top,4)}
 obj.to_mesh_clear()
 checks.append(row)
 print('CONTACT_QA',index+1,side,row[side],flush=True)
(ROOT/'geometry-qa.json').write_text(json.dumps({'frames':checks},indent=2))
