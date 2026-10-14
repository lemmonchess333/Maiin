from pathlib import Path
from datetime import datetime,timezone
from PIL import Image
import json,hashlib,re,statistics,shutil
R=Path(__file__).resolve().parent
REPO=R.parents[1]/'Maiin-burpees'
A=REPO/'docs/exercise-art/sources/kettlebell-swing/2026-10-14'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def frames(rows):return {int(re.search(r'/([1-6])\.webp$',x['src']).group(1)) for x in rows}
def wrap(rows):return any(i and rows[i-1]['src'].endswith('/6.webp') and x['src'].endswith('/1.webp') for i,x in enumerate(rows))
def intervals(rows):return [b['ms']-a['ms'] for a,b in zip(rows,rows[1:]) if a['src']!=b['src'] and 700<b['ms']-a['ms']<4000]
assert read(R/'staged-visual-validation.json')['passed'] is True
themes={}
for theme in ['dark','light']:
    rows=read(R/f'integrated-{theme}-trace.json')
    good=[x for x in rows if x['playing'] and not x['documentHidden'] and x['theme']==theme and x['viewport']==[390,844] and [x['naturalWidth'],x['naturalHeight']]==[690,1008]]
    assert frames(good)==set(range(1,7)) and wrap(good),(theme,good)
    themes[theme]=dict(viewport=[390,844],frames=[1,2,3,4,5,6],loop6to1=True,observations=len(good))
controls=read(R/'integrated-controls.json')
assert controls['selectSix'].endswith('/6.webp') and controls['nextWrap'].endswith('/1.webp') and controls['previousWrap'].endswith('/6.webp')
assert controls['slowerPressed']=='true' and controls['consoleErrors']==[] and controls['pauseObserved'] is True
assert controls['card']==dict(src='/form-art/kettlebell-swing.webp',complete=True,natural=[307,480])
normal=[x for x in read(R/'integrated-dark-trace.json') if x['playing'] and x['viewport']==[390,844]]
slow=[x for x in read(R/'integrated-slower-trace.json') if x['playing'] and x['viewport']==[390,844]]
assert frames(slow)==set(range(1,7)) and wrap(slow)
normalms=statistics.median(intervals(normal));slowms=statistics.median(intervals(slow))
assert 1.8<slowms/normalms<2.2
recordpath=REPO/'docs/exercise-art/releases/2026-10-14/kettlebell-swing.json'
record=read(recordpath)
assert all(text in controls['preparation'] for text in record['authoredSetupInstructions'])
for n,frame in enumerate(record['frames'],1):
    assert sha(REPO/'public'/frame['path'])==frame['sha256']==sha(R/f'final-frames/{n}.webp')
assert (REPO/'public/form-art/kettlebell-swing.webp').read_bytes()==(R/'card-cutout.webp').read_bytes()
prior=read(R/'previous-artwork-hashes.json')
assert all(sha(REPO/name)==expected for name,expected in prior.items())
result=dict(passed=True,reviewedAt=datetime.now(timezone.utc).isoformat(),exerciseId='kettlebell-swing',source='Actual registered registry/placards/public paths; Vite staged overlay excluded from plugins',physicalPoses=3,newImageRequests=0,mobile=themes,controls=controls,timing=dict(normalMedianMs=normalms,slowerMedianMs=slowms,ratio=slowms/normalms),publicCardByteExactToReviewed=True,previousArtworkPreserved=len(prior),completionCredit=False,remaining='Full project check, source seal, required current-head CI and actual merge')
result['reviewedAssetHashes']={name:sha(R/name) for name in ['integrated-vite.config.mjs','integrated-review.tsx','integrated-dark-trace.json','integrated-light-trace.json','integrated-slower-trace.json','integrated-controls.json','integrated-dark-full-page.png','integrated-light-full-page.png']}
(R/'integrated-visual-validation.json').write_text(json.dumps(result,indent=2)+'\n')
for name in list(result['reviewedAssetHashes'])+['integrated-review.html','integrated-visual-validation.json','validate-integrated.py']:
    shutil.copy2(R/name,A/name)
for theme,key in [('light','mobileLight'),('dark','mobileDark')]:
    record['checks'][key]['evidence']+=f' Actual registered public frames and307x480 standard card passed verified390x844 {theme} review, all6/6to1, exact Preparation text and controls; console errors0, normal{normalms}ms/slower{slowms}ms. No staged asset middleware/registry transform used in integrated review.'
record['integrationValidation']='Actual registered native source pixels, mobile light/dark/card/setup/controls passed. Full project verification, source seal, required current-head CI and actualmerge pending before completion credit.'
recordpath.write_text(json.dumps(record,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ['controls','reviewedAssetHashes']},indent=2))
