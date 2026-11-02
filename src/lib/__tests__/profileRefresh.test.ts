import { describe, expect, it } from "vitest";
import { profileShowsPatch } from "../profileRefresh";

describe("profileShowsPatch", () => {
  const patch = {
    runMode: "freeform",
    starterGoal: { startedOn: "2026-09-07", finishedOn: "2026-11-11" },
  };

  it("is false for the profile from before the write", () => {
    expect(
      profileShowsPatch(
        { runMode: "starter", starterGoal: { startedOn: "2026-09-07" } },
        patch
      )
    ).toBe(false);
  });

  it("is true once every field the patch sets reads as set, in any key order", () => {
    expect(
      profileShowsPatch(
        {
          displayName: "Sam",
          starterGoal: { finishedOn: "2026-11-11", startedOn: "2026-09-07" },
          runMode: "freeform",
        },
        patch
      )
    ).toBe(true);
  });

  it("reads a field the patch removes as shown once it is absent", () => {
    expect(
      profileShowsPatch({ runMode: "freeform" }, { raceGoal: undefined })
    ).toBe(true);
    expect(
      profileShowsPatch(
        { raceGoal: { distance: "5k" } },
        { raceGoal: undefined }
      )
    ).toBe(false);
  });

  it("tells arrays from objects", () => {
    expect(profileShowsPatch({ days: { 0: "mon" } }, { days: ["mon"] })).toBe(
      false
    );
  });
});
