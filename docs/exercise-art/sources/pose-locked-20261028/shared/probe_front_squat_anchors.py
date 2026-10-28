"""Measure the released squat rig in source and screen coordinates, no render."""

import json
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

exec(open(__file__.replace('probe_front_squat_anchors.py',
                           'front_squat_scene.py')).read().replace(
    'bpy.ops.render.render(write_still=True)',"print('ANCHOR_NO_RENDER')"))

def project(p):
    q=world_to_camera_view(scene,cam,Vector(p))
    return [round(q.x*scene.render.resolution_x,3),
            round((1-q.y)*scene.render.resolution_y,3)]

def box(points):
    x=[p[0] for p in points]
    y=[p[1] for p in points]
    return [round(min(x),3),round(min(y),3),round(max(x),3),round(max(y),3)]

bpy.context.view_layer.update()
depsgraph=bpy.context.evaluated_depsgraph_get()
shoes={}
for side in ('l','r'):
    shoe=bpy.data.objects['Tropos trainer '+side].evaluated_get(depsgraph)
    mesh=shoe.to_mesh()
    pts=[shoe.matrix_world @ v.co for v in mesh.vertices]
    zmin=min(p.z for p in pts)
    sole=[p for p in pts if p.z<=zmin+.005]
    shoes[side]={
        'world_bbox':box([[p.x,p.y] for p in sole]),
        'screen_bbox':box([project(p) for p in sole]),
        'sole_z_min':round(min(p.z for p in pts),4),
    }
    shoe.to_mesh_clear()

plates={}
plate_objects=sorted((o for o in bpy.data.objects if o.name.startswith('barbell plate')),
                     key=lambda o:o.location.x)
for side,obj in zip(('left','right'),plate_objects):
    plate=obj.evaluated_get(depsgraph)
    mesh=plate.to_mesh()
    pts=[plate.matrix_world @ v.co for v in mesh.vertices]
    plates[side]={'screen_bbox':box([project(p) for p in pts])}
    plate.to_mesh_clear()

data={
    'depth':depth,
    'mask_sha':'1e291dcce3185136fba47d385abd773ce43b7e9b3cf140300b6d496d62528a53',
    'bar_world_yz':[round(bar_y,4),round(bar_z,4)],
    'bar_screen':{'left_end':project((-.92,bar_y,bar_z)),
                  'right_end':project((.92,bar_y,bar_z))},
    'plate_centers_screen':{'left':project((-.73,bar_y,bar_z)),
                            'right':project((.73,bar_y,bar_z))},
    'plates':plates,
    'shoes':shoes,
    'hip_z':round(arm.pose.bones['thigh_l'].head.z,4),
    'knee_z':round(arm.pose.bones['thigh_l'].tail.z,4),
}
print('ANCHOR_JSON',json.dumps(data,sort_keys=True))
