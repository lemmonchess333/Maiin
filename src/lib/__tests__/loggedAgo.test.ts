import { describe, it, expect } from "vitest";
import { loggedAgo } from "../loggedAgo";

describe("loggedAgo", () => {
  it("counts calendar days, whatever the time of day", () => {
    expect(loggedAgo("2026-10-09", "2026-10-09")).toBe("Logged today");
    expect(loggedAgo("2026-10-08", "2026-10-09")).toBe("Logged yesterday");
    // Wednesday's weigh-in seen on Friday morning.
    expect(loggedAgo("2026-10-07", "2026-10-09")).toBe("Logged 2d ago");
  });

  it("goes to weeks, then months", () => {
    expect(loggedAgo("2026-10-01", "2026-10-09")).toBe("Logged 1w ago");
    expect(loggedAgo("2026-08-01", "2026-10-09")).toBe("Logged 2mo ago");
  });

  it("is one day across a clock change", () => {
    // UK clocks go back on 25 October 2026.
    expect(loggedAgo("2026-10-25", "2026-10-26")).toBe("Logged yesterday");
  });
});
