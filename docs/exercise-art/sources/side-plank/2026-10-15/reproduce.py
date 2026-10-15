"""Reproduce one retained static Side Plank using source colour fields only.

Portable: python reproduce.py --source originals/raised-contact-drift.png --out NEW_DIR
No image generation, pose construction, human segmentation/retargeting or body edit.
The only geometry operation is the same empty-margin crop on every complete layer.
"""
from pathlib import Path
import argparse
from collections import deque
import hashlib
import io
import json
import shutil
import zipfile
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageFilter

EXPECTED_SOURCE = '89d0866e0f165831b539839a8c0d7e45b9dc8a77533d916cc4d23a38465d1bc3'
CANONICAL_SHA = 'fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b'
PRIMARY = np.array((123, 114, 233), dtype=float)
SECONDARY = np.array((149, 144, 224), dtype=float)
CROP = (32, 168, 1512, 864)
VALUE_ANCHORS = {'primary': 218.0, 'secondary': 244.0}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def png_bytes(image):
    stream = io.BytesIO()
    image.save(stream, format='PNG')
    return stream.getvalue()


def compose(layers, size):
    merged = Image.new('RGBA', size)
    for name, layer in reversed(layers):
        merged = Image.alpha_composite(merged, layer)
    return merged


def reopen(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        tree = ET.fromstring(archive.read('stack.xml'))
        size = (int(tree.get('w')), int(tree.get('h')))
        layers = []
        for entry in tree.find('stack'):
            assert entry.tag == 'layer'
            assert entry.get('x') == entry.get('y') == '0'
            assert entry.get('opacity') == '1'
            assert entry.get('visibility') == 'visible'
            assert entry.get('composite-op') == 'svg:src-over'
            image = Image.open(io.BytesIO(archive.read(entry.get('src')))).convert('RGBA')
            assert image.size == size
            layers.append((entry.get('name'), image))
        actual = compose(layers, size)
        saved = Image.open(io.BytesIO(archive.read('mergedimage.png'))).convert('RGBA')
        assert actual.tobytes() == saved.tobytes()
        return actual, layers


def save_ora(path, layers, size):
    tree = ET.Element('image', {'w': str(size[0]), 'h': str(size[1]), 'name': 'Retained static Side Plank — one physical hold'})
    stack = ET.SubElement(tree, 'stack')
    merged = compose(layers, size)
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr('mimetype', 'image/openraster', compress_type=zipfile.ZIP_STORED)
        for index, (name, image) in enumerate(layers):
            member = f'data/layer-{index}.png'
            ET.SubElement(stack, 'layer', {'name': name, 'src': member, 'x': '0', 'y': '0', 'opacity': '1', 'visibility': 'visible', 'composite-op': 'svg:src-over'})
            archive.writestr(member, png_bytes(image))
        archive.writestr('stack.xml', ET.tostring(tree, encoding='utf-8', xml_declaration=True))
        archive.writestr('mergedimage.png', png_bytes(merged))
        thumbnail = merged.copy()
        thumbnail.thumbnail((256, 256))
        archive.writestr('Thumbnails/thumbnail.png', png_bytes(thumbnail))
    reopened, reopened_layers = reopen(path)
    assert reopened.tobytes() == merged.tobytes()
    assert len(reopened_layers) == len(layers) == 3
    return merged


def source_fields(rgb):
    """Find original purple components, never expand/draw a human boundary."""
    a = rgb.astype(float)
    excess = a[:, :, 2] - np.minimum(a[:, :, 0], a[:, :, 1])
    weak = excess > 3
    seen = np.zeros(weak.shape, dtype=bool)
    retained = np.zeros_like(weak)
    records = []
    height, width = weak.shape
    for start_y, start_x in zip(*np.where(weak)):
        if seen[start_y, start_x]:
            continue
        queue = deque([(int(start_y), int(start_x))])
        seen[start_y, start_x] = True
        points = []
        while queue:
            y, x = queue.popleft()
            points.append((y, x))
            for yy in range(max(0, y - 1), min(height, y + 2)):
                for xx in range(max(0, x - 1), min(width, x + 2)):
                    if weak[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        queue.append((yy, xx))
        if len(points) < 32:
            continue
        yy, xx = np.array(points).T
        retained[yy, xx] = True
        records.append({'pixels': len(points), 'boundsInclusive': [int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max())]})
    assert len(records) == 3
    # Source coverage stays continuous through faint tint and its antialias rim.
    # Never promote a faint/fragmented white shoulder wash into an opaque field.
    coverage = np.clip((excess - 3) / 18, 0, 1) * retained
    yy, xx = np.indices(retained.shape)
    weak_upper_delt = retained & (xx >= 350) & (xx < 500) & (yy >= 215) & (yy < 325)
    # This original faint field must retain its source wash strength. The
    # canonical secondary chroma is224-144=80; dividing by18 amplifies the
    # source's integer chroma noise. This component-only correction leaves all
    # stronger muscle cores and the independent inherited detail layer intact.
    source_chroma = a.max(axis=2) - a.min(axis=2)
    coverage[weak_upper_delt] = np.clip(source_chroma[weak_upper_delt] / 80, 0, 1)
    assert int(weak_upper_delt.sum()) == 6996
    interior = np.asarray(Image.fromarray(np.uint8(retained) * 255).filter(ImageFilter.MinFilter(5))) == 255
    return excess, retained, coverage, interior, records


def build(source_path, output):
    assert sha(source_path) == EXPECTED_SOURCE
    original = Image.open(source_path).convert('RGBA')
    assert original.size == (1536, 1024)
    a = np.array(original)
    excess, field, coverage, interior, components = source_fields(a[:, :, :3])
    yy, xx = np.indices(field.shape)
    abdomen_ownership = (xx >= 270) & (xx < 650) & (yy >= 335) & (yy < 620)
    # The source already separates saturated lateral/lower obliques from pale
    # rectus fields. This continuous source-chroma ratio reads that distinction;
    # it draws no boundary into a white area and adds no anatomical compartment.
    source_saturation = excess / np.maximum(a[:, :, 2].astype(float), 1)
    role_primary = np.clip((source_saturation - 0.22) / 0.18, 0, 1) * abdomen_ownership * field
    palette = PRIMARY[None, None, :] * role_primary[:, :, None] + SECONDARY[None, None, :] * (1 - role_primary[:, :, None])
    anchors = VALUE_ANCHORS['primary'] * role_primary + VALUE_ANCHORS['secondary'] * (1 - role_primary)
    inherited_value = np.clip(a[:, :, :3].max(axis=2).astype(float) / anchors, 0, 1)
    support_alpha = np.rint(coverage * 255).astype(np.uint8)
    opaque = support_alpha == 255

    palette_rgba = np.zeros_like(a)
    # Full-opacity fields receive literal role palette. At the inherited tint
    # rim, the same source-derived value is included before alpha blending.
    target = palette.copy()
    target[~opaque] *= inherited_value[~opaque, None]
    palette_rgba[:, :, :3] = np.rint(target).astype(np.uint8)
    palette_rgba[:, :, 3] = support_alpha
    palette_rgba[support_alpha == 0, :3] = 0
    palette_layer = Image.fromarray(palette_rgba)

    # Independent black-alpha layer carries only the source's in-place local
    # brightness/contours in opaque fields. No blur/high-pass/new gradient/line.
    detail_rgba = np.zeros_like(a)
    detail_rgba[:, :, 3][opaque] = np.rint((1 - inherited_value[opaque]) * 255).astype(np.uint8)
    detail_layer = Image.fromarray(detail_rgba)
    layers = [('Inherited source brightness and fine contours — unchanged coordinates', detail_layer), ('Exact role palette — existing purple fields only', palette_layer), ('Intact generated original — no geometry edits', original)]
    finished = save_ora(output / '1-native.ora', layers, original.size)
    b = np.array(finished)
    changed = np.any(a != b, axis=2)
    assert np.array_equal(a[~field], b[~field])
    assert np.array_equal(a[:, :, 3], b[:, :, 3])
    assert not np.any(changed & ~field)
    assert not np.any(changed[:, :120])
    assert not np.any(changed[:, 650:])
    assert not np.any(changed[613:])
    finished.save(output / '1-native-finished.png')
    palette_layer.save(output / '1-palette-layer.png')
    detail_layer.save(output / '1-inherited-contours-and-shading-layer.png')
    masks = output / 'masks'
    masks.mkdir()
    for name, mask in {
        'source-existing-colour-support': field.astype(float),
        'source-colour-alpha': coverage,
        'primary-role-within-existing-fields': coverage * role_primary,
        'secondary-role-within-existing-fields': coverage * (1 - role_primary),
        'actual-changed-pixels': changed.astype(float),
        'opaque-source-field-interior': interior.astype(float),
    }.items():
        Image.fromarray(np.rint(mask * 255).astype(np.uint8)).save(masks / f'{name}.png')
    outside_crop = np.ones(field.shape, dtype=bool)
    outside_crop[CROP[1]:CROP[3], CROP[0]:CROP[2]] = False
    outside_max = int(a[:, :, :3].max(axis=2)[outside_crop].max())
    assert outside_max <= 14
    framed_layers = [(name, layer.crop(CROP)) for name, layer in layers]
    framed = save_ora(output / '1-framed.ora', framed_layers, (CROP[2] - CROP[0], CROP[3] - CROP[1]))
    assert framed.tobytes() == finished.crop(CROP).tobytes()
    framed.save(output / '1-framed.png')
    framed.convert('RGB').save(output / 'reference.png')
    frames = output / 'frames'
    frames.mkdir()
    frame1 = frames / '1.webp'
    framed.convert('RGB').save(frame1, format='WEBP', lossless=True, quality=100, method=6)
    for index in range(2, 7):
        shutil.copyfile(frame1, frames / f'{index}.webp')
    frame_hashes = {}
    for index in range(1, 7):
        path = frames / f'{index}.webp'
        assert Image.open(path).convert('RGB').tobytes() == framed.convert('RGB').tobytes()
        frame_hashes[f'draft/frames/{index}.webp'] = sha(path)
    assert sha(source_path) == EXPECTED_SOURCE
    records = {
        'scope': 'Completed bounded source-strength alpha correction; pixel/editable/export integrity only, no visual QA, strict model or release approval.',
        'sourceSha256': EXPECTED_SOURCE,
        'canonicalReferenceSha256': CANONICAL_SHA,
        'nativeDimensions': list(original.size),
        'commonCrop': list(CROP), 'dimensions': list(framed.size),
        'removedMarginsMaximumRgb': outside_max,
        'physicalPoses': 1, 'sourcePoseOrder': [1] * 6,
        'sourceChromaComponents': components,
        'existingSourceColourPixels': int(field.sum()),
        'actualChangedPixels': int(changed.sum()),
        'allOutsideOriginalColourSupportRgbaExact': True,
        'sourceAlphaExact': True,
        'allContactAndTrainerPixelsExact': True,
        'nativeCoordinatesUnchanged': True,
        'commonCropOnlyNoScaleOrRotation': True,
        'independentInheritedDetailLayer': True,
        'nativeAndFramedOraReopenedExact': True,
        'sixSeparateLosslessFramesDecodedExact': True,
        'sixFramesAreOneIdenticalPhysicalHold': True,
        'exactPrimaryOutputPixels': int(np.all(b[:, :, :3] == PRIMARY, axis=2).sum()),
        'exactSecondaryOutputPixels': int(np.all(b[:, :, :3] == SECONDARY, axis=2).sum()),
        'frameHashes': frame_hashes,
        'outputHashes': {p.relative_to(output).as_posix(): sha(p) for p in sorted(output.rglob('*')) if p.is_file()},
        'releaseApproved': False, 'completionCredit': False,
    }
    write_json(output / 'pixel-and-editable-proof.json', records)
    return records


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    destination = args.out.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    assert not (destination / 'pixel-and-editable-proof.json').exists(), 'Do not overwrite an existing proposal.'
    assert args.source.resolve() != destination / '1-native-finished.png'
    result = build(args.source.resolve(), destination)
    print(json.dumps({'status': 'one-static-hold-colour-draft-only', 'out': str(destination), 'dimensions': result['dimensions'], 'frameHashes': result['frameHashes'], 'changedPixels': result['actualChangedPixels']}))
