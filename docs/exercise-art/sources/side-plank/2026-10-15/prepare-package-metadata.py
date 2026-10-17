"""Bind completed outside-only Side Plank draft, never register or accept it."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REPO = ROOT / 'work/Maiin-burpees'
DRAFT = HERE / 'draft'

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def write(name, data):
    (HERE / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

proof = json.loads((DRAFT / 'pixel-and-editable-proof.json').read_text(encoding='utf-8'))
assert proof['sourceSha256'] == '89d0866e0f165831b539839a8c0d7e45b9dc8a77533d916cc4d23a38465d1bc3'
assert proof['physicalPoses'] == 1
source_dir = REPO / 'docs/exercise-art/pilots/continuation-20261002/side-plank'
copies = {
    source_dir / 'raised-contact-drift.png': 'raised-contact-drift.png',
    source_dir / 'provenance.json': 'historical-side-plank-provenance.json',
    source_dir / 'plan.json': 'historical-side-plank-plan.json',
    source_dir / 'registration.json': 'historical-side-plank-registration.json',
    source_dir.parent / 'GENERATION.md': 'historical-generation.md',
}
originals = DRAFT / 'originals'
originals.mkdir(exist_ok=True)
original_map = {}
for path, name in copies.items():
    output = originals / name
    assert not output.exists()
    shutil.copyfile(path, output)
    assert sha(path) == sha(output)
    original_map[f'draft/originals/{name}'] = {'originalPath': str(path), 'sha256': sha(output)}

beats = [
    {'t': 1, 'label': 'Support', 'cue': 'Keep your elbow beneath your shoulder.'},
    {'t': 1, 'label': 'Stack', 'cue': 'Keep your feet stacked and steady.'},
    {'t': 1, 'label': 'Align', 'cue': 'Keep head, hips and feet aligned.'},
    {'t': 1, 'label': 'Brace', 'cue': 'Keep your hips raised and core braced.'},
    {'t': 1, 'label': 'Breathe', 'cue': 'Breathe normally without dropping your hips.'},
    {'t': 1, 'label': 'Time', 'cue': 'Hold for time; then repeat opposite side.'},
]
assert len({b['label'] for b in beats}) == 6
assert all(len(b['cue'].split()) <= 7 for b in beats)
catalogue_instructions = [
    'Lie on your side with your forearm on the floor, elbow under your shoulder.',
    'Stack your feet (or stagger for easier) and brace your core.',
    'Lift your hips off the floor into a straight line from head to feet.',
    'Hold for time, breathing normally, then switch sides.',
]
plan = {
    'exerciseId': 'side-plank', 'name': 'Side Plank',
    'sourceScope': 'Candidate: one intact retained raised forearm side-plank hold, six separate paths with honest repeated form-focus beats. No illustrated rise/lower/switch or six physical states claimed. No new image requests or human geometry edits.',
    'primary': ['Obliques'], 'secondary': ['Core', 'Shoulders'],
    'physicalPoses': 1, 'sourcePoseOrder': [1] * 6,
    'commonCrop': proof['commonCrop'], 'dimensions': proof['dimensions'],
    'setup': catalogue_instructions[:3],
    'catalogueInstructionsUnchanged': catalogue_instructions,
    'afterHold': catalogue_instructions[3],
    'beats': beats, 'frameHashes': proof['frameHashes'],
    'referenceFrame': 1,
    'findingsPendingReview': [
        'One physical isometric hold. Setup and switching sides remain written instructions, with no fabricated transition imagery.',
        'Recognizable canonical white-grey anatomy/no shorts/featureless pelvis. Trainer straps and shading differ in detail from the global canonical image; no strict identity equivalence claimed.',
        'Raw lower/side obliques were primary; rectus and delts were pale. Source-derived role maps need actual native semantic palette review.',
        'Old -4px forearm/-12px shoe mismatch against a separate low pose remains historical; no pair movement is used in this static guide.',
    ],
    'releaseApproved': False, 'completionCredit': False,
}
write('sequence-plan.json', plan)
write('palette-recipe.json', {
    'status': 'one-outside-only-colour-pass-awaiting-native-review',
    'sourceSha256': proof['sourceSha256'], 'canonicalReferenceSha256': proof['canonicalReferenceSha256'],
    'palette': {'primaryObliques': '#7B72E9', 'secondaryCoreShoulders': '#9590E0'},
    'sourceColourSupport': 'Three existing 8-connected B-min(R,G)>3 source components of at least32 pixels. No expansion, inferred muscle region or neutral anatomy painting.',
    'sourceComponents': proof['sourceChromaComponents'],
    'roleMap': {'sourceAbdomenOwnershipBoxExclusive': [270,335,650,620], 'primaryWeight': 'clip(((B-min(R,G))/max(B,1)-0.22)/0.18,0,1) within existing abdominal colour only; elsewhere secondary', 'meaning': 'Reads the original source saturated oblique fields versus pale rectus/delt fields, retaining continuous original boundary coverage; no new anatomical boundary is drawn.'},
    'colourAlpha': 'Continuous clip((source blue excess-3)/18,0,1) within original source purple components, EXCEPT the existing faint upper-delt component in native[350,215,500,325], whose alpha is source(maxRGB-minRGB)/80, matching canonical secondary chroma224-144=80. This preserves the original faint wash strength without amplifying source integer chroma grain. Stronger muscle core alpha and independent source detail layer are unchanged. The5x5 interior mask is diagnostic only.',
    'valueAnchors': {'primary': 218, 'secondary': 244},
    'shadingAndContours': 'Original per-pixel max-channel brightness divided by the fixed role source-value anchor, clamped0..1. The independent black-alpha detail layer retains that in-place source brightness/contour structure on opaque fields; source-colour antialias rims carry the same inherited value in the palette layer. No spatial gradient, blur, new contour stroke or lighting effect is generated.',
    'layersTopToBottom': ['Inherited source brightness and fine contours — unchanged coordinates', 'Exact role palette — existing purple fields only', 'Intact generated original — no geometry edits'],
    'proof': 'draft/pixel-and-editable-proof.json', 'portableReproduction': 'reproduce.py --source draft/originals/raised-contact-drift.png --out NEW_OUTPUT_DIRECTORY',
    'notAcceptance': 'Source-chroma preservation is not semantic muscle or visual quality approval.',
    'firstPassHistory': 'diagnostic-first-hard-interior-coverage preserves the first output/recipe that made very faint upper-shoulder tint opaque. diagnostic-second-amplified-weak-chroma preserves the intermediate continuous alpha that still amplified source chroma grain by dividing by18. Parent identified the actual arithmetic issue and instructed completing that same bounded correction with sourcechroma/80 in the original upper-delt component only; all other finished pixels and independent detail layer remain exact. No body/contact edit or generation.',
})
write('source-provenance.json', {
    'recordedAtUtc': datetime.now(timezone.utc).isoformat(), 'exerciseId': 'side-plank',
    'status': 'outside-only-static-hold-draft-unregistered',
    'originalRecords': original_map,
    'originalGeneration': {'tool': 'image_gen.imagegen', 'date': '2026-10-02', 'exactRequestId': None, 'exactPrompt': None, 'promptSummary': 'draft/originals/historical-generation.md', 'originalPromptSummaryIsNotVerbatim': True, 'references': ['FA56 canonical', 'corrected low setup master'], 'serviceRefusalRecordedForThisSource': False, 'laterLowPoseRefusalIsSeparateRequest': True},
    'originalIntegrity': 'Adjacent original generation record explicitly states no repainting, cropping, resizing or compositing after generation. Original PNG and metadata copies are byte-exact.',
    'sourceIdentityFindings': plan['findingsPendingReview'][1],
    'conversion': {'physicalPoses': 1, 'sourcePoseOrder': [1]*6, 'nativeSize': proof['nativeDimensions'], 'commonCrop': proof['commonCrop'], 'framedSize': proof['dimensions'], 'integerTranslations': [0,0], 'scaling': False, 'rotation': False, 'anatomicalWarping': False, 'grafts': False, 'humanContactEdits': False, 'colourOnlyWithinExistingSourceFields': True},
    'canonicalReferenceSha256': proof['canonicalReferenceSha256'],
    'proofs': {'pixelAndEditable': {'path': 'draft/pixel-and-editable-proof.json', 'sha256': sha(DRAFT/'pixel-and-editable-proof.json')}, 'scopeAudit': {'path': str(ROOT/'work/remaining17-requirements-audit-20261015/side-plank-swimming-review.json'), 'sha256': sha(ROOT/'work/remaining17-requirements-audit-20261015/side-plank-swimming-review.json')}},
    'recipeHashes': {name: sha(HERE/name) for name in ['reproduce.py','palette-recipe.json','sequence-plan.json']},
    'newImageRequests': 0, 'sourceServiceRetries': 0, 'publicEdits': False, 'registration': False, 'releaseApproved': False, 'completionCredit': False,
})
write('draft-file-hashes.json', {'status': 'draft-integrity-bindings-not-acceptance', 'files': {p.relative_to(HERE).as_posix(): sha(p) for p in sorted(DRAFT.rglob('*')) if p.is_file()}, 'sequencePlanSha256': sha(HERE/'sequence-plan.json')})
assert subprocess.check_output(['git','-C',str(REPO),'status','--porcelain']).decode('utf-8').strip() == ''
print(json.dumps({'status': 'one-physical-hold-package-ready-for-native-review', 'root': str(HERE), 'dimensions': plan['dimensions'], 'frameHashes': proof['frameHashes'], 'planSha256': sha(HERE/'sequence-plan.json')}))
