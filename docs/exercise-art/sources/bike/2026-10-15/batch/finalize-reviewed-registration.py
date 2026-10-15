"""Prepared only: record an actual parent integrated decision; never invent QA.

Uses existing strict or owner-with-findings contracts. No phase grouping, tests,
generators, publishing, merge or completion updates. Parent owns execution.
"""
from pathlib import Path
import argparse, hashlib, json, math, re, runpy, shutil, zipfile

R = Path(__file__).resolve().parent
G = runpy.run_path(str(R / 'prepare-local-registration.py'), run_name='endpoint_helpers')
REPO, SPEC = G['REPO'], G['SPEC']
require, safe, save, sha, read, preserve = [G[x] for x in ['require', 'safe', 'save', 'sha', 'read', 'preserve']]
ART_CHECKS = ['identity', 'camera', 'anatomy', 'equipment', 'contact', 'physics', 'muscles', 'cueAgreement', 'sequenceAndLoop', 'mobileLight', 'mobileDark']
CONTROLS = ['pause', 'selectAllSix', 'nextSixToOne', 'previousOneToSix', 'slower']
FOLDER = '2026-10-15'

def frames_with_measurements(eid, draft, spec):
    metrics = read(draft / spec['measurements'])
    if eid == 'pull-ups':
        frames = metrics['frames']
        require(len(frames) == 6, 'Six actual measurement rows required')
        return [{'path': f'form-frames/{eid}/{i}.webp', 'sha256': sha(draft / f'final-frames/{i}.webp'), 'sourcePose': pose, 'anchors': frames[i-1]['anchors'], 'invariantDimensions': frames[i-1]['invariantDimensions']} for i, pose in enumerate(spec['sourcePoseOrder'], 1)]
    # Keep ALL measured Bike anchors, including the failed fixed bearing. Never
    # select only the favourable foot feature or hide drift with phase groups.
    require(len(metrics['fixedAnchors']) == 3 and any('Spindle' in a['name'] for a in metrics['fixedAnchors']), 'Actual spindle finding must remain in record')
    return [{'path': f'form-frames/{eid}/{i}.webp', 'sha256': sha(draft / f'final-frames/{i}.webp'), 'sourcePose': pose,
             'anchors': {a['name']: dict(zip(['x', 'y'], a['framedPoints'][pose-1])) for a in metrics['fixedAnchors']},
             'invariantDimensions': {d['name']: d['valuesPx'][pose-1] for d in metrics['projectedDimensions']}}
            for i, pose in enumerate(spec['sourcePoseOrder'], 1)]

def strict_failures(frames, size):
    errors = []
    anchors, dimensions = frames[0]['anchors'], frames[0]['invariantDimensions']
    require(len(anchors) >= 2 and len(dimensions) >= 2, 'At least two REAL measured anchors and dimensions required')
    for i, f in enumerate(frames, 1):
        for name, origin in anchors.items():
            for axis, bound in zip(['x', 'y'], size):
                value = f['anchors'][name][axis]
                require(isinstance(value, (int, float)) and math.isfinite(value) and 0 <= value < bound, 'Finite in-canvas actual anchor required')
                if abs(value - origin[axis]) > 1:
                    errors.append(f'Frame{i}: {name}.{axis} actual delta {value-origin[axis]}px exceeds1px')
        for name, origin in dimensions.items():
            value = f['invariantDimensions'][name]
            require(isinstance(value, (int, float)) and math.isfinite(value) and value > 0 and origin > 0, 'Actual positive finite dimensions required')
            if abs(value / origin - 1) > .01:
                errors.append(f'Frame{i}: {name} actual relative delta {value/origin-1} exceeds1%')
    return errors

def trace_check(path, eid, theme, size):
    data = read(path)
    events = data if isinstance(data, list) else data.get('trace', [])
    events = [e for e in events if e.get('exerciseId') == eid and e.get('theme') == theme and e.get('playing') is True]
    require(events, 'Actual registered playing trace required: ' + path.name)
    sequence = []
    for e in events:
        match = re.fullmatch(r'/form-frames/' + re.escape(eid) + r'/([1-6])\.webp', e.get('src', ''))
        require(match and [e.get('naturalWidth'), e.get('naturalHeight')] == size and e.get('viewport') == [390, 844] and e.get('documentHidden') is False, 'Actual public URL/dimensions/390x844/foreground trace required')
        n = int(match.group(1))
        if not sequence or sequence[-1] != n:
            sequence.append(n)
    require(set(sequence) == set(range(1, 7)), 'Every actual public frame must have played')
    require(any(a == 6 and b == 1 for a, b in zip(sequence, sequence[1:])), 'Actual sequential6-to-1 wrap required')

def copy_relative(source, destination, names):
    for name in sorted(names):
        p = safe(source, name)
        target = destination / (name + '.txt' if name.endswith('.tsx') else name)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+', choices=list(SPEC), required=True)
    parser.add_argument('--review', type=Path, required=True)
    args = parser.parse_args()
    preserve()
    ledger = read(R / 'local-stage-ledger.json')
    parent = read(args.review)
    require(parent.get('status') == 'parent-actual-integrated-accepted', 'Actual integrated parent acceptance required')
    require(args.review.resolve().is_relative_to(R.resolve()), 'Keep actual review evidence under batch draft')
    review_relative = args.review.resolve().relative_to(R.resolve()).as_posix()
    art_path = REPO / 'src/lib/formArtwork.ts'
    art = art_path.read_text(encoding='utf-8')
    plans = []
    for eid in args.ids:
        spec = SPEC[eid]
        draft = R.parent / spec['directory']
        require(eid in ledger['exercises'], 'Actual local staging must precede integrated review')
        require(sha(safe(R, ledger['exercises'][eid]['nativeCardAcceptanceExactSnapshot'])) == ledger['exercises'][eid]['nativeCardAcceptanceSha256'], 'Historical actual native/card acceptance snapshot changed')
        item = parent.get('exercises', {}).get(eid, {})
        require(item.get('reviewedAt') and item.get('decision') in ['approved', 'owner-released-with-findings'], 'Explicit actual parent decision/date required')
        for name in ART_CHECKS:
            c = item.get('checks', {}).get(name, {})
            require(c.get('passed') is True and isinstance(c.get('evidence'), str) and c['evidence'].strip(), 'Actual integrated core/visual evidence missing: ' + name)
        require(all(item.get('controls', {}).get(name) is True for name in CONTROLS), 'All actual controls required')
        require(item.get('consoleErrors') == 0, 'Actual console observation required')
        pins = item.get('reviewedEvidenceHashes', {})
        require(pins and all(sha(safe(R, p)) == h for p, h in pins.items()), 'Current raw integrated evidence changed')
        require(review_relative not in pins, 'No circular parent proof hash')
        for theme in ['light', 'dark']:
            name = item.get('traceFiles', {}).get(theme)
            require(name in pins, 'Actual theme trace must be hash-pinned')
            trace_check(safe(R, name), eid, theme, spec['size'])
        slower = item.get('traceFiles', {}).get('slower')
        require(slower in pins, 'Actual slower evidence must be hash-pinned')
        required_repo = [f'public/form-frames/{eid}/{n}.webp' for n in range(1, 7)] + [f'public/form-art/{eid}.webp', f'masters/{eid}/1.png', 'src/lib/releasedFormPlacards.ts', 'src/lib/formArtwork.ts', 'src/lib/formArtCutouts.data.ts']
        if spec['preparedCardSource']:
            required_repo += [f'docs/exercise-art/cutout-sources/{eid}.png', f'docs/exercise-art/cutout-sources/{eid}.json']
        repo_pins = item.get('reviewedRepositoryHashes', {})
        require(all(p in repo_pins for p in required_repo) and all(sha(safe(REPO, p)) == h for p, h in repo_pins.items()), 'Exact actually viewed registered asset/code bindings required')
        for name, h in ledger['exercises'][eid]['acceptedDraftHashes'].items():
            require(sha(safe(draft, name)) == h, 'Native/card accepted draft bytes changed')
        require(sha(REPO / f'public/form-art/{eid}.webp') == ledger['exercises'][eid]['expectedGeneratedCardSha256'], 'Unchanged standard generator must reproduce actually accepted card')
        for n in range(1, 7):
            require(sha(REPO / f'public/form-frames/{eid}/{n}.webp') == sha(draft / f'final-frames/{n}.webp'), 'Actual public frame changed')
        frames = frames_with_measurements(eid, draft, spec)
        failures = strict_failures(frames, spec['size'])
        if item['decision'] == 'approved':
            require(not failures, 'Strict release cannot claim these actual failed measurements: ' + '; '.join(failures))
        else:
            require(failures and item.get('findings') and all(isinstance(v, str) and v.strip() for v in item['findings']), 'Owner findings must retain actual strict failures')
            require(all(item.get('approval', {}).get(k) for k in ['actor', 'instruction', 'context']), 'Actual owner relaxation/authorization context required')
            require(item.get('minorHardwareFindingAccepted') is True, 'Parent must explicitly find measured hardware deviation minor after actual playback; otherwise hold')
        target = REPO / f'docs/exercise-art/releases/{FOLDER}/{eid}.json'
        archive = REPO / f'docs/exercise-art/sources/{eid}/{FOLDER}'
        require(not target.exists() and not archive.exists(), 'Do not overwrite release history')
        provisional = f'  "{eid}": existing("{eid}", {spec["size"][0]}, {spec["size"][1]}),'
        require(provisional in art, 'Expected explicit provisional entry missing; inspect formatting before proceeding')
        if item['decision'] == 'approved':
            art = art.replace(provisional + '\n', '', 1)
        else:
            replacement = f'  "{eid}": {{ ...existing("{eid}", {spec["size"][0]}, {spec["size"][1]}), version: "anatomy-v3-{FOLDER}-retained-two-endpoint-v1", status: "owner-released-with-findings", reviewFile: "docs/exercise-art/releases/{FOLDER}/{eid}.json" }},'
            art = art.replace(provisional, replacement, 1)
        beats = read(draft / 'draft-beats.json')
        cues = json.dumps([{'label': b['label'], 'cue': b['cue']} for b in beats], separators=(',', ':'), ensure_ascii=False)
        record = {'exerciseId': eid, 'version': f'anatomy-v3-{FOLDER}-retained-two-endpoint-v1', 'width': spec['size'][0], 'height': spec['size'][1], 'decision': item['decision'], 'reviewer': 'Actual parent native/card and integrated component review, with independent static evidence', 'reviewedAt': item['reviewedAt'], 'reference': {'path': frames[0]['path'], 'sha256': frames[0]['sha256']}, 'cueSha256': hashlib.sha256(cues.encode()).hexdigest(), 'checks': item['checks'] if item['decision'] == 'approved' else {k: {'passed': None, 'evidence': 'Owner-with-findings is not strict certification. Actual separate observed QA: ' + item['checks'][k]['evidence']} for k in ART_CHECKS}, 'frames': frames, 'physicalPoses': 2, 'sourcePoseOrder': spec['sourcePoseOrder'], 'authoredSetupInstructions': spec['setup'], 'scope': spec['scope'], 'newImageRequests': 0, 'strictMeasurementFailures': failures, 'observedQaChecks': item['checks'], 'integrationValidation': 'Actual provisional existing-needs-review registry/public/card/placard paths were viewed through unchanged ExerciseFormContent at390x844 in both themes, including all six paths,6-to-1 and controls. Final release registry generation, formatting, normal branch/project checks, source seal, current-head required CI and actual merge remain separate and pending. No completion claim.'}
        if item['decision'] != 'approved':
            record.update(approval=item['approval'], findings=item['findings'])
        archive_plan = read(draft / spec['minimalArchivePlan'])
        names = set(ledger['exercises'][eid]['acceptedDraftHashes']) | {spec['minimalArchivePlan']}
        for key in ['sourceOriginals', 'editable', 'artwork', 'metadata', 'reproduction', 'sourceEditables', 'deliveredFrames', 'code']:
            names.update(archive_plan.get(key, []))
        for key in ['reference', 'preparedCardSource', 'card']:
            if isinstance(archive_plan.get(key), str):
                names.add(archive_plan[key])
        # Exact source/evidence files must exist before any repository write.
        for name in names:
            safe(draft, name)
        batch_names = set(pins) | {review_relative, ledger['exercises'][eid]['nativeCardAcceptanceExactSnapshot'], 'candidate-specs.json', 'preservation-baseline.json', 'local-stage-ledger.json', 'prepare-local-registration.py', 'finalize-reviewed-registration.py', 'integrated-review.html', 'integrated-review.tsx', 'integrated-vite.config.mjs'}
        for name in batch_names:
            safe(R, name)
        plans.append((eid, spec, draft, item, record, archive, target, names, repo_pins, pins, batch_names))
    # All source/preservation/actual QA/numeric decisions precede first write.
    for eid, spec, draft, item, record, archive, target, names, repo_pins, pins, batch_names in plans:
        archive.mkdir(parents=True)
        (archive / '.gitattributes').write_bytes(b'# Preserve archived evidence bytes.\n* -text\n')
        with zipfile.ZipFile(archive / 'review-inputs-exact.zip', 'w', zipfile.ZIP_DEFLATED) as z:
            for name in sorted(names):
                z.writestr('draft/' + name, (draft / name).read_bytes())
            for name in sorted(batch_names):
                z.writestr('batch/' + name, (R / name).read_bytes())
            for name in sorted(repo_pins):
                z.writestr('repo/' + name, (REPO / name).read_bytes())
        copy_relative(draft, archive / 'draft', names)
        copy_relative(R, archive / 'batch', batch_names)
        for n, pose in enumerate(spec['sourcePoseOrder']):
            name = spec['posePngs'][pose-1]
            record['frames'][n]['source'] = {'path': (archive / 'draft' / name).relative_to(REPO).as_posix(), 'sha256': sha(draft / name)}
        (archive / 'README.md').write_text('Retained two-endpoint guide source archive\n\n' + spec['scope'] + '\n\nOriginal source pixels/prompts/provenance, editable ORAs, six actual paths and reviewed native/card/integrated proof bytes are retained. review-inputs-exact.zip preserves the actual pre-final-registry QA byte bindings; readable copied text may receive normal formatting before source sealing. Archived React fixtures end in.tsx.txt and are evidence, not application modules. No newly generated pose, motion interpolation, anatomy fitting or clothing substitute is implied.\n\nThis archive alone supplies no project-check, CI, merge or completion pass. Final registry/card generators, project evidence and source sealing remain explicit separate steps.\n', encoding='utf-8')
        save(archive / 'provenance.json', {'exerciseId': eid, 'canonicalSha256': G['CANONICAL'], 'physicalPoses': 2, 'sourcePoseOrder': spec['sourcePoseOrder'], 'newImageRequests': 0, 'sourceProvenance': 'draft/' + spec['sourceProvenance'], 'acceptedReviewBytesArchive': 'review-inputs-exact.zip', 'sourceHashes': {}, 'archiveStatus': 'Actual reviewed source/evidence copied; normal formatting/project evidence and final source seal pending.'})
        save(target, record)
    art_path.write_text(art, encoding='utf-8')
    preserve()
    print(json.dumps({'reviewDecisionsRecorded': {eid: item['decision'] for eid, spec, draft, item, record, archive, target, names, repo_pins, pins, batch_names in plans}, 'completionCredit': False, 'next': 'Run normal art:releases/art:cutouts/formatting and required branch checks; preserve previous910/FA56; add actual project evidence and seal before commit/current-head CI/merge.'}))

if __name__ == '__main__':
    main()
