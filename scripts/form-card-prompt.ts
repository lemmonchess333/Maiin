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
  console.log(`A single wide image: an exercise form card for "${ex.name}".

LAYOUT
- One dark card, flat near-black background, subtle rounded panels.
- A 3 x 2 grid of six numbered panels, with clear gaps between them.
- Each panel: a small number badge and a short title at the top, the
  figure in the middle, a one-line caption underneath.
- A muscle legend at the top right. A tip bar along the bottom.

THE SIX PANELS, in order
${positions.join("\n")}

FIGURE
- One neutral grey anatomical mannequin, no face, no clothing.
- Solid purple (#7B72E9) on the PRIMARY muscles: ${ex.muscleGroup}.
- Diagonal hatching in the same purple on the SECONDARY muscles: ${ex.secondaryMuscles.join(", ") || "none"}.
- Equipment: ${ex.equipment}.

CRITICAL — this is what makes the six panels animate
- The SAME camera angle, the SAME distance and the SAME equipment,
  drawn identically in all six panels. Only the body moves between
  them. Treat it as six frames of one locked-off shot, not six
  separate drawings of the exercise.
- The figure must be the same size in every panel.
- Keep the panel backgrounds flat and the gaps between panels clear.`);
}
