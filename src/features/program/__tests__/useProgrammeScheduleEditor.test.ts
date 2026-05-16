/**
 * P0-7: pins the schedule-editor behaviour extracted from Settings.tsx.
 *
 * The hook is the single source of truth for weekly-schedule edits,
 * consumed today by TrainingSection and (from P0-8 onwards) by
 * Programme's Run/Week tabs. Drift between the two surfaces is the
 * exact regression class this suite is designed to catch.
 *
 * Why renderHook + injected fakes (no firestore mock):
 *   The hook deliberately takes its side-effect surface — updateProfile,
 *   refreshRunSchedule, regenerateProgram — as injected callables. So
 *   tests don't have to mock firebase: pass a vi.fn() and assert on
 *   the call shape.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProgrammeScheduleEditor } from "../useProgrammeScheduleEditor";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import type { ScheduleDay } from "@/lib/scheduleUtils";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    weeklyWorkoutsTarget: 4,
    weeklyRunDaysTarget: 2,
    runMode: "structured",
    ...overrides,
  } as UserProfile;
}

const okResult: UpdateProfileResult = { ok: true } as UpdateProfileResult;

function makeArgs(profileOverrides: Partial<UserProfile> = {}) {
  const updateProfile = vi.fn<(data: Partial<UserProfile>, opts?: unknown) => Promise<UpdateProfileResult>>(
    async () => okResult,
  );
  // PR-0b-ii: refreshRunSchedule now accepts optional overrides.
  // Mock signature widens to match so apply-path assertions can
  // inspect the schedule arg.
  const refreshRunSchedule = vi.fn<
    (overrides?: { weekSchedule?: ScheduleDay[]; weeklyRunDaysTarget?: number }) => Promise<void>
  >(async () => {});
  const regenerateProgram = vi.fn<
    (
      goalOverride?: string,
      weeklyTargetOverride?: number,
      overrides?: { weekSchedule?: ScheduleDay[]; weeklyRunDaysTarget?: number },
    ) => Promise<void>
  >(async () => {});
  return {
    profile: makeProfile(profileOverrides),
    updateProfile,
    refreshRunSchedule,
    regenerateProgram,
  };
}

describe("useProgrammeScheduleEditor — initial state", () => {
  it("derives workoutsTarget + runsTarget from the profile", () => {
    const args = makeArgs({ weeklyWorkoutsTarget: 5, weeklyRunDaysTarget: 3 });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    expect(result.current.workoutsTarget).toBe(5);
    expect(result.current.runsTarget).toBe(3);
  });

  it("uses custom weekSchedule when the profile has a 7-entry one", () => {
    const ws: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "run" },
      { day: 5, type: "rest" },
      { day: 6, type: "lift" },
    ];
    const args = makeArgs({ weekSchedule: ws });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    expect(result.current.schedule).toEqual(ws);
    expect(result.current.hasUnsavedScheduleChanges).toBe(false);
  });

  it("falls back to generateSchedule when profile.weekSchedule is missing", () => {
    const { result } = renderHook(() => useProgrammeScheduleEditor(makeArgs()));
    // 4 lift + 2 run → 6 active days + 1 rest, never 7 (generateSchedule's
    // contract). We don't pin the exact arrangement here — just shape.
    expect(result.current.schedule.length).toBe(7);
    expect(result.current.hasUnsavedScheduleChanges).toBe(false);
  });
});

describe("useProgrammeScheduleEditor — handleDayToggle", () => {
  it("cycles rest → lift → run → both → rest", () => {
    const { result } = renderHook(() => useProgrammeScheduleEditor(makeArgs()));
    // Find a rest day to start from — generateSchedule(4, 2) produces
    // at least one rest day.
    const restDay = result.current.schedule.find((d) => d.type === "rest");
    expect(restDay).toBeDefined();
    const dayIdx = restDay!.day;

    act(() => result.current.handleDayToggle(dayIdx));
    expect(result.current.schedule.find((d) => d.day === dayIdx)!.type).toBe("lift");

    act(() => result.current.handleDayToggle(dayIdx));
    expect(result.current.schedule.find((d) => d.day === dayIdx)!.type).toBe("run");

    act(() => result.current.handleDayToggle(dayIdx));
    expect(result.current.schedule.find((d) => d.day === dayIdx)!.type).toBe("both");

    act(() => result.current.handleDayToggle(dayIdx));
    expect(result.current.schedule.find((d) => d.day === dayIdx)!.type).toBe("rest");
  });

  it("re-counts lift + run targets after every cycle", () => {
    // Pin a known schedule so we can predict the cycle result.
    const ws: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "run" },
      { day: 5, type: "rest" },
      { day: 6, type: "rest" },
    ];
    const args = makeArgs({ weekSchedule: ws, weeklyWorkoutsTarget: 2, weeklyRunDaysTarget: 2 });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    // Day 6 is rest → cycling once makes it lift; lift count → 3.
    act(() => result.current.handleDayToggle(6));
    expect(result.current.workoutsTarget).toBe(3);
    expect(result.current.runsTarget).toBe(2);
    // Cycle again → run; lift back to 2, run → 3.
    act(() => result.current.handleDayToggle(6));
    expect(result.current.workoutsTarget).toBe(2);
    expect(result.current.runsTarget).toBe(3);
    // Cycle again → both; counts as 1 lift + 1 run.
    act(() => result.current.handleDayToggle(6));
    expect(result.current.workoutsTarget).toBe(3);
    expect(result.current.runsTarget).toBe(3);
  });

  it("sets hasUnsavedScheduleChanges only after a real edit", () => {
    const ws: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "rest" },
      { day: 3, type: "rest" },
      { day: 4, type: "rest" },
      { day: 5, type: "rest" },
      { day: 6, type: "rest" },
    ];
    const args = makeArgs({ weekSchedule: ws });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    expect(result.current.hasUnsavedScheduleChanges).toBe(false);
    act(() => result.current.handleDayToggle(0));
    expect(result.current.hasUnsavedScheduleChanges).toBe(true);
  });
});

describe("useProgrammeScheduleEditor — handleApplyScheduleChanges", () => {
  it("plain update when the lift-day count is unchanged", async () => {
    const ws: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "run" },
      { day: 5, type: "rest" },
      { day: 6, type: "lift" },
    ];
    const args = makeArgs({ weekSchedule: ws, weeklyWorkoutsTarget: 3, weeklyRunDaysTarget: 2 });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    await act(async () => {
      await result.current.handleApplyScheduleChanges();
    });
    expect(args.updateProfile).toHaveBeenCalledOnce();
    expect(args.refreshRunSchedule).toHaveBeenCalledOnce();
    expect(result.current.showRestructureModal).toBe(false);
  });

  it("opens the restructure modal when the lift-day count changed", async () => {
    const ws: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "run" },
      { day: 5, type: "rest" },
      { day: 6, type: "lift" },
    ];
    const args = makeArgs({ weekSchedule: ws, weeklyWorkoutsTarget: 3, weeklyRunDaysTarget: 2 });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    // Cycle day 5 (rest) → lift → lift count goes 3 → 4.
    act(() => result.current.handleDayToggle(5));
    await act(async () => {
      await result.current.handleApplyScheduleChanges();
    });
    expect(result.current.showRestructureModal).toBe(true);
    expect(result.current.pendingLiftDays).toBe(4);
    // No write should fire before user confirms.
    expect(args.updateProfile).not.toHaveBeenCalled();
    expect(args.regenerateProgram).not.toHaveBeenCalled();
  });

  it("freeform users skip refreshRunSchedule on plain update", async () => {
    // Same-lift-count change but profile.runMode = "freeform" — we
    // shouldn't waste a refresh call when the run scheduler doesn't
    // apply.
    const ws: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "rest" },
      { day: 3, type: "lift" },
      { day: 4, type: "rest" },
      { day: 5, type: "lift" },
      { day: 6, type: "lift" },
    ];
    const args = makeArgs({
      weekSchedule: ws,
      weeklyWorkoutsTarget: 4,
      weeklyRunDaysTarget: 0,
      runMode: "freeform",
    });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    await act(async () => {
      await result.current.handleApplyScheduleChanges();
    });
    expect(args.updateProfile).toHaveBeenCalledOnce();
    expect(args.refreshRunSchedule).not.toHaveBeenCalled();
  });
});

describe("useProgrammeScheduleEditor — restructure flow", () => {
  it("confirm path writes profile + regenerates + closes modal", async () => {
    const ws: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "run" },
      { day: 5, type: "rest" },
      { day: 6, type: "lift" },
    ];
    const args = makeArgs({ weekSchedule: ws, weeklyWorkoutsTarget: 3, weeklyRunDaysTarget: 2 });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    act(() => result.current.handleDayToggle(5)); // rest → lift → 4 lift days
    await act(async () => {
      await result.current.handleApplyScheduleChanges();
    });
    expect(result.current.showRestructureModal).toBe(true);
    await act(async () => {
      await result.current.handleConfirmRestructure();
    });
    expect(args.updateProfile).toHaveBeenCalledOnce();
    expect(args.regenerateProgram).toHaveBeenCalledOnce();
    const [goalOverride, weeklyTargetOverride, overrides] =
      args.regenerateProgram.mock.calls[0];
    expect(goalOverride).toBeUndefined();
    expect(weeklyTargetOverride).toBe(4);
    expect(overrides).toMatchObject({ weeklyRunDaysTarget: 2 });
    expect(result.current.showRestructureModal).toBe(false);
    expect(result.current.pendingLiftDays).toBeNull();
    expect(result.current.restructuring).toBe(false);
  });

  it("cancelRestructure closes the modal without writes", async () => {
    const ws: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "run" },
      { day: 5, type: "rest" },
      { day: 6, type: "lift" },
    ];
    const args = makeArgs({ weekSchedule: ws, weeklyWorkoutsTarget: 3, weeklyRunDaysTarget: 2 });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    act(() => result.current.handleDayToggle(5));
    await act(async () => {
      await result.current.handleApplyScheduleChanges();
    });
    expect(result.current.showRestructureModal).toBe(true);
    act(() => result.current.cancelRestructure());
    expect(result.current.showRestructureModal).toBe(false);
    expect(result.current.pendingLiftDays).toBeNull();
    expect(args.updateProfile).not.toHaveBeenCalled();
    expect(args.regenerateProgram).not.toHaveBeenCalled();
  });
});

// ─── PR-0b-ii — stale-schedule fix + restructure cleanup ─────────────

describe("PR-0b-ii — apply uses the confirmed schedule, not stale profile.weekSchedule", () => {
  it("passes the freshly-confirmed schedule to refreshRunSchedule via overrides", async () => {
    // Profile starts with one schedule; the user toggles a day to
    // produce a different schedule; apply should pass the NEW
    // schedule explicitly so refreshRunSchedule doesn't read the
    // stale profile.weekSchedule from the closure.
    const oldSchedule: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "rest" },
      { day: 3, type: "lift" },
      { day: 4, type: "rest" },
      { day: 5, type: "lift" },
      { day: 6, type: "rest" },
    ];
    const args = makeArgs({
      weekSchedule: oldSchedule,
      weeklyWorkoutsTarget: 3,
      weeklyRunDaysTarget: 0,
      runMode: "structured",
    });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));

    // Toggle a rest day → cycle to lift (changes the lift count
    // count is unchanged staying with apply path, not restructure).
    // Actually toggling will change lift count. To stay in the
    // apply path (same lift-count), we tweak only run vs rest in
    // a way that keeps lift count constant.
    //
    // Simpler: profile has 3 lift days; toggling day 0 takes us
    // through rest→lift (4 lift) → restructure. So instead we
    // start with a schedule that has 0 run days and toggle a rest
    // day twice to land on run (lift count unchanged).
    act(() => result.current.handleDayToggle(0));   // rest → lift
    act(() => result.current.handleDayToggle(0));   // lift → run
    // Now schedule has 3 lift + 1 run + 3 rest, same lift count
    // (3) → apply path, not restructure.

    await act(async () => {
      await result.current.handleApplyScheduleChanges();
    });

    // Apply path takes restructure-or-not branch on lift count.
    // With lift count unchanged, refreshRunSchedule must have
    // been called with overrides containing the toggled schedule.
    expect(args.refreshRunSchedule).toHaveBeenCalledOnce();
    const callArg = args.refreshRunSchedule.mock.calls[0][0];
    expect(callArg).toBeDefined();
    expect(callArg!.weekSchedule).toBeDefined();
    // Day 0 has type "run" in the override, NOT "rest" from the
    // stale profile.
    const day0 = callArg!.weekSchedule!.find((d) => d.day === 0);
    expect(day0?.type).toBe("run");
    // weeklyRunDaysTarget is also threaded through.
    expect(callArg!.weeklyRunDaysTarget).toBe(1);
  });
});

describe("PR-0b-ii — restructure no longer triggers redundant refreshRunSchedule", () => {
  it("does NOT call refreshRunSchedule after handleConfirmRestructure", async () => {
    const ws: ScheduleDay[] = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "run" },
      { day: 5, type: "rest" },
      { day: 6, type: "lift" },
    ];
    const args = makeArgs({ weekSchedule: ws, weeklyWorkoutsTarget: 3, weeklyRunDaysTarget: 2 });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    act(() => result.current.handleDayToggle(5)); // bump to 4 lift days
    await act(async () => {
      await result.current.handleApplyScheduleChanges();
    });
    await act(async () => {
      await result.current.handleConfirmRestructure();
    });

    // regenerateProgram already used the confirmed schedule via
    // its `overrides` arg. A trailing refreshRunSchedule would
    // re-write the same runDays against the same schedule for no
    // benefit. PR-0b-ii drops the redundant call.
    expect(args.regenerateProgram).toHaveBeenCalledOnce();
    expect(args.refreshRunSchedule).not.toHaveBeenCalled();
  });
});

describe("useProgrammeScheduleEditor — PR-2 zero-as-zero", () => {
  it("runsTarget initialises to 0 when getWeeklyRunTarget returns 0", () => {
    // Pre-PR-2 the initialiser was `getWeeklyRunTarget(profile) || 2`
    // — a user with weeklyRunDaysTarget:0 (legitimate freeform setup)
    // would see the editor open with 2 selected. Tapping Apply could
    // then silently restore 2 runs to a user who deliberately removed
    // them. The fix: `getWeeklyRunTarget(profile)` alone; zero stays
    // zero.
    const args = makeArgs({ weeklyRunDaysTarget: 0, weeklyRunsTarget: 0 });
    const { result } = renderHook(() => useProgrammeScheduleEditor(args));
    expect(result.current.runsTarget).toBe(0);
  });

  it("a fresh remount (sheet re-opens) re-reads runsTarget from the latest profile", () => {
    // PR-2 hydration contract: ScheduleLayoutSheet mounts/unmounts
    // its body component on every open transition, so the hook's
    // useState initialisers fire fresh each open. Simulate that
    // here by re-mounting the hook against a changed profile and
    // asserting the new value surfaces.
    const argsA = makeArgs({ weeklyRunDaysTarget: 0, weeklyRunsTarget: 0 });
    const { result: resultA, unmount } = renderHook(() =>
      useProgrammeScheduleEditor(argsA),
    );
    expect(resultA.current.runsTarget).toBe(0);
    unmount();

    // Profile updated externally between opens (e.g. Configure Plan
    // ran a save). Next mount must reflect it.
    const argsB = makeArgs({ weeklyRunDaysTarget: 3, weeklyRunsTarget: 3 });
    const { result: resultB } = renderHook(() =>
      useProgrammeScheduleEditor(argsB),
    );
    expect(resultB.current.runsTarget).toBe(3);
  });
});
