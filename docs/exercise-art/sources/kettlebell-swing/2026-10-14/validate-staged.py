from pathlib import Path
from datetime import datetime,timezone
from PIL import Image
import json,hashlib,re,statistics
r=Path(__file__).resolve().parent
read=lambda name:json.loads((r/name).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
static=read('static-finishing-review.json')
assert static['status']=='static-finishing-checks-passed-runtime-and-mobile-pending'
assert len(static['poses'])==3
assert all(p['changedOutsideOriginalColourLayerAlpha']==0 and p['commonCropMatchesNativeFinished'] is True and p['reopenedOraMatchesFramed'] is True for p in static['poses'])
assert all(c['passed'] is True for c in static['staticVisualChecks'].values())
card=read('prepared-card-review.json')
assert card['status']=='independent-prepared-card-review-passed-integrated-mobile-pending'
assert card['proof']['preparedRGBExactlyMatchesFrame3'] is True
assert card['proof']['allBrightOriginalRGBPixelsRetainedFullyOpaque'] is True
assert card['proof']['lowerBrightOriginalPixelsRemoved']==0
assert all(card['visualReview'][key]['passed'] is True for key in ['fullLowerLegsAndTrainers','lightCardAppearance','darkCardAppearance','noHumanAnatomyOrPoseChanged','reviewOnly160pxDisplay'])
manual=read('native-manual-trace.json');timed=read('native-timed-trace.json')
assert len(manual)==6 and all(x['complete'] and x['natural']==x['display']==[690,1008] for x in manual)
def frames(rows):return {int(re.search(r'/([1-6])\.webp$',x['src']).group(1)) for x in rows}
def wrap(rows):return any(i and rows[i-1]['src'].endswith('/6.webp') and x['src'].endswith('/1.webp') for i,x in enumerate(rows))
assert frames(timed)==set(range(1,7)) and wrap(timed)
themes={}
for theme in ['dark','light']:
    rows=read(f'staged-{theme}-trace.json')
    good=[x for x in rows if x['playing'] and not x['documentHidden'] and x['theme']==theme and x['viewport']==[390,844] and [x['naturalWidth'],x['naturalHeight']]==[690,1008]]
    assert frames(good)==set(range(1,7)) and wrap(good)
    themes[theme]={'viewport':[390,844],'decodedFrames':[1,2,3,4,5,6],'loop6to1':True,'observations':len(good)}
controls=read('staged-controls.json')
assert controls['selectSix'].endswith('/6.webp') and controls['nextWrap'].endswith('/1.webp') and controls['previousWrap'].endswith('/6.webp')
assert controls['slowerPressed']=='true' and controls['consoleErrors']==[]
def intervals(rows):return [b['ms']-a['ms'] for a,b in zip(rows,rows[1:]) if a['src']!=b['src'] and 700<b['ms']-a['ms']<4000]
normal=[x for x in read('staged-dark-trace.json') if x['playing'] and x['viewport']==[390,844]]
slow=[x for x in read('staged-slower-trace.json') if x['playing'] and x['viewport']==[390,844]]
assert frames(slow)==set(range(1,7)) and wrap(slow)
normal_ms=statistics.median(intervals(normal));slow_ms=statistics.median(intervals(slow));assert 1.8<slow_ms/normal_ms<2.2
controls['timing']={'normalMedianMs':normal_ms,'slowerMedianMs':slow_ms,'ratio':slow_ms/normal_ms}
(r/'staged-controls.json').write_text(json.dumps(controls,indent=2)+'\n')
beats=read('draft-beats.json');assert len(beats)==6 and all(len(b['cue'].split())<=7 for b in beats)
for beat,pose in enumerate([2,3,1,1,3,2],1):
    assert Image.open(r/f'final-frames/{beat}.webp').convert('RGBA').tobytes()==Image.open(r/f'{pose}-framed.png').convert('RGBA').tobytes()
result={'passed':True,'reviewedAt':datetime.now(timezone.utc).isoformat(),'exerciseId':'kettlebell-swing','status':'staged native/mobile/card acceptance; integrated public paths/project/CI/actualmerge pending','canonicalWithoutShorts':True,'physicalPoses':3,'sourcePoseOrder':[2,3,1,1,3,2],'newImageRequests':0,'nativeActualDimensions':[690,1008],'nativeManualFrames':6,'nativeTimedLoop6to1':True,'mobile':themes,'controls':controls,'card':{'dimensions':Image.open(r/'card-cutout.webp').size,'sha256':sha(r/'card-cutout.webp'),'preparedSourceSha256':sha(r/'prepared-card-source.png'),'backgroundOnlyCleanup':True,'completeTrainerContoursRetained':True},'preparationVisible':'Actual Preparation paragraph in both mobile themes contains exact catalogue first2instructions; six cues describe the held continuous swing, never a depicted floorpickup/park.','mechanics':'Hip hinge/hike, forward hip drive, upright chest-height float and reversed controlled return. Original feet, body, bell and grips unchanged; partly occluded hike hand/handle join judged plausibly continuous in native loop, not individually exposed or metrically proven.','quality':'Same canonical no-shorts anatomy, white trainers, smooth featureless pelvis and inherited fine neutral shading. Exact glutes/hamstrings primary and abs/lowerback secondary fields; original contour information only, no new gradient or anatomy repair.','editablesReopenedExact':3,'completionCredit':False}
result['reviewedAssetHashes']={name:sha(r/name) for name in ['1-framed.png','2-framed.png','3-framed.png','1-framed.ora','2-framed.ora','3-framed.ora','card-cutout.webp','prepared-card-source.png','draft-beats.json','mobile-review.tsx','review-vite.config.mjs','native-manual-trace.json','native-timed-trace.json','staged-dark-trace.json','staged-light-trace.json','staged-slower-trace.json','staged-controls.json']}
(r/'staged-visual-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['reviewedAssetHashes','quality','mechanics']},indent=2))
