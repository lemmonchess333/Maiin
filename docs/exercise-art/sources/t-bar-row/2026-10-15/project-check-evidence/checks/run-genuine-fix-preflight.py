"""Prepared only: one normal complete-file preflight of genuine fixes.

Captures current inputs rather than pretending they match the earlier full run.
No test filters/retries/timeout/concurrency changes. No full-run failure waiver,
non-reproduction classification, release decision, publication or completion.
Parent executes only after final caption/cue-hash correction is frozen.
"""
from pathlib import Path, PurePosixPath
import argparse, json, os, re, runpy, shutil, subprocess, time

CHECKS = Path(__file__).resolve().parent
BASE = 'fbc3e8879b43086da0488ed8e387953bdb1af911'

def require(ok, why):
    if not ok:
        raise RuntimeError('Genuine-fix preflight refused: ' + why)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--prefix', required=True)
    p.add_argument('--full-prefix', default='branch3')
    p.add_argument('--reason', required=True)
    p.add_argument('--files', nargs='+', required=True)
    args = p.parse_args()
    require(all(re.fullmatch(r'[a-z][a-z0-9-]*', x) for x in [args.prefix, args.full_prefix]) and args.prefix != args.full_prefix, 'Distinct safe evidence prefixes required')
    ns = runpy.run_path(str(CHECKS / 'branch-verify-tools.py'), run_name='genuine_fix_preflight_readonly_helpers')
    verified_baseline = ns['load_baseline']()
    repo, node, npm = [ns[k] for k in ['REPO', 'NODE', 'NPM']]
    save, digest, stamp, parse = [ns[k] for k in ['save_json', 'digest', 'stamp', 'parse_log']]
    read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
    prefix = args.prefix
    log_path, result_path = CHECKS / f'{prefix}.log', CHECKS / f'{prefix}-result.json'
    require(not any(p for p in CHECKS.glob(prefix + '*') if p.name != 'genuine-fix-preflight-preparation.json'), 'No silent retry/overwrite; preserve prior preflight evidence')
    meta_full = read(CHECKS / f'{args.full_prefix}-verify-result.json')
    comparison = read(CHECKS / f'{args.full_prefix}-failure-comparison.json')
    full_log = CHECKS / f'{args.full_prefix}-verify.log'
    full_inputs_path = CHECKS / f'{args.full_prefix}-input-manifest.json'
    baseline_path = CHECKS.parent / 'baseline/baseline-verify-result.json'
    baseline_log = CHECKS.parent / 'baseline/baseline-verify.log'
    baseline = read(baseline_path)
    require(verified_baseline.get('head') == BASE and verified_baseline.get('logSha256') == digest(baseline_log.read_bytes()), 'Fresh baseline proof map/log bindings required')
    require(baseline.get('status') == 'terminal' and baseline.get('head') == BASE and baseline.get('inputStatePreserved') is True and baseline.get('oldResultDataImported') is False, 'Actual fresh fbc baseline required')
    require(meta_full.get('status') == 'terminal' and meta_full.get('command') == 'npm run verify' and meta_full.get('baselineHead') == BASE and meta_full.get('baselineLogSha256') == digest(baseline_log.read_bytes()), 'Actual normal full candidate tied to fresh baseline required')
    require(all(comparison.get(k) is True for k in ['comparisonComplete', 'comparisonValid', 'allNormalVerifyStagesPresent', 'inputStatePreserved']), 'Complete preserved full comparison required')
    require(comparison.get('branchResult') == parse(full_log), 'Actual full log must match comparison')
    failed_files = {f['file'] for f in comparison['branchResult']['failures']}
    targets = args.files
    require(len(targets) == len(set(targets)) and targets, 'Unique complete test files required')
    for name in targets:
        path = PurePosixPath(name)
        require(re.fullmatch(r'[^\s]+\.test\.[cm]?[jt]sx?', name) and not name.startswith('-') and not path.is_absolute() and '..' not in path.parts and '\\' not in name and ':' not in name, 'Only ordinary complete test-file arguments allowed')
        require((repo / name).resolve().is_relative_to(repo.resolve()) and (repo / name).is_file(), 'Each target must be an actual complete test file')
    before, full_inputs = ns['working_manifest'](), read(full_inputs_path)
    changes = [n for n in sorted(set(before) | set(full_inputs)) if before.get(n) != full_inputs.get(n)]
    require(args.reason.strip(), 'Explicit genuine-fix context required')
    allowed_code = {'src/lib/releasedFormPlacards.ts', 'src/lib/__tests__/bodyRig.test.ts', 'src/components/program/__tests__/ExerciseRowSummary.test.tsx', 'src/lib/formArtwork.ts'}
    code_changes = [n for n in changes if n.startswith(('src/', 'scripts/')) or n in ['package.json', 'package-lock.json']]
    require(code_changes and set(code_changes).issubset(allowed_code), 'Only reviewed caption/fixture changes and exact owner-count comment correction are permitted: ' + repr(code_changes))
    comment_proof = None
    if 'src/lib/formArtwork.ts' in code_changes:
        current_comment = (repo / 'src/lib/formArtwork.ts').read_bytes()
        old_text, new_text = b'standard. Three', b'standard. Five'
        require(current_comment.count(new_text) == 1 and digest(current_comment.replace(new_text, old_text, 1)) == full_inputs['src/lib/formArtwork.ts'], 'formArtwork exception permits ONLY exact owner-count header Three-to-Five correction')
        comment_proof = {'path': 'src/lib/formArtwork.ts', 'beforeSha256': full_inputs['src/lib/formArtwork.ts'], 'currentSha256': digest(current_comment), 'exactOldCommentText': old_text.decode(), 'exactNewCommentText': new_text.decode(), 'reverseCorrectionReconstructsPriorFullRunHash': True}
    require(not any(n.startswith(('public/form-frames/', 'public/form-art/', 'masters/', 'docs/exercise-art/identity/')) for n in changes), 'No accepted artwork/model changes allowed in this preflight')
    require(ns['git']('rev-parse', 'HEAD').strip() == meta_full['head'] == meta_full['finalHead'], 'Actual full-run HEAD must remain unchanged')
    require(ns['SNAPSHOT'] == 'src/features/program/__tests__/__snapshots__/planSweep.golden.test.ts.snap', 'Only known snapshot restoration is permitted')
    snapshot = repo / ns['SNAPSHOT']
    snapshot_bytes = snapshot.read_bytes()
    snapshot_proof, inputs_proof = CHECKS / f'{prefix}-planSweep-before.snap', CHECKS / f'{prefix}-input-manifest.json'
    snapshot_proof.write_bytes(snapshot_bytes)
    save(inputs_proof, before)
    full_pins = {str(path.relative_to(CHECKS.parent).as_posix()): digest(path.read_bytes()) for path in [CHECKS / f'{args.full_prefix}-verify-result.json', CHECKS / f'{args.full_prefix}-failure-comparison.json', full_log, full_inputs_path, baseline_path, baseline_log]}
    env = os.environ.copy()
    path_prefixes = [str(node.parent), str(npm.parents[2] / '.bin'), 'C:/Program Files/Git/bin']
    env['PATH'] = os.pathsep.join(path_prefixes + [env.get('PATH', '')])
    resolved = {name: shutil.which(name, path=env['PATH']) for name in ['node', 'npm', 'npm.cmd', 'git', 'bash']}
    require(resolved.get('bash') and Path(resolved['bash']).samefile(Path('C:/Program Files/Git/bin/bash.exe')), 'Normal Git Bash runtime required')
    result = {'phase': 'normal-whole-file-genuine-fix-preflight-before-next-full-run', 'status': 'running', 'startedAt': stamp(), 'head': ns['git']('rev-parse', 'HEAD').strip(), 'initialStatus': ns['status'](), 'targets': targets, 'command': 'npm run test -- ' + ' '.join(targets), 'actualInvocation': [str(node), str(npm), 'run', 'test', '--', *targets], 'pathPrefixes': path_prefixes, 'resolvedExecutables': resolved, 'testNameFilters': False, 'retryAdded': False, 'timeoutChanges': False, 'concurrencyOverrides': False, 'freshBaselineHead': BASE, 'freshBaselineLogSha256': digest(baseline_log.read_bytes()), 'fullRunEvidenceHashes': full_pins, 'changedInputsSincePriorFullRun': changes, 'reviewedSourceChangesSincePriorFullRun': code_changes, 'genuineFixReason': args.reason, 'unchangedCodeNonReproductionClaim': False, 'priorFullFailureWaived': False, 'replacementForNextFullVerify': False, 'inputManifest': 'checks/' + inputs_proof.name, 'inputManifestSha256': digest(inputs_proof.read_bytes()), 'snapshotBefore': 'checks/' + snapshot_proof.name, 'snapshotBeforeSha256': digest(snapshot_bytes), 'limitations': 'This checks current genuine fixes only. The earlier non-green full run remains unchanged; no unchanged-code non-reproduction or pre-existing classification is supplied. Next normal full verify, actual parent correction review and current-head required CI remain separate.'}
    result['exactOwnerCountCommentCorrection'] = comment_proof
    save(result_path, result)
    print(json.dumps({'status': 'running', 'targets': targets, 'freshBaselineHead': BASE, 'prefix': prefix}), flush=True)
    start, exit_code = time.perf_counter(), None
    try:
        with log_path.open('wb') as log:
            exit_code = subprocess.run(result['actualInvocation'], cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT).returncode
    finally:
        after_snapshot = snapshot.read_bytes()
        result['snapshotRestoredFromExactBytes'] = after_snapshot != snapshot_bytes
        if after_snapshot != snapshot_bytes:
            proof = CHECKS / f'{prefix}-planSweep-after-run.snap'
            proof.write_bytes(after_snapshot)
            result['snapshotAfterRun'] = 'checks/' + proof.name
            result['snapshotAfterRunSha256'] = digest(after_snapshot)
            snapshot.write_bytes(snapshot_bytes)
        final = ns['working_manifest']()
        changed = [n for n in sorted(set(before) | set(final)) if before.get(n) != final.get(n)]
        parsed = parse(log_path)
        final_head, final_status = ns['git']('rev-parse', 'HEAD').strip(), ns['status']()
        preserved = not changed and result['head'] == final_head and sorted(result['initialStatus']) == sorted(final_status) and snapshot.read_bytes() == snapshot_bytes
        complete = parsed['testFiles'] is not None and parsed['tests'] is not None and parsed['testFiles']['total'] >= len(targets) and all(c['total'] == sum(c[k] for k in ['failed', 'passed', 'skipped']) for c in [parsed['testFiles'], parsed['tests']])
        passed = complete and preserved and exit_code == 0 and parsed['testFiles']['failed'] == 0 and parsed['tests']['failed'] == 0 and parsed['tests']['passed'] > 0 and not parsed['failures']
        require(all(digest((CHECKS.parent / name).read_bytes()) == expected for name, expected in full_pins.items()), 'Original full/baseline evidence changed during focus')
        result.update(status='terminal', finishedAt=stamp(), elapsedSeconds=round(time.perf_counter()-start, 3), exitCode=exit_code, finalHead=final_head, finalStatus=final_status, snapshotFinalSha256=digest(snapshot.read_bytes()), unexpectedFileByteChanges=changed, inputBytesUnchanged=not changed, inputStatePreserved=preserved, actualTestResult=parsed, completeWholeFileResult=complete, allRequestedWholeFilesPassed=passed)
        save(result_path, result)
        proof_files = [result_path, log_path, inputs_proof, snapshot_proof]
        if result.get('snapshotAfterRun'):
            proof_files.append(CHECKS.parent / result['snapshotAfterRun'])
        save(CHECKS / f'{prefix}-proof-hashes.json', {'hashes': {'checks/' + x.name: digest(x.read_bytes()) for x in proof_files}, 'originalFullEvidenceHashes': full_pins, 'fullRunRewritten': False, 'genuineFixPreflightOnly': True, 'replacementForNextFullVerify': False})
        print(json.dumps({k: result[k] for k in ['status', 'exitCode', 'elapsedSeconds', 'inputStatePreserved', 'completeWholeFileResult', 'allRequestedWholeFilesPassed']}) , flush=True)
        print(json.dumps({'testFiles': parsed['testFiles'], 'tests': parsed['tests'], 'failures': parsed['failures']}), flush=True)
    raise SystemExit(0 if passed else (exit_code if preserved and exit_code not in [None, 0] else 2))

if __name__ == '__main__':
    main()
