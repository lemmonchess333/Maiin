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
const source = readFileSync(resolve(repoRoot, "src/pages/Program.tsx"), "utf8");
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

describe("Train's lift tab explains the session", () => {
  const at = code.indexOf("<LiftPurpose");

  it("renders it once, after the session card", () => {
    expect(at).toBeGreaterThan(-1);
    expect(code.indexOf("<LiftPurpose", at + 1)).toBe(-1);
    expect(at).toBeGreaterThan(code.indexOf('sport="lift"'));
  });

  it("explains the selected day from the programme", () => {
    const props = code.slice(at, code.indexOf("/>", at));
    expect(props).toMatch(/programme=\{programState\}/);
    expect(props).toMatch(/day=\{selectedWorkout\}/);
  });

  it("only on a day still to train this week", () => {
    /* A completed, skipped or missed day — and every day of a past week,
       which liftDayStatus calls missed — has nothing left to explain. */
    expect(code.slice(Math.max(0, at - 160), at)).toMatch(
      /status === "today" \|\| status === "upcoming"/
    );
  });
});

describe("Train's lift tab keeps the plan's rules behind an ⓘ", () => {
  it("puts it beside the week label, on any day (Lift4 (3))", () => {
    const row = code.indexOf("<WeekPhaseRow");
    expect(row).toBeGreaterThan(-1);
    const props = code.slice(
      row,
      code.indexOf("/>", code.indexOf("info=", row))
    );
    expect(props).toMatch(/info=\{\s*<LiftRulesInfo/);
  });
});

describe("Train names the focus in Settings' words", () => {
  it("does not use the engine's own labels anywhere on the page", () => {
    expect(code).not.toMatch(/primaryGoalLabel/);
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
