import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ functions: {} }));

import { planSaveRejection } from "../liftPlanRebuild";
import { PLAN_SAVES_TOO_OFTEN } from "@/lib/callableErrors";

/** What a refused plan save says: one wording for the lift plan editor and
 *  Train's "Rebuild for N min". */
describe("planSaveRejection", () => {
  const changed = "Your plan changed. Check it and try again.";

  it("asks for a fresh sign-in when the session has gone", () => {
    expect(
      planSaveRejection({ code: "functions/unauthenticated" }, changed)
    ).toEqual({
      message: "Sign in again to update your plan.",
      refresh: false,
    });
  });

  it("reloads the plan when it changed elsewhere, with the caller's words", () => {
    expect(
      planSaveRejection({ code: "functions/failed-precondition" }, changed)
    ).toEqual({ message: changed, refresh: true });
  });

  it("uses the server's sentence when it wrote one", () => {
    const rejection = planSaveRejection(
      {
        code: "functions/failed-precondition",
        message: "Your run plan changed on another device.",
      },
      changed
    );
    expect(rejection.refresh).toBe(true);
    expect(rejection.message).not.toBe("");
  });

  it("says too many saves when rate limited", () => {
    expect(
      planSaveRejection({ code: "functions/resource-exhausted" }, changed)
        .message
    ).toBe(PLAN_SAVES_TOO_OFTEN);
  });

  it("falls back to try again", () => {
    expect(planSaveRejection(new Error("boom"), changed)).toEqual({
      message: "Couldn’t save your plan. Try again.",
      refresh: false,
    });
  });
});
