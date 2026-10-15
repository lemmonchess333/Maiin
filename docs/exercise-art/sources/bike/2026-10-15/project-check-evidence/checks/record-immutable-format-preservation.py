"""Outside-repo proposal/review only; parent applies ignore file after full run.

Preserve one original script's bytes using the existing verbatim-source policy.
This never edits the repository, runs checks, changes runtime code or seals art.
"""
from pathlib import Path
import argparse, hashlib, io, json, zipfile

CHECKS = Path(__file__).resolve().parent
R = CHECKS.parent
REPO = R.parent / 'Maiin-burpees'
ORIGINAL = 'docs/exercise-art/sources/t-bar-row/2026-10-15/draft/originals/prepare-master.cjs'
RAW_MEMBER = 'draft/originals/prepare-master.cjs'
COMMENT = '# Preserve the reviewed original authoring script byte-for-byte; format maintained evidence normally.'
APPEND = '\n' + COMMENT + '\n' + ORIGINAL + '\n'
BEFORE = 'checks/prettierignore-tested-before.txt'
AFTER = 'checks/prettierignore-canonical-lf-after.txt'
SCRIPT = 'checks/immutable-original-prepare-master.cjs.txt'
sha = lambda data: hashlib.sha256(data).hexdigest()
parse = lambda data: json.loads(data.decode('utf-8-sig'))

def require(ok, why):
    if not ok:
        raise RuntimeError('Immutable format preservation refused: ' + why)

def validate_review(review, reader, tested, current_ignore, current_original, raw_zip):
    require(review.get('status') == 'parent-reviewed-exact-immutable-original-format-preservation' and review.get('testedPrefix') == 'branch4' and review.get('reviewer') and review.get('reviewedAt'), 'Actual after-terminal parent review required')
    for name, digest in review['reviewedEvidenceHashes'].items():
        require(sha(reader(name)) == digest, 'Actual format-preservation proof changed')
    before, after = reader(BEFORE), reader(AFTER)
    require(sha(before) == review['testedIgnoreSha256'] == tested['.prettierignore'], 'Exact branch4-tested before-ignore bytes required')
    expected = before.decode('utf-8').replace('\r\n', '\n').encode('utf-8') + APPEND.encode('utf-8')
    require(after == expected == current_ignore and b'\r' not in after, 'Only canonical LF normalization and the exact comment/one-original-path append are allowed')
    require(sha(after) == review['currentIgnoreSha256'], 'Current ignore hash must match the explicit post-run delta')
    require(sha(raw_zip) == review['originalReviewZipSha256'], 'Original reviewed ZIP changed')
    with zipfile.ZipFile(io.BytesIO(raw_zip)) as z:
        original = z.read(RAW_MEMBER)
    require(original == reader(SCRIPT) == current_original and sha(original) == review['originalSourceSha256'] == tested[ORIGINAL] == '832f7b0eb9ee5985b602e190fb824ca960ad659c9e4d474858934bd53b7a703a', 'Original script/readable/raw ZIP bytes must remain exact')
    result = parse(reader('checks/branch4-verify-result.json'))
    comparison = parse(reader('checks/branch4-failure-comparison.json'))
    require(result.get('status') == 'terminal' and result.get('inputBytesUnchanged') is True and comparison.get('comparisonComplete') is True and comparison.get('comparisonValid') is True and comparison.get('allNormalVerifyStagesPresent') is True, 'Completed preserved full run must precede the ignore-only configuration action')
    require(review.get('productionCodeChanged') is False and review.get('checkerOrLimitsChanged') is False and review.get('claimsAllCurrentInputsEqualTested') is False, 'Disclose the one non-runtime post-run configuration delta')
    return {'path': '.prettierignore', 'testedSha256': sha(before), 'currentSha256': sha(after), 'scope': 'Canonical LF normalization plus exact comment and one immutable original script path; existing rules and all runtime/checker source unchanged.', 'ignoredOriginalPath': ORIGINAL, 'originalSourceSha256': sha(original), 'meaning': 'Normal full-run input preservation remains the historical at-run fact. Current configuration differs only by this explicitly reviewed non-runtime format-preservation delta; normal production/readable-evidence formatting remains required.'}

def exact_or_new(path, data):
    require(not path.exists() or path.read_bytes() == data, 'Do not overwrite different historical proof bytes')
    if not path.exists():
        path.write_bytes(data)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode', choices=['proposal', 'record'])
    p.add_argument('--reviewer')
    p.add_argument('--reviewed-at')
    args = p.parse_args()
    reader = lambda name: (R / name).read_bytes()
    tested = parse(reader('checks/branch4-input-manifest.json'))
    current = (REPO / '.prettierignore').read_bytes()
    raw = (REPO / 'docs/exercise-art/sources/t-bar-row/2026-10-15/review-inputs-exact.zip').read_bytes()
    original = (REPO / ORIGINAL).read_bytes()
    if args.mode == 'proposal':
        require(sha(current) == tested['.prettierignore'], 'Prepare before the parent changes the tested ignore file')
        exact_or_new(R / BEFORE, current)
        exact_or_new(R / AFTER, current.decode('utf-8').replace('\r\n', '\n').encode('utf-8') + APPEND.encode('utf-8'))
        exact_or_new(R / SCRIPT, original)
        print(json.dumps({'outsideProposal': AFTER, 'parentMayCopyOnlyAfterFullRunTerminal': True, 'repositoryWritten': False, 'completionCredit': False}))
        return
    require(args.reviewer and args.reviewed_at, 'Actual parent review/date required')
    names = [BEFORE, AFTER, SCRIPT, 'checks/record-immutable-format-preservation.py', 'checks/branch4-input-manifest.json', 'checks/branch4-verify-result.json', 'checks/branch4-failure-comparison.json', 'checks/branch4-verify.log']
    review = {'status': 'parent-reviewed-exact-immutable-original-format-preservation', 'reviewer': args.reviewer, 'reviewedAt': args.reviewed_at, 'testedPrefix': 'branch4', 'path': '.prettierignore', 'beforeProof': BEFORE, 'afterProof': AFTER, 'originalProof': SCRIPT, 'testedIgnoreSha256': sha(reader(BEFORE)), 'currentIgnoreSha256': sha(current), 'originalSourceSha256': sha(original), 'originalReviewZipSha256': sha(raw), 'reviewedEvidenceHashes': {n: sha(reader(n)) for n in names}, 'source': 'Existing .prettierignore preserves upstream skills and verbatim plans. This applies that convention only to one immutable original authoring script.', 'eolNormalization': 'Only .prettierignore CRLF to canonical LF is normalized; original script stays byte-exact.', 'productionCodeChanged': False, 'checkerOrLimitsChanged': False, 'claimsAllCurrentInputsEqualTested': False, 'normalProductionAndReadableEvidenceFormattingStillRequired': True, 'newFullVerifyPassClaim': False, 'completionCredit': False}
    validate_review(review, reader, tested, current, original, raw)
    path = CHECKS / 'immutable-original-format-ignore-review.json'
    exact_or_new(path, (json.dumps(review, indent=2, ensure_ascii=False) + '\n').encode())
    print(json.dumps({'review': 'checks/' + path.name, 'currentIgnoreSha256': sha(current), 'sourceScriptUnchanged': True, 'repositoryWritten': False, 'completionCredit': False}))

if __name__ == '__main__':
    main()
