# Front Squat six-frame release checks

Use the same orthographic camera, crop, floor, athlete geometry, bar and plate meshes in every frame. Sequence depth: `[0, .28, .65, 1, .65, .28]`; inspect frame 6 → 1 as well as 1 → 2.

- Both heel and forefoot contacts stay on their original world coordinates and floor height in every pose. Heels never lift. Stance stays shoulder-width, toes modestly out, knees track toes.
- At bottom (frame 4), hip crease is at or a little below knee tops; torso remains within about 20–25° of vertical. Head stays neutral, spine braced, and the bar projects over midfoot.
- Straight bar lies on the anterior deltoid shelf, anterior to the neck, without throat intersection. Its midpoint is rigid to the shoulders while they descend and rise.
- Both humeri point forward close to horizontal. Elbows remain forward near shoulder height, never collapse toward ribs. Forearms cross in front of the chest; each hand presses the shaft toward the opposite front delt. The delts carry the load.
- Both plate meshes are the same size, mounted symmetrically, and do not morph or tilt between frames. Bar remains level; the whole load follows the torso vertically.
- Framing shows the entire bar, both plates, and shoe soles at phone size. Purple quads, glutes and braced core remain consistent in all six frames.
- Visual inspection includes dark and light phone players, cutout card, and the 6 → 1 loop. Numeric checks: projected bar length and plate dimensions invariant, ground-contact drift <1 source pixel, bar angle fixed, throat clearance positive with visible gap.
