/**
 * The recovery-window predicate, now the single definition behind five
 * former hand-inlined copies (`useProgram` ×4, `runHeroState` ×1) plus
 * `resolveRunPlan.inRecovery`.
 *
 * Every copy agreed when they were collapsed, which is precisely why it was
 * worth doing before one stopped: the failure mode is silent. A rollover
 * that reads "not in recovery" regenerates a RACE plan for the coming week
 * and drops the recovery flags via makeRunPlanRecord — the user's post-race
 * easy week quietly becomes race training.
 */
import { describe, it, expect } from "vitest";
import { isInRecoveryOn, resolveRunPlan } from "../runPlanResolver";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

const recovering = { phase: "recovery", recoveryEndDate: "2026-06-10" };

describe("isInRecoveryOn", () => {
  it("is true strictly before the end date", () => {
    expect(isInRecoveryOn(recovering, "2026-06-09")).toBe(true);
  });

  it("is FALSE on the end date itself — the window is half-open", () => {
    // The boundary matters: `recoveryEnded` is the complement
    // (`>= recoveryEndDate`), so an inclusive reading here would make a user
    // both still-recovering and recovery-complete on the same day, and the
    // two surfaces that branch on them would disagree.
    expect(isInRecoveryOn(recovering, "2026-06-10")).toBe(false);
    expect(isInRecoveryOn(recovering, "2026-06-11")).toBe(false);
  });

  it("is false when the phase is not recovery, whatever the dates say", () => {
    expect(
      isInRecoveryOn(
        { phase: null, recoveryEndDate: "2026-06-10" },
        "2026-06-01"
      )
    ).toBe(false);
    expect(
      isInRecoveryOn({ recoveryEndDate: "2026-06-10" }, "2026-06-01")
    ).toBe(false);
  });

  it("is false for a recovery phase with NO end date", () => {
    // A phase flag with no window has no inside. Treating it as open-ended
    // would strand the user in recovery permanently, since nothing else
    // would ever move them out.
    expect(isInRecoveryOn({ phase: "recovery" }, "2026-06-01")).toBe(false);
    expect(
      isInRecoveryOn({ phase: "recovery", recoveryEndDate: null }, "2026-06-01")
    ).toBe(false);
  });

  it("tolerates a missing plan", () => {
    expect(isInRecoveryOn(null, "2026-06-01")).toBe(false);
    expect(isInRecoveryOn(undefined, "2026-06-01")).toBe(false);
  });

  it("answers about a FUTURE date, not today", () => {
    // The property two callers depend on: the week rollovers ask "will this
    // still be a recovery week when next week lands?". Binding the predicate
    // to today would have forced them to keep their own copies.
    expect(isInRecoveryOn(recovering, "2026-06-01")).toBe(true); // next week, still in
    expect(isInRecoveryOn(recovering, "2026-06-20")).toBe(false); // next week, out
  });
});

describe("isInRecoveryOn — agrees with resolveRunPlan", () => {
  it("matches `inRecovery` for the same plan and date", () => {
    // resolveRunPlan calls this internally, so the two cannot drift. Pinned
    // anyway: re-inlining the predicate there is exactly the regression this
    // consolidation exists to prevent, and it would be invisible otherwise.
    const profile = { runMode: "freeform" } as UserProfile;
    const programState = { runPlan: recovering } as unknown as ProgramState;

    for (const day of [
      "2026-06-01",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
    ]) {
      expect(resolveRunPlan(profile, programState, day).inRecovery).toBe(
        isInRecoveryOn(recovering, day)
      );
    }
  });
});
