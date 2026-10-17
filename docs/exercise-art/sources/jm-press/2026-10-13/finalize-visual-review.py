from pathlib import Path
from PIL import Image
import hashlib, json, shutil, re, zipfile, io
from datetime import datetime, timezone

p = Path(__file__).resolve().parent
repo = p.parents[1] / 'Maiin-burpees'
source = repo / 'docs/exercise-art/sources/jm-press/2026-10-13'
sha = lambda f: hashlib.sha256(f.read_bytes()).hexdigest()
canonical = repo / 'docs/exercise-art/identity/athlete-anatomy-v3.png'
assert sha(canonical) == 'fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
previous = json.loads((p / 'previous-artwork-hashes.json').read_text())
assert len(previous) == 868
assert all(sha(repo / name) == digest for name, digest in previous.items())

for theme in ['light', 'dark']:
    trace = json.loads((p / f'integrated-{theme}-trace.json').read_text())
    rows = [r for r in trace if r['playing'] and r['theme'] == theme and not r['documentHidden']]
    assert {r['src'] for r in rows} == {f'/form-frames/jm-press/{i}.webp' for i in range(1, 7)}
    assert all(r['viewport'] == [390, 844] and [r['naturalWidth'], r['naturalHeight']] == [835, 1024] for r in rows)
    assert any(a['src'].endswith('/6.webp') and b['src'].endswith('/1.webp') for a, b in zip(rows, rows[1:]))
controls = json.loads((p / 'integrated-controls.json').read_text())
assert controls['paused'] and controls['slowerPlaybackAdvanced'] and controls['slowerLabel'] == 'Slower'
assert controls['manualPrevious1to6'] == 'JM Press, Finish' and controls['manualNext6to1'] == 'JM Press, Set'
assert not [r for r in json.loads((p / 'integrated-console.json').read_text()) if r['level'] == 'error']

pose_order = ['top', 'middle', 'bottom', 'bottom', 'middle', 'top']
for i, pose in enumerate(pose_order, 1):
    with zipfile.ZipFile(p / f'{pose}-editable.ora') as ora:
        reopened = Image.open(io.BytesIO(ora.read('mergedimage.png'))).convert('RGB')
        final = Image.open(p / f'final-{pose}.png').convert('RGB')
        assert reopened.tobytes() == final.tobytes()
        delivered = Image.open(repo / f'public/form-frames/jm-press/{i}.webp').convert('RGB')
        assert delivered.tobytes() == final.crop((260, 0, 1095, 1024)).tobytes()
        assert sha(repo / f'public/form-frames/jm-press/{i}.webp') == sha(p / f'final-frames/{i}.webp')

entries = re.findall(r'(?:"([^"\n]+)"|(\w+)): \{\s*folder: "([^"\n]+)"', (repo / 'src/lib/formArtReleases.data.ts').read_text())
active = [(quoted or plain, folder) for quoted, plain, folder in entries]
assert len(active) == 116
verified = 0
for exercise, folder in active:
    record = json.loads((repo / f'docs/exercise-art/releases/{folder}/{exercise}.json').read_text())
    assert record['decision'] == 'approved'
    for frame in record['frames']:
        assert sha(repo / 'public' / frame['path']) == frame['sha256'], frame['path']
        verified += 1
assert verified == 696
card = repo / 'public/form-art/jm-press.webp'
assert Image.open(card).size == (409, 480)
assert sha(card) == 'e54af7cdd3faf276817541516d4d8d2551dba87b8d549ec00693166d2eb55027'

release = repo / 'docs/exercise-art/releases/2026-10-13/jm-press.json'
record = json.loads(release.read_text())
for theme in ['Light', 'Dark']:
    record['checks'][f'mobile{theme}']['evidence'] = (
        f'Registered ExerciseFormContent at 390 x 844 in {theme.lower()} mode: all six production '
        'paths decoded, 6 to 1 loop observed, complete body/bar/plates and readable captions/key. '
        'Actual standard generated 409 x 480 card reviewed. Pause, manual 1 to 6 and 6 to 1, '
        'and slower playback passed; observed console has zero errors. '
        f'Evidence: integrated-{theme.lower()}.png, integrated-{theme.lower()}-trace.json, '
        'integrated-controls.json and integrated-console.json.'
    )
record['integrationValidation'] = 'Native and registered mobile/card review passed; project verification and required CI pending before completion and merge.'
release.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')

for name in ['integrated-light.png', 'integrated-dark.png', 'integrated-light-trace.json',
             'integrated-dark-trace.json', 'integrated-controls.json', 'integrated-console.json',
             'sequence-measurements.json', 'finalize-visual-review.py']:
    shutil.copy2(p / name, source / name)
proof = {
    'reviewedAt': datetime.now(timezone.utc).isoformat(),
    'previousArtworkFilesPreserved': len(previous),
    'canonicalPreserved': True, 'approvedActiveSets': len(active), 'verifiedFrames': verified,
    'registeredMobileLightDark': True, 'controlsPassed': True, 'consoleErrors': 0,
    'editableFilesPixelExact': 3, 'losslessFramesPixelExact': 6,
    'distinctPoses': 3, 'sourcePoseOrder': [1, 2, 3, 3, 2, 1],
    'cardSha256': sha(card), 'projectVerification': 'pending', 'merge': 'pending'
}
(p / 'registered-review.json').write_text(json.dumps(proof, indent=2) + '\n')
shutil.copy2(p / 'registered-review.json', source / 'registered-review.json')
provenance_path = source / 'provenance.json'
provenance = json.loads(provenance_path.read_text())
provenance['sourceHash256'] = {f.name: sha(f) for f in source.iterdir()
    if f.is_file() and f.suffix.lower() in {'.png', '.ora'}}
provenance['sourceTextSha256'] = {f.name: hashlib.sha256(f.read_text(encoding='utf-8').encode('utf-8')).hexdigest()
    for f in source.iterdir() if f.is_file() and f.suffix.lower() in {'.txt', '.py'}}
provenance['hashScope'] = 'Raw binary hashes for PNG/OpenRaster. Prompt/recipe text hashes normalize CRLF to LF for cross-platform Git checkouts. JSON/Markdown review records excluded because the repository formatter may normalize them.'
provenance_path.write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
print(json.dumps(proof, indent=2))
