"""Fresh normal verify at clean current main; never imports previous result counts."""
from pathlib import Path
from datetime import datetime, timezone
from hashlib import sha256
import json, os, runpy, shutil, subprocess, sys, time

OUT=Path(__file__).resolve().parent
REPO=Path('C:/Users/myles/Documents/Codex/2026-10-04/lg/work/Maiin-burpees')
EXPECTED_HEAD='82d6d829ad20ad3c8924933f736ad615b83054f6'
NODE=Path('C:/Users/myles/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
NPM=Path('C:/Users/myles/Documents/Codex/2026-10-04/lg/work/merge-reviewed-20261012/runtime/node_modules/npm/bin/npm-cli.js')
GIT=Path('C:/Program Files/Git/bin/git.exe')
HELPER=Path('C:/Users/myles/Documents/Codex/2026-10-04/lg/work/kettlebell-swing/retained-no-shorts-cycle-20261014/checks/branch-verify-tools.py')
SNAP='src/features/program/__tests__/__snapshots__/planSweep.golden.test.ts.snap'
REQUIRED=['lint','check:form-art','check:form-drafts','check:cycles','build','check:dist-size','test']
stamp=lambda:datetime.now(timezone.utc).isoformat()
digest=lambda b:sha256(b).hexdigest()
save=lambda p,obj:p.write_text(json.dumps(obj,indent=2)+'\n',encoding='utf-8')
git=lambda *args:subprocess.check_output([str(GIT),*args],cwd=REPO,text=True).strip()

def main():
    # Reuse only actual file-manifest and log-parser helpers. No old baseline
    # log/result/comparison is read and no helper execution command is invoked.
    helper=runpy.run_path(str(HELPER),run_name='ab_wheel_fresh_baseline_helpers')
    if (OUT/'baseline-verify.log').exists():
        raise RuntimeError('Baseline log already exists; do not silently rerun or overwrite it.')
    for path in [NODE,NPM,GIT,HELPER,REPO/SNAP]:
        if not path.is_file():raise RuntimeError('Required prepared input missing: '+str(path))
    head=git('rev-parse','HEAD');branch=git('branch','--show-current');status=git('status','--porcelain=v1').splitlines()
    if head!=EXPECTED_HEAD or branch!='main' or status:
        raise RuntimeError('Fresh baseline must start on exact clean current main: '+json.dumps({'head':head,'branch':branch,'status':status}))
    before=helper['working_manifest']();save(OUT/'baseline-input-manifest.json',before)
    snapshot=REPO/SNAP;before_snapshot=snapshot.read_bytes();(OUT/'baseline-planSweep-before.snap').write_bytes(before_snapshot)
    env=os.environ.copy()
    prefixes=[str(NODE.parent),str(NPM.parents[2]/'.bin'),'C:/Program Files/Git/bin']
    env['PATH']=os.pathsep.join(prefixes+[env.get('PATH','')])
    resolved={name:shutil.which(name,path=env['PATH']) for name in ['node','npm','npm.cmd','git','bash']}
    if not resolved['bash'] or not Path(resolved['bash']).samefile(Path('C:/Program Files/Git/bin/bash.exe')):
        raise RuntimeError('Known correct Git Bash is not resolved first: '+str(resolved['bash']))
    versions={name:subprocess.check_output(cmd,env=env,cwd=REPO,text=True).strip() for name,cmd in [('node',[str(NODE),'--version']),('npm',[str(NODE),str(NPM),'--version']),('git',[str(GIT),'--version'])]}
    shim=Path(resolved['npm.cmd']) if resolved['npm.cmd'] else None
    meta={'phase':'fresh-current-main-baseline','status':'running','startedAt':stamp(),'head':head,'branch':branch,'initialStatus':status,
          'command':'npm run verify','actualInvocation':[str(NODE),str(NPM),'run','verify'],'versions':versions,
          'pathPrefixes':prefixes,'resolvedExecutables':resolved,'npmCliSha256':digest(NPM.read_bytes()),
          'npmCommandShimSha256':digest(shim.read_bytes()) if shim and shim.is_file() else None,
          'reusedHelperPath':str(HELPER),'reusedHelperSha256':digest(HELPER.read_bytes()),'oldResultDataImported':False,
          'snapshotPath':SNAP,'snapshotBeforeSha256':digest(before_snapshot),'snapshotBackup':str(OUT/'baseline-planSweep-before.snap'),
          'inputFileCount':len(before),'inputManifestSha256':digest((OUT/'baseline-input-manifest.json').read_bytes()),
          'normalIgnoredRunnerArtifactsMayBeWritten':True,'logPath':str(OUT/'baseline-verify.log')}
    result=OUT/'baseline-verify-result.json';save(result,meta)
    print(json.dumps({'status':'running','head':head,'command':meta['command'],'versions':versions,'bash':resolved['bash'],'log':meta['logPath']},indent=2),flush=True)
    started=time.perf_counter();exit_code=None;run_error=None
    try:
        with (OUT/'baseline-verify.log').open('wb') as log:
            exit_code=subprocess.run(meta['actualInvocation'],cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT).returncode
    except BaseException as exc:
        run_error=repr(exc)
    finally:
        meta['elapsedSeconds']=round(time.perf_counter()-started,3)
        meta['afterRunStatus']=git('status','--porcelain=v1').splitlines()
        after_snapshot=snapshot.read_bytes();meta['snapshotAfterRunSha256']=digest(after_snapshot)
        meta['snapshotRestoredFromExactSavedBytes']=after_snapshot!=before_snapshot
        if after_snapshot!=before_snapshot:
            (OUT/'baseline-planSweep-after-run.snap').write_bytes(after_snapshot)
            snapshot.write_bytes(before_snapshot)
        final=helper['working_manifest']();save(OUT/'baseline-final-input-manifest.json',final)
        changed=[p for p in sorted(set(before)|set(final)) if before.get(p)!=final.get(p)]
        meta.update({'status':'terminal','finishedAt':stamp(),'exitCode':exit_code,'runError':run_error,'finalHead':git('rev-parse','HEAD'),
                     'finalBranch':git('branch','--show-current'),'finalStatus':git('status','--porcelain=v1').splitlines(),
                     'snapshotFinalSha256':digest(snapshot.read_bytes()),'unexpectedTrackedOrNonIgnoredFileChanges':changed,
                     'inputBytesUnchanged':not changed,'snapshotBytesExactAfterRestoration':snapshot.read_bytes()==before_snapshot,
                     'repoHeadAndBranchUnchanged':git('rev-parse','HEAD')==head and git('branch','--show-current')==branch})
        parsed=helper['parse_log'](OUT/'baseline-verify.log');save(OUT/'baseline-failure-identities.json',parsed)
        meta['actualMeasuredLog']=parsed
        summaries=parsed['testFiles'] is not None and parsed['tests'] is not None
        totals_valid=summaries and all(row['total']==sum(row[k] for k in ['failed','passed','skipped']) for row in [parsed['testFiles'],parsed['tests']])
        meta['allNormalVerifyStagesInvoked']=parsed['stagesInvoked']==REQUIRED
        meta['fullResultSummariesPresentAndTotalsConsistent']=bool(totals_valid)
        meta['inputStatePreserved']=meta['inputBytesUnchanged'] and meta['snapshotBytesExactAfterRestoration'] and meta['repoHeadAndBranchUnchanged'] and not meta['finalStatus']
        save(result,meta)
        save(OUT/'baseline-inputs.json',{k:meta[k] for k in ['head','branch','initialStatus','versions','pathPrefixes','resolvedExecutables','npmCliSha256','npmCommandShimSha256','reusedHelperPath','reusedHelperSha256','oldResultDataImported','snapshotPath','snapshotBeforeSha256','inputFileCount','inputManifestSha256']})
        print(json.dumps({k:meta[k] for k in ['status','head','exitCode','elapsedSeconds','inputStatePreserved','allNormalVerifyStagesInvoked','fullResultSummariesPresentAndTotalsConsistent']},indent=2),flush=True)
        print(json.dumps({'freshTestFiles':parsed['testFiles'],'freshTests':parsed['tests'],'failureHeaders':parsed['failureHeaderCount']},indent=2),flush=True)
    raise SystemExit(exit_code if meta['inputStatePreserved'] and exit_code is not None else 2)

if __name__=='__main__':main()
