import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A metric pill must name what the chart plots.
 *
 * On a bodyweight exercise the first toggle option charts `s.totalReps`
 * — a one-rep max means nothing when there is no external load — and
 * the pill rendered its internal key, "1RM", above a line of rep
 * counts. Filmed on Pull-Ups: the pill read "1RM" while the y-axis ran
 * 24..36 over total reps, and the header stat beside it already read
 * "Max reps".
 *
 * The strongest evidence it was unintended is three lines above the
 * options themselves, where the comment has always said the toggle
 * "simplifies to Reps / Volume". The intent was written down; only the
 * pill disagreed.
 *
 * The `isTimed` branch had already solved exactly this, rendering
 * "Seconds" rather than the same "1RM" key — which is why the timed
 * surface reads correctly and this one did not. The fix is one more
 * branch on that ternary, not a change to the `Metric` union: the key
 * is storage, the pill is language.
 *
 * Scanned rather than rendered: the pills are built inside a 600-line
 * route page that needs params, auth and Firestore to mount, and the
 * rule is about what the branch emits.
 */
const page = readFileSync("src/pages/ExerciseHistory.tsx", "utf8");

describe("the bodyweight metric pill", () => {
  it("still charts total reps for that option", () => {
    // The anchor. If this ever stops being reps, the label below is
    // wrong again and this test should be what says so.
    expect(page).toMatch(
      /isBodyweight\s*\)\s*\{\s*value = metric === "Volume" \? s\.volume : s\.totalReps;/
    );
  });

  it("says Reps, not the 1RM key it stores", () => {
    expect(page).toMatch(/isBodyweight && m === "1RM"\s*\?\s*"Reps"/);
  });

  it("leaves the timed branch saying Seconds", () => {
    /* The branch that already got this right — and the reason the fix is
       shaped the way it is. */
    expect(page).toMatch(/isTimed\s*\?\s*"Seconds"/);
  });

  it("keeps 1RM on a loaded exercise, where it is the real metric", () => {
    /* The opposite mistake: renaming the pill everywhere would strip the
       correct name off barbell work, whose option really does chart an
       estimated one-rep max. */
    expect(page).toMatch(
      /metric === "1RM"\s*\)\s*\{\s*value = Math\.round\(s\.e1rm\)/
    );
    expect(page).toMatch(/\["1RM", "Max Weight", "Volume"\]/);
  });

  it("the header stat on the same screen already said the right word", () => {
    // Which is what made the pill read as a bug rather than a choice.
    expect(page).toMatch(/isBodyweight\s*\?\s*"Max reps"/);
  });
});
