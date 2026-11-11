"""Measure true fixed bike objects in the final 1024px camera for release."""
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assault-final.blend'))
scene=bpy.context.scene
assert scene.render.resolution_x==1024 and scene.render.resolution_y==1024
assert scene.render.resolution_percentage==100

def projected(point):
    ndc=world_to_camera_view(scene,scene.camera,Vector(point))
    return [ndc.x*1024,(1-ndc.y)*1024]

def centers_with_prefix(prefix):
    return [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(prefix)]

feet=centers_with_prefix('floor foot')
assert len(feet)==4,[(o.name,tuple(o.matrix_world.translation)) for o in feet]
near_rear=min(feet,key=lambda o:(o.matrix_world.translation-Vector((.39,.48,.045))).length)
near_front=min(feet,key=lambda o:(o.matrix_world.translation-Vector((.39,-1.50,.045))).length)
assert (near_rear.matrix_world.translation-Vector((.39,.48,.045))).length<1e-5
assert (near_front.matrix_world.translation-Vector((.39,-1.50,.045))).length<1e-5
hub=bpy.data.objects['fan hub axle']
assert (hub.matrix_world.translation-Vector((0,-1.05,.72))).length<1e-5
rings=centers_with_prefix('fixed fan cage ring')
near_outer=min(rings,key=lambda o:(o.matrix_world.translation-Vector((.285,-1.05,.72))).length)
assert (near_outer.matrix_world.translation-Vector((.285,-1.05,.72))).length<1e-5
# The torus major radius is .43m and tube radius .016m. Its outer
# top/bottom points are real fixed geometry on the near cage ring.
outer_radius=.43+.016

def bbox_corner(obj,select):
    points=[obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return select(points)

def near_rear_visible_top_corner():
    points=[near_rear.matrix_world @ Vector(corner) for corner in near_rear.bound_box]
    return max(points,key=lambda p:(round(p.z,6),round(p.x,6),-round(p.y,6)))

rows=[]
for frame in range(1,7):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    fan_center=projected(hub.matrix_world.translation)
    rear_corner=projected(near_rear_visible_top_corner())
    ring_center=near_outer.matrix_world.translation
    top=projected(ring_center+Vector((0,0,outer_radius)))
    bottom=projected(ring_center-Vector((0,0,outer_radius)))
    rear_foot_center=projected(near_rear.matrix_world.translation)
    front_foot_center=projected(near_front.matrix_world.translation)
    rows.append({
        'frame':frame,
        'fixedAnchorsPx':{
            'fanHubCenter':[round(v,3) for v in fan_center],
            'nearRearFloorFootVisibleTopCorner':[round(v,3) for v in rear_corner],
        },
        'invariantDimensionsPx':{
            'nearFanCageOuterVerticalDiameter':round(math.dist(top,bottom),3),
            'nearFloorFootCenterSpan':round(math.dist(rear_foot_center,front_foot_center),3),
        },
    })
anchor_names=list(rows[0]['fixedAnchorsPx'])
dimension_names=list(rows[0]['invariantDimensionsPx'])
max_anchor_drift=max(math.dist(row['fixedAnchorsPx'][name],rows[0]['fixedAnchorsPx'][name])
                     for row in rows for name in anchor_names)
max_dimension_drift_fraction=max(abs(row['invariantDimensionsPx'][name]-rows[0]['invariantDimensionsPx'][name])/
                                rows[0]['invariantDimensionsPx'][name]
                                for row in rows for name in dimension_names)
assert max_anchor_drift<=1.0,max_anchor_drift
assert max_dimension_drift_fraction<=.01,max_dimension_drift_fraction
result={
    'canvasPx':[1024,1024],
    'definition':{
        'fanHubCenter':'Center of the fixed fan hub axle object',
        'nearRearFloorFootVisibleTopCorner':'Top, camera-near, fan-facing corner of the fixed rear-side floor foot box',
        'nearFanCageOuterVerticalDiameter':'Projected distance between top and bottom of the fixed near ring (0.43m major + 0.016m tube radius)',
        'nearFloorFootCenterSpan':'Projected distance between the fixed near-side front and rear floor foot centers',
    },
    'summary':{
        'maxFixedAnchorDriftPx':round(max_anchor_drift,6),
        'maxInvariantDimensionDriftFraction':round(max_dimension_drift_fraction,9),
        'anchorLimitPx':1.0,
        'dimensionLimitFraction':.01,
    },
    'frames':rows,
}
out=ROOT/'final-release-measurements.json'
out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
