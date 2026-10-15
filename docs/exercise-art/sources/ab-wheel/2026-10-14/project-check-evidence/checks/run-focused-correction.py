"""One normal whole-file batch after the owner-confirmed Ab Wheel t correction."""
from pathlib import Path
from hashlib import sha256
import json, os, re, runpy, shutil, subprocess, time

CHECKS=Path(__file__).resolve().parent
HELPER=CHECKS/'branch-verify-tools.py'
TARGETS=['src/lib/__tests__/bodyRig.test.ts','src/lib/__tests__/formArtOwnerRelease.test.ts','scripts/art/form-art-releases.test.ts','src/features/program/__tests__/trainingBlock.timezone.test.ts','scripts/release-debug-token.test.ts']
PREFIX='focused-correction'
BEFORE_T=[0,.2,.4,.6,.8,1]
AFTER_T=[0,.5,1,1,.5,0]

def main():
    ns=runpy.run_path(str(HELPER),run_name='focused_correction_helpers')
    repo,node,npm=ns['REPO'],ns['NODE'],ns['NPM']
    save,digest,stamp=ns['save_json'],ns['digest'],ns['stamp']
    if (CHECKS/f'{PREFIX}.log').exists():raise RuntimeError('Focused batch already exists; no silent retry permitted.')
    first=json.loads((CHECKS/'branch-verify-result.json').read_text())
    comparison=json.loads((CHECKS/'branch-failure-comparison.json').read_text())
    assert first['status']=='terminal' and comparison['comparisonComplete'] and comparison['inputStatePreserved']
    proof=json.loads((CHECKS/'branch-first-run-proof-hashes.json').read_text())
    for name,h in proof['hashes'].items():assert digest((CHECKS/name).read_bytes())==h,f'First full evidence changed: {name}'
    baseline=ns['load_baseline']()
    before=ns['working_manifest']()
    full_inputs=json.loads((CHECKS/'branch-input-manifest.json').read_text())
    changes=[p for p in sorted(set(before)|set(full_inputs)) if before.get(p)!=full_inputs.get(p)]
    assert changes==['src/lib/releasedFormPlacards.ts'],f'Unexpected changes since frozen full run: {changes}'
    placard_path=repo/changes[0];current=placard_path.read_bytes();text=current.decode('utf-8')
    block=re.search(r'"ab-wheel"\s*:\s*placard\((.*?)\n\s*\),',text,re.S)
    assert block,'Ab Wheel placard block not found.'
    row_pattern=re.compile(r'(?m)^(\s*\[)(\d+(?:\.\d+)?)(\s*,\s*"(?:\\.|[^"\\])*"\s*,)')
    rows=list(row_pattern.finditer(block.group(1)))
    assert [float(m.group(2)) for m in rows]==AFTER_T,'Actual t positions do not match confirmed correction.'
    it=iter(BEFORE_T)
    restored_block=row_pattern.sub(lambda m:m.group(1)+str(next(it)).replace('0.2','0.2')+m.group(3),block.group(1))
    restored_text=text[:block.start(1)]+restored_block+text[block.end(1):]
    only_numeric_fix_proven=digest(restored_text.encode('utf-8'))==full_inputs[changes[0]]
    assert only_numeric_fix_proven,'Reconstructed pre-correction file does not match first full input hash.'
    (CHECKS/f'{PREFIX}-placard-before-run.ts.txt').write_bytes(current)
    snapshot=repo/ns['SNAPSHOT'];snapshot_bytes=snapshot.read_bytes()
    (CHECKS/f'{PREFIX}-planSweep-before.snap').write_bytes(snapshot_bytes)
    save(CHECKS/f'{PREFIX}-input-manifest.json',before)
    env=os.environ.copy();prefixes=[str(node.parent),str(npm.parents[2]/'.bin'),'C:/Program Files/Git/bin']
    env['PATH']=os.pathsep.join(prefixes+[env.get('PATH','')])
    resolved={n:shutil.which(n,path=env['PATH']) for n in ['node','npm','npm.cmd','git','bash']}
    assert Path(resolved['bash']).samefile(Path('C:/Program Files/Git/bin/bash.exe'))
    meta={'phase':'normal-whole-file-focus-after-actual-correction','status':'running','startedAt':stamp(),'head':ns['git']('rev-parse','HEAD').strip(),'initialStatus':ns['status'](),
          'targets':TARGETS,'command':'npm run test -- '+' '.join(TARGETS),'actualInvocation':[str(node),str(npm),'run','test','--',*TARGETS],
          'pathPrefixes':prefixes,'resolvedExecutables':resolved,'testNameFilters':False,'retryAdded':False,'timeoutChanges':False,
          'firstFullLogSha256':comparison['branchResult']['logSha256'],'freshBaselineHead':baseline['head'],'freshBaselineLogSha256':baseline['logSha256'],
          'actualCorrection':{'file':changes[0],'beforeT':BEFORE_T,'afterT':AFTER_T,'onlyNumericPositionsChangedProvenByReconstructionHash':True,'beforeFileSha256':full_inputs[changes[0]],'afterFileSha256':digest(current),'allOtherFrozenFileBytesUnchanged':True,'imagesLabelsCuesSetupUnchanged':True},
          'snapshotBeforeSha256':digest(snapshot_bytes)}
    result_path=CHECKS/f'{PREFIX}-result.json';save(result_path,meta)
    print(json.dumps({'status':'running','targets':TARGETS,'actualCorrection':meta['actualCorrection'],'bash':resolved['bash']},indent=2),flush=True)
    started=time.perf_counter();exit_code=None
    try:
        with (CHECKS/f'{PREFIX}.log').open('wb') as log:
            exit_code=subprocess.run(meta['actualInvocation'],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT).returncode
    finally:
        meta['elapsedSeconds']=round(time.perf_counter()-started,3);meta['afterRunStatus']=ns['status']()
        after_snapshot=snapshot.read_bytes();meta['snapshotRestoredFromExactBytes']=after_snapshot!=snapshot_bytes
        if after_snapshot!=snapshot_bytes:
            (CHECKS/f'{PREFIX}-planSweep-after-run.snap').write_bytes(after_snapshot);snapshot.write_bytes(snapshot_bytes)
        final=ns['working_manifest']();changed=[p for p in sorted(set(before)|set(final)) if before.get(p)!=final.get(p)]
        meta.update({'status':'terminal','finishedAt':stamp(),'exitCode':exit_code,'finalHead':ns['git']('rev-parse','HEAD').strip(),'finalStatus':ns['status'](),'snapshotFinalSha256':digest(snapshot.read_bytes()),'unexpectedFileByteChanges':changed,'inputBytesUnchanged':not changed})
        parsed=ns['parse_log'](CHECKS/f'{PREFIX}.log');meta['actualTestResult']=parsed
        complete=parsed['testFiles'] is not None and parsed['tests'] is not None and parsed['testFiles']['total']==5
        preserved=not changed and meta['head']==meta['finalHead'] and sorted(meta['initialStatus'])==sorted(meta['finalStatus']) and snapshot.read_bytes()==snapshot_bytes
        passed=complete and preserved and exit_code==0 and parsed['testFiles']['failed']==0 and parsed['tests']['failed']==0
        meta.update({'completeFiveWholeFileResult':complete,'inputStatePreserved':preserved,'allFiveWholeFilesPassed':passed,'firstFullRunRemainsNonGreen':True,'actualRegressionDisposition':'fixed-whole-file-pass-reviewed' if passed else 'correction-not-proven-by-focus','timeoutDisposition':'normal-whole-file-nonreproduction' if passed else 'not-resolved','limitations':'Passing this normal batch does not relabel the first full run green or its new timeout cases pre-existing. Root reviews the evidence; final full current-head required CI remains mandatory.'})
        save(result_path,meta)
        for name,h in proof['hashes'].items():assert digest((CHECKS/name).read_bytes())==h,f'First full evidence changed: {name}'
        print(json.dumps({k:meta[k] for k in ['status','exitCode','elapsedSeconds','completeFiveWholeFileResult','inputStatePreserved','allFiveWholeFilesPassed','actualRegressionDisposition','timeoutDisposition']},indent=2),flush=True)
        print(json.dumps({'testFiles':parsed['testFiles'],'tests':parsed['tests'],'failures':parsed['failures']},indent=2),flush=True)
    raise SystemExit(exit_code if preserved and exit_code is not None else 2)

if __name__=='__main__':main()
