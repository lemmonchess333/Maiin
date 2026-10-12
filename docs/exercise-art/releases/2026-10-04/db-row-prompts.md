# Dumbbell Row artwork production

# Dumbbell Row — exact catalogue conversion

Catalogue `db-row`: bench-supported single-arm dumbbell row. One hand and same-side knee on bench; opposite foot planted; neutral grip dumbbell hangs toward floor, row to hip without opening torso, lower under control. This is not a two-arm bent-over row despite the legacy rig alias.

Primary lats purple; secondary rhomboids/rear delts/biceps lilac; other anatomy neutral. Canonical white/grey faceless athlete and white trainers. Fixed shallow rear-oblique working-side camera must show working grip, supporting palm/knee, floor foot and dumbbell. One rigid flat bench and one modest dumbbell. Torso nearly horizontal and level throughout, neck neutral.

## Six beats before generation

1. Stretch: support hand and same-side knee on bench, opposite foot planted, working arm extended with neutral grip below shoulder.
2. Initiate: shoulder blade begins pulling back; elbow starts flexing, dumbbell rises slightly and travels toward hip.
3. Row: elbow halfway back close to ribs, weight halfway to hip, no trunk rotation or shrug.
4. Hip: elbow beside/past torso, dumbbell next to hip/lower ribs, wrist neutral, shoulders level.
5. Lower: reuse pose 3 with eccentric cue.
6. Return: reuse pose 2 with cue to finish the full stretch into frame 1.

Four unique poses, six files. Intended scalar [0,1/3,2/3,1,2/3,1/3] after checking renderer semantics. Inspect full-contraction endpoint before purchasing adjacent poses. Fixed bench/palm/knee/foot contacts and dumbbell dimensions must remain consistent. Native review, measured anchors/dimensions, source/cue hashes and actual mobile ExerciseFormFrames all six/loop light and dark precede production integration. Normal repository verification and commit hooks required; no PR/push/merge authorized.

# Dumbbell Row native and mobile review

Final sources are master, cleaned early pull, late pull and original top pose. Two attempted top tint edits were rejected because they introduced forearm highlights. Closer native inspection of the original top shows the lilac upper-arm band under the foreshortened neutral lateral patch; retained original treatment. The unused initial dumbbell ROI diagnostic touched surrounding anatomy/bench and is not a valid measurement of complete weight dimensions.

The final crop1014x1090 includes all visible pixels. No scaling or anatomy warping. Exact master-copy stationary bench floor supports and planted shoe retain stable contacts; pixel-derived measurements are recorded separately. Supporting palm/knee/trailing shoe remain visibly seated on bench. Both dumbbell heads and neutral grip remain intact, modest and visually consistent; these moving objects are not represented as fixed anchors.

All four unique cropped sources inspected natively. Actual ExerciseFormFrames at390x844: light1,2,3,4,5,6,1 and dark1,2,3,4,5,6,1 inspected using browser screenshots. Entire athlete, bench, dumbbell, caption and controls fit; return reverses elbow travel into full stretch. Working-side elbow/shoulder movement is visible without hips opening or support contacts moving. Sequence uses1,2,3,4,3,2. No UI code changes needed.

Visual review passes. Repository validation and release commit remain separate gates.

## 2-cleanup-prompt.txt

Edit FIRST image only: remove the grey/white background glow completely, restoring uniform solid black everywhere outside athlete, bench and dumbbell. Preserve exact pose, every contour, colors, all equipment and contact positions,1024x1536 canvas. No rim halo or glow. SECOND image exercise master defines required solid black finish; THIRD canonical identity. This is background cleanup only; do not redraw or reposition body or weight. One image.

## 2-early-prompt.txt

Edit FIRST Dumbbell Row master a small amount for early pull, NOT full contraction. SECOND canonical identity. Keep stationary scene exactly unchanged1024x1536. Working right hand must remain LOW, around x285 y720 (masterhand~220830), with dumbbell centered aboutx300y730. Working elbow flexes modestly and moves backward aroundx345y530. Preserve shoulder position, arm segment lengths, neutral wrist. Weight is still below bench top, arm is not tightly folded and dumbbell is not beside hip. Same rigid dumbbell size; keep exact master bench, supporting palm/knee, planted foot, head and torso. Purplelat and lilacbiceps/reardelt/rhomboids unchanged. One image.

## 2-prompt.txt

Edit FIRST image Dumbbell Row master to frame2, first third of row. SECOND canonical identity, THIRD top pose is endpoint only. Keep exact1024x1536 canvas and every stationary part: bench, planted foot, supporting knee/palm, head, hips and torso. Bend working right elbow a little and drive it back, raising dumbbell about110pixels and moving it about60pixels toward hip from master. Working upperarm only begins moving behind ribs, not full contraction. Same anatomical segment lengths, neutral wrist, no shrug/torso twist. Same exact dumbbell head dimensions and handle length as FIRST image. Purplelat, lilacbiceps/reardelt/rhomboids stay consistent. One image.

## 4-local-tint-prompt.txt

Tiny color correction on FIRST image only, without any geometry changes. Apply light lilac to the small white oval upper-arm muscle centered at pixel(382,299), approximately x344..421,y273..321, directly between purple shoulder and bent elbow. Keep the long sloping FOREARM from elbow near(477,270) down toward wrist(413,451) completely WHITE/GREY. Do not tint forearm. Preserve exact dumbbell size and position, all anatomy contours, lat purple, bench, contacts, camera and1024x1536 canvas. SECOND exercise master and THIRD canonical identity. No other edits. One image.

## 4-prompt.txt

Edit FIRST image Dumbbell Row exercise master into full contraction frame4. SECOND canonical identity. Keep exact1024x1536 portrait canvas, camera, body scale, head/torso/hips/legs, bench, supporting left palm and knee, planted right shoe unchanged. Move ONLY working RIGHT arm and held dumbbell: bend elbow, drive it backward close to ribs until elbow reaches behind torso; bring dumbbell toward right hip/lower ribs. Keep shoulder down, torso square, no twisting or shrugging. Maintain exact upperarm/forearm lengths and neutral wrist grip; both dumbbell heads retain same size and rigid assembly. Preserve primary purple working lat and lilac rear delt/rhomboid/biceps. Supporting contacts stay fixed. Entire image unchanged outside workingarm/weight and small natural shoulder-blade motion. One image.

## 4-refine-prompt.txt

Refine FIRST Dumbbell Row top-contraction image only. Keep exact pose, every stationary contact and1024x1536 canvas unchanged. SECOND is exercise master, THIRD canonical athlete. Apply lighter lilac to the visible working biceps on the upper arm, consistent with master secondary-muscle tint; keep triceps and forearm neutral. Retain rich purple lat and lilac rear deltoid/rhomboids. Preserve dumbbell grip and neutral wrist; make both grey dumbbell heads match the master's same modest size (about110pixels tall each) and the same handle length, without moving hand. Do not change torso, head, bench, planted foot or supporting knee/palm. Solidblackbackground. One image.

## master-prompt.txt

Create one instructional anatomical illustration for bench-supported SINGLE ARM DUMBBELL ROW, fully extended start. Use attached canonical white/lightgrey bald faceless athlete with fine contours, smooth neutral featureless pelvis, white trainers. Primary working lat rich purple, rhomboids/rear delt/biceps lighter lilac. A flat narrow grey bench runs lengthwise. Athlete LEFT palm and LEFT knee supported firmly on bench, left lower leg trailing along bench; RIGHT foot planted beside bench on ground, RIGHT hand holds one modest grey dumbbell with neutral grip. Working right arm hangs straight down below shoulder. Torso long, nearly horizontal and square to ground, back neutral, no trunk rotation, neck neutral. Camera shallow rear-oblique on RIGHT working side, facing left, clearly shows working arm/grip, supporting palm on bench, knee contact and planted foot. Entire athlete, rigid bench, dumbbell and all feet visible with comfortable margins in1536x1024 blackbackground. No text or arrows. Maintain normal body proportions and visible joint mechanics. One image.
