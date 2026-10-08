/**
 * #1038 — stable per-instance exercise ids for the reorderable Programme list.
 *
 * `exerciseId` is NOT unique (the same exercise can appear twice in a day), so
 * it can't key a dnd-kit sortable / swipe-delete list. `normalizeExercise`
 * assigns a stable `instanceId` lazily (kept once present), so:
 *   - drag/swipe-delete reconcile by exercise, not by position;
 *   - the read-time persist-if-changed guard only writes once (idempotent);
 *   - legacy plans backfill without a dedicated migration.
 *
 * These pin the invariants the Program.tsx render + handleDragEnd rely on.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeExercise,
  normalizeProgramState,
  generateInstanceId,
  setInstanceIdSource,
} from "../programTypes";
import type { ProgramState } from "../programTypes";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import {
  sequentialInstanceIds,
  useSequentialInstanceIds,
} from "@/test/instanceIds";

describe("instanceId — #1038", () => {
  it("assigns an instanceId when one is missing", () => {
    const ex = normalizeExercise({ name: "Squat", exerciseId: "squat" });
    expect(ex.instanceId).toBeTruthy();
    expect(typeof ex.instanceId).toBe("string");
  });

  it("preserves an existing instanceId (idempotent)", () => {
    const first = normalizeExercise({ name: "Squat", exerciseId: "squat" });
    const again = normalizeExercise(first);
    expect(again.instanceId).toBe(first.instanceId);
  });

  it("gives two exercises with the SAME exerciseId DIFFERENT ids (the duplicate case the fix exists for)", () => {
    const a = normalizeExercise({ name: "Squat", exerciseId: "squat" });
    const b = normalizeExercise({ name: "Squat", exerciseId: "squat" });
    expect(a.instanceId).not.toBe(b.instanceId);
  });

  it("generateInstanceId returns unique-ish values", () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => generateInstanceId())
    );
    expect(ids.size).toBe(100);
  });

  describe("normalizeProgramState backfill", () => {
    const stateWithBareExercises = {
      workouts: [
        {
          dayIndex: 0,
          name: "Day 1",
          exercises: [
            { name: "Squat", exerciseId: "squat" },
            { name: "Bench", exerciseId: "bench" },
            { name: "Squat", exerciseId: "squat" }, // duplicate exerciseId
          ],
        },
      ],
    } as unknown as ProgramState;

    it("assigns an instanceId to every exercise on load", () => {
      const result = normalizeProgramState(stateWithBareExercises);
      const ids = result.workouts[0].exercises.map((e) => e.instanceId);
      expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
        true
      );
      // All three unique — including the two squats.
      expect(new Set(ids).size).toBe(3);
    });

    it("is idempotent — re-normalizing keeps the same ids (so the persist-if-changed guard only writes once)", () => {
      const once = normalizeProgramState(stateWithBareExercises);
      const twice = normalizeProgramState(once);
      expect(twice.workouts[0].exercises.map((e) => e.instanceId)).toEqual(
        once.workouts[0].exercises.map((e) => e.instanceId)
      );
    });
  });
});

/* The simulator's determinism seam (training-engine prompt, Phase 1 item 4):
   a plan built twice must come out identical, or a seeded persona's trace
   can't be compared from one run to the next. Instance ids were the one
   random part. */
describe("the instance-id source", () => {
  const draft: OnboardingDraft = {
    step: 7,
    primaryGoal: "hypertrophy",
    daysPerWeek: 4,
    equipment: "full_gym",
    runFrequency: "none",
    runMode: "freeform",
    weeklyRunDays: 0,
    raceDistance: "10k",
    raceTargetDate: "",
    injuries: ["none"],
    gender: "male",
    ageRange: "25-34",
    heightCm: 175,
    weightKg: 81.5,
    heightUnit: "cm",
    weightUnit: "kg",
    trainingWhy: "",
    experience: "intermediate",
  };
  const build = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 7, 12));
    const plan = buildOnboardingPlan(draft, "recomp", "2026-09-07");
    vi.useRealTimers();
    return plan;
  };
  const ids = (plan: ReturnType<typeof build>) =>
    plan.programState.workouts.flatMap((day) =>
      day.exercises.map((ex) => ex.instanceId)
    );

  afterEach(() => {
    vi.useRealTimers();
  });

  it("draws from a swapped source, and its restore puts the random one back", () => {
    const restore = setInstanceIdSource(sequentialInstanceIds("t"));
    expect([generateInstanceId(), generateInstanceId()]).toEqual([
      "t-1",
      "t-2",
    ]);
    restore();
    expect(generateInstanceId()).not.toMatch(/^t-/);
  });

  it("gives two builds of the same plan different ids by default", () => {
    expect(ids(build())).not.toEqual(ids(build()));
  });

  describe("with sequential ids", () => {
    useSequentialInstanceIds();

    it("builds the same plan twice", () => {
      const first = build();
      setInstanceIdSource(sequentialInstanceIds());
      const second = build();
      expect(ids(first).every((id) => /^ex-\d+$/.test(id ?? ""))).toBe(true);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
  });
});
