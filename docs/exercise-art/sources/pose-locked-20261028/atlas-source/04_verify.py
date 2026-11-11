"""Check atlas build completeness, dimensions and render-safe pixel ranges."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--out-dir', type=Path, required=True)
parser.add_argument('--asset-dir', type=Path, required=True)
parser.add_argument('--size', type=int, default=1024)
parser.add_argument('--reference-dir', type=Path)
args = parser.parse_args()
out = args.out_dir.resolve()
assets = args.asset_dir.resolve()
size = args.size

names = [
    f'anatomy-color-{size}.png',
    f'anatomy-normal-{size}.png',
    f'anatomy-clean-normal-{size}.png',
    f'anatomy-contour-{size}.png',
    f'anatomy-modesty-normal-{size}.png',
    f'front_squat-modesty-contour-color-{size}.png',
    f'front_squat-clean-normal-{size}.png',
    f'assault_bike-modesty-contour-color-{size}.png',
    f'elliptical-modesty-contour-color-{size}.png',
]
names += [f'{exercise}-raw-color-{size}.png' for exercise in ('front_squat','assault_bike','elliptical')]

def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

manifest = {'size': size, 'inputs': {}, 'outputs': {}, 'reference_pixel_mae': {}}
for name in ('human-base-rigged.glb','full-body-muscular-system.glb'):
    path = assets / name
    assert path.is_file(), f'Missing CC0 source: {path}'
    manifest['inputs'][name] = {'bytes': path.stat().st_size, 'sha256': sha256(path)}
for name in names:
    path = out / name
    assert path.is_file(), f'Missing atlas: {path}'
    image = Image.open(path)
    assert image.size == (size,size), (name, image.size)
    data = np.asarray(image.convert('RGB'), dtype=np.uint8)
    assert data.max() > 0, f'Blank atlas: {name}'
    manifest['outputs'][name] = {'bytes': path.stat().st_size, 'sha256': sha256(path)}
    if args.reference_dir:
        reference = args.reference_dir / name
        if reference.is_file():
            original = np.asarray(Image.open(reference).convert('RGB'), dtype=np.uint8)
            assert original.shape == data.shape
            manifest['reference_pixel_mae'][name] = float(np.mean(np.abs(original.astype(np.int16)-data.astype(np.int16))))

for name in ('front_squat','assault_bike','elliptical'):
    image = np.asarray(Image.open(out / f'{name}-modesty-contour-color-{size}.png').convert('RGB'),dtype=np.int16)
    purple = (image[:,:,2]-image[:,:,0] > 20)
    assert purple.mean() > .005, f'No visible violet highlight in {name}'
    assert purple.mean() < .20, f'Violet highlight unexpectedly covers most of {name}'

path = out / 'manifest.json'
with path.open('w') as f:
    json.dump(manifest, f, indent=2, sort_keys=True)
print('ATLAS_VERIFY_OK', len(names), 'images', 'size', size, 'manifest', path)
if args.reference_dir:
    print('REFERENCE_PIXEL_MAE', manifest['reference_pixel_mae'])
