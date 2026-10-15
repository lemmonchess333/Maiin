"""Prepared only: copy actual normal check evidence, then ledger after format.

No tests/Git/servers/QA approvals/publishing. Fresh fbc3e887 baseline and a real
terminal full branch run are mandatory. Source seals remain a separate action.
"""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
import argparse, hashlib, json, re, runpy, shutil, subprocess, zipfile

R = Path(__file__).resolve().parent
REPO = R.parent / 'Maiin-burpees'
BASE = 'fbc3e8879b43086da0488ed8e387953bdb1af911'
STAGES = ['lint', 'check:form-art', 'check:form-drafts', 'check:cycles', 'build', 'check:dist-size', 'test']
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
stamp = lambda: datetime.now(timezone.utc).isoformat()

def require(ok, why):
    if not ok:
        raise RuntimeError('Project evidence refused: ' + why)

def read(path):
    require(path.is_file(), 'Missing actual file: ' + str(path))
    return json.loads(path.read_text(encoding='utf-8-sig'))

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def evidence(name):
    require(isinstance(name, str) and '\\' not in name and ':' not in name, 'Unsafe evidence path')
    p = PurePosixPath(name)
    require(not p.is_absolute() and '..' not in p.parts and p.as_posix() == name and p.parts[0] in ['baseline', 'checks'], 'Evidence must remain inside baseline/checks')
    result = (R / name).resolve()
    require(result.is_relative_to(R.resolve()) and result.is_file(), 'Absent actual evidence: ' + name)
    return result

def unchanged_known_gitlink(baseline, tested, head):
    name = '.claude/skills/gstack'
    oid = '4a77cc2c34506d9ce57193b3378e48e22b7b9842'
    require(name in baseline and name in tested and baseline[name] is None and tested[name] is None, 'Only the exact recorded non-file gitlink has null input digests')
    git = lambda *args: subprocess.check_output(['git', *args], cwd=REPO).decode('utf-8').strip()
    require(git('rev-parse', 'HEAD') == head, 'Gitlink proof HEAD must match actual tested HEAD')
    expected_tree = '160000 commit ' + oid + '\t' + name
    observed = {'baselineTree': git('ls-tree', BASE, '--', name), 'headTree': git('ls-tree', 'HEAD', '--', name), 'index': git('ls-files', '--stage', '--', name)}
    require(observed['baselineTree'] == observed['headTree'] == expected_tree and observed['index'] == '160000 ' + oid + ' 0\t' + name, 'Exact known gitlink mode/OID must match baseline/HEAD/index')
    target = REPO / name
    require(not target.is_file() and not target.is_symlink() and not getattr(target, 'is_junction', lambda: False)(), 'Gitlink cannot become a file or redirected directory')
    require(not target.exists() or target.is_dir() and not any(target.iterdir()), 'Known uninitialized gitlink must remain absent or an empty directory')
    return {'path': name, 'mode': '160000', 'objectType': 'commit', 'oid': oid, 'baselineHead': BASE, 'currentHead': head, 'baselineManifestDigest': None, 'testedManifestDigest': None, 'filesystemState': 'empty-directory' if target.exists() else 'absent', **observed, 'meaning': 'An unchanged uninitialized Git submodule entry is not a regular file and has no file SHA. Only this exact path/mode/OID/null mapping is admitted; other missing inputs still fail.'}

def focus(item, failing_file, parser, pins, full_inputs):
    names = [item.get('focusedResult'), item.get('focusedLog')]
    require(all(isinstance(n, str) and n in pins for n in names), 'Parent must pin focused result/log')
    result, log = read(evidence(names[0])), evidence(names[1])
    for name_field, hash_field in [('inputManifest', 'inputManifestSha256'), ('snapshotBefore', 'snapshotBeforeSha256')]:
        name = result.get(name_field)
        require(isinstance(name, str) and name in pins and sha(evidence(name)) == result.get(hash_field), 'Parent must bind actual focused input map/snapshot bytes')
    if result.get('snapshotAfterRun'):
        name = result['snapshotAfterRun']
        require(name in pins and sha(evidence(name)) == result.get('snapshotAfterRunSha256'), 'Retain actual post-run snapshot before exact restoration')
    focused_inputs = read(evidence(result['inputManifest']))
    for name in set(focused_inputs) | set(full_inputs):
        if name.startswith(('src/', 'scripts/')) or name in ['package.json', 'package-lock.json']:
            require(focused_inputs.get(name) == full_inputs.get(name), 'Focused non-reproduction cannot conceal a changed source/script/package input: ' + name)
    parsed = parser(log)
    invocation = result.get('actualInvocation', [])
    marker = next((i for i in range(len(invocation)-2) if invocation[i:i+3] == ['run', 'test', '--']), None)
    require(marker is not None, 'Normal npm run test -- whole-file invocation required')
    files = invocation[marker+3:]
    require(files and failing_file in files and all(re.fullmatch(r'[^\s]+\.test\.[cm]?[jt]sx?', n) for n in files), 'No test-name/retry/timeout flags or incomplete file selection')
    require(result.get('status') == 'terminal' and result.get('exitCode') == 0 and result.get('inputStatePreserved') is True and result.get('inputBytesUnchanged') is True and result.get('unexpectedFileByteChanges') == [], 'Actual preserved complete focused run required')
    require(parsed == result.get('actualTestResult') and parsed['stagesInvoked'] == ['test'] and parsed['failures'] == [] and parsed['failureHeaderCount'] == 0, 'Focused metadata must reconstruct actual normal log')
    require(parsed['testFiles']['failed'] == 0 and parsed['testFiles']['passed'] >= len(set(files)) and parsed['tests']['failed'] == 0 and parsed['tests']['passed'] > 0, 'Whole requested file batch must actually pass')
    require(result.get('head') == result.get('finalHead') and sorted(result.get('initialStatus', [])) == sorted(result.get('finalStatus', [])), 'Focused HEAD/status preserved')
    require(result.get('snapshotBeforeSha256') == result.get('snapshotFinalSha256') and result.get('snapshotBeforeSha256'), 'Focused snapshot preserved exactly')
    require('> node scripts/run-unit-tests.mjs run ' + ' '.join(files) in re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', log.read_text(encoding='utf-8-sig', errors='replace')), 'Actual whole-file unit runner invocation must appear in log')
    return {'identity': item['identity'], 'parentRationale': item['rationale'], 'file': failing_file, 'result': names[0], 'log': names[1], 'exitCode': 0, 'wholeFilePassed': True, 'meaning': 'The added full-run failure is retained. An unchanged normal whole-file check did not reproduce it; no fix, pre-existing classification or green full run is claimed.'}

def facts(prefix, decision_name):
    require(re.fullmatch(r'[a-z][a-z0-9-]*', prefix) is not None and prefix != 'baseline', 'Safe non-baseline run prefix required')
    helpers = runpy.run_path(str(evidence('checks/branch-verify-tools.py')), run_name='read_only_actual_log_parser')
    validated_baseline = helpers['load_baseline']()
    parser = helpers['parse_log']
    baseline = read(evidence('baseline/baseline-verify-result.json'))
    old = parser(evidence('baseline/baseline-verify.log'))
    require(validated_baseline.get('head') == BASE and all(validated_baseline.get(k) == old[k] for k in ['testFiles', 'tests', 'failures', 'failureHeaderCount', 'stagesInvoked', 'logSha256']), 'Fresh baseline proof map/result must match actual reparsed log')
    require(baseline.get('status') == 'terminal' and baseline.get('head') == BASE and baseline.get('inputStatePreserved') is True and baseline.get('oldResultDataImported') is False, 'Fresh preserved current-main fbc3e887 baseline required; no imported82d counts')
    require(old['stagesInvoked'] == STAGES and baseline.get('allNormalVerifyStagesInvoked') is True and baseline.get('fullResultSummariesPresentAndTotalsConsistent') is True, 'Complete normal baseline and summaries required')
    require(baseline.get('snapshotBytesExactAfterRestoration') is True and baseline['snapshotBeforeSha256'] == baseline['snapshotFinalSha256'] == sha(evidence('baseline/baseline-planSweep-before.snap')), 'Actual exact baseline snapshot preservation required')
    result_name, comparison_name, log_name = [f'checks/{prefix}-{suffix}' for suffix in ['verify-result.json', 'failure-comparison.json', 'verify.log']]
    meta, comparison, new = read(evidence(result_name)), read(evidence(comparison_name)), parser(evidence(log_name))
    require(meta.get('status') == 'terminal' and meta.get('command') == 'npm run verify' and meta.get('exitCode') in [0, 1], 'Actual full normal branch terminal result required')
    require(meta.get('baselineHead') == BASE and meta.get('baselineLogSha256') == old['logSha256'], 'Exact newly measured baseline log binding required')
    require(meta.get('inputBytesUnchanged') is True and meta.get('unexpectedFileByteChanges') == [] and meta.get('head') == meta.get('finalHead') and sorted(meta.get('initialStatus', [])) == sorted(meta.get('finalStatus', [])), 'Exact branch input/HEAD/status preservation required')
    require(meta['savedSnapshotSha256'] == meta['snapshotFinalSha256'] == sha(evidence(f'checks/{prefix}-planSweep-before.snap')) == sha(REPO / meta['savedSnapshot']), 'Current accepted snapshot must equal exact pre-run bytes')
    for key in ['comparisonComplete', 'comparisonValid', 'allNormalVerifyStagesPresent', 'failureHeaderFileAccountingComplete', 'inputStatePreserved']:
        require(comparison.get(key) is True, 'Incomplete actual comparison: ' + key)
    require(new['stagesInvoked'] == STAGES and comparison.get('branchResult') == new and comparison.get('exitCode') == meta['exitCode'], 'Comparison must exactly reconstruct actual full branch log/exit')
    for parsed in [old, new]:
        for key in ['testFiles', 'tests']:
            c = parsed[key]
            require(c is not None and c['total'] == sum(c[k] for k in ['failed', 'passed', 'skipped']), 'Actual terminal totals required')
    before, after = [{f['identity']: f for f in x['failures']} for x in [old, new]]
    added, absent = sorted(after.keys()-before.keys()), sorted(before.keys()-after.keys())
    changes = [{'identity': i, 'baseline': before[i]['firstDetailLines'], 'branch': after[i]['firstDetailLines']} for i in sorted(before.keys() & after.keys()) if before[i]['firstDetailLines'] != after[i]['firstDetailLines']]
    require(comparison.get('newFailureIdentities') == added and comparison.get('resolvedFailureIdentities') == absent and comparison.get('changedDetailsForExistingFailures') == changes, 'Derive exact identity/detail sets, not count-only equivalence')
    decision = read(evidence(decision_name))
    require(decision.get('status') == 'parent-reviewed-normal-full-comparison' and decision.get('baselineHead') == BASE and decision.get('baselineLogSha256') == old['logSha256'] and decision.get('prefix') == prefix and decision.get('reviewer') and decision.get('reviewedAt'), 'Actual dated parent comparison review required')
    pins = decision.get('reviewedEvidenceHashes', {})
    minimum = {result_name, comparison_name, log_name, 'baseline/baseline-verify-result.json', 'baseline/baseline-verify.log', 'baseline/baseline-failure-identities.json'}
    require(isinstance(pins, dict) and minimum.issubset(pins), 'Parent must pin the actual complete baseline/branch evidence')
    for name, digest in pins.items():
        require(sha(evidence(name)) == digest, 'Parent-reviewed project evidence changed: ' + name)
    items = decision.get('additionalFailureDispositions', [])
    require(len(items) == len(added) and {i.get('identity') for i in items} == set(added), 'Every actual added identity needs one explicit disposition')
    tested = read(evidence(f'checks/{prefix}-input-manifest.json'))
    unresolved, focused = [], []
    for item in items:
        require(item.get('rationale') and item.get('disposition') in ['unresolved', 'focused-whole-file-pass-reviewed'], 'No automatic new-failure waiver; a real code fix needs separate actual reviewed evidence/new normal run')
        if item['disposition'] == 'unresolved':
            unresolved.append(item['identity'])
        else:
            focused.append(focus(item, after[item['identity']]['file'], parser, pins, tested))
    reviews = decision.get('changedDetailReviews', [])
    require(len(reviews) == len(changes) and {r.get('identity') for r in reviews} == {r['identity'] for r in changes}, 'Each changed existing diagnostic needs actual parent review')
    for review in reviews:
        observed = next(c for c in changes if c['identity'] == review['identity'])
        require(review.get('baselineDetailLines') == observed['baseline'] and review.get('branchDetailLines') == observed['branch'] and review.get('classification') == 'reviewed-existing-diagnostic-change' and review.get('rationale'), 'Do not silently resolve timing/ordinal/detail changes')
    post_config = []
    if sha(REPO / '.prettierignore') != tested.get('.prettierignore'):
        format_name = 'checks/immutable-original-format-ignore-review.json'
        format_helper = 'checks/record-immutable-format-preservation.py'
        require(prefix == 'branch4' and format_name in pins and format_helper in pins, 'Only the exact reviewed branch4 post-run immutable-original format ignore is permitted')
        format_review = read(evidence(format_name))
        require(all(pins.get(name) == digest for name, digest in format_review['reviewedEvidenceHashes'].items()), 'Bind all actual post-run configuration proof bytes')
        validator = runpy.run_path(str(evidence(format_helper)), run_name='readonly_post_verify_format_preservation')['validate_review']
        original = 'docs/exercise-art/sources/t-bar-row/2026-10-15/draft/originals/prepare-master.cjs'
        raw = (REPO / 'docs/exercise-art/sources/t-bar-row/2026-10-15/review-inputs-exact.zip').read_bytes()
        result = validator(format_review, lambda name: evidence(name).read_bytes(), tested, (REPO / '.prettierignore').read_bytes(), (REPO / original).read_bytes(), raw)
        post_config = [{**result, 'review': format_name}]
    gitlink = unchanged_known_gitlink(read(evidence('baseline/baseline-input-manifest.json')), tested, meta['finalHead'])
    gitlink_proof = 'checks/unchanged-gstack-gitlink-proof.json'
    require(gitlink_proof in pins and read(evidence(gitlink_proof)) == gitlink, 'Actual parent-pinned exact gitlink proof is required')
    for name, digest in tested.items():
        if name == '.prettierignore' and post_config:
            continue
        if name == gitlink['path'] and digest is None:
            continue
        p = (REPO / name).resolve()
        require(p.is_relative_to(REPO.resolve()) and p.is_file() and sha(p) == digest, 'Tested repository input changed; non-reproduction cannot waive a code edit: ' + name)
    corrected_prior = None
    fixture_paths = ['src/components/program/__tests__/ExerciseRowSummary.test.tsx', 'src/lib/__tests__/bodyRig.test.ts']
    baseline_inputs = read(evidence('baseline/baseline-input-manifest.json'))
    if any(baseline_inputs.get(path) != tested.get(path) for path in fixture_paths):
        correction_name = 'checks/caption-and-fixture-correction-review.json'
        helper_name = 'checks/record-caption-and-fixture-correction.py'
        second_name = 'checks/pull-up-caption-correction-review.json'
        second_helper_name = 'checks/record-pull-up-caption-correction.py'
        require(all(name in pins for name in [correction_name, helper_name, second_name, second_helper_name]), 'Both actual exact caption reviews and validators must be parent-pinned')
        correction = read(evidence(correction_name))
        second = read(evidence(second_name))
        require(all(pins.get(name) == digest for item in [correction, second] for name, digest in item['reviewedEvidenceHashes'].items()), 'Every exact chained correction input must be bound by the actual final parent decision')
        validator = runpy.run_path(str(evidence(helper_name)), run_name='readonly_caption_fixture_contract')['validate_review']
        chain = runpy.run_path(str(evidence(second_helper_name)), run_name='readonly_second_caption_contract')['validate_chain']
        prior_inputs = read(evidence('checks/branch3-input-manifest.json'))
        preflight_inputs = read(evidence('checks/genuine-fix-preflight-input-manifest.json'))
        raws = [(REPO / f'docs/exercise-art/sources/{eid}/2026-10-15/review-inputs-exact.zip').read_bytes() for eid in ['t-bar-row', 'pull-ups']]
        chain(second, lambda name: evidence(name).read_bytes(), baseline_inputs, prior_inputs, preflight_inputs, tested, *raws, validator)
        prior = read(evidence('checks/branch3-failure-comparison.json'))
        require(prior.get('comparisonComplete') is True and prior.get('comparisonValid') is True and prior.get('allNormalVerifyStagesPresent') is True, 'Retain actual complete failed branch3 comparison')
        fixed = correction['correctedPriorFailureIdentities']
        require(len(fixed) == 3 and set(fixed).issubset(prior['newFailureIdentities']) and not set(fixed) & after.keys(), 'All three actual corrected prior identities must be absent from the final full run')
        corrected_prior = {'review': correction_name, 'priorRunPrefix': 'branch3', 'priorFullVerifyExitCode': prior['exitCode'], 'priorFullTestFiles': prior['branchResult']['testFiles'], 'priorFullTests': prior['branchResult']['tests'], 'correctedPriorFailureIdentities': fixed, 'finalFullRunPrefix': prefix, 'correctedCaptionBeat': 5, 'originalLabel': 'Stretch', 'currentLabel': 'Return', 'meaning': 'Actual reviewed fixture/caption fixes, with original failed branch3 and original acceptance bytes retained. This is separate from unchanged-code focused non-reproduction and from the truthful final full-run outcome.'}
        corrected_prior.update({'secondReview': second_name, 'intermediateFailedPreflightRetained': True, 'pullUpOriginalLabel': 'Hang', 'pullUpCurrentLabel': 'Return'})
    green = meta['exitCode'] == 0 and new['tests']['failed'] == 0 and new['testFiles']['failed'] == 0
    require(comparison.get('overallGreen') == green, 'Truthful overall full-run green state required')
    return dict(baseline=baseline, old=old, meta=meta, comparison=comparison, new=new, decision=decision, decision_name=decision_name, added=added, absent=absent, changes=changes, reviews=reviews, unresolved=sorted(unresolved), focused=focused, green=green, corrected_prior=corrected_prior, post_config=post_config, gitlink=gitlink)

def sources(value, prefix):
    names = set(value['decision']['reviewedEvidenceHashes']) | {value['decision_name']}
    names.update(p.relative_to(R).as_posix() for p in (R / 'baseline').iterdir() if p.is_file())
    names.update(p.relative_to(R).as_posix() for p in (R / 'checks').iterdir() if p.is_file() and (p.name.startswith(prefix + '-') or p.name in ['branch-verify-tools.py', 'candidate-runner-preparation.json']))
    # The first real run stopped at TS2783. Preserve it as historical evidence
    # when the corrected complete run uses branch2; never overwrite/relabel it.
    if prefix in ['branch2', 'branch3', 'branch4']:
        first = read(evidence('checks/branch-verify-result.json'))
        require(first.get('status') == 'terminal' and first.get('exitCode') == 2, 'Actual failed first build evidence must remain intact')
        names.update(p.relative_to(R).as_posix() for p in (R / 'checks').iterdir() if p.is_file() and p.name.startswith('branch-'))
        for earlier in ['branch2', 'branch3'][:['branch2', 'branch3', 'branch4'].index(prefix)]:
            require(read(evidence(f'checks/{earlier}-verify-result.json')).get('status') == 'terminal', 'Earlier actual run must remain terminal')
            names.update(p.relative_to(R).as_posix() for p in (R / 'checks').iterdir() if p.is_file() and p.name.startswith(earlier + '-'))
    result = {name: evidence(name) for name in sorted(names)}
    runner = R / 'run-isolated-baseline.py'
    require(runner.is_file() and sha(runner) == value['baseline']['runnerSha256'], 'Actual baseline runner source hash required')
    result['baseline/run-isolated-baseline.py'] = runner
    if value['focused']:
        result['checks/run-focused-whole-files.py'] = evidence('checks/run-focused-whole-files.py')
    return result

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode', choices=['copy', 'ledger'])
    p.add_argument('--ids', nargs='+', choices=['pull-ups', 'bike', 't-bar-row'], required=True)
    p.add_argument('--prefix', default='branch')
    p.add_argument('--decision', default='checks/parent-check-decision.json')
    args = p.parse_args()
    value, archives = facts(args.prefix, args.decision), {eid: REPO / f'docs/exercise-art/sources/{eid}/2026-10-15' for eid in args.ids}
    files = sources(value, args.prefix)
    manifest_path = R / 'checks/batch-project-check-copy-manifest.json'
    for eid, a in archives.items():
        require(a.is_dir() and read(a / 'provenance.json').get('sourceHashes') == {}, 'Actual unsealed finalized archive required')
    if args.mode == 'copy':
        require(not manifest_path.exists(), 'Do not replace historical copied evidence')
        require(all(not (a / 'project-check-evidence').exists() and not (a / 'project-check-inputs-exact.zip').exists() for a in archives.values()), 'Copy targets must be new')
        manifest = {'prefix': args.prefix, 'decision': args.decision, 'copiedAt': stamp(), 'rawSourceHashes': {n: sha(s) for n, s in files.items()}, 'writerSha256': sha(Path(__file__)), 'archives': {}}
        for eid, a in archives.items():
            with zipfile.ZipFile(a / 'project-check-inputs-exact.zip', 'w', zipfile.ZIP_DEFLATED) as z:
                for name, source in files.items():
                    z.writestr(name, source.read_bytes())
                    target = a / 'project-check-evidence' / (name + '.txt' if name.endswith('.tsx') else name)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
                z.writestr('write-project-checks.py', Path(__file__).read_bytes())
            shutil.copy2(Path(__file__), a / 'project-check-evidence/write-project-checks.py')
            manifest['archives'][eid] = {'rawZipSha256': sha(a / 'project-check-inputs-exact.zip')}
        save(manifest_path, manifest)
        print(json.dumps({'copiedActualEvidenceFilesPerArchive': len(files), 'ids': args.ids, 'overallVerifyExitCode': value['meta']['exitCode'], 'next': 'Normal-format readable copied JSON/scripts; raw ZIP/logs unchanged; then ledger mode.', 'completionCredit': False}))
        return
    manifest = read(manifest_path)
    require(manifest['prefix'] == args.prefix and manifest['decision'] == args.decision and manifest['rawSourceHashes'] == {n: sha(s) for n, s in files.items()} and manifest['writerSha256'] == sha(Path(__file__)), 'Original copied run/decision/source bytes/writer changed')
    prepared = []
    for eid, a in archives.items():
        require(sha(a / 'project-check-inputs-exact.zip') == manifest['archives'][eid]['rawZipSha256'], 'Raw check evidence ZIP changed')
        with zipfile.ZipFile(a / 'project-check-inputs-exact.zip') as z:
            require(len(z.namelist()) == len(set(z.namelist())) and set(z.namelist()) == set(files) | {'write-project-checks.py'} and z.testzip() is None, 'Exact raw project member accounting required')
            for name, source in files.items():
                require(z.read(name) == source.read_bytes(), 'Raw actual check bytes changed')
                target = a / 'project-check-evidence' / (name + '.txt' if name.endswith('.tsx') else name)
                require(target.is_file(), 'Missing readable check copy')
                if name.endswith('.json'):
                    require(read(target) == read(source), 'Readable copied JSON changed beyond formatting')
                elif Path(name).suffix not in ['.mjs', '.mts', '.html', '.md']:
                    require(target.read_bytes() == source.read_bytes(), 'Raw log/input/snapshot/source bytes changed')
        evidence_hashes = {x.relative_to(a).as_posix(): sha(x) for x in sorted((a / 'project-check-evidence').rglob('*')) if x.is_file()}
        evidence_hashes['project-check-inputs-exact.zip'] = sha(a / 'project-check-inputs-exact.zip')
        ledger = {'exerciseId': eid, 'reviewedAt': stamp(), 'baselineHead': BASE, 'baselineLogSha256': value['old']['logSha256'], 'testedWorkingTreeHead': value['meta']['head'], 'normalCommand': 'npm run verify', 'allNormalVerifyStagesPresent': True, 'normalVerifyStages': STAGES, 'comparisonComplete': True, 'comparisonValid': True, 'inputStatePreserved': True, 'snapshotPreservedExactly': True, 'snapshotSha256': value['meta']['savedSnapshotSha256'], 'overallVerifyExitCode': value['meta']['exitCode'], 'overallGreen': value['green'], 'fullWindowsNonGreen': value['meta']['exitCode'] != 0, 'baselineExitCode': value['baseline']['exitCode'], 'baselineTestFiles': value['old']['testFiles'], 'baselineTests': value['old']['tests'], 'branchTestFiles': value['new']['testFiles'], 'branchTests': value['new']['tests'], 'additionalFullRunFailureIdentities': value['added'], 'unresolvedAdditionalFailureIdentities': value['unresolved'], 'baselineFailuresAbsentFromBranchFullRun': value['absent'], 'changedDetailsForExistingFailures': value['changes'], 'parentChangedDetailReviews': value['reviews'], 'parentReviewedFocusedNonReproductions': value['focused'], 'parentDecision': {'reviewer': value['decision']['reviewer'], 'reviewedAt': value['decision']['reviewedAt'], 'evidencePath': 'project-check-evidence/' + args.decision}, 'evidenceHashes': evidence_hashes, 'copyThenFormatThenHashOrdering': 'Exact raw evidence retained in ZIP; normal-formatted readable JSON semantics and all logs/input maps/snapshots rechecked before these current hashes.', 'meaning': 'A nonzero normal full Windows run remains non-green. Added cases and changed diagnostics remain disclosed with actual parent dispositions; focused non-reproduction is not a fix or a pre-existing classification. Source seal/current-head required CI/merge remain separate.', 'completionCredit': False}
        ledger['parentReviewedCorrectedPriorRegressions'] = value['corrected_prior']
        ledger['postVerifyConfigurationChanges'] = value['post_config']
        ledger['unchangedNonFileGitlinkPreservation'] = value['gitlink']
        ledger['inputStatePreservedMeaning'] = 'Exact source/HEAD/status/snapshot preservation during the actual normal run. Any later narrowly reviewed non-runtime configuration delta is disclosed separately in postVerifyConfigurationChanges; no all-current-inputs-identical claim is implied.'
        prepared.append((a, ledger))
    for a, ledger in prepared:
        save(a / 'project-checks.json', ledger)
    print(json.dumps({'actualLedgersWrittenFor': args.ids, 'overallVerifyExitCode': value['meta']['exitCode'], 'unresolvedAdditionalFailureIdentities': value['unresolved'], 'completionCredit': False}))

if __name__ == '__main__':
    main()
