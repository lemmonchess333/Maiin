import bpy
import math
import sys
from pathlib import Path
from mathutils import Matrix, Vector
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from front_rack_shelf import add_front_rack_shelf
from apply_anatomy_material import apply_anatomy_material
from style_human import apply_style

depth = float(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else 0.0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'human-base-rigged.glb'))
body = next(o for o in bpy.data.objects if o.type == 'MESH' and 'body' in o.name)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for obj in list(bpy.data.objects):
    if obj not in (body, arm):
        bpy.data.objects.remove(obj, do_unlink=True)
normal_strength=float(sys.argv[sys.argv.index('--normal')+1]) if '--normal' in sys.argv else .35
normal_path=sys.argv[sys.argv.index('--normal-path')+1] if '--normal-path' in sys.argv else None
anatomy_mat=apply_anatomy_material(body, exercise='front_squat',
                                   normal_path=normal_path,
                                   normal_strength=normal_strength)
emission=float(sys.argv[sys.argv.index('--emission')+1]) if '--emission' in sys.argv else .30
if emission:
    nodes=anatomy_mat.node_tree.nodes
    links=anatomy_mat.node_tree.links
    shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    albedo=next(n for n in nodes if n.type=='TEX_IMAGE' and n.image and 'contour-color' in n.image.name)
    shader.inputs['Emission Strength'].default_value=emission
    links.new(albedo.outputs['Color'],shader.inputs['Emission Color'])
style_parts=apply_style(arm, body)

def material(name, color, roughness=.65, metallic=0):
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Roughness'].default_value=roughness
    bsdf.inputs['Metallic'].default_value=metallic
    return mat

gear=material('black steel',(.11,.12,.14),.35,.7)
edge=material('steel edges',(.28,.29,.32),.3,.75)

def target(name, loc):
    obj=bpy.data.objects.new(name,None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location=loc
    obj.empty_display_type='SPHERE'
    obj.empty_display_size=.03
    obj.hide_render=True
    return obj

def ik(bone_name, end, pole, chain=2, pole_angle=0):
    p=arm.pose.bones[bone_name]
    p.rotation_mode='QUATERNION'
    t=target(bone_name+' target',end)
    po=target(bone_name+' pole',pole)
    c=p.constraints.new('IK')
    c.target=t
    c.pole_target=po
    c.pole_angle=pole_angle
    c.chain_count=chain
    c.use_stretch=False
    return c

# Preserve exactly fixed sole contacts as pelvis moves back and down.
root=arm.pose.bones['Root']
root.location=(0,.09*depth,-.50*depth)

leg_iks={}
for side, x in [('l',.19),('r',-.19)]:
    leg_iks[side]=ik('calf_'+side, (x,-.07,.075), (x,-.95,.55),
                      pole_angle=math.radians(-120 if side=='l' else -60))

if '--probe-legs' in sys.argv:
    for side in ('l','r'):
        for deg in range(-180,181,15):
            leg_iks[side].pole_angle=math.radians(deg)
            bpy.context.view_layer.update()
            b=arm.pose.bones['thigh_'+side]
            print('PROBE-LEG',side,deg,tuple(round(v,3) for v in (arm.matrix_world @ b.tail)))
        leg_iks[side].pole_angle=0
    sys.exit(0)

for side in ('l','r'):
    foot=arm.pose.bones['foot_'+side]
    neutral=target('level foot orientation '+side,(0,0,0))
    neutral.rotation_euler=(arm.matrix_world @ arm.data.bones['foot_'+side].matrix_local).to_euler()
    c=foot.constraints.new('COPY_ROTATION')
    c.target=neutral
    c.owner_space='WORLD'
    c.target_space='WORLD'
    c.mix_mode='REPLACE'

# Roll the clavicles upward and forward into a front-deltoid shelf.
elevation=float(sys.argv[sys.argv.index('--elev')+1]) if '--elev' in sys.argv else .10
protraction=float(sys.argv[sys.argv.index('--protract')+1]) if '--protract' in sys.argv else .12
bpy.context.view_layer.update()
for side, sign in [('l',-1),('r',1)]:
    clav=arm.pose.bones['clavicle_'+side]
    head=clav.head.copy()
    clav.matrix=(Matrix.Translation(head) @ Matrix.Rotation(sign*protraction,4,'Z')
                 @ Matrix.Rotation(sign*elevation,4,'Y')
                 @ Matrix.Translation(-head) @ clav.matrix)
    bpy.context.view_layer.update()

# The shaft is carried on the deltoid shelf over the midfoot.
bar_y=-.18+.09*depth
bar_z=1.46-.50*depth
arm_iks={}
wrist_cross=float(sys.argv[sys.argv.index('--wrist')+1]) if '--wrist' in sys.argv else .015
for side, x, pole_angle in [('l',wrist_cross,-55),('r',-wrist_cross,-125)]:
    arm_iks[side]=ik('lowerarm_'+side, (x,bar_y-.025,bar_z+.026),
       (x,-.70+.09*depth,bar_z-.01), pole_angle=math.radians(pole_angle))

if '--probe' in sys.argv:
    for side in ('l','r'):
        for deg in range(-180,181,30):
            arm_iks[side].pole_angle=math.radians(deg)
            bpy.context.view_layer.update()
            b=arm.pose.bones['upperarm_'+side]
            print('PROBE',side,deg,tuple(round(v,3) for v in (arm.matrix_world @ b.tail)))
        arm_iks[side].pole_angle=0
    sys.exit(0)

bpy.context.view_layer.update()

# Cross-arm grip: fingertips angle down to the shaft over the opposite delt.
for side, sign in [('l',-1),('r',1)]:
    hand=arm.pose.bones['hand_'+side]
    wrist=hand.head.copy()
    fingertip=arm.pose.bones['middle_03_'+side].tail.copy()
    direction=(fingertip-wrist).normalized()
    desired=Vector((sign*.16,.03,-.027)).normalized()
    rotation=direction.rotation_difference(desired)
    hand.matrix=(Matrix.Translation(wrist) @ rotation.to_matrix().to_4x4()
                 @ Matrix.Translation(-wrist) @ hand.matrix)
    bpy.context.view_layer.update()

shelf_lift=float(sys.argv[sys.argv.index('--shelf')+1]) if '--shelf' in sys.argv else .010
add_front_rack_shelf(body,bar_y,bar_z,lift=shelf_lift,
                     mask_path=ROOT/'styled-shelf-mask.json',
                     write_mask='--write-mask' in sys.argv)
subdivision=int(sys.argv[sys.argv.index('--subsurf')+1]) if '--subsurf' in sys.argv else 0
if subdivision:
    skin_smooth=body.modifiers.new('Continuous anatomical skin', 'SUBSURF')
    skin_smooth.levels=subdivision
    skin_smooth.render_levels=subdivision

def segment(name,a,b,r,mat,vertices=40):
    a,b=Vector(a),Vector(b)
    d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object
    o.name=name
    o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    o.data.materials.append(mat)
    bevel=o.modifiers.new('bevel','BEVEL');bevel.width=.004;bevel.segments=2
    bpy.ops.object.shade_smooth()
    return o

segment('barbell shaft',(-.92,bar_y,bar_z),(.92,bar_y,bar_z),.016,edge)
for sign in (-1,1):
    x=sign*.73
    segment('barbell plate',(x-.034,bar_y,bar_z),(x+.034,bar_y,bar_z),.16,gear)
    segment('plate hub',(x-.06,bar_y,bar_z),(x+.06,bar_y,bar_z),.036,edge)
    segment('outer collar',(sign*.8,bar_y,bar_z),(sign*.84,bar_y,bar_z),.027,edge)

world=bpy.data.worlds.new('near-black')
bpy.context.scene.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.006,.006,.009,1)
for name,loc,power,size in [('key',(2,-3,4),850,3),('fill',(-3,-1,2),500,3),('rim',(1,2,2.5),650,2)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size
bpy.ops.object.camera_add(location=(4.1,-2.9,1.55) if '--side' in sys.argv else (2.7,-4.5,1.55))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.82))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=2.15
bpy.context.scene.camera=cam
scene=bpy.context.scene
engine=sys.argv[sys.argv.index('--engine')+1] if '--engine' in sys.argv else 'BLENDER_EEVEE_NEXT'
size=int(sys.argv[sys.argv.index('--size')+1]) if '--size' in sys.argv else 1024
scene.render.engine=engine
if engine=='CYCLES':
    scene.cycles.samples=int(sys.argv[sys.argv.index('--samples')+1]) if '--samples' in sys.argv else 32
    scene.view_layers[0].cycles.use_denoising=False
else:
    scene.eevee.taa_render_samples=int(sys.argv[sys.argv.index('--samples')+1]) if '--samples' in sys.argv else 64
scene.render.resolution_x=size;scene.render.resolution_y=size
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent='--transparent' in sys.argv
scene.render.filepath=(sys.argv[sys.argv.index('--out')+1] if '--out' in sys.argv else
    str(ROOT/f'front-squat-preview-{depth:.2f}{"-side" if "--side" in sys.argv else ""}.png'))
bpy.ops.render.render(write_still=True)
for name in ('Root','pelvis','thigh_l','calf_l','thigh_r','calf_r','upperarm_l','lowerarm_l','upperarm_r','lowerarm_r'):
    b=arm.pose.bones[name]
    print('POSE',name,tuple(round(v,3) for v in (arm.matrix_world @ b.head)),tuple(round(v,3) for v in (arm.matrix_world @ b.tail)))
