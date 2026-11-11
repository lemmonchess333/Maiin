"""Numerical loop and machine-contact audit for elliptical_release.py."""
import json,math,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from elliptical_machine import targets

def maxdiff(a,b):
    return max(abs(x-y) for x,y in zip(a,b))

first=targets(0)
end=targets(1)
closure=max(maxdiff(first[s][key],end[s][key]) for s in ('near','far') for key in ('pedal','shoe_sole','hand','crank_pin'))
phases=[targets(i/6) for i in range(6)]
unique=len({tuple(round(v,4) for v in row['near']['pedal']+row['far']['pedal']) for row in phases})
oppose=max(maxdiff(targets(t)['near'][key][::2],targets((t+.5)%1)['far'][key][::2])
    for t in (i/24 for i in range(24)) for key in ('pedal','hand','crank_pin'))
links=[];sole_gaps=[]
for i in range(72):
    row=targets(i/72)
    for side in ('near','far'):
        p=row[side]['pedal'];c=row[side]['crank_pin']
        links.append(math.hypot(p[0]-.15-c[0],p[2]-c[2]))
        sole_gaps.append(row[side]['shoe_sole'][2]-(p[2]+.024))
# One-sided finite-difference velocities must agree at phase 0/1.
eps=1e-5
velocity_seam=max(maxdiff(
    tuple((first[s][key][j]-targets(1-eps)[s][key][j])/eps for j in (0,2)),
    tuple((targets(eps)[s][key][j]-first[s][key][j])/eps for j in (0,2)))
    for s in ('near','far') for key in ('pedal','hand'))
result={'sixUniquePedalPhases':unique==6,'phase0To1MaxMetres':closure,
        'oppositeSideHalfCycleMaxMetres':oppose,
        'rearDriveLinkMinMetres':min(links),'rearDriveLinkMaxMetres':max(links),
        'soleToPadTopMinMetres':min(sole_gaps),'soleToPadTopMaxMetres':max(sole_gaps),
        'velocitySeamMaxMetresPerCycle':velocity_seam}
assert result['sixUniquePedalPhases']
assert closure<1e-10 and oppose<1e-10
assert max(abs(v-.6) for v in links)<1e-10
assert all(abs(v-.001)<1e-10 for v in sole_gaps)
assert velocity_seam<1e-3
(ROOT/'cycle-qa.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
