# Front Squat pose-locked source

`front_squat_scene.py` renders one depth of the approved crossed-arm Front
Squat. The bar rests on the anterior deltoids; `styled-shelf-mask.json` fixes
the same supporting shoulder vertices across all frames. The script imports
the shared CC0 body, anatomy atlas, faceless styling, and trainers from
`../shared/` using paths relative to this directory.

The six depth values are `0, .28, .65, 1, .65, .28`; the next loop frame is
standing again. Default art settings are Eevee, 64 samples, 1024 × 1024,
Front Squat normal strength 0.35, and atlas-color emission strength 0.30.

From this directory, render a single review frame with:

```bash
blender -b -t 4 --python front_squat_scene.py -- 1.0 --out ./frame-4.png
```

Use `--transparent` for the frame-4 card cutout. Pass an absolute `--out` path
outside this source directory when regenerating all six release files. The
source tree excludes generated preview images.

`RELEASE_QA.md`, `measurements.json`, and `anchors.jsonl` record the final
phone-size form, fixed-contact, plate-geometry, and loop checks. `copy.md`
and `qa.md` identify the intentional crossed-arm variant. `SHA256SUMS`
verifies this source directory; the shared asset licenses are in
`../shared/PROVENANCE.md`.
