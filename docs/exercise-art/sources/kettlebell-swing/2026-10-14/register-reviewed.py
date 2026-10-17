from pathlib import Path
from datetime import datetime, timezone
from PIL import Image
import hashlib, json, shutil, subprocess, zipfile

R=Path(__file__).resolve().parent
REPO=R.parents[1]/'Maiin-burpees'
EID='kettlebell-swing'
CANONICAL='fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
def save(p,data):p.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
assert subprocess.check_output(['git','branch','--show-current'],cwd=REPO,text=True).strip()=='art/kettlebell-retained-cycle-20261014'
baseline=read(R/'checks/baseline-verify-result.json')
assert baseline['head']=='af7ac48299e9a0daa35ce0effb72336e46d05adc' and baseline['snapshotRestoredFromExactBytes']
assert sha(REPO/baseline['savedSnapshot'])==baseline['savedSnapshotSha256']
validation=read(R/'staged-visual-validation.json')
assert validation['passed'] is True and validation['physicalPoses']==3 and validation['newImageRequests']==0
assert all(sha(R/name)==expected for name,expected in validation['reviewedAssetHashes'].items())
prior=read(R/'previous-artwork-hashes.json')
assert len(prior)==896 and all(sha(REPO/name)==expected for name,expected in prior.items())
assert sha(REPO/'docs/exercise-art/identity/athlete-anatomy-v3.png')==CANONICAL
originals=read(R/'retained-original-provenance.json')
for item in originals:
    assert sha(R/item['name'])==item['sha256'] and sha(R/item['prompt'])==item['promptSha256']
beats=read(R/'draft-beats.json')
measurements=read(R/'release-schema-measurement-preparation.json')
assert len(beats)==6 and measurements['sourcePoseOrder']==[2,3,1,1,3,2]
frames=measurements['framesMeasurementProposal']
for n,frame in enumerate(frames,1):assert sha(R/f'final-frames/{n}.webp')==frame['sha256']
cuehash=hashlib.sha256(json.dumps([dict(label=b['label'],cue=b['cue']) for b in beats],separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
assert cuehash==measurements['cueSha256ForCurrentDraft']
setup=['Stand with feet shoulder-width, bell on the floor a foot in front of you.','Hinge at the hips and grip the handle with both hands, back flat.']
catalog=(REPO/'src/lib/exercises.ts').read_text(encoding='utf-8')
assert all(s in catalog for s in setup)
public=REPO/f'public/form-frames/{EID}'
recordpath=REPO/f'docs/exercise-art/releases/2026-10-14/{EID}.json'
master=REPO/f'masters/{EID}/1.png'
archive=REPO/f'docs/exercise-art/sources/{EID}/2026-10-14'
cutouts=REPO/'docs/exercise-art/cutout-sources'
assert not any(p.exists() for p in [public,recordpath,master,archive,cutouts/f'{EID}.png',cutouts/f'{EID}.json'])
placards=REPO/'src/lib/releasedFormPlacards.ts'
code=placards.read_text(encoding='utf-8')
assert 'authoredSetupInstructions?: string[]' in code and f'"{EID}": placard(' not in code
rows='\n'.join('      ['+str(b['t'])+', '+json.dumps(b['label'])+', '+json.dumps(b['cue'])+'],' for b in beats)
block=f'  "{EID}": placard(\n    "{EID}",\n    ["Glutes", "Hamstrings"],\n    ["Core", "Lower Back"],\n    [\n{rows}\n    ],\n    '+json.dumps(setup)+'\n  ),\n'
needle='export const RELEASED_FORM_PLACARDS = {\n'
assert needle in code
placards.write_text(code.replace(needle,needle+block),encoding='utf-8')
public.mkdir(parents=True)
for n in range(1,7):shutil.copy2(R/f'final-frames/{n}.webp',public/f'{n}.webp')
master.parent.mkdir(parents=True)
shutil.copy2(R/'1-framed.png',master)
assert Image.open(master).convert('RGBA').tobytes()==Image.open(public/'3.webp').convert('RGBA').tobytes()

evidence={
'identity':'Native originals and finished poses reviewed against FA56 anatomy-v3: same bald faceless lean white/light-grey athlete, smooth featureless neutral pelvis without shorts/clothing/waistband, white trainers and inherited fine anatomical shading. Three intact retained sources; original prompts and hashes archived. Full historical generation invocation IDs/attachments are unavailable and are not invented.',
'camera':'Same fixed oblique source view and planted scene in all three 1536x1024 original poses. Shared crop [280,0,970,1008] yields 690x1008 at scale1; no image or anatomical resampling, translation, limb fitting, grafts or head replacement. Actual fixed heel-edge pixels measured independently.',
'anatomy':'Native Hike, intermediate Drive and chest-height Float reviewed, then all six natural-size690x1008 player beats and timed loop. Coherent hip hinge to extension, long relaxed arms, neutral smooth pelvis and adult proportions. Minor inherited contour/projection variation accepted under revised owner standard; no anatomical reconstruction.',
'equipment':'Original ordinary dark kettlebell and single handle retained unchanged outside original muscle colour fields. Modest consistent bell body, natural handle rotation and occlusion; measured projected bounds vary with rotation and are not asserted to be invariant3D diameter or weight. Hike inherited metallic colour pixels correctly remain equipment.',
'contact':'Both planted heel-edge anchors fixed at near(86,949),far(226,912) in every original/framed pose. Lower sole bright spans153/159 in Hike/Drive and154/160 in Float, less than1% variation. Float/Drive overlapping two-hand grip readable; Hike hand/handle join partly hidden by near thigh, judged plausibly continuous in native loop, not claimed individually exposed or metrically proven.',
'physics':'Complete continuous two-handed Russian swing repetition: loaded hip hinge/backswing, hip-driven forward excursion, extended-hip chest-height float without backward lean, then relaxed-arm controlled reverse return to hinge. No overhead swing/front raise/squat substitution. Floor pickup/park are set boundaries and remain written preparation rather than depicted repeated beats.',
'muscles':'Catalogue primary Glutes/Hamstrings #7B72E9; secondary Core/Lower Back #9590E0 on inherited abdominal/lower-back fields. Source-connected colour alpha and source-derived fine grey contours only; flat fields without new gradients. Independent comparison finds zero changed pixels outside colour domains in all three original poses; neutral athlete, shoes, hands and gear preserved.',
'cueAgreement':'Hike/Drive/Float/Brace/Return/Reset cues each at most7words match actual continuous swing. Exact first two catalogue instructions display in a plain Preparation paragraph alongside six cue rows in both mobile themes. No cue claims an illustrated floor pickup/park. Three physical poses honestly reused across six distinct paths in source order[2,3,1,1,3,2].',
'sequenceAndLoop':'All six paths decode exactly to three self-contained framed OpenRaster editables, independently reopened and recomposed exactly. Manual native690x1008 review and timed playback observed every beat and6to1. Forward drive/float endpoint hold and reversed return are appropriate to this swing repetition.',
'mobileLight':'Actual staged ExerciseFormContent at verified390x844 light: all6 decoded690x1008 paths and6to1; correct key/cues, visible exact Preparation paragraph, whole figure/bell/trainers and reviewed307x480 card. Pause/select6/next6to1/previous1to6/slower pass, console errors0, normal1206ms/slower2412ms. Registered-path review remains required before completion credit.',
'mobileDark':'Actual staged ExerciseFormContent at verified390x844 dark: all6 decoded690x1008 paths and6to1; correct key/cues, visible exact Preparation paragraph, whole figure/bell/trainers and reviewed307x480 card. Pause/select6/next6to1/previous1to6/slower pass, console errors0, normal1206ms/slower2412ms. Registered-path review remains required before completion credit.'}
record=dict(exerciseId=EID,version='anatomy-v3-2026-10-14-retained-kettlebell-cycle-v1',width=690,height=1008,decision='approved',reviewer='Codex native, independent static/card and actual mobile review',reviewedAt=datetime.now(timezone.utc).isoformat(),reference=dict(path=f'form-frames/{EID}/3.webp',sha256=sha(public/'3.webp')),cueSha256=cuehash,checks={k:dict(passed=True,evidence=v) for k,v in evidence.items()},frames=frames,physicalPoses=3,sourcePoseOrder=[2,3,1,1,3,2],newImageRequests=0,authoredSetupInstructions=setup,
sourceRoute='Three intact retained September29 no-shorts sources, colour/inherited-contour finishing only; no failed floor candidate or clothed source used.',
minorFindings=['Hike two-hand handle contact partly occluded; native loop reviewed without claiming individually visible fingers.','Small inherited contour/projection variation accepted; no calibrated3D gear/head-scale claim.','Three physical poses and6distinctpaths; hold and controlled reverse return reuse disclosed.','Floor pickup/park are written set preparation/boundaries, not claimed illustrated phases.'],
integrationValidation='Staged native/mobile/card accepted; registered paths, full project verification, required CI and actualmerge pending before completion credit.')
recordpath.parent.mkdir(parents=True,exist_ok=True);save(recordpath,record)
cutouts.mkdir(parents=True,exist_ok=True)
shutil.copy2(R/'prepared-card-source.png',cutouts/f'{EID}.png')
save(cutouts/f'{EID}.json',dict(reviewStatus='reviewed',image=f'{EID}.png',imageSha256=sha(cutouts/f'{EID}.png'),reference=record['reference']['path'],referenceSha256=record['reference']['sha256'],method='Native frame3 exact RGB; one reviewed alpha-only floor/background cleanup, then normal standard card generator.',reviewEvidence='Independent native/light/dark card review plus actual staged390x844 light/dark review; whole trainers and contours retained. Registered card review follows.'))
archive.mkdir(parents=True)
(archive/'.gitattributes').write_bytes(b'# Preserve archived byte hashes.\n* -text\n')
names=['PLAN.md','retained-original-provenance.json','source-prompt-hash-verification.json','draft-beats.json','finishing-audit.json','framing.json','static-finishing-review.json','release-schema-measurement-preparation.json','prepared-card-review.json','prepared-card-review-proof-hashes.json','staged-card-provenance.json','staged-visual-validation.json','staged-controls.json','staged-dark-trace.json','staged-light-trace.json','staged-slower-trace.json','staged-dark-full-page.png','staged-light-full-page.png','native-manual-trace.json','native-timed-trace.json','native-beat-1.png','native-beat-2.png','native-beat-3.png','prepared-card-source.png','card-cutout.webp','prepare-originals.py','finish.py','prepare-review.py','prepare-card-floor-matte.py','review-prepared-card.py','validate-staged.py','register-reviewed.py','mobile-review.html','mobile-review.tsx','native-review.html','review-vite.config.mjs','stage-prepared-card.mts']
names+=[f'{p}-{suffix}' for p in [1,2,3] for suffix in ['framed.ora','framed.png','native-finished.png','primary-glutes-hamstrings.png','secondary-abs-lower-back.png'] if (R/f'{p}-{suffix}').exists()]
names += [x['name'] for x in originals]
for name in names:shutil.copy2(R/name,archive/name)
for name in ['baseline-verify-result.json','baseline-summary.md','baseline-failure-identities.json']:shutil.copy2(R/'checks'/name,archive/name)
with zipfile.ZipFile(archive/'original-prompts-exact.zip','w',zipfile.ZIP_DEFLATED) as z:
    for item in originals:z.writestr(item['prompt'],(R/item['prompt']).read_bytes())
for item in originals:
    (archive/item['prompt']).write_text((R/item['prompt']).read_text(encoding='utf-8-sig'),encoding='utf-8',newline='\n')
save(archive/'provenance.json',dict(exerciseId=EID,canonicalSha256=CANONICAL,sourceGenerations=originals,sourcePoseOrder=[2,3,1,1,3,2],newImageRequests=0,physicalPoses=3,method=record['sourceRoute'],fullGenerationIDsAvailable=False,originalPromptBytesArchive='original-prompts-exact.zip',sourceHashes={},archiveStatus='Integrated review/check evidence and source hash seal pending.'))
config=(R/'review-vite.config.mjs').read_text(encoding='utf-8').replace('plugins:[staged,react(),tailwindcss()]','plugins:[react(),tailwindcss()]').replace('port:8774','port:8775')
(R/'integrated-vite.config.mjs').write_text(config,encoding='utf-8')
(R/'integrated-review.html').write_text((R/'mobile-review.html').read_text().replace('mobile-review.tsx','integrated-review.tsx'),encoding='utf-8')
wrapper=(R/'mobile-review.tsx').read_text().replace('Staged continuous swing: three intact no-shorts poses','Registered continuous swing: three intact no-shorts poses').replace('src="/card-cutout.webp"',f'src="/form-art/{EID}.webp"')
(R/'integrated-review.tsx').write_text(wrapper,encoding='utf-8')
print(json.dumps(dict(locallyRegistered=EID,frames=6,physicalPoses=3,newImageRequests=0,previousArtworkPreserved=len(prior),completionCredit=False,sourceArchive=str(archive))))
