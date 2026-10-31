"""Blender: export body-geometry regions as UV polygons for atlas cleanup.

Usage: blender -b -t 2 --python 02_uv_regions.py -- ASSET_DIR OUT_DIR
"""

import bpy
import json
import sys
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:]
asset_dir = Path(args[0]).resolve()
out_dir = Path(args[1]).resolve()
out_dir.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(asset_dir / 'human-base-rigged.glb'))
body = bpy.data.objects['Avery | anatomical body']
uv = body.data.uv_layers.active.data
regions = {'pelvis': [], 'front_chest': [], 'front_axilla': []}
for face in body.data.polygons:
    c = face.center
    polygon = [[float(uv[i].uv.x), float(uv[i].uv.y)] for i in face.loop_indices]
    if abs(c.x) < .145 and .66 < c.z < .985 and c.y < .015:
        regions['pelvis'].append(polygon)
    if 1.22 < c.z < 1.50 and c.y < -.015 and abs(c.x) < .29:
        regions['front_chest'].append(polygon)
    if 1.14 < c.z < 1.47 and -.16 < c.y < .15 and .17 < abs(c.x) < .43:
        regions['front_axilla'].append(polygon)

path = out_dir / 'uv-regions.json'
with path.open('w') as f:
    json.dump(regions, f)
print('UV_REGIONS', {key: len(value) for key,value in regions.items()}, path)
