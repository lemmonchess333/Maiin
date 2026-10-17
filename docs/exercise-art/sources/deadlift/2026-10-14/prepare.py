from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib
R=Path(__file__).resolve().parent;SRC=R.parent
rows=[];registered=[]
for i,(name,dx,shift) in enumerate([('1-rebuilt-master.png',0,11),('3-rebuilt.png',4,25),('4-lockout-candidate.png',5,0)],1):
    path=SRC/name;im=Image.open(path).convert('RGB');assert im.size==(1536,1024)
    reg=Image.new('RGB',im.size,'black');reg.paste(im,(dx,shift));reg.save(R/f'{i}-whole-registered.png');registered.append(reg)
    a=np.array(reg)
    shoes=[]
    for label,box in [('far',(665,810,789,865)),('near',(788,820,935,878))]:
        x0,y0,x1,y1=box;roi=a[y0:y1,x0:x1];bright=(roi.min(axis=2)>135)&((roi.max(axis=2)-roi.min(axis=2))<25)
        yy,xx=np.where(bright)
        # Bright sole span/centroid is a silhouette diagnostic, not a3D contact centre.
        bottom=int(yy.max()+y0);band=bright[max(0,bottom-y0-5):bottom-y0+1];by,bx=np.where(band)
        # Posterior heel/sole contact: leftmost bright sole point in the fixed
        # lower contact band. ROIs exclude nearby hands and the opposite shoe.
        heelRows=bright[-20:];hy,hx=np.where(heelRows)
        shoes.append(dict(side=label,ROI=box,brightSoleBottom=bottom,lowerBandXMedian=float(np.median(bx)+x0),posteriorHeelX=int(hx.min()+x0),brightShoeLowerWidth=int(xx.max()-xx.min()+1)))
    axes=[]
    for label,box in [('left',(631,400,634,820)),('right',(970,400,973,820))]:
        x0,y0,x1,y1=box;roi=a[y0:y1,x0:x1];mask=(roi.max(axis=2)>25)&((roi.max(axis=2)-roi.min(axis=2))<24);yy,xx=np.where(mask)
        axes.append(dict(side=label,shaftCentreY=float((yy.min()+yy.max())/2+y0),bandTop=int(yy.min()+y0),bandBottom=int(yy.max()+y0),ROI=box))
    rows.append(dict(pose=i,source=name,originalSha256=hashlib.sha256(path.read_bytes()).hexdigest(),wholeSceneTranslation=[dx,shift],registrationRationale='Single whole-scene shift aligning both posterior heel/sole contacts; no independent shoe/body fitting',shoes=shoes,shaftAxes=axes))
# Equipment masks lie beyond all native visible body/hand pixels in these selected sources.
master=registered[0];regions=[(390,630,635,910),(970,630,1250,910)]
for i,reg in enumerate(registered,1):
    out=reg.copy();a0=np.array(reg)
    if i>1:
        for j,(x0,y0,x1,y1) in enumerate(regions):
            dy=round(rows[i-1]['shaftAxes'][j]['shaftCentreY']-rows[0]['shaftAxes'][j]['shaftCentreY'])
            out.paste('black',(x0,390,x1,925));out.paste(master.crop((x0,y0,x1,y1)),(x0,y0+dy))
            rows[i-1].setdefault('equipmentCopies',[]).append(dict(masterRegion=[x0,y0,x1,y1],translation=[0,dy]))
    out.save(R/f'{i}-equipment-only-draft.png')
    diff=np.any(np.array(out)!=a0,axis=2);allow=np.zeros(diff.shape,dtype=bool)
    for x0,y0,x1,y1 in regions:allow[390:925,x0:x1]=True
    assert not np.any(diff&~allow)
    rows[i-1]['changedPixelsOutsideEquipmentRects']=int((diff&~allow).sum())
    rows[i-1]['equipmentChangedPixels']=int(diff.sum())
sheet=Image.new('RGB',(3*1536,1024),'black')
for i in range(1,4):sheet.paste(Image.open(R/f'{i}-equipment-only-draft.png'),((i-1)*1536,0))
sheet.save(R/'three-source-equipment-review-native.png')
(R/'source-inspection.json').write_text(json.dumps(dict(status='Native review required; not a release',onlyExistingCompleteSources=True,noGeneratorRequests=True,noShoeHeadHandGrafts=True,noHumanWarpsOrIndependentFitting=True,sixProvisionalPaths=[1,1,2,3,3,2],diagnosticLimits='Pixel threshold silhouettes and observed shaft bands, not calibrated body joint or3D hardware measurements',rows=rows),indent=2))
print(json.dumps(rows,indent=2))
