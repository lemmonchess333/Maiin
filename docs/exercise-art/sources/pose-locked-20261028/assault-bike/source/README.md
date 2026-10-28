# Assault Bike illustration source

Rebuild the six locked-camera 1024 × 1024 PNG frames and the transparent card frame with Blender 4.3.2:

```sh
blender -b -t 6 --python source/rebuild_assault_bike.py
blender -b -t 6 --python source/qa_final.py -- assault-final.blend
blender -b -t 6 --python source/measure_release.py
```

The builder creates a deterministic six-phase crank, opposing pedals and handle levers, a rotating six-blade fan, and a seated 53-bone athlete. Frames 1–6 are one full crank turn; the seventh key reproduces frame 1 so the visible loop step is continuous. Fan rotation is 13/6 turns per crank turn: with six identical blades each displayed frame advances 10° of apparent fan rotation, including 6→1.

`assault_machine.py` defines the machine and phase targets. `rebuild_assault_bike.py` sets the pose, camera, lights, materials, and rendering. `qa_final.py` writes per-frame projected anchors and hand/foot contact measurements. `apply_anatomy_material.py`, `style_human_v2.py`, and `attach_sneakers.py` apply the coherent muscle contour atlas, fitted shorts, faceless head, and bone-bound shoes. `PROVENANCE.md` records the CC0 source assets and hashes.

Source atlas and normal-map PNGs are packed into `assault-final.blend` after rendering. The additional `final/card-1-transparent.png` is the alpha-safe source for a small card cutout; the six motion frames use the app's near-black stage.

`measure_release.py` records two fixed 1024px anchors and two invariant dimensions per frame, asserting ≤1px/≤1% drift.
