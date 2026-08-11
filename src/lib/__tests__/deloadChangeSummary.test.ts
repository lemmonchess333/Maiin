/**
 * The deload banner has to describe everything the reduction changed.
 *
 * Since the deload grew a run half (#1930) it described only the lift
 * side — "one set fewer and slightly lower targets, at the same weights"
 * — while the athlete's Tuesday tempo had quietly become a shorter one.
 * The applied rule says a reduction must "state whether sets, reps, load,
 * exercise stress, or schedule changed", and a run swap is a change to
 * exercise stress that nothing said out loud.
 *
 * Same shape as LIFT-EV-03, which was resolved once already for the lift
 * recipe. The run half reintroduced it on a new axis.
 *
 * The count is DERIVED from the snapshot rather than stored, which is
 * what makes it self-correcting across the two deload paths — and those
 * genuinely differ:
 *
 *   - the user-applied deload sends `runSwaps`, so the days differ;
 *   - the AUTOMATIC week-4 deload runs through `advanceWeek`, which is
 *     lift-only (`programEngine.ts` contains no `runDays` reference at
 *     all), so the runs are regenerated at full prescription and there is
 *     nothing to report.
 *
 * A stored count would also be a second thing to keep in step with a week
 * that `moveRunDay`, `transitionRunDay` and the ease week all mutate.
 */
import { describe, it, expect } from "vitest";
import { deloadRunSwapCount } from "../deloadChangeSummary";
import type { ProgramState } from "@/features/program/programTypes";

type Input = Parameters<typeof deloadRunSwapCount>[0];

const day = (id: string, templateId: string) =>
  ({
    id,
    dayIndex: 2,
    templateId,
    type: "tempo",
    status: "planned",
  }) as never;

function state(over: Partial<ProgramState> = {}): Input {
  return {
    weekNumber: 5,
    runDays: [day("run-1", "tempo_30"), day("run-2", "5x1k")],
    deloadSnapshot: {
      weekNumber: 5,
      workouts: [],
      runDays: [day("run-1", "tempo_40"), day("run-2", "6x1k")],
      currentPhase: "progression",
      fatigueScore: 10,
      appliedAt: 1,
    },
    ...over,
  } as Input;
}

describe("deloadRunSwapCount", () => {
  it("counts the days the deload actually stepped down", () => {
    expect(deloadRunSwapCount(state())).toBe(2);
  });

  it("counts only what changed, not the whole week", () => {
    // One day was at a ladder floor and skipped, so it reads the same on
    // both sides. Reporting 2 here would overstate what the athlete's week
    // lost, which is the sort of small lie this fix exists to remove.
    expect(
      deloadRunSwapCount(
        state({
          runDays: [day("run-1", "tempo_30"), day("run-2", "6x1k")] as never,
        })
      )
    ).toBe(1);
  });

  it("reports nothing for the AUTOMATIC week-4 deload", () => {
    /* That path goes through `advanceWeek`, which never touches runDays,
       so no snapshot is written. Silence is the correct copy there, and
       it falls out of the derivation rather than needing its own branch. */
    expect(deloadRunSwapCount(state({ deloadSnapshot: undefined }))).toBe(0);
  });

  it("ignores a snapshot stranded by a rollover", () => {
    // It describes a week the athlete has left; its run list has nothing
    // to say about the one they are in.
    expect(deloadRunSwapCount(state({ weekNumber: 6 }))).toBe(0);
  });

  it("tolerates a snapshot written before the run half shipped", () => {
    // `runDays` is optional on the type for exactly this reason, and the
    // server's revert guards on Array.isArray for the same one.
    const s = state();
    const snap = { ...s!.deloadSnapshot! };
    delete (snap as { runDays?: unknown }).runDays;
    expect(deloadRunSwapCount({ ...s!, deloadSnapshot: snap } as Input)).toBe(0);
  });

  it("does not count a day that only exists on one side", () => {
    // A day added or removed since the deload is not a swap — the week
    // changed shape, which is a different fact and not this one.
    expect(
      deloadRunSwapCount(
        state({ runDays: [day("run-3", "easy_40")] as never })
      )
    ).toBe(0);
  });

  it("is safe on absent state", () => {
    expect(deloadRunSwapCount(null)).toBe(0);
    expect(deloadRunSwapCount(undefined)).toBe(0);
  });
});
