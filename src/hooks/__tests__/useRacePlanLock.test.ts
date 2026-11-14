/**
 * The free week of a half or full marathon plan is once per account
 * (whole-app grill Q85's gap): the hook records it on the profile the first
 * time a free account's plan passes it, and reads it back for a later plan.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRacePlanLocked } from "../useRacePlanLock";

let profile: Record<string, unknown> | null = null;
let isPro = false;
const updateProfile = vi.fn(async () => ({ ok: true as const }));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile, updateProfile }),
}));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro }),
}));

const marathonPlan = (currentWeek: number, extra = {}) => ({
  mode: "race_prep",
  currentWeek,
  raceGoal: { distance: "marathon" },
  ...extra,
});

afterEach(() => {
  profile = null;
  isPro = false;
  updateProfile.mockClear();
});

describe("useRacePlanLocked: one free week per account", () => {
  it("a first plan's first week is free, and records nothing", () => {
    profile = { uid: "u1", raceGoal: { distance: "marathon" } };
    const { result } = renderHook(() => useRacePlanLocked(marathonPlan(0)));
    expect(result.current).toBe(false);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("records the free week once the first plan passes it", async () => {
    profile = { uid: "u1", raceGoal: { distance: "marathon" } };
    const { result } = renderHook(() => useRacePlanLocked(marathonPlan(1)));
    expect(result.current).toBe(true);
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        { racePlanFreeWeekUsed: true },
        { throwOnError: true }
      )
    );
    expect(updateProfile).toHaveBeenCalledTimes(1);
  });

  it("a later plan after the free week was used is locked from its first week, and records nothing again", () => {
    profile = {
      uid: "u1",
      raceGoal: { distance: "half" },
      racePlanFreeWeekUsed: true,
    };
    const { result } = renderHook(() => useRacePlanLocked(marathonPlan(0)));
    expect(result.current).toBe(true);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("a later plan before the free week was used keeps its first week", () => {
    profile = { uid: "u1", raceGoal: { distance: "half" } };
    const { result } = renderHook(() => useRacePlanLocked(marathonPlan(0)));
    expect(result.current).toBe(false);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("race recovery stays free after the free week was used", () => {
    profile = {
      uid: "u1",
      raceGoal: { distance: "marathon" },
      racePlanFreeWeekUsed: true,
    };
    const { result } = renderHook(() =>
      useRacePlanLocked(marathonPlan(15, { phase: "recovery" }))
    );
    expect(result.current).toBe(false);
  });

  it("Pro and trials are never locked and never record it", () => {
    isPro = true;
    profile = { uid: "u1", raceGoal: { distance: "marathon" } };
    const { result } = renderHook(() => useRacePlanLocked(marathonPlan(6)));
    expect(result.current).toBe(false);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("a refused write leaves the plan locked and says nothing", async () => {
    updateProfile.mockRejectedValueOnce(new Error("permission-denied"));
    profile = { uid: "u1", raceGoal: { distance: "marathon" } };
    const { result } = renderHook(() => useRacePlanLocked(marathonPlan(2)));
    expect(result.current).toBe(true);
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
  });
});
