# Front Squat final redraw — 2026-10-28

The animation depicts a barbell **crossed-arm front rack**. The bar rests on
the anterior deltoid shelf; each crossed hand stabilizes it near the opposite
shoulder. Cue copy is in `copy.md`.

## Source and render

- Portable source: `front_squat_scene.py`
- Fixed shoulder shelf: `front_rack_shelf.py` and `styled-shelf-mask.json`
  (SHA-256 `1e291dcce3185136fba47d385abd773ce43b7e9b3cf140300b6d496d62528a53`)
- CC0 body and trainers, baked anatomy maps, and their license/provenance are
  recorded in `../shared/PROVENANCE.md` and `../atlas-source/PROVENANCE.md`.
- Art settings: 1024 × 1024 PNG; Blender Eevee Next; 64 samples; cleaned
  Front Squat color atlas and normal atlas; normal strength 0.35; color-driven
  body emission 0.30; no subdivision. Camera and all equipment geometry are
  constant across the six poses.
- Depth phases: `[0, .28, .65, 1, .65, .28]`. Frames 5 and 6 use the exact
  rendered images from phases 3 and 2, respectively. This makes the return
  movement symmetric and the 6 → 1 transition continuous.
- Native alpha card source: `../../../cutout-sources/front-squat.png` (the
  deepest squat).

## Measured form and stability

- Proximal left/right front deltoids are 15.6 mm from the center of a 16 mm
  radius shaft at every phase; the shaft sits on the shoulder shelf. Throat
  clearance is 23.2 mm on the styled mesh.
- Bar projected length varies by 0.0001 px; left/right plate projected height
  varies by at most 0.001 px. Left/right shoe bbox coordinate drift is
  ≤0.037 px across all six 1024 px frames. Sole minimum height stays 0.0059 m.
- At depth, hip joint is 0.0212 m below the knee joint. The bar moves from
  y=-0.180 m to y=-0.090 m, inside the shoes' support span approximately
  -0.263 m to 0.001 m.
- `anchors.jsonl` contains per-frame projected bar, plate and shoe anchors;
  `measurements.json` contains the invariant summary and frame hashes.

Independent form and visual QA passed the standing/deep poses, all six frames
at phone size, and the final 6 → 1 transition. The final application player
and card should still be checked after packaging and frame crop rules apply.
