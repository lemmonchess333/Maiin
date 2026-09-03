/**
 * Print the generator prompt for one exercise's form card.
 *
 * The cards are generated outside this repo (there is no image model
 * here), so the only lever on consistency is the prompt — and the
 * prompt is built FROM the catalogue, which means the six positions it
 * asks for are the six positions the app is already expecting. Author
 * the beats first, generate second, and the card and the code cannot
 * disagree about what the exercise is.
 *
 * Two constraints in the text are load-bearing rather than decorative:
 *
 *  - ONE camera and ONE piece of equipment across all six panels. The
 *    first dips card was generated panel by panel, so the station is
 *    drawn at a different position, size and angle in each; animated,
 *    it swims under the lifter. Mean station overlap between frames was
 *    9%, and a translation-registration pass measurably did not help
 *    (9.3% → 8.7%). It cannot be fixed downstream.
 *  - The flat dark panel background and the 3x2 grid, because
 *    `extract-form-frames.mjs` finds the panels by their gutters. It
 *    detects the geometry rather than assuming it, so the card need not
 *    be a fixed size — but it does need gutters.
 *
 * Usage: npx tsx scripts/form-card-prompt.ts <exerciseId> [...ids]
 */
import { EXERCISES } from "../src/lib/exercises";
import { getAuthoredBeats } from "../src/lib/bodyRig";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("usage: npx tsx scripts/form-card-prompt.ts <exerciseId>...");
  console.error(
    "\nExercises with beats already authored: " +
      EXERCISES.filter((e) => getAuthoredBeats(e.id))
        .map((e) => e.id)
        .join(", ")
  );
  process.exit(1);
}

for (const id of ids) {
  const ex = EXERCISES.find((e) => e.id === id);
  if (!ex) {
    console.error(`unknown exercise: ${id}`);
    continue;
  }
  const beats = getAuthoredBeats(id);
  const positions = beats
    ? beats.map((b, i) => `${i + 1}. ${b.label} — ${b.cue}`)
    : ex.instructions.map((s, i) => `${i + 1}. ${s}`);

  console.log(`\n${"=".repeat(64)}\n${ex.name}  (${id})\n${"=".repeat(64)}`);
  if (!beats)
    console.log(
      `[no beats authored yet — the positions below are the catalogue's\n` +
        ` instructions. Author beats first so the card and the app agree.]\n`
    );
  /* "same bodyweight" is not a sentence. Bodyweight exercises still
     have furniture the camera must hold still — bars, a bench — so the
     instruction names the setup rather than the load. */
  const gear =
    ex.equipment.toLowerCase() === "bodyweight"
      ? "setup and surroundings"
      : ex.equipment.toLowerCase();
  const figure = `- One neutral grey anatomical mannequin, no face, no clothing.
- Solid purple (#7B72E9) on the PRIMARY muscles: ${ex.muscleGroup}.
- Diagonal hatching in the same purple on the SECONDARY muscles: ${ex.secondaryMuscles.join(", ") || "none"}.
- Equipment: ${ex.equipment}.
- Draw the shoulder and upper back as continuous anatomy. Do not leave
  a flat plate or a seam where the deltoid meets the neck.
- Flat near-black background, nothing else in the frame.`;

  console.log(`STEP 1 — generate ONE image, position 1 of 6.

A single square image on a flat near-black background: "${ex.name}",
at the position "${positions[0]}".

FIGURE
${figure}

FRAMING
- The figure fills most of the frame. No panel, no caption, no legend,
  no border, no text of any kind.
- Remember this camera. Every later position reuses it exactly.


STEP 2 — for EACH of the five positions below, EDIT the image from
step 1. Do not generate a new one.

Say: "Keep this image exactly as it is — same camera, same distance,
same ${gear}, same figure size, same style and
shading. Change ONLY the body position to: <position>."

${positions.slice(1).join("\n")}


WHY IT IS TWO STEPS
Six separately generated pictures do not share a camera. Measured on
the first card of this kind, the equipment overlapped between frames by
about 10%, so it visibly swam under the lifter when animated. Editing
one image instead starts around 38% and the extractor's alignment pass
takes it to about 48%; alignment alone gets a card only to 23%, because
separate drawings differ in scale as well as position and no shift
reaches that.
Generating one figure per image also gives roughly three times the
resolution of six panels squeezed into one card, which is the other
half of why the first attempt looked soft.

Send all six images. They are wired up with:
  node scripts/extract-form-frames.mjs public/form-frames/${id} \\
    --frames 1.png 2.png 3.png 4.png 5.png 6.png`);
}
