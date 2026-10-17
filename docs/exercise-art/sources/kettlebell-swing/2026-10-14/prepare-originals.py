from pathlib import Path
from PIL import Image
import json,hashlib,shutil,numpy as np
from collections import deque

root=Path(__file__).resolve().parent
old=Path('C:/Users/myles/Documents/Codex/2026-09-29/ok-continue-on-with-the-doing/work/kettlebell-swing-production-review')
names=[('1-master.png','master-prompt.txt'),('2-hike-candidate.png','2-hike-prompt.txt'),('3-mid-candidate.png','3-mid-prompt.txt')]
rows=[]
for name,prompt in names:
    for filename in [name,prompt]:shutil.copy2(old/filename,root/filename)
    image=Image.open(root/name).convert('RGB')
    assert image.size==(1536,1024)
    a=np.asarray(image).astype(float)
    chroma=np.clip((a[:,:,2]-np.minimum(a[:,:,0],a[:,:,1])-6)/22,0,1)
    coloured=(chroma>.7)&(a.mean(axis=2)>110)
    labels=np.zeros(coloured.shape,np.int32)
    comps=[]
    for sy,sx in zip(*np.where(coloured)):
        if labels[sy,sx]:continue
        k=len(comps)+1;q=deque([(sy,sx)]);labels[sy,sx]=k;points=[]
        while q:
            y,x=q.popleft();points.append((x,y))
            for ny,nx in [(y-1,x),(y+1,x),(y,x-1),(y,x+1)]:
                if 0<=ny<1024 and 0<=nx<1536 and coloured[ny,nx] and labels[ny,nx]==0:
                    labels[ny,nx]=k;q.append((ny,nx))
        if points:
            xs,ys=zip(*points)
            comps.append({'label':k,'pixels':len(points),'bbox':list(map(int,[min(xs),min(ys),max(xs)+1,max(ys)+1]))})
    rows.append({'name':name,'originalPath':str(old/name),'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest(),'dimensions':[1536,1024],'prompt':prompt,'promptSha256':hashlib.sha256((root/prompt).read_bytes()).hexdigest(),'newGeneration':False,'components':[c for c in comps if c['pixels']>100]})
(root/'retained-original-provenance.json').write_text(json.dumps(rows,indent=2)+'\n')
labels=['Hike','Drive','Float','Brace','Return','Reset']
cues=['Hinge back; guide bell between your legs.','Drive through your feet and extend hips.','Let the bell float to chest height.','Brace your abs without leaning back.','Let the bell fall; keep arms relaxed.','Hinge back as bell passes your legs.']
beats=[{'t':t,'label':label,'cue':cue,'image':f'/form-frames/kettlebell-swing/{n}.webp','sourcePose':pose} for n,(t,label,cue,pose) in enumerate(zip([0,.5,1,1,.5,0],labels,cues,[2,3,1,1,3,2]),1)]
assert all(len(b['cue'].split())<=7 for b in beats)
(root/'draft-beats.json').write_text(json.dumps(beats,indent=2)+'\n')
print(json.dumps(rows,indent=2))
