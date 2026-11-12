import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSegmentColor, type SegmentType } from "@/lib/guidedRun";
import { ACTIVITY_TYPES } from "@/components/run/runConfigDefaults";

describe("getSegmentColor", () => {
  it("returns correct color for each segment type", () => {
    const expected: Record<SegmentType, string> = {
      warmup: "#e09510",
      easy: "#22b558",
      moderate: "#3b7ee6",
      hard: "#e04040",
      recovery: "#7B72E9",
      cooldown: "#06a8c8",
    };

    for (const [type, color] of Object.entries(expected)) {
      expect(getSegmentColor(type as SegmentType)).toBe(color);
    }
  });
});

/* Trim1 call 8 (the owner, 11 November 2026: "streamline all"). Running
   had two sources of sessions: the plan, which writes easy runs,
   intervals, tempo and long runs with their steps, and three fixed
   "guided" workouts picked in the run setup. The three are gone. */
describe("running has one source of sessions", () => {
  const read = (rel: string) =>
    readFileSync(resolve(__dirname, "../..", rel), "utf8");

  it("the run setup offers no guided run", () => {
    expect(ACTIVITY_TYPES.map((t) => t.type)).not.toContain("guided");
    const setup = read("components/run/RunSetupModal.tsx");
    expect(setup).not.toContain("GuidedRunPicker");
    expect(setup).not.toContain("guidedWorkout:");
  });

  it("the module holds no workouts of its own", () => {
    const src = read("lib/guidedRun.ts");
    expect(src).not.toContain("GUIDED_WORKOUTS");
    expect(src).not.toMatch(/durationSeconds:\s*\d/);
  });

  it("a run already begun from one is still given its steps", () => {
    /* The stored config carries the workout. Run reads it and draws it
       with the step shell every structured run uses; the overlay only
       guided runs had is gone. */
    const run = read("pages/Run.tsx");
    expect(run).toContain("segmentsFromGuided(config.guidedWorkout)");
    expect(run).not.toContain("GuidedRunOverlay");
    expect(run).not.toContain('activityType !== "guided"');
  });
});
