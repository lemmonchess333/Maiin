import { describe, it, expect, beforeEach, vi } from "vitest";

// Capture lifecycle emissions at the analyticsClient boundary.
const emitSpy = vi.fn();
vi.mock("@/lib/analyticsClient", () => ({
  emit: (...args: unknown[]) => emitSpy(...args),
}));
vi.mock("../analyticsClient", () => ({
  emit: (...args: unknown[]) => emitSpy(...args),
}));

import { trackFirst, track } from "@/lib/lifecycleAnalytics";

describe("lifecycleAnalytics.trackFirst", () => {
  beforeEach(() => {
    emitSpy.mockClear();
    localStorage.clear();
  });

  it("emits the first time, then is a no-op for the same uid+event", () => {
    trackFirst("first_workout_completed", "u1");
    trackFirst("first_workout_completed", "u1");
    trackFirst("first_workout_completed", "u1");
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(
      "lifecycle",
      "first_workout_completed",
      {}
    );
  });

  it("dedups per event (different first_* events both fire once)", () => {
    trackFirst("first_run_started", "u1");
    trackFirst("first_food_logged", "u1");
    trackFirst("first_run_started", "u1"); // dup
    expect(emitSpy).toHaveBeenCalledTimes(2);
  });

  it("dedups per uid (a different user fires again)", () => {
    trackFirst("first_food_logged", "u1");
    trackFirst("first_food_logged", "u2");
    expect(emitSpy).toHaveBeenCalledTimes(2);
  });

  it("no-ops without a uid (never throws, never emits)", () => {
    trackFirst("first_plan_generated", undefined);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it("emits (rather than drops) when localStorage is unavailable", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("private mode");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("private mode");
      });
    trackFirst("first_workout_started", "u1");
    trackFirst("first_workout_started", "u1"); // no guard available → emits again
    expect(emitSpy).toHaveBeenCalledTimes(2);
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("plain track() still delegates to emit unconditionally", () => {
    track("onboarding_completed", { primaryGoal: "recomp" });
    track("onboarding_completed", { primaryGoal: "recomp" });
    expect(emitSpy).toHaveBeenCalledTimes(2);
  });
});
