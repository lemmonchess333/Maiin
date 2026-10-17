from pathlib import Path
from datetime import datetime,timezone
import hashlib,json
r=Path(__file__).resolve().parent
read=lambda name:json.loads((r/name).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert read('static-finishing-review-independent.json')['allStaticChecksPassed'] is True
assert read('prepared-card-review-independent.json')['allStaticChecksPassed'] is True
names=['master-brace-original.png','roll-original.png','reach-original.png']
names += [f'final-frames/{n}.webp' for n in range(1,7)]
names += [f'{p}-{suffix}' for p in [1,2,3] for suffix in ['framed.png','framed.ora','native-finished.png','primary-core.png','secondary-lats-deltoids.png']]
names += ['plan.json','catalogue.json','draft-beats.json','provenance.json','framing.json','finishing-audit.json','finish-colour.py','prepared-card-source.png','card-cutout.webp','prepared-card-alpha-proof.json','staged-card-provenance.json','prepare-card-floor-matte.py','stage-prepared-card.mts','measurements-independent.json','static-finishing-review-independent.json','prepared-card-review-independent.json','mobile-review.tsx','mobile-review.html','native-review.html','review-vite.config.mjs','native-manual-trace.json','native-timed-trace.json','staged-light-trace.json','staged-dark-trace.json','staged-slower-trace.json','staged-controls.json','previous-artwork-hashes.json','baseline/baseline-verify-result.json','baseline/baseline-failure-identities.json','master-prompt.txt','roll-prompt.txt','reach-prompt.txt','native-parent-signoff.json','native-master-review-independent.json','native-roll-review-independent.json','native-source-cycle-review-independent.json']
proofs=['native-playback-proof.png','staged-light-full-page.png','staged-dark-full-page.png']
checks={
  'nativeManual':'Parent individually selected all6 distinct paths at natural/display1448x924 in native1536x1120 viewport. Coherent complete model, supports/grips and palette; no clipping.',
  'nativeTimed':'Parent observed timed sequence and6to1, including held Reach and reversed Return/Reset; native DOM load trace and screenshot saved.',
  'mobileLight':'Actual ExerciseFormContent at390x844 light with final card: all6 decoded paths and6to1 recorded. Figure/trainers/grips remain whole; exact keys/cues/preparation visible in full-page proof.',
  'mobileDark':'Actual ExerciseFormContent at390x844 dark with final card: all6 decoded paths and6to1 recorded. Dark stage/card have no floor block; model and equipment remain whole.',
  'pauseSelectWrapSlower':'Actual Pause/select6/Next6to1/Previous1to6/Slower controls operated. Isolated slower trace contains complete visible cycle; no console errors.',
  'cueAgreement':'Brace/Roll/Reach/Hold/Return/Reset match the illustrated controlled-range kneeling rollout. No fully horizontal/perfectly straight endpoint claim; tips tell users to shorten range if neutral spine fails.',
  'cardAndPreparation':'Final alpha-only card reviewed on actual light/dark UI and independent160px composites. Body/RGB unchanged, both trainers complete, pad/wheel retained, no black floor block. Exact first catalogue setup sentence displayed.'
}
d={'status':'actual-staged-native-mobile-visual-review-passed','reviewer':'Parent Codex actual native/browser mobile visual review','reviewedAt':datetime.now(timezone.utc).isoformat(),'checks':{k:{'passed':True,'evidence':v} for k,v in checks.items()},'reviewedAssetHashes':{n:sha(r/n) for n in names},'proofHashes':{n:sha(r/n) for n in proofs},'completionCredit':False}
(r/'staged-parent-visual-signoff.json').write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'sourceAndEvidenceBindings':len(names),'actualScreenshotBindings':len(proofs),'completionCredit':False}))
