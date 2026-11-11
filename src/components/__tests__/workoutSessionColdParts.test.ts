/**
 * The workout screen's chunk holds what every session draws. What only
 * some sessions open, or only at the end, loads on its own: the finish
 * screen, Finish's question about today's swaps, an exercise's menu, the
 * exercise picker, the empty session's screen and the Plate-Club rule run
 * after a save (Mob2 call 14).
 * `check-dist-size` holds the chunk's size; this holds which modules stay
 * out of it, since one static import brings a sheet back in without the
 * size moving past its tolerance on the day it lands.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = (rel: string) =>
  readFileSync(resolve(here, "../..", rel), "utf8");

/** Modules the screen imports statically: `import … from "…"`, type-only
 *  imports left out, since the build erases them. */
function staticImports(code: string): string[] {
  return [
    ...code.matchAll(/^import\s+(?!type\s)[^;]*?from\s+"([^"]+)";/gms),
  ].map(([, from]) => from);
}

const COLD = [
  "@/components/workout/SessionCompleteScreen",
  "@/components/workout/KeepSwapSheet",
  "@/components/workout/ExerciseMenuSheet",
  "@/components/workout/EmptySessionScreen",
  "@/components/program/ExercisePicker",
  "@/features/streaks/liftWeightMilestones",
];

describe("the workout screen's cold parts", () => {
  it("are not imported statically by the screen", () => {
    const imports = staticImports(source("components/WorkoutSession.tsx"));
    expect(imports.filter((from) => COLD.includes(from))).toEqual([]);
  });

  it("are each loaded on their own", () => {
    const code = source("components/WorkoutSession.tsx");
    for (const from of COLD) expect(code).toContain(`import("${from}")`);
  });
});
