"""Prepared only. Parent runs after actual UI decision, formatting and checks.

Seal existing retained-endpoint archives; never create approvals, rewrite a raw ZIP,
run tests/Git/servers, publish, merge or grant completion. No text edits follow.
"""
from pathlib import Path, PurePosixPath
import argparse, hashlib, json, runpy, shutil, zipfile
from PIL import Image

R = Path(__file__).resolve().parent
F = runpy.run_path(str(R / 'finalize-reviewed-registration.py'), run_name='seal_helpers')
REPO, SPEC = F['REPO'], F['SPEC']
require, read, sha = F['require'], F['read'], F['sha']
BASE = 'fbc3e8879b43086da0488ed8e387953bdb1af911'
CANONICAL = 'fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
STAGES = ['lint', 'check:form-art', 'check:form-drafts', 'check:cycles', 'build', 'check:dist-size', 'test']
AUXILIARY = {'candidate-specs.json', 'preservation-baseline.json', 'local-stage-ledger.json', 'prepare-local-registration.py', 'finalize-reviewed-registration.py', 'integrated-review.html', 'integrated-review.tsx', 'integrated-vite.config.mjs'}

def member(name):
    require(isinstance(name, str) and name and '\\' not in name and ':' not in name and '\0' not in name, 'Unsafe archive member')
    p = PurePosixPath(name)
    require(not p.is_absolute() and not any(x in ['.', '..'] for x in p.parts) and p.as_posix() == name and not name.endswith('/'), 'Noncanonical archive member')
    return name

def proof_path(archive, name):
    member(name)
    p = (archive / name).resolve()
    require(p.is_relative_to(archive.resolve()) and p.is_file(), 'Missing archived proof: ' + name)
    return p

def tbar_completion(archive, raw, ledger):
    """Three omitted, already accepted files; never expand the original ZIP."""
    add = read(proof_path(archive, 'editable-completion-addendum.json'))
    require(add.get('schemaVersion') == 1 and add.get('exerciseId') == 't-bar-row' and add.get('newImageRequests') == 0 and add.get('newArtworkEdits') == 0 and add.get('approvalBytesChanged') is False, 'Bounded T-Bar completion scope required')
    require(add.get('originalReviewZip') == {'path': 'review-inputs-exact.zip', 'sha256': sha(archive / 'review-inputs-exact.zip'), 'unchanged': True}, 'Original reviewed ZIP must remain unchanged')
    manifest_bytes = raw.read('draft/final-asset-hashes.json')
    manifest_sha = hashlib.sha256(manifest_bytes).hexdigest()
    require(add.get('acceptedManifest') == {'path': 'review-inputs-exact.zip#draft/final-asset-hashes.json', 'sha256': manifest_sha, 'parentReviewedManifestPin': ledger['acceptedDraftHashes']['final-asset-hashes.json']} and manifest_sha == ledger['acceptedDraftHashes']['final-asset-hashes.json'], 'Completion must derive from the actual parent-accepted manifest')
    manifest = json.loads(manifest_bytes)
    accepted = {row['path']: row for row in manifest['files']}
    require(manifest.get('fileCount') == len(accepted) == 45, 'Original accepted 45-file manifest required')
    expected = {'1-native.ora': ('draft/1-native.ora', 'draft/1-native.ora'), '2-native.ora': ('draft/2-native.ora', 'draft/2-native.ora'), 'stage-card.mts': ('draft/stage-card.mts', 'draft/stage-card.mts.txt')}
    rows = add.get('members', [])
    require(len(rows) == 3 and {row.get('sourcePath') for row in rows} == set(expected), 'Only the three omitted files may be completed')
    target = proof_path(archive, 'editable-completion-inputs-exact.zip')
    require(add.get('completionZip') == {'path': target.name, 'sha256': sha(target), 'memberCount': 3}, 'Exact separate completion ZIP binding required')
    with zipfile.ZipFile(target) as z:
        require(z.testzip() is None and len(z.namelist()) == len(set(z.namelist())) == 3 and set(z.namelist()) == {p[0] for p in expected.values()}, 'Closed three-member completion namespace required')
        for row in rows:
            source = row['sourcePath']
            require((row.get('archivePath'), row.get('readablePath')) == expected[source] and row['archivePath'] not in raw.namelist(), 'Original ZIP cannot be rewritten or completed twice')
            data = z.read(member(row['archivePath']))
            require(len(data) == row['bytes'] == accepted[source]['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'] == accepted[source]['sha256'], 'Completion bytes differ from accepted original manifest')
            require(proof_path(archive, member(row['readablePath'])).read_bytes() == data, 'Immutable readable completion bytes changed')
    return add

def raw_project(archive):
    target = proof_path(archive, 'project-check-inputs-exact.zip')
    z = zipfile.ZipFile(target)
    require(z.testzip() is None and len(z.namelist()) == len(set(z.namelist())), 'Actual raw project proof ZIP corrupt/duplicate')
    for name in z.namelist():
        member(name)
    return z

def form_guides_migration(archive, checks, baseline, tested):
    """Permit exactly the parent-reviewed BASE header/legacy placard removal."""
    name = 'checks/form-guides-migration-review.json'
    pins = checks['evidenceHashes']
    require('project-check-evidence/' + name in pins, 'Exact formGuides migration review is required')
    with raw_project(archive) as z:
        review = json.loads(z.read(name))
        require(read(proof_path(archive, 'project-check-evidence/' + name)) == review, 'Migration readable review semantics changed')
        require(review.get('status') == 'parent-reviewed-exact-form-guides-migration' and review.get('baselineHead') == BASE and review.get('reviewer') and review.get('reviewedAt') and review.get('changedFile') == 'src/lib/formGuides.ts' and review.get('setupCorrectionPerformed') is False, 'Only the actual reviewed legacy metadata migration is authorized')
        require(review.get('parentObservedNormalTypecheck') == {'command': 'npm run typecheck', 'log': 'checks/legacy-fix-typecheck.log', 'exitCode': 0}, 'Retain the parent-observed normal typecheck exit zero; full branch verification remains separate')
        for path, digest in review['reviewedEvidenceHashes'].items():
            member(path)
            require('project-check-evidence/' + path in pins and hashlib.sha256(z.read(path)).hexdigest() == digest, 'Actual migration evidence changed')
        before = z.read(member(review['originalGuideProof']))
        after = z.read(member(review['currentGuideProof']))
        key = 'src/lib/formGuides.ts'
        require(hashlib.sha256(before).hexdigest() == review['originalSha256'] == baseline[key] and hashlib.sha256(after).hexdigest() == review['currentSha256'] == tested[key] == sha(REPO / key), 'Full before/current guide bytes must match baseline/tested/current inputs')
        text = before.decode('utf-8').replace('\r\n', '\n')
        start = text.index('  /* \u2500\u2500 Authored ahead of the art (2026-09-03)')
        end = text.index('  /* Supplied art, 2026-09-04.', start)
        removed = text[start:end]
        fixed_sha = '296db0033306c0b05b411cd6ba9f675472688d494cec5accf74deaa458c9d898'
        require(hashlib.sha256(removed.encode('utf-8')).hexdigest() == review.get('removedNormalizedBlockSha256') == fixed_sha and after.decode('utf-8').replace('\r\n', '\n') == text[:start] + text[end:], 'No guide/runtime change beyond the exact obsolete header and legacy Pull-Ups block removal')
        first = json.loads(z.read('checks/branch-verify-result.json'))
        first_inputs = json.loads(z.read('checks/branch-input-manifest.json'))
        require(first.get('status') == 'terminal' and first.get('exitCode') == 2 and first.get('inputBytesUnchanged') is True and first_inputs[key] == baseline[key] and b'TS2783' in z.read('checks/branch-verify.log'), 'Retain the actual failed first normal run; do not relabel it green')
        require(b'> tsc -b' in z.read('checks/legacy-fix-typecheck.log') and b'error TS' not in z.read('checks/legacy-fix-typecheck.log'), 'Actual normal typecheck log required')

def tbar_reproduction(archive, checks):
    name = 'checks/t-bar-row-archive-completion-reproduction-proof.json'
    require('project-check-evidence/' + name in checks['evidenceHashes'], 'Actual archive completion reproduction evidence required')
    with raw_project(archive) as z:
        proof = json.loads(z.read(name))
        require(read(proof_path(archive, 'project-check-evidence/' + name)) == proof, 'Reproduction proof changed beyond formatting')
    add = read(archive / 'editable-completion-addendum.json')
    canonical_add = (json.dumps(add, indent=2) + '\n').encode()
    require(proof.get('exerciseId') == 't-bar-row' and proof.get('exitCode') == 0 and proof.get('actualArchivedStandaloneReproductionPassed') is True and proof.get('originalReviewZipUnchanged') is True and proof.get('noArtworkOrApprovalChanges') is True, 'Actual completed reproduction is required; no pass is inferred')
    require(proof.get('originalReviewZipSha256') == sha(archive / 'review-inputs-exact.zip') and proof.get('acceptedManifestSha256') == add['acceptedManifest']['sha256'] and proof.get('completionZipSha256') == sha(archive / 'editable-completion-inputs-exact.zip') and proof.get('addendumSha256') == hashlib.sha256(canonical_add).hexdigest() and proof.get('members') == add['members'], 'Actual completion/reproduction bindings changed')
    actual = json.loads(proof['stdout'])
    require(actual == {'status': 'exact', 'sourceColourRecipeReproducedFromOriginals': True, 'sourceNeutralRGBAndAlphaExact': True, 'nativeOras': 2, 'framedOras': 2, 'losslessFrames': 6, 'referenceExact': True, 'physicalPoses': 2, 'size': [918, 1036]}, 'Actual standalone output must include both native and framed ORAs, six frames and exact source recipe')

def caption_correction(archive, checks, tested):
    """Validate both explicit caption reviews in order, keep old QA raw."""
    name = 'checks/caption-and-fixture-correction-review.json'
    helper_name = 'checks/record-caption-and-fixture-correction.py'
    second_name = 'checks/pull-up-caption-correction-review.json'
    second_helper_name = 'checks/record-pull-up-caption-correction.py'
    for required in [name, helper_name, second_name, second_helper_name]:
        require('project-check-evidence/' + required in checks['evidenceHashes'], 'Actual bounded caption/fixture correction proof required')
    helper_path = proof_path(archive, 'project-check-evidence/' + helper_name)
    second_helper_path = proof_path(archive, 'project-check-evidence/' + second_helper_name)
    with raw_project(archive) as z:
        require(helper_path.read_bytes() == z.read(helper_name) and second_helper_path.read_bytes() == z.read(second_helper_name), 'Both correction validator sources must remain exact reviewed bytes')
        review = json.loads(z.read(name))
        second_review = json.loads(z.read(second_name))
        require(read(proof_path(archive, 'project-check-evidence/' + name)) == review and read(proof_path(archive, 'project-check-evidence/' + second_name)) == second_review, 'Correction review semantics changed')
        for path in set(review['reviewedEvidenceHashes']) | set(second_review['reviewedEvidenceHashes']):
            require('project-check-evidence/' + member(path) in checks['evidenceHashes'], 'Missing actual correction evidence copy: ' + path)
        baseline = json.loads(z.read('baseline/baseline-input-manifest.json'))
        prior = json.loads(z.read('checks/branch3-input-manifest.json'))
        preflight = json.loads(z.read('checks/genuine-fix-preflight-input-manifest.json'))
        validator = runpy.run_path(str(helper_path), run_name='readonly_caption_fixture_contract')['validate_review']
        chain = runpy.run_path(str(second_helper_path), run_name='readonly_second_caption_contract')['validate_chain']
        raws = [(REPO / f'docs/exercise-art/sources/{eid}/2026-10-15/review-inputs-exact.zip').read_bytes() for eid in ['t-bar-row', 'pull-ups']]
        corrected = chain(second_review, z.read, baseline, prior, preflight, tested, *raws, validator)
    return corrected.get(archive.parent.name)

def post_verify_format_preservation(archive, checks, tested):
    name = 'checks/immutable-original-format-ignore-review.json'
    helper_name = 'checks/record-immutable-format-preservation.py'
    for required in [name, helper_name]:
        require('project-check-evidence/' + required in checks['evidenceHashes'], 'Actual narrow post-run format-preservation review required')
    helper_path = proof_path(archive, 'project-check-evidence/' + helper_name)
    with raw_project(archive) as z:
        require(helper_path.read_bytes() == z.read(helper_name), 'Format-preservation validator source changed')
        review = json.loads(z.read(name))
        require(read(proof_path(archive, 'project-check-evidence/' + name)) == review, 'Format-preservation review semantics changed')
        for path in review['reviewedEvidenceHashes']:
            require('project-check-evidence/' + member(path) in checks['evidenceHashes'], 'Missing actual format-preservation proof')
        validator = runpy.run_path(str(helper_path), run_name='readonly_post_verify_format_preservation')['validate_review']
        original = 'docs/exercise-art/sources/t-bar-row/2026-10-15/draft/originals/prepare-master.cjs'
        raw = (REPO / 'docs/exercise-art/sources/t-bar-row/2026-10-15/review-inputs-exact.zip').read_bytes()
        result = validator(review, z.read, tested, (REPO / '.prettierignore').read_bytes(), (REPO / original).read_bytes(), raw)
    return {**result, 'review': name}

def raw_review(archive, eid):
    """Validate the complete closed raw namespace without altering its bytes."""
    target = archive / 'review-inputs-exact.zip'
    with zipfile.ZipFile(target) as z:
        names = z.namelist()
        require(len(names) == len(set(names)) and z.testzip() is None, 'Raw ZIP duplicate/corrupt member')
        for name in names:
            member(name)
        spec = json.loads(z.read('batch/candidate-specs.json'))[eid]
        ledger = json.loads(z.read('batch/local-stage-ledger.json'))['exercises'][eid]
        native_name = ledger['nativeCardAcceptanceExactSnapshot']
        require(hashlib.sha256(z.read('batch/' + native_name)).hexdigest() == ledger['nativeCardAcceptanceSha256'], 'Historical native acceptance changed')
        candidates = []
        for name in names:
            if name.startswith('batch/') and name.endswith('.json'):
                value = json.loads(z.read(name))
                if isinstance(value, dict) and value.get('status') == 'parent-actual-integrated-accepted' and eid in value.get('exercises', {}):
                    candidates.append((name.removeprefix('batch/'), value['exercises'][eid]))
        require(len(candidates) == 1, 'One actual integrated decision required per archived exercise')
        review_name, parent = candidates[0]
        for key in F['ART_CHECKS']:
            require(parent.get('checks', {}).get(key, {}).get('passed') is True and parent['checks'][key].get('evidence'), 'Actual parent UI/core check missing: ' + key)
        require(all(parent.get('controls', {}).get(k) is True for k in F['CONTROLS']) and parent.get('consoleErrors') == 0, 'Actual integrated controls/console observation missing')
        for name, digest in parent['reviewedEvidenceHashes'].items():
            require(hashlib.sha256(z.read('batch/' + member(name))).hexdigest() == digest, 'Raw integrated proof changed')
        for name, digest in parent['reviewedRepositoryHashes'].items():
            require(hashlib.sha256(z.read('repo/' + member(name))).hexdigest() == digest, 'Raw reviewed repository bytes changed')
        for name, digest in ledger['acceptedDraftHashes'].items():
            require(hashlib.sha256(z.read('draft/' + member(name))).hexdigest() == digest, 'Raw native/card/source bytes changed')
        plan = json.loads(z.read('draft/' + spec['minimalArchivePlan']))
        draft_names = set(ledger['acceptedDraftHashes']) | {spec['minimalArchivePlan']}
        for key in ['sourceOriginals', 'editable', 'artwork', 'metadata', 'reproduction', 'sourceEditables', 'deliveredFrames', 'code']:
            draft_names.update(plan.get(key, []))
        for key in ['reference', 'preparedCardSource', 'card']:
            if isinstance(plan.get(key), str):
                draft_names.add(plan[key])
        batch_names = set(parent['reviewedEvidenceHashes']) | AUXILIARY | {review_name, native_name}
        expected = {'draft/' + member(n) for n in draft_names} | {'batch/' + member(n) for n in batch_names} | {'repo/' + member(n) for n in parent['reviewedRepositoryHashes']}
        require(set(names) == expected, 'Unchecked extra or missing raw ZIP members')
        # Raw repo bytes deliberately retain the earlier provisional registry.
        # Current tested production code is bound separately by its input map.
        for name in names:
            if name.startswith('repo/'):
                continue
            copied = proof_path(archive, name + '.txt' if name.endswith('.tsx') else name)
            data = z.read(name)
            if name.endswith('.json'):
                require(json.loads(copied.read_text(encoding='utf-8-sig')) == json.loads(data), 'Readable JSON changed beyond formatting: ' + name)
            elif Path(name).suffix in ['.png', '.jpg', '.jpeg', '.webp', '.ora', '.npy', '.txt', '.py', '.tsx']:
                require(copied.read_bytes() == data, 'Immutable source/fixture bytes changed: ' + name)
        if eid == 't-bar-row':
            tbar_completion(archive, z, ledger)
        return spec, ledger, parent, len(names), sha(target)

def project_proof(archive, baseline_inputs, branch_inputs):
    checks = read(archive / 'project-checks.json')
    require(checks.get('baselineHead') == BASE and checks.get('normalCommand') == 'npm run verify', 'Fresh actual fbc3e887 normal baseline required; prior82d evidence is not this baseline')
    for key in ['allNormalVerifyStagesPresent', 'comparisonComplete', 'comparisonValid', 'inputStatePreserved', 'snapshotPreservedExactly']:
        require(checks.get(key) is True, 'Incomplete project proof: ' + key)
    require(checks.get('normalVerifyStages') == STAGES and checks.get('unresolvedAdditionalFailureIdentities') == [], 'All normal stages and actual reviewed failure dispositions required')
    require(checks.get('overallVerifyExitCode') in [0, 1] and checks.get('overallGreen') == (checks['overallVerifyExitCode'] == 0) and checks.get('fullWindowsNonGreen') == (checks['overallVerifyExitCode'] != 0), 'Full non-green result must remain truthful')
    pins = checks.get('evidenceHashes', {})
    require(isinstance(pins, dict) and pins and baseline_inputs in pins and branch_inputs in pins, 'Actual raw baseline/branch evidence bindings required')
    for name, digest in pins.items():
        require(sha(proof_path(archive, name)) == digest, 'Formatted project evidence changed: ' + name)
    require(any(name.endswith('/baseline-verify.log') and digest == checks.get('baselineLogSha256') for name, digest in pins.items()), 'Actual fresh baseline log hash required')
    baseline = read(proof_path(archive, baseline_inputs))
    tested = read(proof_path(archive, branch_inputs))
    post_config = []
    if sha(REPO / '.prettierignore') != tested.get('.prettierignore'):
        post_config = [post_verify_format_preservation(archive, checks, tested)]
    require(checks.get('postVerifyConfigurationChanges', []) == post_config, 'Disclose the exact post-run configuration delta; never claim all current inputs are unchanged')
    metadata = {'src/lib/formArtwork.ts', 'src/lib/releasedFormPlacards.ts', 'src/lib/formArtReleases.data.ts', 'src/lib/formArtCutouts.data.ts'}
    guide = 'src/lib/formGuides.ts'
    if baseline.get(guide) != tested.get(guide):
        form_guides_migration(archive, checks, baseline, tested)
        metadata.add(guide)
    if archive.parent.name == 't-bar-row':
        tbar_reproduction(archive, checks)
    if any(baseline.get(path) != tested.get(path) for path in ['src/components/program/__tests__/ExerciseRowSummary.test.tsx', 'src/lib/__tests__/bodyRig.test.ts']):
        caption_correction(archive, checks, tested)
    for name, digest in tested.items():
        if name.startswith('src/') and '/__tests__/' not in name and not name.endswith(('.test.ts', '.test.tsx')):
            require(sha(proof_path(REPO, name)) == digest, 'Production source changed after normal verify: ' + name)
            if name not in metadata:
                require(baseline.get(name) == digest, 'UI/runtime change outside reviewed metadata scope: ' + name)
    for name in ['package.json', 'package-lock.json', 'scripts/run-unit-tests.mjs']:
        require(name in tested and baseline.get(name) == tested[name] == sha(proof_path(REPO, name)), 'Normal verification/runtime input changed')
    return checks, tested

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--ids', nargs='+', choices=['pull-ups', 'bike', 't-bar-row'], required=True)
    p.add_argument('--baseline-inputs', default='project-check-evidence/baseline/baseline-input-manifest.json')
    p.add_argument('--branch-inputs', default='project-check-evidence/checks/branch-input-manifest.json')
    args = p.parse_args()
    previous = read(R / 'preservation-baseline.json')
    require(len(previous['publicAssetHashes']) == 910 and previous['baselineHead'] == BASE, 'Actual preservation baseline required')
    require(all(sha(proof_path(REPO, name)) == digest for name, digest in previous['publicAssetHashes'].items()), 'Previous910 public files changed')
    require(sha(REPO / 'docs/exercise-art/identity/athlete-anatomy-v3.png') == CANONICAL, 'FA56 changed')
    plans = []
    for eid in args.ids:
        archive = REPO / f'docs/exercise-art/sources/{eid}/2026-10-15'
        record_path = REPO / f'docs/exercise-art/releases/2026-10-15/{eid}.json'
        record, provenance = read(record_path), read(archive / 'provenance.json')
        spec, ledger, parent, count, zip_sha = raw_review(archive, eid)
        require(record['exerciseId'] == eid and record['decision'] == parent['decision'] and record['reviewedAt'] == parent['reviewedAt'] and record['sourcePoseOrder'] == [1, 1, 2, 2, 1, 1] and record['physicalPoses'] == 2, 'Actual final decision/two-endpoint scope changed')
        require(record.get('checks') == parent['checks'] if record['decision'] == 'approved' else all(record['checks'][k]['passed'] is None for k in F['ART_CHECKS']), 'Strict/owner contract distinction changed')
        measured = F['frames_with_measurements'](eid, archive / 'draft', spec)
        failures = F['strict_failures'](measured, spec['size'])
        require(record.get('strictMeasurementFailures') == failures, 'Actual metric findings were changed or hidden')
        if record['decision'] == 'approved':
            require(not failures, 'Strict numeric release fails actual measurements')
        else:
            require(record['decision'] == 'owner-released-with-findings' and (parent.get('ownerFindingAccepted') is True or parent.get('minorHardwareFindingAccepted') is True) and record.get('approval') == parent.get('approval') and record.get('findings') and record.get('findings') == parent.get('findings'), 'Actual owner finding/permission required; never invent numeric failures')
        require(len(record.get('frames', [])) == 6 and record['reference'] == {'path': f'form-frames/{eid}/1.webp', 'sha256': ledger['acceptedDraftHashes']['final-frames/1.webp']}, 'Actual six ordered frames/reference required')
        for n, frame in enumerate(record['frames'], 1):
            expected = ledger['acceptedDraftHashes'][f'final-frames/{n}.webp']
            require(frame['path'] == f'form-frames/{eid}/{n}.webp' and frame['sha256'] == expected == sha(REPO / 'public' / frame['path']) and list(Image.open(REPO / 'public' / frame['path']).size) == spec['size'], 'Final public frame changed')
        require(sha(REPO / f'masters/{eid}/1.png') == ledger['acceptedDraftHashes'][spec['master']] and sha(REPO / f'public/form-art/{eid}.webp') == ledger['expectedGeneratedCardSha256'], 'Actual master/card changed')
        checks, tested = project_proof(archive, args.baseline_inputs, args.branch_inputs)
        beats = caption_correction(archive, checks, tested) if eid in ['t-bar-row', 'pull-ups'] else None
        beats = beats if beats is not None else read(archive / 'draft/draft-beats.json')
        cues = json.dumps([{'label': b['label'], 'cue': b['cue']} for b in beats], separators=(',', ':'), ensure_ascii=False)
        require(hashlib.sha256(cues.encode()).hexdigest() == record['cueSha256'], 'Reviewed actual cues changed')
        require(not list(archive.rglob('*.tsx')) and (archive / '.gitattributes').read_bytes() == b'# Preserve archived evidence bytes.\n* -text\n', 'Archive fixtures/byte attributes')
        require(tested.get(record_path.relative_to(REPO).as_posix()) == sha(record_path), 'Release record changed after normal verify')
        current = {x.relative_to(archive).as_posix(): sha(x) for x in archive.rglob('*') if x.is_file() and x != archive / 'provenance.json'}
        if provenance.get('sourceHashes'):
            require(provenance['sourceHashes'] == current, 'Existing seal changed; do not silently reseal')
        plans.append((eid, archive, provenance, checks, count, zip_sha))
    results = []
    for eid, archive, provenance, checks, count, zip_sha in plans:
        if not provenance.get('sourceHashes'):
            shutil.copy2(Path(__file__), archive / 'batch/seal-reviewed-sources.py')
            provenance['archiveStatus'] = 'Actual native/card/integrated decision and completed normal project evidence retained; final formatted archive bytes sealed. Current-head required CI and actual merge remain separate.'
            provenance['sourceHashes'] = {x.relative_to(archive).as_posix(): sha(x) for x in sorted(archive.rglob('*')) if x.is_file() and x != archive / 'provenance.json'}
            (archive / 'provenance.json').write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        require(all(sha(proof_path(archive, name)) == digest for name, digest in provenance['sourceHashes'].items()), 'Source seal readback failed')
        results.append({'exerciseId': eid, 'sourceHashesVerified': len(provenance['sourceHashes']), 'rawReviewedZipMembersVerified': count, 'rawReviewedZipSha256': zip_sha, 'preservedPublicFiles': 910, 'fullWindowsVerifyExitCode': checks['overallVerifyExitCode'], 'fullWindowsNonGreen': checks['fullWindowsNonGreen'], 'completionCredit': False})
    (R / 'pre-publication-source-seal.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(results, indent=2))

if __name__ == '__main__':
    main()
