from pathlib import Path
ROOT = Path(__file__).resolve().parent
import bpy
import bmesh
import math
import sys
from mathutils import Matrix, Vector

sys.path.insert(0,str(ROOT))
from assault_machine import build_machine, phase_targets

bpy.ops.wm.read_factory_settings(use_empty=True)
build_machine()
scene=bpy.context.scene
bpy.ops.import_scene.gltf(filepath=str(ROOT / "human-base-rigged.glb"))
body=next(o for o in bpy.data.objects if o.type=="MESH" and "anatomical body" in o.name)
arm=next(o for o in bpy.data.objects if o.type=="ARMATURE")

def material(name,color,roughness=.66):
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    shader=mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value=(*color,1)
    shader.inputs["Roughness"].default_value=roughness
    return mat

sys.path.insert(0,str(ROOT))
from apply_anatomy_material import apply_anatomy_material
apply_anatomy_material(body, exercise="assault_bike")
sys.path.insert(0,str(ROOT))
from style_human_v2 import apply_style
styling=apply_style(arm, body)

def empty(name,location,size=.03):
    obj=bpy.data.objects.new(name,None)
    scene.collection.objects.link(obj)
    obj.location=location
    obj.empty_display_type="SPHERE"
    obj.empty_display_size=size
    obj.hide_render=True
    return obj

def ik(bone_name,target,pole,angle,chain=2):
    bone=arm.pose.bones[bone_name]
    bone.rotation_mode="QUATERNION"
    target_obj=empty(bone_name+" IK goal",target)
    pole_obj=empty(bone_name+" IK pole",pole)
    con=bone.constraints.new("IK")
    con.target=target_obj
    con.pole_target=pole_obj
    con.pole_angle=math.radians(angle)
    con.chain_count=chain
    con.use_stretch=False
    return target_obj,pole_obj

root=arm.pose.bones["Root"]
root.location=(0,-0.20,0.20)
root.keyframe_insert(data_path="location",frame=1)

targets={}
for side,x in (("l",.30),("r",-.30)):
    key="near" if side=="l" else "far"
    foot=phase_targets(0)[f"{key}_foot"]
    hand=phase_targets(0)[f"{key}_hand"]
    targets[f"{key}_foot"],_=ik("calf_"+side,foot,(x,-.8,.7),
                                 -120 if side=="l" else -60)
    targets[f"{key}_hand"],_=ik("hand_"+side,hand,
                                 (x*1.8,-.35,1.20),
                                 90 if side=="l" else 60,chain=3)
    # Keep the foot/sole level while the shin cycles.
    foot_bone=arm.pose.bones["foot_"+side]
    fixed=empty(f"{side} level foot orientation",(0,0,0))
    fixed.rotation_euler=(arm.matrix_world @
                          arm.data.bones["foot_"+side].matrix_local
                          ).to_euler()
    rotation=foot_bone.constraints.new("COPY_ROTATION")
    rotation.target=fixed
    rotation.target_space="WORLD"
    rotation.owner_space="WORLD"

    # Close the source model's display hands around the horizontal grips.
    for digit in ("index","middle","ring","pinky"):
        for level,angle in ((1,-75),(2,-85),(3,-75)):
            finger=arm.pose.bones[f"{digit}_0{level}_{side}"]
            finger.rotation_mode="XYZ"
            finger.rotation_euler[0]=math.radians(angle)
    for level in (1,2,3):
        thumb=arm.pose.bones[f"thumb_0{level}_{side}"]
        thumb.rotation_mode="XYZ"
        thumb.rotation_euler[0]=math.radians(50)

for frame in range(1,8):
    phase=(frame-1)/6
    scene.frame_set(frame)
    t=phase_targets(phase)
    for side in ("near","far"):
        targets[f"{side}_foot"].location=t[f"{side}_foot"]
        targets[f"{side}_foot"].keyframe_insert(data_path="location")
        targets[f"{side}_hand"].location=Vector(t[f"{side}_hand"])+Vector((0,.045*math.cos(2*math.pi*phase)*(1 if side=="near" else -1),.025))
        targets[f"{side}_hand"].keyframe_insert(data_path="location")

world=bpy.data.worlds.new("near black")
scene.world=world
world.use_nodes=True
world.node_tree.nodes["Background"].inputs["Color"].default_value=(.006,.006,.008,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value=.65
for name,location,power,size in (
    ("large front softbox",(2,-2.2,3.4),580,3.6),
    ("rear rim",(-1.8,.8,2.8),430,3.2),
    ("front fill",(1,1.3,2.3),220,3.0),
):
    bpy.ops.object.light_add(type="AREA",location=location)
    light=bpy.context.object
    light.name=name
    light.data.energy=power
    light.data.shape="DISK"
    light.data.size=size
    direction=Vector((0,-.4,.9))-light.location
    light.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()

bpy.ops.object.camera_add(location=(2.9,-0.75,1.55))
camera=bpy.context.object
camera.name="assault side camera"
direction=Vector((0,-.45,1.00))-camera.location
camera.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"
camera.data.ortho_scale=2.55
scene.camera=camera
scene.render.engine="CYCLES"
scene.cycles.samples=80
scene.view_layers[0].cycles.use_denoising=False

scene.render.resolution_x=1024
scene.render.resolution_y=1024
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.frame_end=6

for frame in range(1,7):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    for side in ("l","r"):
        for bone_name in ("pelvis","hand_"+side,"foot_"+side,"calf_"+side):
            bone=arm.pose.bones[bone_name]
            print("JOINT",frame,bone_name,
                  tuple(round(v,3) for v in arm.matrix_world @ bone.tail))
    scene.render.filepath=str(ROOT.parent / "final" / f"{frame}.png")
    bpy.ops.render.render(write_still=True)
# Transparent source for 48px cutout avoids keying halos on fan spokes.
scene.frame_set(1)
scene.render.film_transparent=True
scene.render.image_settings.color_mode="RGBA"
scene.render.filepath=str(ROOT.parent / "final" / "card-1-transparent.png")
bpy.ops.render.render(write_still=True)
scene.render.film_transparent=False
scene.render.image_settings.color_mode="RGB"
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT.parent / "assault-final.blend"))
