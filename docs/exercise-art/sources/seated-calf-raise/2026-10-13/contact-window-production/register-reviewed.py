from pathlib import Path
from PIL import Image
import numpy as np, json, hashlib, shutil
from datetime import datetime, timezone

p=Path(__file__).resolve().parent
repo=p.parents[1]/'Maiin-burpees'
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
canonical=repo/'docs/exercise-art/identity/athlete-anatomy-v3.png'
assert sha(canonical)=='fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
previous=json.loads((p/'previous-artwork-hashes.json').read_text())
assert all(sha(repo/f)==h for f,h in previous.items())
dest=repo/'public/form-frames/seated-calf-raise'
assert not dest.exists(), 'Do not overwrite an existing release'
dest.mkdir(parents=True)
for i in range(1,7):shutil.copy2(p/f'final-frames/{i}.webp',dest/f'{i}.webp')
master=repo/'masters/seated-calf-raise/1.png'
assert not master.exists(), 'Preserve any previous master'
master.parent.mkdir(parents=True,exist_ok=True)
Image.open(dest/'1.webp').convert('RGB').save(master)

def scan(a,y,x0,x1):
    line=a[y,x0:x1];mx=line.max(1);mn=line.min(1)
    xx=np.flatnonzero((mx>25)&(mx<200)&(mx-mn<35))+x0
    groups=np.split(xx,np.flatnonzero(np.diff(xx)>1)+1)
    g=max(groups,key=len);assert len(g)>10
    return int(g[0]),int(g[-1]),int(len(g))
frames=[]
for i in range(1,7):
    f=dest/f'{i}.webp';a=np.array(Image.open(f).convert('RGB'))
    bearing=scan(a,738,90,150);floor=scan(a,1280,620,740)
    frames.append({'path':f'form-frames/seated-calf-raise/{i}.webp','sha256':sha(f),
      'anchors':{'rearBearingGreySegmentAt738':{'x':bearing[0],'y':738},'frontFloorGreySegmentAt1280':{'x':floor[1],'y':1280}},
      'invariantDimensions':{'rearBearingGreySegmentWindowWidth':bearing[2],'frontFloorGreySegmentWindowWidth':floor[2]}})
assert all(f['anchors']==frames[0]['anchors'] and f['invariantDimensions']==frames[0]['invariantDimensions'] for f in frames)
beats=json.loads((p/'draft-beats.json').read_text())
cues=[{'label':b['label'],'cue':b['cue']} for b in beats]
cuehash=hashlib.sha256(json.dumps(cues,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
placards=repo/'src/lib/releasedFormPlacards.ts'
text=placards.read_text(encoding='utf-8');assert '"seated-calf-raise": placard(' not in text
rows='\n'.join('      ['+str(b['t'])+', '+json.dumps(b['label'])+', '+json.dumps(b['cue'])+'],' for b in beats)
block='  "seated-calf-raise": placard(\n    "seated-calf-raise",\n    ["Calves"],\n    [],\n    [\n'+rows+'\n    ]\n  ),\n'
placards.write_text(text.replace('export const RELEASED_FORM_PLACARDS = {\n','export const RELEASED_FORM_PLACARDS = {\n'+block),encoding='utf-8')
checks={
 'identity':'Canonical athlete-anatomy-v3 attached to all selected imagegen sources: bald faceless lean white-grey anatomy, neutral featureless pelvis, white trainers. No anatomical transforms, independent limb fitting or head/shoe grafts. Original sources, exact prompts and editable layers retained.',
 'camera':'Complete 1024x1536 source scenes. Connected moving-unit window at(15,440), 990x660, uniformly normalized from1536x1024 with scale.64453125; no body-based fitting. One common empty-margin crop(60,80,1000,1390) gives940x1310 lossless delivery. Shared fixed equipment measured across six files.',
 'anatomy':'Native full-size stills and actual940x1310 playback inspected. Whole connected body/carriage generation naturally exposes previously occluded shoe and grip. Local source window includes connected forearms, torso, hips and complete legs; continuous upper boundary inspected. Slight source contour variation accepted under revised standard.',
 'equipment':'Generic plate-loaded seated calf machine. Shared floor/base, rear bearing, foot-platform front face and disengaged safety support assembled as equipment-only layers. Shared support swung rigidly24degrees about its original ground hinge. TKO722SC original assembly manual distinguishes separate safety bar from rear-pivoted power frame; illustration is not a branded exact replica.',
 'contact':'Native source/contact crops and complete loops show both forefeet supported on the platform, knees under pads and hands on the moving grips. Lower shoes flatter than raised; earlier 2D transverse-line plane inference explicitly withdrawn. Scanline anchors verify fixed gear segments only; no calibrated3D ankle/contact claim.',
 'physics':'Three generated physical states: lower, small near-top transition and raised. Heel and connected loaded carriage move together; shared ground gear/safety assembly remains fixed. Panatta official demonstrationDJkTjfR0Ono supplies actual lower/intermediate/raised pose references. Qualitative illustrated motion, not a clinical or3D mechanical calibration.',
 'muscles':'Calves primary#7B72E9; secondary empty. Source tint neutralized and reapplied using inherited luminance, shading and grey contours. Exact primary pixels measured in all three states; outside calf colour scope changed0. Colour ownership manually inspected at native scale.',
 'cueAgreement':'Stretch/Rise/Squeeze/Hold/Lower/Reset with sourcePoseOrder1,2,3,3,2,1. Near-top state is not halfway: qualitative t0,.875,1,1,.875,0. Three physical poses honestly reused through six distinct file paths; controlled heel movement cues match the reviewed illustrations.',
 'sequenceAndLoop':'Native-final-trace records actual940x1310 decoded playback of all six paths including6to1. Six lossless WebP files match their source crops exactly. Three multilayer OpenRaster files reopen pixel-exact; hashes disclose repeated poses.',
 'mobileLight':'Actual ExerciseFormContent at390x844 light: all six decoded940x1310 paths and6to1 observed. Full figure/gear, captions, key and controls reviewed. Pause, manual selection, wrap and slower timing passed; final standard card and registered paths follow in integration validation.',
 'mobileDark':'Actual ExerciseFormContent at390x844 dark: all six decoded paths and6to1 observed. Complete body/equipment and colour hierarchy reviewed; controls and observed console error count0. Final registered standard-card review follows in integration validation.'}
record={'exerciseId':'seated-calf-raise','version':'anatomy-v3-2026-10-13-reviewed-seated-calf-v1','width':940,'height':1310,'decision':'approved','reviewer':'Codex native/mobile review under user-approved revised standard','reviewedAt':datetime.now(timezone.utc).isoformat(),'reference':{'path':frames[0]['path'],'sha256':frames[0]['sha256']},'cueSha256':cuehash,'checks':{k:{'passed':True,'evidence':v} for k,v in checks.items()},'frames':frames,'distinctPoses':3,'sourcePoseOrder':[1,2,3,3,2,1],'standardsAuthorization':'work/REVISED-CONVERSION-STANDARDS-20261009.md','minorFindings':['Three genuine poses reused through six playback files; near-top state and uneven spacing disclosed.','Minor generated neutral contour and far-platform profile variation; no calibrated3D or precise halfway claim.','Contact interpretation uses actual pose references and full native motion, not imageY against a transverse line.'],'integrationValidation':'Staged native/mobile passed; registered standard card and project checks pending before merge/completion.'}
release=repo/'docs/exercise-art/releases/2026-10-13/seated-calf-raise.json'
release.parent.mkdir(parents=True,exist_ok=True);release.write_text(json.dumps(record,indent=2)+'\n')
source=repo/'docs/exercise-art/sources/seated-calf-raise/2026-10-13'
files=['1-lower-editable.ora','2-near-top-editable.ora','3-raised-editable.ora','final-1-lower.png','final-2-near-top.png','final-3-raised.png','middle-window-corrected.png','middle-window-corrected-normalized.png','middle-window-correction-prompt.txt','middle-window-prompt.txt','middle-window-original.png','raised-edit-window-2x.png','raised-source-window-native.png','window-preparation.json','middle-window-normalization.json','local-corrected-static-evidence.json','far-rail-silhouette-inspection.json','native-near-heel-landmarks.json','native-endpoints-and-local-heel-comparison.png','corrected-upper-boundary-native.png','reference-upper-boundary-native.png','colour-editable-audit.json','export-review.json','draft-beats.json','PLAN.md','export-candidate.py','register-reviewed.py','native-final-trace.json','native-final-full-page.png','staged-light.png','staged-dark.png','staged-light-trace.json','staged-dark-trace.json','staged-controls.json','staged-visual-validation.json']
for name in files:
    target=source/'contact-window-production'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p/name,target)
assembly=p.parent/'safety-layer-assembly-production'
selected=['1-lower-without-safety.png','2-near-top-without-safety.png','3-raised-without-safety.png','lower-without-safety-prompt.txt','raised-without-safety-prompt.txt','assemble-pair.py','assembly-provenance.json','body-ownership-supporting-audit.json','PAIR-REVIEW.md']
selected += [f.name for f in assembly.glob('shared-*-layer.png')]
selected += [f'{s}-assembly-draft.png' for s in ['1-lower','2-near-top','3-raised']]
for name in selected:
    target=source/'safety-layer-assembly-production'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(assembly/name,target)
provenance={'exerciseId':'seated-calf-raise','canonicalSha256':sha(canonical),'selectedSourceImagegenIds':{'lower':'01c746b9-fcd0-49b3-86e5-64670900ffc9','raised':'f2a828a7-1b76-4999-8bd9-d79de2abbdda','nearTopConnectedWindow':'57e709ca-d8fb-4e65-a636-48bdab122495'},'sourceOriginalsPreserved':True,'sourcePoseOrder':[1,2,3,3,2,1],'reconstructionNote':'Recipes retained from work layout; adjust repo root when replaying from archival folder. No anatomical fitting. Standard card generator binds to frame1. Failed full middle and first local window not activated.','sourceHashes':{f.relative_to(source).as_posix():sha(f) for f in source.rglob('*') if f.is_file()}}
(source/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
(p/'sequence-measurements.json').write_text(json.dumps({'scope':'Measured grey scanline segments inside documented windows verify fixed gear, not anatomical or3D landmarks.','scanWindows':{'rearBearing':[738,90,150],'frontFloor':[1280,620,740]},'frames':frames},indent=2)+'\n')
shutil.copy2(p/'sequence-measurements.json',source/'sequence-measurements.json')
print(json.dumps({'registeredFrames':6,'previousArtworkPreserved':len(previous),'firstFrame':frames[0],'sourceFiles':len(list(source.rglob('*')))},indent=2))
