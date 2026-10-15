"""Record the actual parent-reviewed caption/fixture correction; no repo writes.

The pure validator is also reused by the project writer and sealed source audit.
Original native/card/mobile acceptance and raw ZIP bytes remain historical.
"""
from pathlib import Path
import argparse, copy, hashlib, io, json, zipfile

CHECKS = Path(__file__).resolve().parent
R = CHECKS.parent
REPO = R.parent / 'Maiin-burpees'
BASE = 'fbc3e8879b43086da0488ed8e387953bdb1af911'
ROW = 'src/components/program/__tests__/ExerciseRowSummary.test.tsx'
BODY = 'src/lib/__tests__/bodyRig.test.ts'
CODE = 'src/lib/releasedFormPlacards.ts'
ART = 'src/lib/formArtwork.ts'
RECORD = 'docs/exercise-art/releases/2026-10-15/t-bar-row.json'
BOUNDS = {
    ROW: ('9d22575f4d8664a40603957cf322dd4a0051ef6cbec541e80efadd1ab9c2954b', '5a4af26d414390ef0661ddeb23635e6d94a152b14c6c843c060d928ef634f59f'),
    BODY: ('579ccb8f96690045d49187e0769c377551eb2ba0bd976e9b667aa63b25f50950', '19d11f565f333b30abefb2da75df08965493deb3771e4951529e6cb11b728a01'),
}
sha = lambda data: hashlib.sha256(data).hexdigest()
parse = lambda data: json.loads(data.decode('utf-8-sig'))

def require(ok, why):
    if not ok:
        raise RuntimeError('Caption/fixture correction refused: ' + why)

def validate_review(review, reader, baseline, prior, tested, raw_zip_bytes):
    require(review.get('status') == 'parent-reviewed-caption-and-fixture-correction' and review.get('baselineHead') == BASE and review.get('priorRunPrefix') == 'branch3' and review.get('reviewer') and review.get('reviewedAt'), 'Actual parent correction review required')
    for name, digest in review['reviewedEvidenceHashes'].items():
        require(sha(reader(name)) == digest, 'Reviewed raw correction evidence changed: ' + name)
    rows = review.get('files', [])
    require(len(rows) == 5 and {r['path'] for r in rows} == {ROW, BODY, CODE, ART, RECORD}, 'Only two test fixtures, one caption token, one owner-count comment and one record scalar are in scope')
    sources = {}
    for row in rows:
        before, after = reader(row['beforeProof']), reader(row['afterProof'])
        require(sha(before) == row['beforeSha256'] == prior[row['path']] and sha(after) == row['afterSha256'] == tested[row['path']], 'Before/current full source bytes must match actual prior/final input maps')
        sources[row['path']] = (before, after)
    for path in [ROW, BODY]:
        before, after = sources[path]
        require(sha(before) == baseline[path], 'Test fixture must start at unchanged fresh baseline bytes')
        a, b = [data.decode('utf-8').replace('\r\n', '\n') for data in [before, after]]
        title = '  it("an authored placard with no frames is not live", () => {' if path == BODY else '  it("shows the muscles its category works when it has no drawing", () => {'
        x, u = a.index(title), b.index(title)
        y, w = a.index('\n  it(', x + len(title)), b.index('\n  it(', u + len(title))
        require((sha(a[x:y].encode()), sha(b[u:w].encode())) == BOUNDS[path], 'Only exact reviewed restored missing-art fixtures are permitted')
        rest = a[:x] + a[y:]
        if path == ROW:
            rest = rest.replace('import { describe, it, expect } from "vitest";', 'import { describe, it, expect, vi } from "vitest";', 1).replace('import ExerciseThumb from "../ExerciseThumb";', 'import ExerciseThumb from "../ExerciseThumb";\nimport * as formArtCutouts from "@/lib/formArtCutouts";', 1)
        require(rest == b[:u] + b[w:], 'Test code outside the exact fixture/import edits changed')
    before, after = sources[CODE]
    old = b'[0, "Stretch", "Return to straight arms without rounding."]'
    new = b'[0, "Return", "Return to straight arms without rounding."]'
    require(before.count(old) == 1 and after == before.replace(old, new, 1), 'Only T-Bar beat5 label Stretch to Return may change in placards')
    before, after = sources[ART]
    require(before.count(b'new consistency standard. Three') == 1 and after == before.replace(b'new consistency standard. Three', b'new consistency standard. Five', 1), 'Only the truthful owner-count comment Three to Five may change in artwork metadata')
    require(sha(raw_zip_bytes) == review['originalReviewZipSha256'], 'Original raw review ZIP changed')
    with zipfile.ZipFile(io.BytesIO(raw_zip_bytes)) as z:
        original = parse(z.read('draft/draft-beats.json'))
        spec = parse(z.read('batch/candidate-specs.json'))['t-bar-row']
        ledger = parse(z.read('batch/local-stage-ledger.json'))['exercises']['t-bar-row']
        require(sha(z.read('draft/draft-beats.json')) == ledger['acceptedDraftHashes']['draft-beats.json'], 'Original accepted draft cues changed')
    require(len(original) == 6 and original[4]['label'] == 'Stretch', 'Original six-beat review history must remain intact')
    corrected = copy.deepcopy(original)
    corrected[4]['label'] = 'Return'
    require(parse(reader(review['correctedBeatsProof'])) == corrected, 'Corrected beats must preserve all original t/cue/order fields')
    current = parse(reader(review['currentPlacardProof']))
    require(current['beats'] == [{**b, 'image': f'form-frames/t-bar-row/{i}.webp'} for i, b in enumerate(corrected, 1)] and current['key'] == {'primary': spec['primary'], 'secondary': spec['secondary'], 'secondaryFill': 'solid'} and current['authoredSetupInstructions'] == spec['setup'], 'Current caption proof must retain image order/muscles/setup')
    cue = lambda beats: sha(json.dumps([{'label': b['label'], 'cue': b['cue']} for b in beats], separators=(',', ':'), ensure_ascii=False).encode())
    require(cue(original) == review['beforeCueSha256'] and cue(corrected) == review['afterCueSha256'], 'Actual old/current cue hashes required')
    before, after = sources[RECORD]
    old_scalar = ('"cueSha256": "' + cue(original) + '"').encode()
    new_scalar = ('"cueSha256": "' + cue(corrected) + '"').encode()
    require(before.count(old_scalar) == 1 and after == before.replace(old_scalar, new_scalar, 1), 'Record change must be only the matching cueSha256 scalar')
    for i in range(1, 7):
        path = f'public/form-frames/t-bar-row/{i}.webp'
        require(prior[path] == tested[path] == ledger['acceptedDraftHashes'][f'final-frames/{i}.webp'], 'No artwork change is authorized by a caption correction')
    observation = parse(reader('checks/t-bar-return-caption-observation.json'))
    require(observation.get('viewport') == [390, 844] and observation.get('console') == [] and observation.get('frameButtons') == ['Show frame 1: Stretch', 'Show frame 2: Hinge', 'Show frame 3: Top', 'Show frame 4: Squeeze', 'Show frame 5: Return', 'Show frame 6: Reset'] and observation.get('visibleImages') == [{'alt': 'T-Bar Row, Return', 'height': 1036, 'src': '/form-frames/t-bar-row/5.webp', 'width': 918}], 'Actual corrected caption/mobile observation required')
    require(review.get('originalAcceptanceAndZipUnchanged') is True and review.get('historicalLabelWasStretch') is True and review.get('newImageRequests') == 0 and review.get('noNewFullVerifyPassClaim') is True, 'Historical approval and pending verification must remain truthful')
    return corrected

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewer', required=True)
    parser.add_argument('--reviewed-at', required=True)
    args = parser.parse_args()
    prep = parse((CHECKS / 'caption-correction-preparation.json').read_bytes())
    names = {row[k] for row in prep['files'] for k in ['beforeProof', 'afterProof']}
    names |= {'checks/caption-correction-preparation.json', prep['correctedBeatsProof'], prep['currentPlacardProof'], 'checks/branch3-verify-result.json', 'checks/branch3-failure-comparison.json', 'checks/branch3-verify.log', 'checks/branch3-input-manifest.json', 'checks/record-caption-and-fixture-correction.py'}
    for name in ['t-bar-return-caption-dark.png', 't-bar-return-caption-light.png', 't-bar-return-caption-observation.json']:
        target = CHECKS / name
        data = (R / name).read_bytes()
        require(not target.exists() or target.read_bytes() == data, 'Do not overwrite distinct caption review evidence')
        if not target.exists():
            target.write_bytes(data)
        names.add('checks/' + name)
    read = lambda name: (R / name).read_bytes()
    prior = parse(read('checks/branch3-input-manifest.json'))
    baseline = parse(read('baseline/baseline-input-manifest.json'))
    tested = {row['path']: sha((REPO / row['path']).read_bytes()) for row in prep['files']}
    tested.update({f'public/form-frames/t-bar-row/{i}.webp': sha((REPO / f'public/form-frames/t-bar-row/{i}.webp').read_bytes()) for i in range(1, 7)})
    failed = parse(read('checks/branch3-failure-comparison.json'))
    corrected_ids = [x for x in failed['newFailureIdentities'] if 'ExerciseRowSummary.test.tsx' in x or 'bodyRig.test.ts' in x]
    require(len(corrected_ids) == 3 and failed.get('comparisonComplete') is True and failed.get('comparisonValid') is True, 'Actual three corrected prior failures required')
    review = {**prep, 'status': 'parent-reviewed-caption-and-fixture-correction', 'reviewer': args.reviewer, 'reviewedAt': args.reviewed_at, 'reviewedEvidenceHashes': {name: sha(read(name)) for name in sorted(names)}, 'correctedPriorFailureIdentities': corrected_ids, 'originalAcceptanceAndZipUnchanged': True, 'historicalLabelWasStretch': True, 'parentObservedCaptionReview': 'Actual unchanged ExerciseFormContent frame5 Return at390x844 light/dark; original native/mobile traces keep historical Stretch. No image/cue/t/setup change.', 'noNewFullVerifyPassClaim': True}
    raw = (REPO / 'docs/exercise-art/sources/t-bar-row/2026-10-15/review-inputs-exact.zip').read_bytes()
    validate_review(review, read, baseline, prior, tested, raw)
    path = CHECKS / 'caption-and-fixture-correction-review.json'
    data = (json.dumps(review, indent=2, ensure_ascii=False) + '\n').encode()
    require(not path.exists() or path.read_bytes() == data, 'Do not overwrite a different historical correction review')
    if not path.exists():
        path.write_bytes(data)
    print(json.dumps({'review': 'checks/' + path.name, 'sha256': sha(data), 'correctedBeats': prep['correctedBeatsProof'], 'afterCueSha256': prep['afterCueSha256'], 'normalFinalVerifyStillRequired': True, 'completionCredit': False}, indent=2))

if __name__ == '__main__':
    main()
