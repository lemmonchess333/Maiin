# Elliptical animation handoff

Six reviewed 1080×1080 source frames are in the sibling pilot folder as
`1.png` through `6.png`. The app's dated lossless WebPs are re-encoded from
those PNGs. `final-phone-sheet.png` in the pilot folder shows all six frames
at 360×360. The native transparent-background fourth-stride card render is
`docs/exercise-art/cutout-sources/elliptical.png`. The full-stage frames have
an opaque dark background.

## Motion and art

- One fixed camera, lighting setup, model, and machine persists through all
  phases. The machine has two independently moving pedals and two opposite
  hand levers; the foot and hand targets share a phase.
- Frame 1: near pedal forward, near handle back. Frames 2–3: near pedal travels
  back/up as its handle travels forward. Frame 4: near pedal furthest back,
  handle furthest forward. Frames 5–6: near pedal travels forward/down as the
  handle returns. The far side stays opposite throughout.
- A CC0 rigged human has the app's faceless head, UV anatomy contours, lifting
  purple highlights, fitted neutral shorts, and CC0 trainers. The original
  weighted wrists and hands are intact; hand bones pronate 45° and finger
  bones flex around both vertical grips. No palm or wrist proxy is rendered.
- Source code: `elliptical_release.py` (camera, body, IK, render),
  `elliptical_machine.py` (fixed chassis and kinematic targets),
  `render_machine.py` (stage setup). Inputs and license details are in
  `source-model/`. A portable form is also packaged as `elliptical_scene.py`
  and machine helpers in the adjacent `../shared/` source bundle.

## QA

- `kinematic-audit.json`: 19 fixed objects had zero transform drift across
  six phases; both drive links stayed 0.600 m; pedal and grip motion stayed
  opposite. `cycle-qa.json`: six unique phases, phase 0/1 closure under
  6×10⁻¹⁷ m, and continuous loop velocity under 10⁻⁴ m per cycle.
- `geometry-qa.json`: evaluated skin touches each grip surface within
  0–0.1 mm in all twelve hand checks. Rendered sneaker bottoms stay 1.9–6.4
  mm above the pad tops; this is within one phone pixel. The mathematical
  sole targets stay 1 mm above the moving rubber pads.
- `frame-qa.json`: six unique image hashes, fixed screen anchors, no cropped
  figure or machine, and an adjacent frame RGB RMS range of 24.7–39.9.
  Frame 6→1 is 27.9, within that range. All art bounds at a 28/255 luma
  threshold are (22, 133, 1034, 971) in a 1080 square. The card render has
  alpha 0 at the corner and alpha 255 over the machine.
- Full-size and 360px reviews checked both extreme stride poses, continuous
  wrists and shins, hands wrapping their own tubes, soles on the pads, and
  stable equipment. The earlier inward-wrist experiment was rejected after
  side-by-side visual review; the final frames use the stronger unshifted
  hand pose.

Run `blender -b -t 4 --python elliptical_release.py` from this folder to
rebuild all six PNGs. Use `-- --transparent-frame4` to rebuild the card art.
`qa_frames.py`, `qa_cycle.py`, `qa_geometry.py`, and `audit_machine.py` record
the image, loop, contact, and fixed-geometry checks. `SHA256SUMS` lists the
frozen handoff files.
