from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,shutil,zipfile
R=Path(__file__).resolve().parent
REPO=R.parents[1]/'Maiin-burpees'
A=REPO/'docs/exercise-art/sources/kettlebell-swing/2026-10-14'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,data):p.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
parser=argparse.ArgumentParser();parser.add_argument('--prefix',default='branch-final');args=parser.parse_args()
meta=read(R/f'checks/{args.prefix}-verify-result.json')
comparison=read(R/f'checks/{args.prefix}-failure-comparison.json')
assert meta['status']=='terminal' and comparison['comparisonComplete'] and comparison['comparisonValid'] and comparison['inputStatePreserved']
focused=read(R/'checks/focused-new-failures-result.json')
assert focused['status']=='terminal' and focused['inputStatePreserved'] is True and focused['bothNewFailureSuitesPassed'] is True
assert focused['head']==meta['head'] and focused['newFailureFileHeaders']==[]
assert set(focused['targets'])=={'src/components/__tests__/FoodCameraModal.photoLock.test.tsx','src/features/program/__tests__/useProgramWriters.test.ts','scripts/ci/install-playwright-chromium.test.ts'}
assert all(any(p in identity for p in focused['targets'][:2]) for identity in comparison['newFailureIdentities'])
assert sha(R/'checks/focused-new-failures.log')==focused['actualTestResult']['logSha256']
assert read(R/'integrated-visual-validation.json')['passed'] is True
baseline=comparison['baselineTests'];branch=comparison['branchResult']['tests']
checks=dict(reviewedAt=datetime.now(timezone.utc).isoformat(),baselineHead=comparison['baselineHead'],testedWorkingTreeHead=meta['head'],command='npm run verify',baselineWindowsTests=baseline,branchWindowsTests=branch,fullWindowsGreen=comparison['overallGreen'],lintArtworkDraftCyclesBuildSizePassed=True,allNormalVerifyStagesPresent=comparison['allNormalVerifyStagesPresent'],newFailureIdentities=comparison['newFailureIdentities'],newFailureSuitesPassedFocused=focused['bothNewFailureSuitesPassed'],focusedTotals=focused['actualTestResult']['tests'],resolvedFailureIdentities=comparison['resolvedFailureIdentities'],changedExistingFailureDetails=comparison['changedDetailsForExistingFailures'],inputBytesUnchanged=meta['inputBytesUnchanged'],snapshotRestoredExactToPreRun=meta['snapshotFinalSha256']==meta['savedSnapshotSha256'],comparisonNote='Full Windows exit1 remains non-green: two baseline generator-byte failures resolved, two new full-run failures passed their normal whole-file focused run. Five existing helper detail changes were caused by an omitted Git Bash PATH entry in this runner; focused correct-baseline-PATH run restores the same baseline helper failure details. No tests, limits, skips or app code changed to obtain focused results.',remaining='Required current-head unit/emulator-tests CI and actualmerge before completion credit.')
save(R/'project-checks.json',checks);shutil.copy2(R/'project-checks.json',A/'project-checks.json')
for name in [f'{args.prefix}-verify-result.json',f'{args.prefix}-failure-comparison.json',f'{args.prefix}-comparison-summary.md','branch-verify-result.json','branch-early-gate-failure.json','focused-new-failures-result.json','branch-final-runner-path-diagnostic.json']:
    shutil.copy2(R/'checks'/name,A/name)
with zipfile.ZipFile(A/'full-verification-logs-exact.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['baseline-verify.log',f'{args.prefix}-verify.log','branch-verify.log','focused-new-failures.log']:
        z.writestr(name,(R/'checks'/name).read_bytes())
shutil.copy2(R/'prepare-publication.py',A/'prepare-publication.py')
shutil.copy2(R/'audit-registered-source-archive.py',A/'audit-registered-source-archive.py')
shutil.copy2(R/'registered-source-archive-audit.json',A/'registered-source-archive-audit.json')
recordpath=REPO/'docs/exercise-art/releases/2026-10-14/kettlebell-swing.json'
record=read(recordpath)
record['integrationValidation']=f"Actual registered native/mobile390x844 light/dark/card/setup/controls passed; all896 prior art preserved. Normal lint/art/drafts/cycles/build/size passed. Full Windows branch{branch['failed']}failed/{branch['passed']}passed/{branch['skipped']}skip versus fresh cleanAF baseline{baseline['failed']}failed/{baseline['passed']}passed/{baseline['skipped']}skip: two baseline generator-byte failures resolved; two new full-run failures passed focused whole-file testing. Five existing helper detail changes came from the runner's Git Bash PATH omission; correct-baseline-PATH focused run restores baseline helper details. Exact comparison/focused results/raw logs archived; full Windows suite remains non-green. Required current-head Linux CI and actualmerge remain before completion credit."
save(recordpath,record)
provenance=read(A/'provenance.json')
provenance['archiveStatus']='Actual registered mobile/native/card acceptance and normal project verification completed with Windows failure limitation recorded. Required current-head CI and actualmerge pending.'
provenance['projectChecks']='project-checks.json'
save(A/'provenance.json',provenance)
print(json.dumps(dict(projectChecks=checks,sourceSealPending=True)))
