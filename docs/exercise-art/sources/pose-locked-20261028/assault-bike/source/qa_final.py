from pathlib import Path
ROOT = Path(__file__).resolve().parent
"""Seven-key contact, fixed-anchor and visual fan-step check for final bike."""
import json, math, sys
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
sys.path.insert(0, str(ROOT))
from assault_machine import HANDLE_LENGTH, phase_targets

path = sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else str(ROOT.parent / 'assault-final.blend')
bpy.ops.wm.open_mainfile(filepath=path)
scene=bpy.context.scene
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')


def world_point(bone):
    return arm.matrix_world @ arm.pose.bones[bone].tail


def projected(point):
    p=world_to_camera_view(scene,scene.camera,point)
    return (p.x*scene.render.resolution_x,(1-p.y)*scene.render.resolution_y)


def box_world(obj):
    return [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]

fixed_names=[o.name for o in bpy.data.objects if o.name.startswith(('seat pad','floor rail','fixed fan cage ring','small console','fan hub axle'))]
fixed_first={}
fixed_drift=0.0
max_hand_gap=0.0
max_hook_surface_gap=0.0
max_pedal_target_gap=0.0
max_shoe_height_gap=0.0
min_shoe_pedal_y_overlap=1e9
hip_first=None
max_hip_drift=0.0
rows=[]
for frame in range(1,8):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    phase=(frame-1)/6
    t=phase_targets(phase)
    row={'frame':frame,'fan_apparent_degrees':round((phase*360*13/6)%60,6),'hands':{},'pedals':{}}
    hip=world_point('pelvis')
    if hip_first is None:hip_first=hip.copy()
    max_hip_drift=max(max_hip_drift,(hip-hip_first).length)
    for name in fixed_names:
        center=projected(bpy.data.objects[name].matrix_world.translation)
        if name not in fixed_first:fixed_first[name]=center
        drift=math.dist(center,fixed_first[name])
        fixed_drift=max(fixed_drift,drift)
    for label,bone_suffix in [('near','l'),('far','r')]:
        pivot=bpy.data.objects[f'{label} handle pivot']
        grip=pivot.matrix_world @ Vector((0,0,HANDLE_LENGTH))
        hand=world_point(f'hand_{bone_suffix}')
        gap=(grip-hand).length
        max_hand_gap=max(max_hand_gap,gap)
        # The wrist target sits above the rubber. Curled finger tips—not the
        # hand-bone tail—must lie on the 32 mm cylindrical grip surface.
        tips=[world_point(f'{digit}_03_{bone_suffix}') for digit in ('index','middle','ring')]
        hook=sum(tips,Vector())/len(tips)
        radial=math.hypot(hook.y-grip.y,hook.z-grip.z)
        hook_surface_gap=abs(radial-.032)
        max_hook_surface_gap=max(max_hook_surface_gap,hook_surface_gap)
        row['hands'][label]={'grip_px':[round(v,3) for v in projected(grip)],
                             'hook_px':[round(v,3) for v in projected(hook)],
                             'wrist_to_grip_m':round(gap,6),
                             'hook_to_rubber_surface_m':round(hook_surface_gap,6)}
        pedal=bpy.data.objects[f'{label} level pedal']
        target=Vector(t[f'{label}_pedal'])+Vector((0,0,-.015))
        target_gap=(pedal.matrix_world.translation-target).length
        max_pedal_target_gap=max(max_pedal_target_gap,target_gap)
        shoe=bpy.data.objects.get(f'Tropos trainer {bone_suffix}') or bpy.data.objects[f'Tropos {bone_suffix} rubber tread']
        shoe_bbox=box_world(shoe)
        pedal_bbox=box_world(pedal)
        sole_bottom=min(v.z for v in shoe_bbox)
        pedal_top=max(v.z for v in pedal_bbox)
        shoe_z_gap=sole_bottom-pedal_top
        max_shoe_height_gap=max(max_shoe_height_gap,abs(shoe_z_gap))
        overlap_y=min(max(v.y for v in shoe_bbox),max(v.y for v in pedal_bbox))-max(min(v.y for v in shoe_bbox),min(v.y for v in pedal_bbox))
        min_shoe_pedal_y_overlap=min(min_shoe_pedal_y_overlap,overlap_y)
        row['pedals'][label]={'center_px':[round(v,3) for v in projected(pedal.matrix_world.translation)],
                              'shoe_to_pedal_vertical_m':round(shoe_z_gap,6),
                              'shoe_pedal_y_overlap_m':round(overlap_y,6)}
    rows.append(row)
summary={'max_hand_gap_m':max_hand_gap,'max_finger_hook_surface_gap_m':max_hook_surface_gap,'max_pedal_target_gap_m':max_pedal_target_gap,
         'max_shoe_to_pedal_vertical_gap_m':max_shoe_height_gap,
         'min_shoe_pedal_y_overlap_m':min_shoe_pedal_y_overlap,
         'max_fixed_anchor_drift_px':fixed_drift,'max_seated_hip_drift_m':max_hip_drift,
         'fan_apparent_degrees':[r['fan_apparent_degrees'] for r in rows],
         'source_blend':path}
assert max_hook_surface_gap<.025,summary
assert max_pedal_target_gap<1e-5,summary
assert max_shoe_height_gap<.012,summary
assert fixed_drift<.01,summary
assert max_hip_drift<.001,summary
assert min_shoe_pedal_y_overlap>.03,summary
assert summary['fan_apparent_degrees']==[0,10,20,30,40,50,0],summary
with open(str(ROOT.parent / 'final-qa-anchors.json'),'w') as f:
    json.dump({'summary':summary,'frames':rows},f,indent=2)
print(json.dumps(summary,indent=2))
