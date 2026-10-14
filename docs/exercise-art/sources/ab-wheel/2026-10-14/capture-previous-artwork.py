from pathlib import Path
import hashlib,json,subprocess
r=Path(__file__).resolve().parent;repo=r.parents[1]/'Maiin-burpees'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert head=='82d6d829ad20ad3c8924933f736ad615b83054f6'
status=subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).splitlines()
# Only the documented running suite's known snapshot is tolerated before exact restoration.
assert all('planSweep.golden.test.ts.snap' in x for x in status)
paths=[]
for folder in ['public/form-frames','public/form-art']:
    paths.extend(p for p in (repo/folder).rglob('*') if p.is_file())
rows={p.relative_to(repo).as_posix():sha(p) for p in sorted(paths)}
assert len(rows)==903
(r/'previous-artwork-hashes.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')
canonical=sha(repo/'docs/exercise-art/identity/athlete-anatomy-v3.png')
assert canonical=='fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
plan=json.loads((r/'plan.json').read_text(encoding='utf-8'))
plan['sourcePoses'][1]['physicalState']='An advanced intermediate rollout. Knees remain supported; straight arms angle forward, shoulders travel forward/down and hips extend in control. Rib-to-pelvis shape remains braced; no lumbar arch. The actual generated travel is not represented as exactly halfway.'
plan['sourcePoses'][2]['physicalState']='Longest illustrated controlled reach with residual hip flexion. Knees remain supported, torso braced and neutral, elbows straight, head follows spine and body clear of floor. This is a shorter controlled-range rollout, not claimed perfectly shoulder-hip-knee linear or fully horizontal. No unsupported wheel, sagging waist or collapsed chest.'
plan['status']='Three intact physical sources and native six-beat playback reviewed; field/card/mobile/project gates pending'
(r/'plan.json').write_text(json.dumps(plan,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'head':head,'publicFilesPinned':len(rows),'canonicalPreserved':True,'completionCredit':0}))
