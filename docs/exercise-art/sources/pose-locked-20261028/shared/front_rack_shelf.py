"""Small, continuous anterior-delt shape key for a supported barbell rack."""

import bpy
import json
from pathlib import Path
from mathutils import Vector


def ramp(value, lo, hi):
    t=max(0.0,min(1.0,(value-lo)/(hi-lo)))
    return t*t*(3.0-2.0*t)


def pulse(value, outer_lo, inner_lo, inner_hi, outer_hi):
    return ramp(value,outer_lo,inner_lo)*(1-ramp(value,inner_hi,outer_hi))


def add_front_rack_shelf(body, bar_y, bar_z, lift=.010, mask_path=None,
                         write_mask=False):
    """Lift only the paired front-delt caps, feathering into the upper arms.

    Selection uses evaluated pose coordinates so the same local shape follows
    the raised clavicles in every animation frame. Neck, pecs, and hands are
    excluded by dominant bone weight.
    """
    bpy.context.view_layer.update()
    arm=body.find_armature()
    local_up={}
    for side in ('l','r'):
        name='upperarm_'+side
        deform=arm.pose.bones[name].matrix @ arm.data.bones[name].matrix_local.inverted()
        local_up[side]=deform.to_3x3().inverted() @ Vector((0,0,1))
    path=Path(mask_path) if mask_path else None
    if path and path.exists() and not write_mask:
        saved=json.loads(path.read_text())
        if saved['vertex_count']!=len(body.data.vertices):
            raise RuntimeError('Fixed front-rack shelf mask does not match mesh')
        mask={int(i):(float(w),side) for i,w,side in saved['vertices']}
    else:
        if path and not write_mask:
            raise RuntimeError(f'Missing fixed front-rack shelf mask: {path}')
        depsgraph=bpy.context.evaluated_depsgraph_get()
        evaluated=body.evaluated_get(depsgraph)
        posed=evaluated.to_mesh()
        mask={}
        for v in posed.vertices:
            source=body.data.vertices[v.index]
            if not source.groups:
                continue
            dominant=body.vertex_groups[max(source.groups,key=lambda g:g.weight).group].name
            if dominant not in ('upperarm_l','upperarm_r'):
                continue
            p=evaluated.matrix_world @ v.co
            weight=(pulse(abs(p.x),.11,.145,.205,.232)
                    * (1-ramp(abs(p.y-bar_y),.045,.09))
                    * pulse(p.z-bar_z,-.11,-.065,-.008,.015))
            if weight>.001:
                mask[v.index]=(weight, dominant[-1])
        evaluated.to_mesh_clear()
        if path:
            path.write_text(json.dumps({
                'vertex_count':len(body.data.vertices),
                'reference_depth':0,
                'vertices':[[i,round(w,8),side]
                            for i,(w,side) in sorted(mask.items())]
            },separators=(',',':')))
    body.shape_key_add(name='Unchanged body',from_mix=False)
    key=body.shape_key_add(name='Front deltoid support shelf',from_mix=False)
    for i,(w,side) in mask.items():
        key.data[i].co+=local_up[side]*lift*w
    key.value=1.0
    bpy.context.view_layer.update()
    print('RACK_SHELF_VERTICES',len(mask),'PEAK_LIFT',lift)
    return key
