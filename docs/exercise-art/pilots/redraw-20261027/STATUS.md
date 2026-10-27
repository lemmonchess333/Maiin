# October 27 form-art redraw review

The catalogue has 152 exercise sets. The preceding full-sequence audit placed
15 inaccurate or inconsistent illustrated sets on the checked motion renderer.
This pass inspected the available redraw drafts at native size and checked
all 15 active displays at phone size. Seven candidates also passed all six
frames in the actual player at 393×852 and now have dated, strictly approved
releases. Eight remain on the motion renderer. Older frame files remain intact.

| Exercise | Decision | Review finding |
| --- | --- | --- |
| Bench Dips | Approved | Flat bench, fixed grips and heels, controlled elbow bend. |
| Bench Press | Approved | Flat one-piece pad, two grips, bar reaches pec level, fixed rack and shoes. |
| Dumbbell Bench Press | Approved | Flat bench, paired weights, fixed supports; enlarged with one safe camera. |
| Hack Squat | Approved | Carriage follows rails, shoes remain on footplate, fixed frame. |
| Hip Abduction Machine | Approved | Fixed outboard grips and seat, knees/pads/foot platforms open together. |
| Seated Cable Row | Approved | Upright torso, connected cable, rising stack, fixed seat and footplate. |
| Swimming | Approved | Alternating overhead crawl, visible side breath, aligned pool-tile reference and tile-free transparent card. |
| Assault Bike | Motion renderer | Image edits kept moving handles static. The live rig now links opposite grips to the pedal cycle. |
| Elliptical | Motion renderer | Image edits kept the handles static. The live rig already links opposite handles and pedals. |
| Front Squat | Motion renderer | Redrawn feet lift 2–3 native pixels and plates resize about 2%; the live rig now shows a clearer front rack and planted shoes. |
| Clean and Press | Motion renderer | Redrawn body and bar change scale between hinge, rack and press. Live phase labels clarify the clean and press path. |
| Burpees | Motion renderer | Redrawn jump changes camera angle at the loop, and the landing image does not yet show the planted palms its cue claims. |
| Close Grip Bench Press | Motion renderer | Flat narrow-grip draft keeps the bar 18–29 native pixels above the lower chest at bottom. |
| Inverted Row | Motion renderer | Improved chest-to-bar draft retains 2-pixel rack-foot drift at the top; release alignment gate is unmet. |
| Smith Machine Bench Press | Motion renderer | Initial sequence uses an incline backrest; flat replacement has incomplete chest contact and scene continuity. |

Approved WebPs are under `public/form-frames/<id>/2026-10-27/`, with native
source PNGs in the matching pilot folder and measured release records under
`docs/exercise-art/releases/2026-10-27/`. The quarantine list is
`src/lib/formArtQuarantine.ts`; failed drafts in this pilot are not referenced
by the production player.

Review covered identity, anatomy, equipment, contacts, movement, muscle
highlighting, cue agreement, sequence/loop, fixed-scene measurements, phone
rendering in both themes, card cutouts and exact delivered asset hashes. The
read-only draft checker is `scripts/art/check-redraw-drafts.ts`; the phone
candidate and active-release browser checks are in `scripts/art/`.
