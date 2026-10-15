"""Measure one fresh normal verify on an isolated exact-base checkout.

No source checkout reset/stash/mutation; local shared clone uses immutable Git
objects. Existing prepared dependencies and npm/Git Bash shims are reused.
"""
from pathlib import Path
from datetime import datetime, timezone
from hashlib import sha256
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time

R = Path(__file__).resolve().parent
OUT = R / 'baseline'
SOURCE = R.parent / 'Maiin-burpees'
REPO = R / 'baseline-checkout-fbc3e887'
EXPECTED_HEAD = 'fbc3e8879b43086da0488ed8e387953bdb1af911'
NODE = Path('C:/Users/myles/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
NPM = R.parent / 'merge-reviewed-20261012/runtime/node_modules/npm/bin/npm-cli.js'
GIT = Path('C:/Program Files/Git/bin/git.exe')
HELPER = R.parent / 'ab-wheel/intact-whole-athlete-production-20261014/checks/branch-verify-tools.py'
SNAP = 'src/features/program/__tests__/__snapshots__/planSweep.golden.test.ts.snap'
REQUIRED = ['lint', 'check:form-art', 'check:form-drafts', 'check:cycles', 'build', 'check:dist-size', 'test']
stamp = lambda: datetime.now(timezone.utc).isoformat()
digest = lambda data: sha256(data).hexdigest()
save = lambda path, data: path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')

def git(*args, cwd=REPO):
    return subprocess.check_output([str(GIT), *args], cwd=cwd, text=True).strip()

def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)

def main():
    require(not OUT.exists() and not REPO.exists(), 'Preserve all previous evidence/checkouts; both new paths must be absent.')
    for path in [NODE, NPM, GIT, HELPER, SOURCE / 'package-lock.json']:
        require(path.is_file(), 'Required prepared input missing: ' + str(path))
    require((SOURCE / 'node_modules').is_dir(), 'Prepared dependency directory missing.')
    require(git('cat-file', '-t', EXPECTED_HEAD, cwd=SOURCE) == 'commit', 'Requested baseline commit missing locally.')
    OUT.mkdir()
    setup_started = stamp()
    clone_cmd = [str(GIT), '-c', 'core.longpaths=true', 'clone', '--shared', '--local', '--no-checkout', str(SOURCE), str(REPO)]
    with (OUT / 'baseline-checkout-setup.log').open('wb') as log:
        subprocess.run(clone_cmd, stdout=log, stderr=subprocess.STDOUT, check=True)
        subprocess.run([str(GIT), 'config', 'core.longpaths', 'true'], cwd=REPO, stdout=log, stderr=subprocess.STDOUT, check=True)
        subprocess.run([str(GIT), 'checkout', '--detach', EXPECTED_HEAD], cwd=REPO, stdout=log, stderr=subprocess.STDOUT, check=True)
        quote = lambda value: "'" + str(value).replace("'", "''") + "'"
        command = 'New-Item -ItemType Junction -Path ' + quote(REPO / 'node_modules') + ' -Target ' + quote(SOURCE / 'node_modules') + ' | Out-Null'
        subprocess.run(['powershell.exe', '-NoProfile', '-Command', command], stdout=log, stderr=subprocess.STDOUT, check=True)
    require((REPO / 'node_modules').resolve() == (SOURCE / 'node_modules').resolve(), 'Dependency junction resolves to unexpected directory.')
    head = git('rev-parse', 'HEAD')
    branch = git('branch', '--show-current')
    initial = git('status', '--porcelain=v1').splitlines()
    require(head == EXPECTED_HEAD and not branch and not initial, 'Isolated exact baseline must be clean and detached.')
    save(OUT / 'baseline-checkout-setup.json', {
        'startedAt': setup_started, 'finishedAt': stamp(), 'sourceRepository': str(SOURCE),
        'isolatedRepository': str(REPO), 'head': head, 'detached': not branch, 'initialStatus': initial,
        'cloneCommand': clone_cmd, 'dependencyJunction': str(REPO / 'node_modules'),
        'dependencyTarget': str((REPO / 'node_modules').resolve()),
        'sourceRepositoryStashResetOrCheckoutPerformed': False,
        'usesReadOnlySharedImmutableGitObjects': True,
        'freshCheckoutFromCommitExcludesActiveDirtyEdits': True,
        'trackedPackageLockSha256': digest((REPO / 'package-lock.json').read_bytes()),
    })

    # Import only existing utility definitions; never execute its run/compare or
    # read historical baseline logs, identity lists or counts.
    spec = importlib.util.spec_from_file_location('retained_endpoint_verify_utilities', HELPER)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    helper.REPO = REPO
    before = helper.working_manifest()
    save(OUT / 'baseline-input-manifest.json', before)
    snapshot = REPO / SNAP
    before_snapshot = snapshot.read_bytes()
    (OUT / 'baseline-planSweep-before.snap').write_bytes(before_snapshot)
    env = os.environ.copy()
    prefixes = [str(NODE.parent), str(NPM.parents[2] / '.bin'), 'C:/Program Files/Git/bin']
    env['PATH'] = os.pathsep.join(prefixes + [env.get('PATH', '')])
    resolved = {name: shutil.which(name, path=env['PATH']) for name in ['node', 'npm', 'npm.cmd', 'git', 'bash']}
    require(resolved['bash'] and Path(resolved['bash']).samefile(Path('C:/Program Files/Git/bin/bash.exe')), 'Prepared Git Bash must resolve first.')
    versions = {name: subprocess.check_output(command, cwd=REPO, env=env, text=True).strip() for name, command in [
        ('node', [str(NODE), '--version']), ('npm', [str(NODE), str(NPM), '--version']), ('git', [str(GIT), '--version'])]}
    shim = Path(resolved['npm.cmd']) if resolved['npm.cmd'] else None
    meta = {
        'phase': 'fresh-isolated-fbc3e887-baseline', 'status': 'running', 'startedAt': stamp(),
        'head': head, 'branch': branch, 'detachedCleanCheckout': True, 'initialStatus': initial,
        'sourceRepository': str(SOURCE), 'repository': str(REPO),
        'command': 'npm run verify', 'actualInvocation': [str(NODE), str(NPM), 'run', 'verify'],
        'versions': versions, 'pathPrefixes': prefixes, 'resolvedExecutables': resolved,
        'npmCliSha256': digest(NPM.read_bytes()),
        'npmCommandShimSha256': digest(shim.read_bytes()) if shim and shim.is_file() else None,
        'reusedHelperPath': str(HELPER), 'reusedHelperSha256': digest(HELPER.read_bytes()),
        'reusedHelperFunctions': ['working_manifest', 'parse_log'], 'helperRepoOverride': str(REPO),
        'runnerSha256': digest(Path(__file__).read_bytes()), 'oldResultDataImported': False,
        'testFilteringTimeoutConcurrencyOverrides': False,
        'snapshotPath': SNAP, 'snapshotBeforeSha256': digest(before_snapshot),
        'inputFileCount': len(before), 'inputManifestSha256': digest((OUT / 'baseline-input-manifest.json').read_bytes()),
        'normalIgnoredRunnerArtifactsMayBeWritten': True, 'logPath': str(OUT / 'baseline-verify.log'),
    }
    result = OUT / 'baseline-verify-result.json'
    save(result, meta)
    print(json.dumps({key: meta[key] for key in ['status','head','repository','command','actualInvocation','versions','logPath']}, indent=2), flush=True)
    started = time.perf_counter()
    exit_code = None
    run_error = None
    try:
        with (OUT / 'baseline-verify.log').open('wb') as log:
            exit_code = subprocess.run(meta['actualInvocation'], cwd=REPO, env=env, stdout=log, stderr=subprocess.STDOUT).returncode
    except BaseException as exc:
        run_error = repr(exc)
    finally:
        meta['elapsedSeconds'] = round(time.perf_counter() - started, 3)
        meta['afterRunStatus'] = git('status', '--porcelain=v1').splitlines()
        after_snapshot = snapshot.read_bytes()
        meta['snapshotAfterRunSha256'] = digest(after_snapshot)
        meta['snapshotRestoredFromExactSavedBytes'] = after_snapshot != before_snapshot
        if after_snapshot != before_snapshot:
            (OUT / 'baseline-planSweep-after-run.snap').write_bytes(after_snapshot)
            snapshot.write_bytes(before_snapshot)
        final = helper.working_manifest()
        save(OUT / 'baseline-final-input-manifest.json', final)
        changed = [path for path in sorted(set(before) | set(final)) if before.get(path) != final.get(path)]
        parsed = helper.parse_log(OUT / 'baseline-verify.log')
        parsed['head'] = head
        save(OUT / 'baseline-failure-identities.json', parsed)
        summaries = parsed['testFiles'] is not None and parsed['tests'] is not None
        totals_valid = summaries and all(row['total'] == sum(row[kind] for kind in ['failed','passed','skipped']) for row in [parsed['testFiles'],parsed['tests']])
        header_files = {row['file'] for row in parsed['failures']}
        accounting = summaries and None not in header_files and len(header_files) == parsed['testFiles']['failed'] and (parsed['tests']['failed'] == 0 or bool(parsed['failures']))
        meta.update({
            'status': 'terminal', 'finishedAt': stamp(), 'exitCode': exit_code, 'runError': run_error,
            'finalHead': git('rev-parse','HEAD'), 'finalBranch': git('branch','--show-current'),
            'finalStatus': git('status','--porcelain=v1').splitlines(),
            'snapshotFinalSha256': digest(snapshot.read_bytes()), 'unexpectedTrackedOrNonIgnoredFileChanges': changed,
            'inputBytesUnchanged': not changed, 'snapshotBytesExactAfterRestoration': snapshot.read_bytes() == before_snapshot,
            'repoHeadAndBranchUnchanged': git('rev-parse','HEAD') == head and not git('branch','--show-current'),
            'actualMeasuredLog': parsed, 'allNormalVerifyStagesInvoked': parsed['stagesInvoked'] == REQUIRED,
            'fullResultSummariesPresentAndTotalsConsistent': bool(totals_valid),
            'failureHeaderFileAccountingComplete': bool(accounting),
        })
        meta['inputStatePreserved'] = meta['inputBytesUnchanged'] and meta['snapshotBytesExactAfterRestoration'] and meta['repoHeadAndBranchUnchanged'] and not meta['finalStatus']
        meta['overallGreen'] = exit_code == 0 and bool(totals_valid) and parsed['testFiles']['failed'] == 0 and parsed['tests']['failed'] == 0 and meta['allNormalVerifyStagesInvoked'] and meta['inputStatePreserved']
        save(result, meta)
        save(OUT / 'baseline-proof-hashes.json', {path.name: digest(path.read_bytes()) for path in sorted(OUT.iterdir()) if path.is_file() and path.name != 'baseline-proof-hashes.json'})
        print(json.dumps({key:meta[key] for key in ['status','head','exitCode','elapsedSeconds','inputStatePreserved','allNormalVerifyStagesInvoked','fullResultSummariesPresentAndTotalsConsistent','failureHeaderFileAccountingComplete','overallGreen']}, indent=2), flush=True)
        print(json.dumps({'freshTestFiles':parsed['testFiles'],'freshTests':parsed['tests'],'failureHeaders':parsed['failureHeaderCount']}, indent=2), flush=True)
    raise SystemExit(exit_code if meta['inputStatePreserved'] and exit_code is not None else 2)

if __name__ == '__main__':
    main()
