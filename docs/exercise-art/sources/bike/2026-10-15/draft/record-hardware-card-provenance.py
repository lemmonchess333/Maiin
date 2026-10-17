"""Measured source hardware/card provenance only; no equipment correction/acceptance."""
from pathlib import Path
from datetime import datetime,timezone
from PIL import Image,ImageOps
import hashlib,json,math
import numpy as np
R=Path(__file__).resolve().parent
REPO=R.parents[1]/'Maiin-burpees'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
save=lambda p,v:p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
names=['3-lower-direct-original.png','6-upper-direct-original.png'];offsets=[(0,0),(-1,16)]
rows=[]
for n,(name,off) in enumerate(zip(names,offsets),1):
 source=Image.open(R/name).convert('RGB');norm=Image.new('RGB',source.size);norm.paste(source,off)
 a=np.asarray(norm).astype(float);bright=a.mean(2);spread=a.max(2)-a.min(2)
 thresholds=[]
 for threshold in [20,25,30,35,40,50]:
  row={'threshold':threshold}
  for label,box,side in [('front',(75,1370,225,1450),'left'),('rear',(815,1370,968,1450),'right')]:
   x0,y0,x1,y1=box;yy,xx=np.where((bright[y0:y1,x0:x1]>threshold)&(spread[y0:y1,x0:x1]<12));edge=xx.min() if side=='left' else xx.max();ys=yy[xx==edge]
   row[label+'Anchor']=[float(x0+edge),float(y0+(ys.min()+ys.max())/2)]
   xs=np.where((bright[1400,x0:x1]>threshold)&(spread[1400,x0:x1]<12))[0];row[label+'WidthAtY1400']=int(xs.max()-xs.min())
  thresholds.append(row)
 box=[(539,1129,554,1145),(546,1112,563,1131)][n-1];apertures=[]
 for threshold in [40,50,60,70]:
  x0,y0,x1,y1=box;yy,xx=np.where(a[y0:y1,x0:x1].max(2)<threshold)
  apertures.append({'thresholdMaxRGB':threshold,'samples':int(len(xx)),'centroid':[float(x0+xx.mean()),float(y0+yy.mean())]})
 norm.crop((75,1280,970,1450)).save(R/f'{n}-stationary-support-native-source-proof.png')
 norm.crop((495,1080,605,1190)).save(R/f'{n}-fixed-spindle-native-source-proof.png')
 rows.append({'pose':n,'wholeSceneOffset':off,'equipmentThresholds':thresholds,'spindleApertureROI':box,'spindleDarkApertureSamples':apertures})
at30=[next(v for v in row['equipmentThresholds'] if v['threshold']==30) for row in rows]
centres=[next(v for v in row['spindleDarkApertureSamples'] if v['thresholdMaxRGB']==60)['centroid'] for row in rows]
delta=[centres[1][i]-centres[0][i] for i in [0,1]]
distance=lambda a,b:math.hypot(b[0]-a[0],b[1]-a[1])
report={'status':'actual measured source findings; strict fixed-spindle failure retained; root acceptance pending','exerciseId':'bike','measuredAt':datetime.now(timezone.utc).isoformat(),'sourceCoordinateSpace':[1024,1536],'crop':[48,32,977,1464],'framedCoordinateConversion':'subtract48 from normalized x and32 from normalized y','rows':rows,
'fixedAnchors':[
 {'name':'frontStabilizerLeftmostNeutralOuterEdgeMidpoint','normalizedNativePoints':[r['frontAnchor'] for r in at30],'framedPoints':[[r['frontAnchor'][0]-48,r['frontAnchor'][1]-32] for r in at30],'driftPx':distance(at30[0]['frontAnchor'],at30[1]['frontAnchor']),'strict1pxPassed':distance(at30[0]['frontAnchor'],at30[1]['frontAnchor'])<=1,'method':'ROI75,1370,225,1450; common meanRGB>30 and max-minRGB<12; leftmost edge then midpoint of its actual y plateau.'},
 {'name':'rearStabilizerRightmostNeutralOuterEdgeMidpoint','normalizedNativePoints':[r['rearAnchor'] for r in at30],'framedPoints':[[r['rearAnchor'][0]-48,r['rearAnchor'][1]-32] for r in at30],'driftPx':distance(at30[0]['rearAnchor'],at30[1]['rearAnchor']),'strict1pxPassed':False,'method':'ROI815,1370,968,1450; same threshold; rightmost edge then midpoint of actual y plateau.'},
 {'name':'fixedCrankSpindleDarkBearingApertureCentroid','normalizedNativePoints':centres,'framedPoints':[[p[0]-48,p[1]-32] for p in centres],'deltaUpperMinusLowerPx':delta,'driftPx':math.hypot(*delta),'strict1pxPassed':False,'method':'Actual visible enclosed dark bearing aperture centroid, common maxRGB<60 within per-source inspected literal aperture ROIs.40/50/70 sensitivity retained; all show substantial same-direction drift. Not an inferred ankle/joint or background coordinate.'}],
'projectedDimensions':[
 {'name':'frontStabilizerVisibleNeutralEndcapWidthAtNormalizedY1400','valuesPx':[r['frontWidthAtY1400'] for r in at30],'relativeChangePercent':100*(at30[1]['frontWidthAtY1400']/at30[0]['frontWidthAtY1400']-1),'strict1PercentPassed':True},
 {'name':'rearStabilizerVisibleNeutralEndcapWidthAtNormalizedY1400','valuesPx':[r['rearWidthAtY1400'] for r in at30],'relativeChangePercent':100*(at30[1]['rearWidthAtY1400']/at30[0]['rearWidthAtY1400']-1),'strict1PercentPassed':True}],
'dimensionSensitivity':'Front width is124/125 at thresholds20/25/30/35; threshold40 erodes the first source shaded endcap to102 versus125, so it is unsuitable for the full visible neutral endcap feature. Rear is111/111 at25/30/35 and110/110 at40/50. These are visible raster cross-sections, not complete unoccluded hardware dimensions.',
'decision':'No strict apparatus pass is claimed. The16.6px spindle drift and rear-foot drift are actual retained source findings. Root must judge actual native/mobile continuity under the owner relaxation; otherwise hold. Do not hide them behind two base anchors, contact phase groups, a noise/perspective explanation or code equipment/anatomy correction.',
'calibrated3DClaim':False,'equipmentPixelsEdited':False,'completionCredit':False}
save(R/'hardware-measurements.json',report)
prepared=Image.open(R/'prepared-card-source.png').convert('RGBA');framed=Image.open(R/'1-framed.png').convert('RGBA')
p=np.asarray(prepared);f=np.asarray(framed);assert np.array_equal(p[:,:,:3],f[:,:,:3]);bright=(f[:,:,:3].max(2)>110);assert np.all(p[:,:,3][bright]==255)
card=Image.open(R/'card-cutout.webp').convert('RGBA');provenance=json.loads((R/'staged-card-provenance.json').read_text())
assert sha(R/'card-cutout.webp')==provenance['sha256'] and sha(R/'prepared-card-source.png')==provenance['preparedSourceSha256'] and sha(R/'final-frames/1.webp')==provenance['sourceSha256']
proofs={}
for theme,colour in [('light',(250,250,250,255)),('dark',(18,20,24,255))]:
 base=Image.new('RGBA',card.size,colour);base.alpha_composite(card);name=f'card-{theme}-review.png';base.convert('RGB').save(R/name);proofs[name]=sha(R/name)
 thumb=ImageOps.contain(card,(160,160),Image.Resampling.LANCZOS);base=Image.new('RGBA',(160,160),colour);base.alpha_composite(thumb,((160-thumb.width)//2,(160-thumb.height)//2));name=f'card-160px-{theme}-review.png';base.convert('RGB').save(R/name);proofs[name]=sha(R/name)
save(R/'card-static-proof.json',{'status':'standard-card-byte/alpha proof; actual light/dark/160 visual and mobile acceptance pending','reference':1,'referenceSha256':sha(R/'final-frames/1.webp'),'preparedSource':'prepared-card-source.png','preparedSourceSha256':sha(R/'prepared-card-source.png'),'preparedRGBExactToNativeFrame1':True,'allBrightSourceBodyAndTrainerPixelsOpaque':True,'standardAlgorithmCoreSha256':provenance['algorithmCoreSha256'],'customAlphaEdits':False,'cardDimensions':list(card.size),'cardSha256':sha(R/'card-cutout.webp'),'proofImages':proofs,'completionCredit':False})
save(R/'source-provenance.json',{'exerciseId':'bike','status':'unregistered retained two-position guide; strict apparatus findings/current native-mobile decision pending','canonicalSha256':'fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b','retainedSourceCalls':[{'source':names[0],'sourceSha256':sha(R/names[0]),'historicalImagegenId':'fc36f8fe-9d3a-401d-aa4c-1bfaea3d2409'},{'source':names[1],'sourceSha256':sha(R/names[1]),'historicalImagegenId':'9f1ce6ac-989e-4b15-834f-9d2c7f2fb93c'}],'historicalProvenance':'historical-evidence/provenance.json','historicalBlockedFrontRequest':'historical-evidence/front-service-rejection.json','newImageRequests':0,'serviceRetries':0,'physicalPoses':2,'sourcePoseOrder':[1,1,2,2,1,1],'wholeSceneOffsets':offsets,'commonCrop':[48,32,977,1464],'framedDimensions':[929,1432],'reference':1,'finishingMethod':'Only existing source-colour fields: quadricepsP/hamstringsS with inherited source brightness at fixed per-role anchors; existing calf colour neutralized. Neutral source contours/pixels/alpha, gear, grips, trainers and human geometry preserved. No new positional gradient or equipment/anatomy reconstruction.','paletteMaskCorrections':'First coarse draft and pre-final calf version retained outside repository. Final far-calf correction changed exactly1565 newly neutral calf pixels; zero changes outside that role-class delta; pose2 unchanged.','editableSources':['1-framed.ora','2-framed.ora'],'preparedCardSource':'prepared-card-source.png','card':'card-cutout.webp','scope':'Two opposed seated pedal positions repeated for cue reading. No sampled forward trajectory/smooth revolution/six-unique drawing claim.','actualHardwareFindings':'hardware-measurements.json; fixed spindle~16.6px and rear-support~4px strict failures must remain explicit.','productionRegistered':False,'completionCredit':False})
save(R/'archive-plan.json',{'status':'minimal reproducible source archive plan; no production copy','sourceOriginals':names,'sourceEditables':['1-framed.ora','2-framed.ora'],'deliveredFrames':[f'final-frames/{n}.webp' for n in range(1,7)],'reference':'1-framed.png','preparedCardSource':'prepared-card-source.png','card':'card-cutout.webp','code':['prepare-pair.py','prepare-guide-data.mjs','prepare-review.py','stage-card.mts','record-static-proof.py','record-hardware-card-provenance.py'],'metadata':['source-provenance.json','catalogue.json','draft-beats.json','plan.json','framing.json','finishing-audit.json','hardware-measurements.json','static-proof.json','card-static-proof.json','staged-card-provenance.json'],'retainHistoricalEvidence':True,'pending':['Actual root/independent current-native/card signoff','Actual component/native/mobile light/dark/controls proof','Honest strict-vs-owner-with-findings decision retaining spindle drift','Project gates/current-head CI/actual merge before completion'],'excludeObsoleteDraftAssetsFromProduction':True,'retainHeldDraftsOutsideRepository':True})
print(json.dumps({'spindleDriftPx':math.hypot(*delta),'spindleDelta':delta,'cardDimensions':list(card.size),'cardSha256':sha(R/'card-cutout.webp'),'preparedRGBExact':True,'brightOpaque':True,'strictApparatusPassed':False,'completionCredit':False}))
