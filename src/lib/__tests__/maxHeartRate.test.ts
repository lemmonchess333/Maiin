import { describe, it, expect } from "vitest";
import { profileMaxHr } from "../maxHeartRate";

const today = "2026-11-23";

describe("profileMaxHr", () => {
  it("estimates from a real year of birth", () => {
    // Born 1998: 28 on 23 November 2026, so 208 − 0.7 × 28 = 188.4.
    expect(profileMaxHr({ birthYear: 1998 }, today)).toEqual({
      maxHr: 188,
      source: "estimate",
    });
  });

  it("does not draw zones on an age nobody was let keep", () => {
    // The owner's 207 bpm: a stored age of 2 (or a year of birth of 2024)
    // read as an age.
    expect(profileMaxHr({ age: 2 }, today)).toEqual({
      maxHr: 0,
      source: "unknown",
    });
    expect(profileMaxHr({ birthYear: 2024 }, today).maxHr).toBe(0);
  });

  it("puts a measured max first, and reads a stored 0 or null as none", () => {
    expect(profileMaxHr({ maxHeartRate: 192, birthYear: 1998 }, today)).toEqual(
      { maxHr: 192, source: "measured" }
    );
    expect(profileMaxHr({ maxHeartRate: 0, birthYear: 1998 }, today)).toEqual({
      maxHr: 188,
      source: "estimate",
    });
    expect(
      profileMaxHr({ maxHeartRate: null, birthYear: 1998 }, today).source
    ).toBe("estimate");
  });

  it("is unknown with neither", () => {
    expect(profileMaxHr({}, today)).toEqual({ maxHr: 0, source: "unknown" });
    expect(profileMaxHr(null, today).source).toBe("unknown");
  });
});
