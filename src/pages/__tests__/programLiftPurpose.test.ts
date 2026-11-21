import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Train's lift tab carries "Why this session" under the session card, as
 * its Run tab carries "Why this run", and on the same days: one still to
 * train this week.
 *
 * Pinned at the source, for the reason `programExerciseList.test.ts`
 * gives: nothing in the repo renders Program.tsx in jsdom. What the
 * disclosure says, and when it says nothing, is rendered and tested in
 * `liftSessionPurpose.test.ts`, `DayPeekCard.test.tsx` and
 * `DayActionSheet.test.tsx`; this file pins only where the page puts it.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const strip = (path: string) =>
  readFileSync(resolve(repoRoot, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
const code = strip("src/pages/Program.tsx");
/* The day's session, drawn on the Lift tab and on a lift's own page
   (`LiftSessionView`, TrainWk1 step 3). */
const view = strip("src/components/program/LiftSessionView.tsx");

describe("Train's lift tab explains the session", () => {
  const at = view.indexOf("<LiftPurpose");

  it("renders it once, after the session card", () => {
    expect(at).toBeGreaterThan(-1);
    expect(view.indexOf("<LiftPurpose", at + 1)).toBe(-1);
    expect(at).toBeGreaterThan(view.indexOf('sport="lift"'));
    // Train draws the day's, and adds none of its own.
    expect(code).toContain("<LiftSessionView");
    expect(code).not.toContain("<LiftPurpose");
  });

  it("explains the selected day from the programme", () => {
    const props = view.slice(at, view.indexOf("/>", at));
    expect(props).toMatch(/programme=\{programState\}/);
    expect(props).toMatch(/day=\{selectedWorkout\}/);
  });

  it("only on a day still to train this week", () => {
    /* A completed, skipped or missed day — and every day of a past week,
       which liftDayStatus calls missed — has nothing left to explain. */
    expect(view.slice(Math.max(0, at - 160), at)).toMatch(
      /status === "today" \|\| status === "upcoming"/
    );
  });
});

describe("Train's lift tab has one way into the rules sheet", () => {
  it("is 'Why this session', with nothing beside the week label", () => {
    /* Owner: an ⓘ beside the week label opened the same sheet as "Why
       this session" a few rows down, and one of the two was not needed. */
    const row = code.indexOf("<WeekPhaseRow");
    expect(row).toBeGreaterThan(-1);
    expect(code.slice(row, code.indexOf("/>", row))).not.toMatch(/info=/);
    expect(code).not.toMatch(/LiftRulesInfo/);
  });
});

describe("Train names the focus in Settings' words", () => {
  it("does not use the engine's own labels anywhere on the page", () => {
    expect(code).not.toMatch(/primaryGoalLabel/);
    expect(view).not.toMatch(/primaryGoalLabel/);
  });

  it("names a run-only plan's focus and says it has no lift days", () => {
    /* No week row renders without lift days, so the header is the one
       line that names the focus there, and it uses the same words. */
    const at = code.indexOf("no lift days");
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(Math.max(0, at - 160), at)).toMatch(
      /focusLabel\(programState\.primaryGoal \?\? "general"\)/
    );
  });
});
