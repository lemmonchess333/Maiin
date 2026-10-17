from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np, json
from collections import deque
r = Path(__file__).resolve().parent
names=['master-brace-original.png','roll-original.png','reach-original.png']
rows=[]
for n,name in enumerate(names,1):
    im=Image.open(r/name).convert('RGB');a=np.asarray(im).astype(float)
    c=np.clip((a[:,:,2]-np.minimum(a[:,:,0],a[:,:,1])-6)/22,0,1)
    strong=(c>.7)&(a.mean(axis=2)>110)
    labels=np.zeros(strong.shape,np.int32);k=0;comps=[]
    for sy,sx in zip(*np.where(strong)):
        if labels[sy,sx]:continue
        k+=1;q=deque([(sy,sx)]);labels[sy,sx]=k;coords=[]
        while q:
            y,x=q.popleft();coords.append((x,y))
            for ny,nx in [(y-1,x),(y+1,x),(y,x-1),(y,x+1)]:
                if 0<=ny<im.height and 0<=nx<im.width and strong[ny,nx] and not labels[ny,nx]:
                    labels[ny,nx]=k;q.append((ny,nx))
        if len(coords)>=70:
            z=np.array(coords);comps.append({'id':k,'pixels':len(coords),'bbox':[int(z[:,0].min()),int(z[:,1].min()),int(z[:,0].max()+1),int(z[:,1].max()+1)],'centre':z.mean(axis=0).round(1).tolist()})
    np.save(r/f'{n}-source-colour-labels.npy',labels)
    overlay=im.copy();d=ImageDraw.Draw(overlay)
    for item in comps:
        x,y=item['centre'];s=str(item['id']);d.rectangle([x-2,y-2,x+8*len(s)+3,y+13],fill=(0,0,0));d.text((x,y),s,fill=(255,255,255))
    overlay.save(r/f'{n}-colour-inspection.png')
    rows.append({'source':name,'components':comps})
(r/'source-colour-components.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')
print(json.dumps(rows))
