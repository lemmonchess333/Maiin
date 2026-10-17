"""Rebuild the two retained poses without resizing, warping or grafting.

Requires Pillow. Writes only to the explicitly supplied output directory.
The original top's historical whole-output normalization is retained in originals/;
this recipe starts with that formatted source and adds no further scaling.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

from PIL import Image, ImageChops

HERE = Path(__file__).resolve().parent
CROP = (277, 254, 738, 1801)
SIZE = (1024, 1856)
ORDER = (1, 1, 4, 4, 1, 1)


def exact(actual, expected):
    assert actual.size == expected.size
    assert ImageChops.difference(actual.convert('RGBA'), expected.convert('RGBA')).getextrema() == ((0, 0),) * 4


def reopen(path):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        root = ET.fromstring(z.read('stack.xml'))
        size = (int(root.get('w')), int(root.get('h')))
        layers = []
        for item in root.find('stack'):
            assert item.tag == 'layer'
            assert item.get('visibility', 'visible') == 'visible'
            assert float(item.get('opacity', '1')) == 1
            assert item.get('composite-op', 'svg:src-over') == 'svg:src-over'
            layer = Image.new('RGBA', size)
            layer.alpha_composite(Image.open(io.BytesIO(z.read(item.get('src')))).convert('RGBA'), dest=(int(item.get('x', 0)), int(item.get('y', 0))))
            layers.append(layer)
        merged = Image.new('RGBA', size)
        for layer in reversed(layers):
            merged = Image.alpha_composite(merged, layer)
        exact(merged, Image.open(io.BytesIO(z.read('mergedimage.png'))))
        return merged, len(layers)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    assert args.output.resolve() != HERE
    args.output.mkdir(parents=True, exist_ok=True)
    provenance = HERE / 'provenance.json'
    if provenance.exists():
        for relative, digest in json.loads(provenance.read_text())['sourceHashes'].items():
            assert hashlib.sha256((HERE / relative).read_bytes()).hexdigest() == digest, relative
    source = Image.open(HERE / 'originals/1-standing-top-format-v1.png').convert('RGB')
    assert source.size == SIZE
    placed = Image.new('RGB', SIZE, 'black')
    placed.paste(source, (-13, 37))
    exact(placed, Image.open(HERE / 'layers/top-whole-frame-placement.png'))
    top = Image.alpha_composite(placed.convert('RGBA'), Image.open(HERE / 'layers/top-colour-layer.png').convert('RGBA'))
    exact(top, Image.open(HERE / 'layers/top-candidate-colours.png'))
    bottom, bottom_layers = reopen(HERE / 'originals/standing-master-authoring-v1.ora')
    assert bottom.size == SIZE and bottom_layers == 8
    exact(bottom, Image.open(HERE / 'originals/4-standing-master-v1.png'))
    poses = {1: top, 4: bottom}
    ora_records = {}
    for pose, whole in poses.items():
        framed = whole.crop(CROP)
        exact(framed, Image.open(HERE / f'draft/{pose}-framed.png'))
        framed.save(args.output / f'{pose}-framed.png')
        whole.save(args.output / f'{pose}-full.png')
        for kind, expected in [('full', whole), ('framed', framed)]:
            actual, count = reopen(HERE / f'draft/{pose}-{kind}.ora')
            exact(actual, expected)
            ora_records[f'{pose}-{kind}.ora'] = {'layers': count, 'pixelExact': True}
    for number, pose in enumerate(ORDER, 1):
        expected = poses[pose].crop(CROP).convert('RGB')
        path = args.output / f'{number}.webp'
        expected.save(path, format='WEBP', lossless=True, quality=100, method=6)
        exact(Image.open(path), Image.open(HERE / f'draft/frames/{number}.webp'))
    report = {'dimensions': [461, 1547], 'sourcePoseOrder': list(ORDER), 'wholeFrameTranslation': [-13, 37], 'addedResizing': False, 'anatomicalWarpOrGraft': False, 'sixFramesReproducedPixelExactly': True, 'fourEditableOrasReopenedExactly': ora_records, 'card': 'Normal repository cutout export from reference frame3; see authoring/card-preview-proof.json.txt and review/registered-card-match.json.txt. This recipe does not replace that exporter.'}
    (args.output / 'reproduction.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
