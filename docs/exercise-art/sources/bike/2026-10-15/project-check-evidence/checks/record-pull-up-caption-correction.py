"""Second explicit caption review; first review and failed preflight stay exact.

No repository writes or tests. Pure chain validation is reused by final audits.
"""
from pathlib import Path
import argparse, copy, hashlib, io, json, runpy, zipfile

CHECKS = Path(__file__).resolve().parent
R = CHECKS.parent
REPO = R.parent / 'Maiin-burpees'
CODE = 'src/lib/releasedFormPlacards.ts'
RECORD = 'docs/exercise-art/releases/2026-10-15/pull-ups.json'
sha = lambda data: hashlib.sha256(data).hexdigest()
parse = lambda data: json.loads(data.decode('utf-8-sig'))

def require(ok, why):
    if not ok:
        raise RuntimeError('Pull-Up caption chain refused: ' + why)

def validate_chain(review, reader, baseline, branch3, preflight, tested, tbar_raw, pullup_raw, first_validator):
    require(review.get('status') == 'parent-reviewed-pull-up-caption-correction' and review.get('baselineHead') == 'fbc3e8879b43086da0488ed8e387953bdb1af911' and review.get('priorRunPrefix') == 'genuine-fix-preflight' and review.get('reviewer') and review.get('reviewedAt'), 'Actual second parent review required')
    for name, digest in review['reviewedEvidenceHashes'].items():
        require(sha(reader(name)) == digest, 'Second reviewed evidence changed: ' + name)
    first_data = reader(review['firstCorrectionReview'])
    require(sha(first_data) == review['firstCorrectionReviewSha256'], 'Never rewrite the first actual correction review')
    first = parse(first_data)
    tbar_beats = first_validator(first, reader, baseline, branch3, preflight, tbar_raw)
    rows = review['files']
    require(len(rows) == 2 and {row['path'] for row in rows} == {CODE, RECORD}, 'Only Pull-Up caption token and matching record scalar may change after the first preflight')
    sources = {}
    for row in rows:
        before, after = reader(row['beforeProof']), reader(row['afterProof'])
        require(sha(before) == row['beforeSha256'] == preflight[row['path']] and sha(after) == row['afterSha256'] == tested[row['path']], 'Exact prior preflight/current full source bindings required')
        sources[row['path']] = before, after
    for name in set(preflight) | set(tested):
        if name.startswith(('src/', 'scripts/', 'public/', 'masters/')) or name in ['package.json', 'package-lock.json']:
            if name != CODE:
                require(preflight.get(name) == tested.get(name), 'No extra source/test/script/art change is authorized after preflight: ' + name)
    before, after = sources[CODE]
    old = b'[0, "Hang", "Return to full elbow extension."]'
    new = b'[0, "Return", "Return to full elbow extension."]'
    require(before.count(old) == 1 and after == before.replace(old, new, 1), 'Only Pull-Up beat5 label Hang to Return may change')
    require(sha(pullup_raw) == review['originalReviewZipSha256'], 'Original Pull-Up review ZIP changed')
    with zipfile.ZipFile(io.BytesIO(pullup_raw)) as z:
        original = parse(z.read('draft/draft-beats.json'))
        spec = parse(z.read('batch/candidate-specs.json'))['pull-ups']
        ledger = parse(z.read('batch/local-stage-ledger.json'))['exercises']['pull-ups']
        require(sha(z.read('draft/draft-beats.json')) == ledger['acceptedDraftHashes']['draft-beats.json'], 'Original accepted Pull-Up cues changed')
    require(len(original) == 6 and original[4]['label'] == 'Hang', 'Original native/mobile label history must remain Hang')
    corrected = copy.deepcopy(original)
    corrected[4]['label'] = 'Return'
    require(parse(reader(review['correctedBeatsProof'])) == corrected, 'Preserve every original t/cue/order field')
    current = parse(reader(review['currentPlacardProof']))
    require(current['beats'] == [{**b, 'image': f'form-frames/pull-ups/{i}.webp'} for i, b in enumerate(corrected, 1)] and current['key'] == {'primary': spec['primary'], 'secondary': spec['secondary'], 'secondaryFill': 'solid'} and current['authoredSetupInstructions'] == spec['setup'], 'Current Pull-Up caption must preserve images/muscles/setup')
    cue = lambda beats: sha(json.dumps([{'label': b['label'], 'cue': b['cue']} for b in beats], separators=(',', ':'), ensure_ascii=False).encode())
    require(cue(original) == review['beforeCueSha256'] and cue(corrected) == review['afterCueSha256'], 'Actual old/current Pull-Up cue hashes required')
    before, after = sources[RECORD]
    old = ('"cueSha256": "' + cue(original) + '"').encode()
    new = ('"cueSha256": "' + cue(corrected) + '"').encode()
    require(before.count(old) == 1 and after == before.replace(old, new, 1), 'Only the matching Pull-Up record cueSha256 scalar may change')
    for i in range(1, 7):
        path = f'public/form-frames/pull-ups/{i}.webp'
        require(preflight[path] == tested[path] == ledger['acceptedDraftHashes'][f'final-frames/{i}.webp'], 'Caption correction authorizes no artwork edits')
    prior_result = parse(reader('checks/genuine-fix-preflight-result.json'))
    require(prior_result.get('status') == 'terminal' and prior_result.get('exitCode') == 1 and prior_result.get('inputBytesUnchanged') is True and any('pull-ups labels: expected 5 to be 6' in line for f in prior_result['actualTestResult']['failures'] for line in f['firstDetailLines']), 'Actual failed first preflight must remain disclosed')
    observed = parse(reader('checks/pull-ups-return-caption-observation.json'))
    require(observed.get('viewport') == [390, 844] and observed.get('console') == [] and observed.get('frameButtons') == ['Show frame 1: Hang', 'Show frame 2: Grip', 'Show frame 3: Top', 'Show frame 4: Hold', 'Show frame 5: Return', 'Show frame 6: Reset'] and observed.get('visibleImages') == [{'alt': 'Pull-Ups, Return', 'height': 1075, 'src': '/form-frames/pull-ups/5.webp', 'width': 800}], 'Actual corrected Pull-Up caption observation required')
    require(review.get('originalAcceptanceAndZipUnchanged') is True and review.get('historicalLabelWasHang') is True and review.get('newImageRequests') == 0 and review.get('noNewFullVerifyPassClaim') is True, 'Keep historical acceptance and pending full verification truthful')
    return {'t-bar-row': tbar_beats, 'pull-ups': corrected}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewer', required=True)
    parser.add_argument('--reviewed-at', required=True)
    args = parser.parse_args()
    prep = parse((CHECKS / 'pull-up-caption-correction-preparation.json').read_bytes())
    names = {row[k] for row in prep['files'] for k in ['beforeProof', 'afterProof']}
    names |= {'checks/pull-up-caption-correction-preparation.json', prep['correctedBeatsProof'], prep['currentPlacardProof'], prep['firstCorrectionReview'], 'checks/record-pull-up-caption-correction.py', 'checks/genuine-fix-preflight-result.json', 'checks/genuine-fix-preflight.log', 'checks/genuine-fix-preflight-input-manifest.json', 'checks/genuine-fix-preflight-proof-hashes.json'}
    for name in ['pull-ups-return-caption-dark.png', 'pull-ups-return-caption-light.png', 'pull-ups-return-caption-observation.json']:
        target, data = CHECKS / name, (R / name).read_bytes()
        require(not target.exists() or target.read_bytes() == data, 'Do not overwrite different second caption evidence')
        if not target.exists():
            target.write_bytes(data)
        names.add('checks/' + name)
    reader = lambda name: (R / name).read_bytes()
    review = {**prep, 'status': 'parent-reviewed-pull-up-caption-correction', 'reviewer': args.reviewer, 'reviewedAt': args.reviewed_at, 'reviewedEvidenceHashes': {name: sha(reader(name)) for name in sorted(names)}, 'historicalLabelWasHang': True, 'parentObservedCaptionReview': 'Actual unchanged ExerciseFormContent frame5 Return at390x844 dark/light; original native/mobile evidence keeps historical Hang. No image/cue/t/setup/muscle change.', 'noNewFullVerifyPassClaim': True}
    baseline = parse(reader('baseline/baseline-input-manifest.json'))
    branch3 = parse(reader('checks/branch3-input-manifest.json'))
    preflight = parse(reader('checks/genuine-fix-preflight-input-manifest.json'))
    tested = dict(preflight)
    for row in prep['files']:
        tested[row['path']] = sha((REPO / row['path']).read_bytes())
    first_validator = runpy.run_path(str(CHECKS / 'record-caption-and-fixture-correction.py'), run_name='readonly_first_caption_review')['validate_review']
    raws = [(REPO / f'docs/exercise-art/sources/{eid}/2026-10-15/review-inputs-exact.zip').read_bytes() for eid in ['t-bar-row', 'pull-ups']]
    validate_chain(review, reader, baseline, branch3, preflight, tested, *raws, first_validator)
    path = CHECKS / 'pull-up-caption-correction-review.json'
    data = (json.dumps(review, indent=2, ensure_ascii=False) + '\n').encode()
    require(not path.exists() or path.read_bytes() == data, 'Do not replace a different actual second review')
    if not path.exists():
        path.write_bytes(data)
    print(json.dumps({'review': 'checks/' + path.name, 'sha256': sha(data), 'afterCueSha256': prep['afterCueSha256'], 'normalFinalVerifyStillRequired': True, 'completionCredit': False}, indent=2))

if __name__ == '__main__':
    main()
