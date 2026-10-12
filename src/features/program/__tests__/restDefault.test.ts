/**
 * The rest timer and its setting say the same thing.
 *
 * It was one number, shown and used, after the select once read "2:00"
 * while the session rested 1:30. Lift4 (5) replaced the number with the
 * plan's suggestion by role and reps (`restTime.ts`), and the setting with a
 * choice between that and a fixed rest. So an untouched setting has to read
 * "Plan's suggestion", which is what the session then does.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { restSecondsFor } from "../restTime";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

describe("rest between sets", () => {
  it("an untouched setting reads the plan's suggestion", () => {
    expect(read("src/pages/settings/SettingsWorkoutPrefs.tsx")).toMatch(
      /defaultRestSeconds \?\? 0/
    );
    expect(read("src/components/settings/WorkoutPrefsSection.tsx")).toMatch(
      /<option value=\{0\}>Plan's suggestion<\/option>/
    );
  });

  it("and the session then rests as the plan suggests", () => {
    const bench = { exerciseId: "bench-press", reps: 5 };
    expect(restSecondsFor(bench, {})).toBe(180);
    expect(restSecondsFor(bench, { fixedRest: 0 })).toBe(180);
    // a fixed rest is fixed, even in a plan built for 30 minutes
    expect(restSecondsFor(bench, { fixedRest: 120 })).toBe(120);
    expect(restSecondsFor(bench, { fixedRest: 120, sessionMinutes: 30 })).toBe(
      120
    );
  });

  it("the session asks the rule, not a number of its own", () => {
    expect(read("src/components/WorkoutSession.tsx")).toMatch(
      /restSecondsFor\(exercise, \{ fixedRest, sessionMinutes \}\)/
    );
  });
});
