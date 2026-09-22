import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The links the footer's own tests cannot see.
 *
 * `exerciseListDisclosure.test.tsx` renders the footer and pins its
 * behaviour, `forceOpen` included. What it cannot know is whether the
 * PAGE wires any of it up — and the prop's whole reason for existing is
 * Program's own wiring: "Reorder exercises" is a page-header overflow
 * action, so it can be tapped while the list is collapsed, and without
 * `forceOpen={reorderMode}` the mode starts with nothing to drag. Pass
 * `undefined` there and every component test stays green.
 *
 * It also pins the two repeats the footer replaced. The card used to
 * say "6 exercises" directly above a row saying 6, and "· Day N" above
 * a day cell already lit and numbered.
 *
 * Pinned at the source, for the reason `programSessionActions.test.ts`
 * gives: Program.tsx mounts charts, sheets and several Firestore hooks,
 * and nothing in the repo renders it in jsdom. A source pin cannot
 * prove what a user sees, so these are deliberately narrow.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(resolve(repoRoot, "src/pages/Program.tsx"), "utf8");
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

const panel = () => {
  const open = code.indexOf("<div id={EXERCISE_PANEL_ID}");
  expect(open).toBeGreaterThan(-1);
  return code.slice(open, code.indexOf("Completed Session Summary", open));
};

describe("the footer is the trigger and the panel is beneath the card", () => {
  it("passes the footer to the command card, not a row of its own", () => {
    const at = code.indexOf("<ExerciseListFooter");
    expect(at).toBeGreaterThan(-1);
    // It sits inside the card's `footer={...}` slot.
    expect(code.slice(Math.max(0, at - 120), at)).toContain("footer={");
  });

  it("hands the drag mode the override that opens it", () => {
    expect(code).toMatch(/forceOpen=\{reorderMode\}/);
  });

  it("shows the panel for the user's choice OR the drag mode", () => {
    expect(code).toMatch(/\{\(exercisesExpanded \|\| reorderMode\) && \(/);
  });

  it("gives the footer every name, in plan order", () => {
    /* Not the trimmed `usualPlan`: the panel below lists the full day,
       and a preview that disagreed with the list it opens would be the
       "6 exercises over a row saying 5" defect in a new place. */
    const at = code.indexOf("<ExerciseListFooter");
    expect(code.slice(at, at + 260)).toContain("selectedWorkout.exercises.map");
  });

  it("puts BOTH the rows and Add exercise inside the panel", () => {
    expect(panel()).toContain("<DndContext");
    expect(panel()).toContain("Add exercise");
  });

  it("keeps the per-row manage menu inside it", () => {
    /* Replace / Remove / Move live only here — the day sheet is
       day-scoped and offers none of the three. */
    expect(panel()).toContain("More options for ");
  });
});

describe("the two repeats the footer replaced", () => {
  it("no longer counts the exercises on the card", () => {
    expect(code).not.toMatch(/\$\{exerciseCount\} exercises/);
    expect(code).not.toMatch(/\bexerciseCount\b/);
  });

  it("no longer numbers the day in the eyebrow", () => {
    // The day cell above the card is already lit and carries the number.
    expect(code).not.toMatch(/· Day \$\{idx \+ 1\}/);
  });

  it("keeps the duration, which is the one fact you decide on", () => {
    expect(code).toMatch(/~\$\{estimatedMinutes\} min/);
  });
});
