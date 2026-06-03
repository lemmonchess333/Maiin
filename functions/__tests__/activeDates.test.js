/**
 * [push] functions/lib/activeDates.js — server-side active-date derivation.
 */
import { describe, it, expect } from "vitest";
import { activeDateKeysFromLogs } from "../lib/activeDates";

describe("activeDateKeysFromLogs", () => {
  it("uses workout + meal local date strings as-is", () => {
    const keys = activeDateKeysFromLogs(
      {
        workouts: [{ date: "2026-06-01" }],
        meals: [{ date: "2026-06-02", items: [{ x: 1 }] }],
      },
      "Europe/London"
    );
    expect(keys.sort()).toEqual(["2026-06-01", "2026-06-02"]);
  });

  it("excludes meals with no items", () => {
    const keys = activeDateKeysFromLogs(
      { meals: [{ date: "2026-06-02", items: [] }] },
      "Europe/London"
    );
    expect(keys).toEqual([]);
  });

  it("converts run timestamps to the user's local day", () => {
    // 23:00 UTC on 2026-06-01 → 08:00 next day in Tokyo (UTC+9) → 2026-06-02.
    const ms = Date.parse("2026-06-01T23:00:00Z");
    expect(
      activeDateKeysFromLogs({ runs: [{ completedAtMs: ms }] }, "Asia/Tokyo")
    ).toEqual(["2026-06-02"]);
    // Same instant in LA (UTC-7) is still 16:00 on 2026-06-01.
    expect(
      activeDateKeysFromLogs(
        { runs: [{ completedAtMs: ms }] },
        "America/Los_Angeles"
      )
    ).toEqual(["2026-06-01"]);
  });

  it("dedupes a day contributed by more than one source", () => {
    const ms = Date.parse("2026-06-01T12:00:00Z");
    const keys = activeDateKeysFromLogs(
      {
        workouts: [{ date: "2026-06-01" }],
        runs: [{ completedAtMs: ms }],
        meals: [{ date: "2026-06-01", items: [{ x: 1 }] }],
      },
      "Europe/London"
    );
    expect(keys).toEqual(["2026-06-01"]);
  });

  it("skips invalid run timestamps and empty input", () => {
    expect(
      activeDateKeysFromLogs({ runs: [{ completedAtMs: NaN }] }, "UTC")
    ).toEqual([]);
    expect(activeDateKeysFromLogs(null, "UTC")).toEqual([]);
  });
});
