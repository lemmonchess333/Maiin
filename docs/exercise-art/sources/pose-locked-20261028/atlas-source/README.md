# Rebuild the Tropos anatomy atlases

This folder contains the complete, relative-path source pipeline for the
pose-stable atlas on the original 53-bone CC0 body. The source package contains
these two files in `assets/`:

- `human-base-rigged.glb` — the coherent render body and shared UV.
- `full-body-muscular-system.glb` — static fascia plus named muscle meshes.

Run from any working directory:

```bash
./build.sh                  # 1024px atlases in ./build/
./build.sh 256 ./build/smoke256   # quick import/bake/processing smoke
```

Requires Blender 4.3 or later, Python 3 with NumPy, SciPy and Pillow.
The script never downloads assets. It writes all generated files to the
selected output directory and creates `manifest.json` with input/output
SHA-256 hashes and dimensions.

Build stages:

1. `01_bake.py` imports both CC0 GLBs, checks exact shared UV loops, copies
   the original rig's skin weights to the fascia by loop correspondence, and
   transfers them to the named muscles by nearest-surface interpolation. It
   adds the original armature modifier to reproduce the approved neutral
   bake staging, then bakes a generic muscle color map, a tangent normal map,
   and three exercise color
   maps from 136 named muscle/tendon objects plus the body GLB's unshaded
   `Icosphere` guide (included to match the approved neutral bakes). It uses Cycles
   selected-to-active baking onto the fascia UV, 6 cm maximum ray distance,
   1.5 cm cage extrusion, and 8-pixel margin.
2. `02_uv_regions.py` exports body surface polygons for modesty, chest
   projection cleanup, and underarm normal cleanup into `uv-regions.json`.
3. `03_process.py` fills missing muscle projection with opaque anatomy white,
   neutralizes invalid normals, derives low-frequency contour lines, paints
   per-exercise violet/lilac muscle regions, and applies the UV cleanup masks.
   Front Squat uses a filled/feathered quad mask, a white core with gray abs
   contour, and a targeted underarm normal map.
4. `04_verify.py` checks the generated image set, dimensions, violet coverage,
   and hashes. An optional `--reference-dir` reports mean pixel error against
   known outputs.

The render-time original body uses:

- `front_squat-modesty-contour-color-1024.png` with
  `front_squat-clean-normal-1024.png` at normal strength 0.35.
- `assault_bike-modesty-contour-color-1024.png` or
  `elliptical-modesty-contour-color-1024.png` with
  `anatomy-modesty-normal-1024.png` at normal strength 0.12.

The separately weighted muscle `.blend` experiments are not part of this
pipeline; they detach under multi-bone IK. The images are applied to the
original coherent body whose UV loops exactly match the fascia bake target.

Source URLs, license text, downloaded GLB hashes, and approved output hashes
are in `PROVENANCE.md`.
