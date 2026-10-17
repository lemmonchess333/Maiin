"""Prepared only. Parent executes after actual native/card acceptance.

Stage uses the existing existing-needs-review hand-list contract, never an
approved release or a staged browser plugin. It deliberately does not run tests,
generators, a server, Git publishing or write any passing release evidence.
"""
from pathlib import Path, PurePosixPath
from PIL import Image
from datetime import datetime, timezone
import argparse, hashlib, io, json, re, shutil, subprocess, zipfile
import xml.etree.ElementTree as ET

R = Path(__file__).resolve().parent
REPO = R.parent / 'Maiin-burpees'
BASE = 'fbc3e8879b43086da0488ed8e387953bdb1af911'
BRANCH = 'art/retained-endpoint-guides-20261015'
CANONICAL = 'fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
SPEC = json.loads((R / 'candidate-specs.json').read_text(encoding='utf-8'))
CHECKS = ['nativeManual', 'nativeTimed', 'canonicalNoShorts', 'physicalEndpoints', 'visibleGrips', 'colourBoundaries', 'cardLight', 'cardDark']
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
git = lambda *args: subprocess.check_output(['git', *args], cwd=REPO, text=True, encoding='utf-8').strip()

def require(ok, why):
    if not ok:
        raise RuntimeError(why)

def safe(root, relative):
    p = PurePosixPath(relative)
    require(isinstance(relative, str) and not p.is_absolute() and '..' not in p.parts and '\\' not in relative and ':' not in relative, 'Unsafe relative evidence path')
    resolved = (root / relative).resolve()
    require(resolved.is_relative_to(root.resolve()) and resolved.is_file(), 'Missing evidence: ' + relative)
    return resolved

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def preserve():
    baseline = read(R / 'preservation-baseline.json')
    require(git('rev-parse', 'HEAD') == BASE and git('branch', '--show-current') == BRANCH, 'Exact base and review branch required')
    require(len(baseline['publicAssetHashes']) == 910, 'Expected actual preserved public set')
    for path, expected in baseline['publicAssetHashes'].items():
        require(sha(safe(REPO, path)) == expected, 'Prior accepted public artwork changed: ' + path)
    require(sha(REPO / 'docs/exercise-art/identity/athlete-anatomy-v3.png') == CANONICAL, 'Canonical FA56 changed')

def finalized_outputs(ledger):
    """Permit only genuinely finalized earlier staged IDs, not arbitrary edits."""
    records, archives, strict_ids = set(), set(), set()
    for eid, staged in ledger['exercises'].items():
        record_path = REPO / f'docs/exercise-art/releases/2026-10-15/{eid}.json'
        if not record_path.exists():
            continue
        record = read(record_path)
        spec = SPEC[eid]
        archive = REPO / f'docs/exercise-art/sources/{eid}/2026-10-15'
        require(record.get('exerciseId') == eid and record.get('decision') in ['approved', 'owner-released-with-findings'] and record.get('sourcePoseOrder') == spec['sourcePoseOrder'] and [record.get('width'), record.get('height')] == spec['size'], 'Prior finalized release scope changed')
        require(len(record.get('frames', [])) == 6, 'Prior finalized release needs six actual frames')
        for n, frame in enumerate(record['frames'], 1):
            name = f'final-frames/{n}.webp'
            require(frame['path'] == f'form-frames/{eid}/{n}.webp' and frame['sha256'] == staged['acceptedDraftHashes'][name] == sha(REPO / 'public' / frame['path']), 'Prior finalized public frame/ledger mismatch')
        require(record['reference'] == {'path': f'form-frames/{eid}/1.webp', 'sha256': staged['acceptedDraftHashes']['final-frames/1.webp']}, 'Prior finalized reference changed')
        require(sha(REPO / f'public/form-art/{eid}.webp') == staged['expectedGeneratedCardSha256'], 'Prior finalized card changed')
        native_snapshot = safe(R, staged['nativeCardAcceptanceExactSnapshot'])
        require(sha(native_snapshot) == staged['nativeCardAcceptanceSha256'], 'Prior native/card acceptance changed')
        with zipfile.ZipFile(archive / 'review-inputs-exact.zip') as z:
            require(len(z.namelist()) == len(set(z.namelist())) and z.testzip() is None, 'Prior finalized exact evidence ZIP invalid')
            require(z.read('batch/' + native_snapshot.name) == native_snapshot.read_bytes(), 'Prior finalized native acceptance bytes missing')
            for name, digest in staged['acceptedDraftHashes'].items():
                require(hashlib.sha256(z.read('draft/' + name)).hexdigest() == digest, 'Prior finalized raw accepted draft changed')
            actual_parent = []
            for name in z.namelist():
                if name.startswith('batch/') and name.endswith('.json'):
                    item = json.loads(z.read(name))
                    if isinstance(item, dict) and item.get('status') == 'parent-actual-integrated-accepted':
                        actual_parent.append(item.get('exercises', {}).get(eid, {}))
            require(any(p.get('decision') == record['decision'] and all(p.get('checks', {}).get(k, {}).get('passed') is True for k in ['identity', 'camera', 'anatomy', 'equipment', 'contact', 'physics', 'muscles', 'cueAgreement', 'sequenceAndLoop', 'mobileLight', 'mobileDark']) for p in actual_parent), 'Prior finalized actual integrated acceptance missing')
        records.add(record_path.relative_to(REPO).as_posix())
        archives.add((archive.parent.relative_to(REPO).as_posix() + '/'))
        if record['decision'] == 'approved':
            strict_ids.add(eid)
    return records, archives, strict_ids

def validate_generated_release_map():
    """Check the entire generated table and unchanged surrounding contract."""
    path = 'src/lib/formArtReleases.data.ts'
    text = (REPO / path).read_text(encoding='utf-8').replace('\r\n', '\n')
    original = git('show', BASE + ':' + path).replace('\r\n', '\n')
    marker = '> = {\n'
    require(marker in text and marker in original, 'Generated release module shape changed')
    prefix, table = text.split(marker, 1)
    old_prefix, old_table = original.split(marker, 1)
    body, suffix = table.rsplit('\n};', 1)
    _, old_suffix = old_table.rsplit('\n};', 1)
    require(prefix == old_prefix and suffix.strip() == old_suffix.strip(), 'Unrelated generated-module contract edit')
    actual, consumed = {}, []
    pattern = re.compile(r'(?:"([^"\\]+)"|([A-Za-z_$][A-Za-z0-9_$]*)):\s*\{([^{}]+)\}\s*,?', re.S)
    for match in pattern.finditer(body):
        quoted, bare, fields = match.groups()
        key = quoted or bare
        fields = re.sub(r'\b(folder|version|width|height|reference)\s*:', r'"\1":', fields)
        fields = re.sub(r',\s*$', '', fields)
        require(key not in actual, 'Duplicate generated release ID')
        actual[key] = json.loads('{' + fields + '}')
        consumed.append(match.span())
    remainder = body
    for start, end in reversed(consumed):
        remainder = remainder[:start] + remainder[end:]
    require(not remainder.strip(), 'Unparsed/unrelated generated release module content')
    expected, newest = {}, {}
    for folder in (REPO / 'docs/exercise-art/releases').iterdir():
        if not folder.is_dir():
            continue
        for p in folder.glob('*.json'):
            value = read(p)
            if not isinstance(value, dict) or value.get('decision') != 'approved':
                continue
            require(value.get('exerciseId') == p.stem, 'Approved record ID mismatch')
            stamp = datetime.fromisoformat(value['reviewedAt'].replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            if p.stem not in newest or stamp > newest[p.stem]:
                newest[p.stem] = stamp
                expected[p.stem] = {'folder': folder.name, 'version': value['version'], 'width': value['width'], 'height': value['height'], 'reference': int(value['reference']['path'].rsplit('/', 1)[1].split('.')[0])}
    require(actual == expected, 'Generated release map differs from actual approved records')

def validate_owner_inventory_change(finalized_records):
    path = 'src/lib/__tests__/formArtOwnerRelease.test.ts'
    before = git('show', BASE + ':' + path).replace('\r\n', '\n')
    after = (REPO / path).read_text(encoding='utf-8').replace('\r\n', '\n').strip()
    pattern = re.compile(r'const ids = \[[\s\S]*?\];')
    old, current = pattern.search(before), pattern.search(after)
    require(old is not None and current is not None, 'Owner test inventory shape changed')
    parse = lambda text: json.loads(re.sub(r',\s*\]', ']', text.removeprefix('const ids = ').removesuffix(';')))
    original_ids, current_ids = parse(old[0]), parse(current[0])
    added = {read(REPO / p)['exerciseId'] for p in finalized_records if read(REPO / p)['decision'] == 'owner-released-with-findings'}
    require(len(current_ids) == len(set(current_ids)) and set(current_ids) == set(original_ids) | added, 'Owner test may add only actual finalized owner IDs')
    words = {3: 'three', 4: 'four', 5: 'five', 6: 'six'}
    require(len(original_ids) in words and len(current_ids) in words, 'Explicit bounded owner inventory count')
    expected = before[:old.start()] + current[0] + before[old.end():]
    expected = expected.replace('ships exactly ' + words[len(original_ids)] + ' owner-authorized guides', 'ships exactly ' + words[len(current_ids)] + ' owner-authorized guides', 1)
    require(expected.strip() == after, 'Unrelated owner test edit; only actual ID inventory/title count allowed')
    return path

def validate_candidate(eid, accepted):
    spec = SPEC[eid]
    require(spec.get('packageReady', True) is True and isinstance(spec.get('size'), list) and len(spec['size']) == 2 and len(spec['sourceFiles']) == 2 and len(spec['posePngs']) == 2, 'Actual complete candidate package facts required before staging')
    draft = R.parent / spec['directory']
    require(accepted.get('reviewedAt') and isinstance(accepted.get('reviewedInputHashes'), dict), 'Actual dated parent acceptance with input hashes required')
    for key in CHECKS:
        item = accepted.get('checks', {}).get(key, {})
        require(item.get('passed') is True and isinstance(item.get('evidence'), str) and item['evidence'].strip(), 'Actual parent native/card check missing: ' + key)
    pins = accepted['reviewedInputHashes']
    required = [spec['master'], spec['card'], spec['sourceProvenance'], spec['measurements'], 'draft-beats.json', 'catalogue.json', *spec['requiredReports'], *spec['oras'], *spec['posePngs'], *spec['sourceFiles'], *[f'final-frames/{n}.webp' for n in range(1, 7)]]
    if spec['preparedCardSource']:
        required.append(spec['preparedCardSource'])
    require(all(name in pins for name in required), 'Parent acceptance must pin every source/frame/card/cue/ORA/provenance/measurement input')
    for name, expected in pins.items():
        require(sha(safe(draft, name)) == expected, 'Accepted draft bytes changed: ' + name)
    catalogue = read(draft / 'catalogue.json')
    require(catalogue['id'] == eid and catalogue['name'] == spec['name'] and all(x in catalogue['instructions'] for x in spec['setup']), 'Exact catalogue identity/setup')
    beats = read(draft / 'draft-beats.json')
    require(isinstance(beats, list) and len(beats) == 6 and [b['t'] for b in beats] == spec['positionCoordinates'], 'Six actual cue positions must match reviewed two-state scope')
    require(all(isinstance(b['label'], str) and b['label'].strip() and isinstance(b['cue'], str) and b['cue'].strip() for b in beats), 'Six actual labels/cues')
    poses = [Image.open(draft / p).convert('RGBA') for p in spec['posePngs']]
    require(all(list(im.size) == spec['size'] for im in poses), 'Actual pose sizes')
    for name, pose in zip(spec['oras'], poses):
        with zipfile.ZipFile(draft / name) as z:
            tree = ET.fromstring(z.read('stack.xml'))
            reopened = Image.new('RGBA', pose.size)
            for layer in reversed(list(tree.find('stack'))):
                reopened.alpha_composite(Image.open(io.BytesIO(z.read(layer.attrib['src']))).convert('RGBA'))
            require(reopened.tobytes() == pose.tobytes(), 'Actual reopened editable differs: ' + name)
    for n, pose in enumerate(spec['sourcePoseOrder'], 1):
        im = Image.open(draft / f'final-frames/{n}.webp').convert('RGBA')
        require(im.size == poses[pose - 1].size and im.tobytes() == poses[pose - 1].tobytes(), 'Actual frame/pose decoding mismatch')
    require(Image.open(draft / spec['master']).convert('RGB').tobytes() == poses[0].convert('RGB').tobytes(), 'Reference/master must be actual frame1')
    require(Image.open(draft / spec['card']).size[0] > 0, 'Actual accepted card must decode')
    return draft, spec, beats

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+', choices=list(SPEC), required=True)
    parser.add_argument('--acceptance', type=Path, required=True)
    args = parser.parse_args()
    preserve()
    approval = read(args.acceptance)
    require(approval.get('status') == 'parent-native-card-accepted-for-local-integration', 'Actual parent acceptance required; template is not a pass')
    ledger_path = R / 'local-stage-ledger.json'
    ledger = read(ledger_path) if ledger_path.exists() else {'baselineHead': BASE, 'exercises': {}, 'completionCredit': False}
    finalized_records, finalized_archives, prior_strict = finalized_outputs(ledger)
    known_ids = set(ledger['exercises']) | set(args.ids)
    shared = {'src/lib/releasedFormPlacards.ts', 'src/lib/formArtwork.ts', 'src/lib/formArtCutouts.data.ts'}
    if prior_strict:
        validate_generated_release_map()
        shared.add('src/lib/formArtReleases.data.ts')
    if any(read(REPO / path)['decision'] == 'owner-released-with-findings' for path in finalized_records):
        shared.add(validate_owner_inventory_change(finalized_records))
    status = subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=REPO, text=True, encoding='utf-8').rstrip('\r\n')
    for line in status.splitlines():
        name = line[3:].replace('\\', '/').strip('"')
        allowed = name in shared or any(name.startswith(f'public/form-frames/{eid}/') or name == f'public/form-art/{eid}.webp' or name.startswith(f'masters/{eid}/') or name in [f'docs/exercise-art/cutout-sources/{eid}.png', f'docs/exercise-art/cutout-sources/{eid}.json'] for eid in known_ids)
        allowed = allowed or name in finalized_records or any(name.startswith(prefix) for prefix in finalized_archives)
        if name.endswith('/') and name.startswith('docs/exercise-art/releases/'):
            folder = REPO / name
            allowed = bool(folder.is_dir()) and all(p.relative_to(REPO).as_posix() in finalized_records for p in folder.rglob('*') if p.is_file())
        require(allowed, 'Unexpected repository edit before stage: ' + name)
    validated = {}
    for eid in args.ids:
        require(eid not in ledger['exercises'], 'Do not stage a second time or overwrite an accepted local set')
        validated[eid] = validate_candidate(eid, approval.get('exercises', {}).get(eid, {}))
        require(not any(p.exists() for p in [REPO / f'public/form-frames/{eid}', REPO / f'masters/{eid}', REPO / f'public/form-art/{eid}.webp']), 'New target must not replace existing art')
        if SPEC[eid]['preparedCardSource']:
            require(not any((REPO / f'docs/exercise-art/cutout-sources/{eid}{suffix}').exists() for suffix in ['.png', '.json']), 'Prepared card targets must be new')
    placards = REPO / 'src/lib/releasedFormPlacards.ts'
    artwork = REPO / 'src/lib/formArtwork.ts'
    code, art = placards.read_text(encoding='utf-8'), artwork.read_text(encoding='utf-8')
    needle = 'export const RELEASED_FORM_PLACARDS = {\n'
    hand = 'export const HAND_LISTED_FORM_ARTWORK: Record<string, HandListedFormArtwork> = {\n'
    require(needle in code and hand in art, 'Existing application contracts changed')
    for eid, (draft, spec, beats) in validated.items():
        require(f'"{eid}": placard(' not in code and f'"{eid}": existing(' not in art, 'Exact ID already registered')
        rows = '\n'.join('      [' + str(b['t']) + ', ' + json.dumps(b['label']) + ', ' + json.dumps(b['cue']) + '],' for b in beats)
        block = f'  "{eid}": placard(\n    "{eid}",\n    ' + json.dumps(spec['primary']) + ',\n    ' + json.dumps(spec['secondary']) + ',\n    [\n' + rows + '\n    ],\n    ' + json.dumps(spec['setup']) + '\n  ),\n'
        code = code.replace(needle, needle + block, 1)
        art = art.replace(hand, hand + f'  "{eid}": existing("{eid}", {spec["size"][0]}, {spec["size"][1]}),\n', 1)
    # All acceptance/preservation/source/target checks precede repository writes.
    for eid, (draft, spec, beats) in validated.items():
        acceptance_snapshot = R / f'local-acceptance-{eid}-exact.json'
        require(not acceptance_snapshot.exists() or acceptance_snapshot.read_bytes() == args.acceptance.read_bytes(), 'Do not replace historical native/card acceptance bytes')
    for eid, (draft, spec, beats) in validated.items():
        acceptance_snapshot = R / f'local-acceptance-{eid}-exact.json'
        acceptance_snapshot.write_bytes(args.acceptance.read_bytes())
        public = REPO / f'public/form-frames/{eid}'
        public.mkdir(parents=True)
        for n in range(1, 7):
            shutil.copy2(draft / f'final-frames/{n}.webp', public / f'{n}.webp')
        master = REPO / f'masters/{eid}/1.png'
        master.parent.mkdir(parents=True)
        shutil.copy2(draft / spec['master'], master)
        if spec['preparedCardSource']:
            target = REPO / f'docs/exercise-art/cutout-sources/{eid}.png'
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(draft / spec['preparedCardSource'], target)
            save(target.with_suffix('.json'), {'reviewStatus': 'reviewed', 'image': eid + '.png', 'imageSha256': sha(target), 'reference': f'form-frames/{eid}/1.webp', 'referenceSha256': sha(public / '1.webp'), 'method': 'Actual parent native/card accepted prepared source; original geometry unchanged; standard card generator remains required.'})
        ledger['exercises'][eid] = {'draft': spec['directory'], 'nativeCardAcceptanceExactSnapshot': acceptance_snapshot.name, 'nativeCardAcceptanceSha256': sha(acceptance_snapshot), 'acceptedDraftHashes': approval['exercises'][eid]['reviewedInputHashes'], 'state': 'existing-needs-review local integration only; no approved release', 'expectedGeneratedCardSha256': sha(draft / spec['card'])}
    placards.write_text(code, encoding='utf-8')
    artwork.write_text(art, encoding='utf-8')
    preserve()
    save(ledger_path, ledger)
    print(json.dumps({'locallyStaged': args.ids, 'status': 'existing-needs-review', 'releaseRecordsWritten': False, 'passingReviewFlagsWritten': False, 'next': 'Run unchanged normal card generator for these IDs; confirm exact card hashes; then parent actual integrated 390x844 light/dark/controls/6-to-1 QA on port8784. Do not publish a provisional state.', 'completionCredit': False}))

if __name__ == '__main__':
    main()
