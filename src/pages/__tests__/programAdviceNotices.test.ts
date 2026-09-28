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

  it("owns both week-level dismissals and hands them to the banners", () => {
    expect(code).toMatch(/useDismissOnce\(deloadDismissKey\(noticeWeekKey\)\)/);
    expect(code).toMatch(
      /useDismissOnce\(recoveryDismissKey\(noticeWeekKey\)\)/
    );
    expect(code).toContain("dismissed={deloadNotice.dismissed}");
    expect(code).toContain("dismissed={recoveryNotice.dismissed}");
  });

  it("holds the deload recommendation back behind a recovery reduction", () => {
    expect(code).toMatch(
      /visible=\{showDeloadSuggest && liftAdvice !== "recovery"\}/
    );
  });

  it("offers today's lighter session only when it is the notice", () => {
    expect(around("Go easier today", 900)).toContain('liftAdvice === "easier"');
  });

  it("lets the level-up suggestion give way to the week-level notices", () => {
    expect(code).toMatch(
      /suppressed=\{liftAdvice === "recovery" \|\| liftAdvice === "deload"\}/
    );
  });
});
