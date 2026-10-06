import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Train shows one advice notice at a time (DS3, `programNotices`).
 *
 * Pinned at the source, for the reason `programExerciseList.test.ts`
 * gives: Program.tsx mounts charts, sheets and several Firestore hooks,
 * and nothing in the repo renders it in jsdom. The priority itself is a
 * pure function with its own tests; these pins hold the page to using it.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const code = readFileSync(resolve(repoRoot, "src/pages/Program.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

const around = (needle: string, before = 400) => {
  const at = code.indexOf(needle);
  expect(at, `not found: ${needle}`).toBeGreaterThan(-1);
  return code.slice(Math.max(0, at - before), at);
};

describe("Train's advice waits its turn", () => {
  it("asks one function which notice shows", () => {
    expect(code).toMatch(/const liftAdvice = pickLiftAdvice\(\{/);
  });

  it("owns the week-level dismissal and hands it to the banner", () => {
    expect(code).toMatch(/useDismissOnce\(deloadDismissKey\(noticeWeekKey\)\)/);
    expect(code).toContain("dismissed={deloadNotice.dismissed}");
  });

  it("shows no recovery reduction, which is retired (Lift4 (13))", () => {
    expect(code).not.toContain("RecoveryReductionBanner");
    expect(code).not.toContain("recoveringMuscles");
  });

  it("offers today's lighter session only when it is the notice", () => {
    expect(around("Go easier today", 900)).toContain('liftAdvice === "easier"');
  });

  it("lets the level-up suggestion give way to the week-level notice", () => {
    expect(code).toMatch(/suppressed=\{liftAdvice === "deload"\}/);
  });

  /* Owner, 2026-10-05: no row per lift that has held ("Seated Leg Curl has
     held at 47.5 kg for 3 sessions", opening a calorie offer). With twenty
     exercises it could name twenty. The engine still holds and rotates
     lifts, without a notice. */
  it("names no lift that has held its load or reps", () => {
    // The positive half: this reads the day view, where the row sat between
    // today's one offer and the exercise rows. If the comment stripping or a
    // move of the day view took that span out of `code`, these fail first.
    const offer = code.indexOf("Go easier today");
    expect(offer).toBeGreaterThan(-1);
    expect(code.indexOf("<ExerciseRowSummary", offer)).toBeGreaterThan(offer);
    // And nothing on the page brings the row or its modal back.
    expect(code).not.toMatch(
      /has held|Review recent lifting progress|Plateau detected|StallReview|StallModal|detectStall|tropos_stall_/
    );
  });
});
