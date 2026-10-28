import sys, json, math
import bpy

sys.path.insert(0,'/tmp/elliptical-final')
from elliptical_machine import build_machine, pose_machine, targets

bpy.ops.wm.read_factory_settings(use_empty=True)
moving=build_machine()
fixed={o.name:tuple(round(c,8) for row in o.matrix_world for c in row)
       for o in bpy.data.objects if o.name.startswith('fixed ')}
rows=[]
for frame in range(6):
    phase=frame/6
    p=pose_machine(moving,phase)
    bpy.context.view_layer.update()
    for name,base in fixed.items():
        obj=bpy.data.objects[name]
        current=tuple(round(c,8) for row in obj.matrix_world for c in row)
        assert current==base,(frame,name)
    for side,parts in moving.items():
        pedal,pad,heel,crank,rear,front,handle,grip,pivot=parts
        x,y,z=p[side]['pedal']
        cx,cy,cz=p[side]['crank_pin']
        assert abs(math.dist((cx,cy,cz),(x-0.15,y,z))-0.60)<1e-8
        assert abs(pad.location.z+pad.dimensions.z/2-p[side]['shoe_sole'][2])<0.0011
        assert abs(grip.location.x-p[side]['hand'][0])<1e-6
        assert abs(grip.location.y-p[side]['hand'][1])<1e-6
    rows.append({'frame':frame+1,'phase':phase,
        'nearFoot':[round(v,4) for v in p['near']['shoe_sole']],
        'farFoot':[round(v,4) for v in p['far']['shoe_sole']],
        'nearHand':[round(v,4) for v in p['near']['hand']],
        'farHand':[round(v,4) for v in p['far']['hand']]})
assert len({tuple(r['nearFoot'])+tuple(r['farFoot']) for r in rows})==6
assert rows[0]['nearFoot'][0]==rows[3]['farFoot'][0]
assert rows[0]['farFoot'][0]==rows[3]['nearFoot'][0]
assert rows[0]['nearHand'][0]==rows[3]['farHand'][0]
assert rows[0]['farHand'][0]==rows[3]['nearHand'][0]
json.dump({'fixedObjects':len(fixed),'fixedTransformDrift':0,
           'sixDistinctFootPhases':True,'shoePadGapMetres':0.001,
           'opposedHalfCycle':True,'rows':rows},
          open('/tmp/elliptical-final/kinematic-audit.json','w'),indent=2)
print('KINEMATIC AUDIT PASSED',len(fixed),'fixed objects',len(rows),'phases')
