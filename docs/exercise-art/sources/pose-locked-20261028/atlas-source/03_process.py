"""Process Blender raw bakes into opaque, pose-stable Tropos atlases.

Usage: python 03_process.py --out-dir BUILD_DIR [--size 1024]
Requires Pillow, NumPy and SciPy. All paths are relative to BUILD_DIR.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import (
    binary_closing, binary_dilation, binary_erosion, binary_fill_holes,
    gaussian_filter, median_filter, sobel,
)

parser = argparse.ArgumentParser()
parser.add_argument('--out-dir', type=Path, required=True)
parser.add_argument('--size', type=int, default=1024)
args = parser.parse_args()
out = args.out_dir.resolve()
size = args.size
scale = size / 1024

def read(name):
    return np.asarray(Image.open(out / name).convert('RGB'), np.float32) / 255

def read_mask(name):
    return np.asarray(Image.open(out / name).convert('L'), np.float32) / 255

def save(name, values):
    Image.fromarray(np.uint8(np.clip(values * 255, 0, 255))).save(out / name)
    print('PROCESSED', out / name)

def radius(value):
    return max(1, round(value * scale))

def odd_filter(value):
    return 2 * radius(value // 2) + 1

def disk(r):
    y, x = np.ogrid[-r:r+1, -r:r+1]
    return x*x + y*y <= r*r

white = np.array([.925, .928, .94], np.float32)
violet = np.array([123, 114, 233], np.float32) / 255
neutral_normal = np.array([.5, .5, 1], np.float32)
generic_raw = read(f'anatomy-color-{size}.png')
raw_normal = read(f'anatomy-normal-{size}.png')

# Selected-to-active bake leaves source muscle gaps; replace missing color by
# anatomy white and invalid normal rays by neutral tangent normals.
valid = generic_raw.mean(axis=2) > .18
good_normal = valid & (raw_normal[:, :, 2] > .28)
raw_normal[~good_normal] = neutral_normal
normal = gaussian_filter(raw_normal, sigma=(.65*scale, .65*scale, 0))
save(f'anatomy-clean-normal-{size}.png', normal)

generic_primary = np.clip(np.minimum(
    (generic_raw[:,:,2]-generic_raw[:,:,0]-.015)/.17,
    (generic_raw[:,:,0]-generic_raw[:,:,1]-.008)/.035), 0, 1)
generic_primary *= valid
generic_primary = gaussian_filter(median_filter(generic_primary, size=3), sigma=.45*scale)
generic_color = white[None,None,:]*(1-generic_primary[:,:,None]) + violet[None,None,:]*generic_primary[:,:,None]
save(f'anatomy-clean-color-{size}.png', generic_color)

# Restrained ink-like valley lines from low-frequency baked normal gradients.
# Mask UV-island edges so no seam is drawn where anatomy geometry is absent.
normal = read(f'anatomy-clean-normal-{size}.png')
inside = binary_erosion(valid, iterations=radius(4))
smooth = gaussian_filter(normal, sigma=(1.8*scale, 1.8*scale, 0))
gradient = np.sqrt(np.sum(sobel(smooth, axis=0)**2 + sobel(smooth, axis=1)**2, axis=2))
line = np.clip((gradient - 1.0) / 2.0, 0, 1) * inside
line = gaussian_filter(median_filter(line, size=3), sigma=.45*scale)
save(f'anatomy-contour-{size}.png', line)
line = read_mask(f'anatomy-contour-{size}.png')
save(f'anatomy-contour-color-{size}.png', read(f'anatomy-clean-color-{size}.png')*(1-.28*line[:,:,None]))

# Original-body polygons define modesty and the two squat-specific cleanup
# regions in the same UV as the continuous source body and fascia.
with (out / 'uv-regions.json').open() as f:
    regions = json.load(f)
for region, blur in (('pelvis',7), ('front_chest',9), ('front_axilla',9)):
    canvas = Image.new('L', (size,size), 0)
    draw = ImageDraw.Draw(canvas)
    for face in regions[region]:
        draw.polygon([(u*size,(1-v)*size) for u,v in face], fill=255)
    canvas = canvas.filter(ImageFilter.MaxFilter(odd_filter(7)))
    canvas = canvas.filter(ImageFilter.GaussianBlur(blur*scale))
    canvas.save(out / f'{region}-mask-{size}.png')

pelvis = read_mask(f'pelvis-mask-{size}.png')
chest = read_mask(f'front_chest-mask-{size}.png')
axilla = read_mask(f'front_axilla-mask-{size}.png')
normal = read(f'anatomy-clean-normal-{size}.png')
modesty_normal = normal*(1-pelvis[:,:,None]) + neutral_normal[None,None,:]*pelvis[:,:,None]
save(f'anatomy-modesty-normal-{size}.png', modesty_normal)

def color_masks(exercise):
    raw = read(f'{exercise}-raw-color-{size}.png')
    delta = raw[:,:,2] - raw[:,:,0]
    bright = (raw.mean(axis=2) > .18).astype(np.float32)
    primary = np.clip((delta-.18)/.12, 0, 1)*bright
    secondary = np.clip((delta-.025)/.09, 0, 1)*bright*(1-primary)
    primary = gaussian_filter(median_filter(primary, size=3), sigma=.45*scale)
    secondary = gaussian_filter(median_filter(secondary, size=3), sigma=.45*scale)
    return primary, secondary

for exercise in ('assault_bike', 'elliptical'):
    primary, secondary = color_masks(exercise)
    primary_color = (np.array([110,88,233],np.float32)/255
                     if exercise == 'assault_bike' else violet)
    secondary_color = (np.array([156,137,232],np.float32)/255
                       if exercise == 'assault_bike' else np.array([176,170,235],np.float32)/255)
    color = white[None,None,:]*(1-primary[:,:,None]-secondary[:,:,None])
    color += primary_color[None,None,:]*primary[:,:,None]
    color += secondary_color[None,None,:]*secondary[:,:,None]
    save(f'{exercise}-clean-color-{size}.png', color)
    color = read(f'{exercise}-clean-color-{size}.png') * (1-.28*line[:,:,None])
    save(f'{exercise}-contour-color-{size}.png', color)
    color = read(f'{exercise}-contour-color-{size}.png')
    color = color*(1-pelvis[:,:,None]) + white[None,None,:]*pelvis[:,:,None]
    save(f'{exercise}-modesty-contour-color-{size}.png', color)

# Front Squat's visible front-facing quads need filled, feathered muscle
# regions. Its core remains white with grayscale contour: the raw secondary
# bake produced a hard lavender rectangular block at the waist.
raw = read(f'front_squat-raw-color-{size}.png')
delta = raw[:,:,2] - raw[:,:,0]
quad = (delta > .18) & (raw.mean(axis=2) > .18)
quad = median_filter(quad, size=3)
quad = binary_closing(quad, structure=disk(radius(12)))
quad = binary_fill_holes(quad)
quad = binary_dilation(quad, structure=disk(radius(4)))
quad = gaussian_filter(quad.astype(np.float32), sigma=3.0*scale)
quad = np.clip(quad*(1-pelvis),0,1)
save(f'front_squat-quad-mask-{size}.png', quad)
color = white[None,None,:]*(1-quad[:,:,None]) + violet[None,None,:]*quad[:,:,None]
clean_line = line*(1-chest)
color *= 1-.28*clean_line[:,:,None]
color = color*(1-pelvis[:,:,None]) + white[None,None,:]*pelvis[:,:,None]
save(f'front_squat-modesty-contour-color-{size}.png', color)
normal = read(f'anatomy-modesty-normal-{size}.png')
normal = normal*(1-axilla[:,:,None]) + neutral_normal[None,None,:]*axilla[:,:,None]
save(f'front_squat-clean-normal-{size}.png', normal)
