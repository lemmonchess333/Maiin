from pathlib import Path
import json,hashlib,shutil
R=Path(__file__).resolve().parent;repo=R.parents[1]/'Maiin-burpees';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
checks=dict(baselineHead='d16e00d77eea6bcb3526c2a21e14c48cbaa8663a',baselineFullWindows=dict(failed=74,passed=12927,skipped=409),finalFullWindows=dict(failed=74,passed=12929,skipped=409),lintPassed=True,artworkAuditPassed=True,draftAuditPassed=True,cyclesPassed=True,buildPassed=True,distSizePassed=True,focused=dict(files=5,passed=434,failed=0),isolatedFinal=dict(files=3,passed=106,failed=0),comparison='72 persistent failures match the fresh cleanD16 baseline. Two baseline manifest-byte failures resolved through normal generators. Two additional final full-run timing failures passed isolated reruns; do not label them pre-existing. Full Windows verification remains non-green. Required Linux CI must pass before merge.',remaining='Required CI and actual merge; no completion credit yet')
(R/'project-checks.json').write_text(json.dumps(checks,indent=2)+'\n')
source=repo/'docs/exercise-art/sources/deadlift/2026-10-14'
shutil.copy2(R/'project-checks.json',source/'project-checks.json')
shutil.copy2(R/'prepare-publication.py',source/'prepare-publication.py')
for name in ['baseline-verify-result.json','final-verify-result.json','final-failure-comparison.json']:
    shutil.copy2(R/'checks'/name,source/name)
before=json.loads((R/'previous-artwork-hashes.json').read_text());assert all(sha(repo/f)==h for f,h in before.items())
print(json.dumps(dict(previousArtworkPreserved=len(before),checks=checks)))
