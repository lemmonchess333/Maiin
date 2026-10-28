# October 28 exercise art completion

The catalogue has 152 exercise sets. The preceding full-sequence review
approved twelve replacements and held three sets on the checked motion guide.
This pass built, reviewed, and released those three six-frame replacements.
No exercise remains in the form-art quarantine.

| Exercise | Final movement | Fixed/contact checks | Card pose |
| --- | --- | --- | --- |
| Assault Bike | Opposed pedals and linked moving handles; fan turns through every frame | Fan hub, rails, saddle, console, and seated hip stay fixed; fingers wrap grips and trainers stay on pedals within 1.7 and 0.9 phone pixels | Frame 1, native transparent render |
| Elliptical | Opposed pedals and handles complete a continuous six-phase stride | 19 fixed machine objects have zero transform drift; skin touches both grip surfaces within 0.1 mm and shoe soles stay within one phone pixel of pads | Frame 4, native transparent render |
| Front Squat | Cross-arm front rack, planted-feet descent below parallel, and symmetric rise | Shoe bounds drift at most 0.037 native pixels; bar span and plate centers remain invariant; deltoid shelf supports the bar with throat clearance | Frame 4, native transparent render |

Each set was viewed at native size and at 360 px. The candidate and active
release players decoded all six frames, returned from frame 6 to frame 1, and
passed at 393×852 in light and dark themes without horizontal overflow or
browser errors. Frame hashes, fixed anchors, invariant dimensions, cues, and
review decisions are pinned in `docs/exercise-art/releases/2026-10-28/`.
Native frame PNGs and phone review sheets are in the exercise folders here;
dated lossless WebPs are in `public/form-frames/`. Native transparent card
sources are under `docs/exercise-art/cutout-sources/`. Rebuildable Blender
sources, CC0 provenance, and geometry QA are under
`docs/exercise-art/sources/pose-locked-20261028/`.
