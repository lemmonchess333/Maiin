"""Read-only integrity verification of this one-pose draft, not visual acceptance."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys

sys.dont_write_bytecode = True

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
DRAFT = HERE / 'draft'

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def rgba(path):
    return Image.open(path).convert('RGBA')

manifest = json.loads((HERE / 'draft-file-hashes.json').read_text(encoding='utf-8'))
plan = json.loads((HERE / 'sequence-plan.json').read_text(encoding='utf-8'))
provenance = json.loads((HERE / 'source-provenance.json').read_text(encoding='utf-8'))
assert sha(HERE / 'sequence-plan.json') == manifest['sequencePlanSha256']
for name, expected in manifest['files'].items():
    path = HERE / name
    assert path.is_file() and path.resolve().is_relative_to(DRAFT.resolve())
    assert sha(path) == expected, name
for name, expected in provenance['recipeHashes'].items():
    assert sha(HERE / name) == expected
for name, record in provenance['originalRecords'].items():
    assert sha(HERE / name) == record['sha256']

spec = importlib.util.spec_from_file_location('side_plank_reproduction', HERE / 'reproduce.py')
recipe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recipe)
original_path = DRAFT / 'originals/raised-contact-drift.png'
assert sha(original_path) == recipe.EXPECTED_SOURCE
original = rgba(original_path)
native = rgba(DRAFT / '1-native-finished.png')
framed = rgba(DRAFT / '1-framed.png')
native_reopened, native_layers = recipe.reopen(DRAFT / '1-native.ora')
framed_reopened, framed_layers = recipe.reopen(DRAFT / '1-framed.ora')
assert native.size == original.size == (1536, 1024)
assert framed.size == tuple(plan['dimensions']) == (1480, 696)
assert native.tobytes() == native_reopened.tobytes()
assert framed.tobytes() == framed_reopened.tobytes() == native.crop(recipe.CROP).tobytes()
assert len(native_layers) == len(framed_layers) == 3
assert native_layers[-1][1].tobytes() == original.tobytes()
for (native_name, native_layer), (framed_name, framed_layer) in zip(native_layers, framed_layers):
    assert native_name == framed_name
    assert native_layer.crop(recipe.CROP).tobytes() == framed_layer.tobytes()
a, b = np.array(original), np.array(native)
_, field, _, _, components = recipe.source_fields(a[:, :, :3])
assert np.array_equal(a[~field], b[~field])
assert np.array_equal(a[:, :, 3], b[:, :, 3])
assert np.array_equal(a[613:], b[613:])
assert np.array_equal(a[:, 650:], b[:, 650:])
mask = np.array(Image.open(DRAFT / 'masks/source-existing-colour-support.png').convert('L')) > 0
assert np.array_equal(mask, field)
for _, layer in native_layers[:-1]:
    assert not np.any((np.array(layer)[:, :, 3] > 0) & ~field)
assert plan['physicalPoses'] == 1 and plan['sourcePoseOrder'] == [1] * 6
assert [beat['t'] for beat in plan['beats']] == [1] * 6
assert len({beat['label'] for beat in plan['beats']}) == 6
assert all(len(beat['cue'].split()) <= 7 for beat in plan['beats'])
frame_hashes = []
for index in range(1, 7):
    path = DRAFT / 'frames' / f'{index}.webp'
    assert sha(path) == plan['frameHashes'][f'draft/frames/{index}.webp']
    assert Image.open(path).convert('RGB').tobytes() == framed.convert('RGB').tobytes()
    frame_hashes.append(sha(path))
assert len(set(frame_hashes)) == 1
assert Image.open(DRAFT / 'reference.png').convert('RGB').tobytes() == framed.convert('RGB').tobytes()
print(json.dumps({'scope': 'read-only draft integrity; not semantic/native/mobile/release approval', 'pinnedDraftFilesVerified': len(manifest['files']), 'originalEvidenceFilesVerified': len(provenance['originalRecords']), 'physicalPoses': 1, 'decodedSize': list(framed.size), 'oraFilesReopenedExact': 2, 'losslessFrameFilesVerified': 6, 'allOutsideExistingSourceColourRgbaExact': True, 'allContactTrainerPixelsExact': True, 'nativeAndCommonCropLayersExact': True, 'frameSha256': frame_hashes[0], 'newImageRequests': 0, 'filesWrittenByVerifier': 0, 'releaseApproved': False}))
