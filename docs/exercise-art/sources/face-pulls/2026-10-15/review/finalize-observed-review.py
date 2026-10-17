import json, hashlib
from pathlib import Path
from datetime import datetime, timezone

root = Path(__file__).resolve().parent
repo = root.parent.parent / 'Maiin-burpees'
release_path = repo / 'docs/exercise-art/releases/2026-10-15/face-pulls.json'
release = json.loads(release_path.read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
evidence = {
 'identity': 'Parent viewed both final complete982x1258 native poses, standard480/160cards, and actual registered390x844 light/dark guide. Existing FA56 lean bald faceless no-shorts model, featureless pelvis, trainers and inherited fine contours/shading remain. This is scoped visual observation, not calibrated identity certification.',
 'camera': 'Both exact source endpoints use common crop[0,72,982,1330], without scaling. Whole head, trainers and complete tower stay visible in native/player/card. No independent limb fitting or camera change.',
 'anatomy': 'Parent inspected intact reach and high-elbow external-rotation endpoints. Original human RGBA is unchanged by the equipment layer; colour changes remain within existing tinted fields. No anatomical warps, grafts, invented joints or hidden-hand reconstruction.',
 'equipment': 'Parent reviewed generic ergonomic inner-flange/palm-support grips at native and mobile sizes against actual manufacturer topology. Hands, cable, pulley and stack positions are preserved. Hidden far-start free terminal remains uncertain; minor neutral surface-render variation is disclosed.',
 'contact': 'Original closed finger/grip pixels and planted trainers remain intact in both endpoints. Visible hands close around their original grip regions. Occluded far-start terminal support is not visually certified.',
 'physics': 'Actual two-endpoint playback moves reach to high-elbow external-rotation finish and back. Projected cable payout79-83px versus stack rise75px is locally consistent, not calibrated3D routing/world-length proof. No continuous path is claimed.',
 'muscles': 'Actual registered key and prescribed colour fields are Rear Delts primary#7B72E9, Rhomboids/Traps/visible Rotator Cuff secondary#9590E0. Existing fine contours/shading retained. Inherited pale highlight islands remain visible and accepted as a disclosed cosmetic finding.',
 'cueAgreement': 'Parent selected all six actual registered instruction buttons; correct labels, public URLs and cues observed. Both preparation sentences match the catalogue. Source order[1,1,4,4,1,1], position values[0,0,1,1,0,0]; no illustrated intermediate.',
 'sequenceAndLoop': 'Actual native and registered player traces show six decoded paths, automatic6-to-1 wraps, pause/manual selection, next6-to-1 and previous1-to-6. Slower cadence approximately2.4s versus normal1.2s. Two physical endpoint drawings are disclosed.',
 'mobileLight': 'Parent viewed actual unchanged ExerciseFormContent at verified390x844 light, after final standard card generation. Full athlete/tower, card, primary/secondary key, preparation, all cues and controls readable. Actual browser warnings/errors empty. Screenshot-watcher server failure retained separately and affected checks repeated after recovery.',
 'mobileDark': 'Parent viewed actual unchanged ExerciseFormContent at verified390x844 dark, including full athlete/trainers/tower, exact standard card, key, preparation and cues. No horizontal overflow. Actual playback and control evidence retained after server recovery; browser warnings/errors empty.',
}
native=json.loads((root/'native-playback-observed.json').read_text())
mobile=json.loads((root/'integrated-playback-after-recovery.json').read_text())
for trace,name in [(native,'native'),(mobile,'mobile')]:
 for mode in ['Normal','Slower']:
  rows=[x for x in trace if x['playing'] and mode in x['sectionText'] and not x['documentHidden']]
  paths=[x['src'].split('/')[-1] for x in rows]
  assert set(paths)=={f'{i}.webp' for i in range(1,7)}, (name,mode,paths)
  assert any(a=='6.webp' and b=='1.webp' for a,b in zip(paths,paths[1:])), (name,mode,'loop missing')
assert all(x['naturalWidth']==982 and x['naturalHeight']==1258 for x in mobile)
assert all(x['viewport']==[390,844] for x in mobile)
logs=json.loads((root/'integrated-console-after-recovery.json').read_text())
assert logs==[], logs
files=['native-playback-observed.json','native-manual-controls.txt','native-dark.png','native-light.png','native-cards-light.png','native-cards-dark.png','integrated-playback-after-recovery.json','integrated-manual-selection-after-recovery.txt','integrated-light-after-recovery.png','integrated-dark-after-recovery.png','integrated-console-after-recovery.json','review-vite.config.mjs','native-review.tsx','integrated-review.tsx','review-shared.tsx']
observed={key:{'observed':True,'evidence':value} for key,value in evidence.items()}
review={'exerciseId':'face-pulls','version':release['version'],'dimensions':[982,1258],'physicalPoses':2,'sourcePoseOrder':[1,1,4,4,1,1],'canonicalSha256':release['canonicalSha256'],'frameHashes':{x['path']:sha(repo/'public'/x['path']) for x in release['frames']},'card':{'path':'public/form-art/face-pulls.webp','sha256':sha(repo/'public/form-art/face-pulls.webp')},'cueSha256':release['cueSha256'],'observedQaChecks':observed,'findings':release['findings'],'browserEvidence':{name:sha(root/name) for name in files},'finalReviewCompleted':True,'reviewedAt':datetime.now(timezone.utc).isoformat(),'strictCertification':False}
release['reviewer']='Parent actual native/card and registered component mobile review, with independent source/preservation evidence'
release['reviewedAt']=review['reviewedAt']
release['recordStage']='reviewed-owner-with-findings; project verification and publication separately recorded'
release['checks']={key:{'passed':None,'evidence':'Owner release retains unverified strict status. Actual scoped observation: '+value} for key,value in evidence.items()}
release['observedQaChecks']=observed
release['approval']['context']='Existing explicit user authorization covers remaining conversions with minor disclosed findings, no-shorts model preservation, routine registration/checks and merge. Parent completed actual native/card/mobile review. This owner-with-findings release does not assert strict visual certification; actual project/CI/merge evidence is recorded separately.'
release['findings'][-1]='Fine inherited pale muscle-highlight islands remain visible after prescribed colour remap; parent accepted their native/card/mobile appearance as a minor cosmetic finding.'
review['findings']=release['findings']
release['integrationValidation']='Actual native/player/card and registered390x844 light/dark observations complete; raw evidence archived. All11 strict checks intentionally remain null. Project/CI/merge are separate gates.'
release_path.write_text(json.dumps(release,indent=2)+'\n',encoding='utf-8')
(root/'final-parent-review.json').write_text(json.dumps(review,indent=2)+'\n',encoding='utf-8')
print('Actual observed review finalized; no completion credit or strict certification.')
