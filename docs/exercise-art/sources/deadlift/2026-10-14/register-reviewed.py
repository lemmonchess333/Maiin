from pathlib import Path
from PIL import Image
import numpy as np,json,hashlib,shutil,datetime
R=Path(__file__).resolve().parent;repo=R.parents[1]/'Maiin-burpees';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(repo/'docs/exercise-art/identity/athlete-anatomy-v3.png')=='fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
validation=json.loads((R/'staged-visual-validation.json').read_text());assert validation['passed']
previous=json.loads((R/'previous-artwork-hashes.json').read_text());assert all(sha(repo/name)==h for name,h in previous.items())
dest=repo/'public/form-frames/deadlift';assert not dest.exists(),'Preserve any existing release'
dest.mkdir(parents=True)
for i in range(1,7):shutil.copy2(R/f'final-frames/{i}.webp',dest/f'{i}.webp')
master=repo/'masters/deadlift/1.png';assert not master.exists();master.parent.mkdir(parents=True,exist_ok=True);Image.open(dest/'1.webp').convert('RGB').save(master)
beats=json.loads((R/'draft-beats.json').read_text());rows='\n'.join('      ['+str(b['t'])+', '+json.dumps(b['label'])+', '+json.dumps(b['cue'])+'],'for b in beats)
placards=repo/'src/lib/releasedFormPlacards.ts';text=placards.read_text();assert '"deadlift": placard(' not in text
block='  "deadlift": placard(\n    "deadlift",\n    ["Glutes", "Hamstrings"],\n    ["Erectors", "Traps"],\n    [\n'+rows+'\n    ]\n  ),\n'
assert 'export const RELEASED_FORM_PLACARDS = {\n' in text
placards.write_text(text.replace('export const RELEASED_FORM_PLACARDS = {\n','export const RELEASED_FORM_PLACARDS = {\n'+block))
guides=repo/'src/lib/formGuides.ts';guide_text=guides.read_text()
start=guide_text.index('  deadlift: {\n');end=guide_text.index('  "pull-ups": {\n',start)
assert 'image:' not in guide_text[start:end], 'Only retire the original imageless guide'
guides.write_text(guide_text[:start]+guide_text[end:])
inspection=json.loads((R/'source-inspection.json').read_text());order=[1,1,2,3,3,2];frames=[]
for n,pose in enumerate(order,1):
    row=inspection['rows'][pose-1];feet={s['side']:s for s in row['shoes']};a=np.array(Image.open(dest/f'{n}.webp').convert('RGB'));dims={}
    for label,x in [('leftPlateGreyVerticalSpanAt160',160),('rightPlateGreyVerticalSpanAt760',760)]:
        col=a[:,x];yy=np.flatnonzero((col.max(1)>25)&(np.ptp(col,axis=1)<24));assert len(yy)>100;dims[label]=int(yy.max()-yy.min()+1)
    frames.append(dict(path=f'form-frames/deadlift/{n}.webp',sha256=sha(dest/f'{n}.webp'),anchors={side+'PosteriorSoleEnvelope':dict(x=s['posteriorHeelX']-350,y=s['brightSoleBottom']+25)for side,s in feet.items()},invariantDimensions=dims))
for f in frames:
    assert f['invariantDimensions']==frames[0]['invariantDimensions']
    for side in f['anchors']:
        assert all(abs(f['anchors'][side][axis]-frames[0]['anchors'][side][axis])<=1 for axis in ['x','y'])
cues=[dict(label=b['label'],cue=b['cue'])for b in beats];cuehash=hashlib.sha256(json.dumps(cues,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
checks={
 'identity':'Original built-in imagegen sources de334d0b,b83f1b44,a936d163 used the same athlete-anatomy-v3 canonical. Bald faceless lean white-grey anatomy, neutral featureless pelvis, white trainers. Native originals and final940x940/mobile reviewed. Canonical hash pinned; complete original figures retained.',
 'camera':'Three complete1536x1024 scenes receive whole-scene translations[0,11],[4,25],[5,0], aligning both planted posterior sole envelopes. One common empty-margin crop(370,25,1270,905) and pad(20,50) produces940x940 without resizing the anatomy. Same rear-oblique camera; minor source contour/toe-shape variation retained.',
 'anatomy':'Fresh original-source review excludes the early-lift source with uncertain arm proportions and all later shoe-grafted versions. Selected floor,knee,standing show connected straight arms, closed grips, neutral spine and natural hip/knee extension. Native original-size images and final/mobile playback reviewed. No body warp, independent fitting, head/hand/shoe graft or new pose in code; qualitative illustration, not calibrated3D joint measurements.',
 'equipment':'One modest grey plate per end. Identical floor-source outer plate/sleeve pixels reused outside body/hand regions at observed shaft JOIN heights; initial outer-cap measurement step was corrected before export. Original middle shaft/grips retained. Native joins inspected and two actual grey plate-column spans remain exact across six images. Slight projected shaft-angle variation disclosed; not a calibrated3D bar certificate.',
 'contact':'Both original shoes remain intact and visually planted. One common whole-image shift per pose yields near posterior envelope443/444/444,y893 and far333/332/332,y880/879/880,within1px. These are source-threshold sole envelope bounds in hand-excluding ROIs, not exact heel joint centres. Small toe/sole contour variation retained. Hands remain closed on original shaft through rising and lowering; no doubled ankle seams because grafted versions are unused.',
 'physics':'Conventional floor setup with hips above knees, straight arms and neutral spine; bar rises close past knees to tall neutral lockout, returns with hip hinge and controlled lowering. Three genuine physical states, no invented human interpolation. Original already-generated sources used; no retry of service-blocked graft-seam cleanup and no alternate route to obtain that cleanup.',
 'muscles':'Glutes/hamstrings primary#7B72E9, erectors/traps secondary#9590E0; rest neutral. Existing source chroma plus native-traced lumbar/glute ownership boundary only. Recolour retains inherited source luminance, neutral highlights and grey contours; no new gradient treatment. Exact base colour pixels measured in all3 states, no colour change outside scope. Ownership is visual anatomical inference, not certified segmentation.',
 'cueAgreement':'Set/Brace/Clear knees/Stand/Control/Lower. Source order1,1,2,3,3,2; actual floor and lockout pauses, middle reused on controlled return. Qualitative t1,1,.3,0,0,.3; middle is not claimed halfway. Separate file paths and duplicate groups honestly disclosed.',
 'sequenceAndLoop':'All6 distinct WebP paths losslessly decode exactly to940x940 reviewed crops. Native natural/rendered940x940 manual beats and6to1 plus timed playback reviewed. Three layered OpenRaster files reopen pixel-exact. Source hash/export/native trace evidence retained.',
 'mobileLight':'Staged actual ExerciseFormContent at verified390x844 light, all6 decoded940x940 paths and6to1 observed. Complete figure/plates, original closed grips and planted shoes, readable cues/key and standard-algorithm card. Pause/manual selection/previous-next wrap/slower controls and observed console errors0. Registered-path review follows before completion/merge.',
 'mobileDark':'Staged actual ExerciseFormContent at verified390x844 dark, all6 decoded paths and6to1 observed. Full figure/gear and same colour hierarchy/camera. Real controls passed; normal/slower timing recorded. Registered standard card/project checks remain before completion/merge.'}
record=dict(exerciseId='deadlift',version='anatomy-v3-2026-10-14-reviewed-original-deadlift-v1',width=940,height=940,decision='approved',reviewer='Codex native and actual mobile review under user-approved revised standard',reviewedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),reference=dict(path=frames[0]['path'],sha256=frames[0]['sha256']),cueSha256=cuehash,checks={k:dict(passed=True,evidence=v)for k,v in checks.items()},frames=frames,distinctPoses=3,sourcePoseOrder=order,standardsAuthorization='work/REVISED-CONVERSION-STANDARDS-20261009.md',minorFindings=['Three physical poses through six separate files; floor/lockout pauses and qualitative uneven spacing disclosed.','Original shoe/toe contours and neutral body contours vary slightly; both sole envelopes within1px after whole-scene registration. No shoe patches.','Projected bar angle varies slightly; identical plate/end-sleeve pixels and measured grey spans retained; no calibrated3D claim.','Palette ownership is native anatomical inference, with inherited source luminance and contours.'],integrationValidation='Staged native/mobile passed; actual registered paths, standard card and project/CI checks pending before completion credit.')
release=repo/'docs/exercise-art/releases/2026-10-14/deadlift.json';release.parent.mkdir(parents=True,exist_ok=True);release.write_text(json.dumps(record,indent=2)+'\n')
source=repo/'docs/exercise-art/sources/deadlift/2026-10-14';source.mkdir(parents=True,exist_ok=True)
files=['PLAN.md','prepare.py','finish-colours.py','export-stage.py','register-reviewed.py','source-inspection.json','colour-audit.json','export-review.json','draft-beats.json','native-final-trace.json','native-final-full-page.png','staged-dark-trace.json','staged-light-trace.json','staged-dark.png','staged-light.png','staged-dark-full-page.png','staged-light-full-page.png','staged-controls.json','staged-slower-trace.json','staged-visual-validation.json','cutout-staging-provenance.json']
files += [f'{i}-{suffix}'for i in range(1,4)for suffix in ['whole-registered.png','equipment-only-draft.png','coloured-full.png','editable-draft.ora']]
for name in files:shutil.copy2(R/name,source/name)
for name in ['1-rebuilt-master.png','3-rebuilt.png','4-lockout-candidate.png','1-proportion-rebuild-prompt.txt','3-rebuild-prompt.txt','4-lockout-prompt.txt','DEFERRED.md']:shutil.copy2(R.parent/name,source/name)
provenance=dict(exerciseId='deadlift',canonicalSha256=sha(repo/'docs/exercise-art/identity/athlete-anatomy-v3.png'),sourceImagegenIds=dict(floor='de334d0b-4029-43c5-8558-ef728831e721',knee='b83f1b44-6d72-4343-84d1-c62712438c9c',standing='a936d163-e9b8-4f6c-a1ac-c9ba894ab790'),generationMode='Existing built-in imagegen originals only; no new generation request. User-authorized whole-scene framing and colour/contour/equipment finishing.',graftedSourceVersionsUsed=False,sourcePoseOrder=order,sourceHashes={f.name:sha(f)for f in source.iterdir()if f.is_file()},reconstructionNote='Recipes retained in original work layout; archival replay needs relative source/repo paths adjusted. No blocked graft-seam cleanup is attempted. Original figures and original shoes remain intact.')
(source/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
(R/'sequence-measurements.json').write_text(json.dumps(dict(scope='Posterior sole envelope bounds and exact plate-column spans; projected raster diagnostics, not3D joint centres.',frames=frames),indent=2))
shutil.copy2(R/'sequence-measurements.json',source/'sequence-measurements.json')
print(json.dumps(dict(registered=6,previousArtworkPreserved=len(previous),sourceFiles=len(list(source.iterdir())),firstFrame=frames[0])))
