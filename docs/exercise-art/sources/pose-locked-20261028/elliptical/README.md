# Elliptical render source

This folder contains the final six-phase Blender scene, machine geometry,
contact checks, and CC0 body, trainer, and material assets. Run from this
folder with Blender 4.3.2:

```sh
blender -b -t 4 --python elliptical_release.py
blender -b -t 4 --python elliptical_release.py -- --transparent-frame4
sha256sum -c SHA256SUMS
```

The reviewed PNGs are in
`docs/exercise-art/pilots/redraw-20261028/elliptical/{1..6}.png`; the
delivered lossless WebPs are in `public/form-frames/elliptical/2026-10-28/`.
The native transparent frame-4 card render is
`docs/exercise-art/cutout-sources/elliptical.png`. `FINAL_REVIEW.md`
describes form, contact, and loop QA; `SHA256SUMS` checks the local source and
QA files. Released-frame and card hashes are pinned in the release and
cutout-source records.
