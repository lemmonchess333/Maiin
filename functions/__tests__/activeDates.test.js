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
      activeDateKeysFromLogs(
        { runs: [{ completedAtMs: ms, distance: 5000, duration: 1800 }] },
        "Asia/Tokyo"
      )
    ).toEqual(["2026-06-02"]);
    // Same instant in LA (UTC-7) is still 16:00 on 2026-06-01.
    expect(
      activeDateKeysFromLogs(
        { runs: [{ completedAtMs: ms, distance: 5000, duration: 1800 }] },
        "America/Los_Angeles"
      )
    ).toEqual(["2026-06-01"]);
  });

  it("dedupes a day contributed by more than one source", () => {
    const ms = Date.parse("2026-06-01T12:00:00Z");
    const keys = activeDateKeysFromLogs(
      {
        workouts: [{ date: "2026-06-01" }],
        runs: [{ completedAtMs: ms, distance: 5000, duration: 1800 }],
        meals: [{ date: "2026-06-01", items: [{ x: 1 }] }],
      },
      "Europe/London"
    );
    expect(keys).toEqual(["2026-06-01"]);
  });

  it("skips invalid run timestamps and empty input", () => {
    expect(
      activeDateKeysFromLogs(
        { runs: [{ completedAtMs: NaN, distance: 5000, duration: 1800 }] },
        "UTC"
      )
    ).toEqual([]);
    expect(activeDateKeysFromLogs(null, "UTC")).toEqual([]);
  });

  it("junk runs contribute NO active day — same gate as the client's snapshot boundary", () => {
    // Pre-fix, every run doc counted: a saved-anyway 0:02 record made
    // today look "active" server-side, so the streak nudge skipped the
    // one user whose real streak (which the client refuses to credit
    // for that run) was about to break at midnight.
    const ms = Date.parse("2026-06-01T12:00:00Z");
    const junk = [
      { completedAtMs: ms, distance: 5000, duration: 1800, isInvalid: true },
      { completedAtMs: ms, distance: 5000, duration: 1800, savedAnyway: true },
      { completedAtMs: ms, distance: 20, duration: 1800 }, // sub-50m
      { completedAtMs: ms, distance: 5000, duration: 2 }, // sub-30s
      { completedAtMs: ms }, // legacy row with no eligibility fields at all
    ];
    expect(activeDateKeysFromLogs({ runs: junk }, "UTC")).toEqual([]);
    // …and an eligible run alongside them still counts exactly once.
    expect(
      activeDateKeysFromLogs(
        {
          runs: [
            ...junk,
            { completedAtMs: ms, distance: 5000, duration: 1800 },
          ],
        },
        "UTC"
      )
    ).toEqual(["2026-06-01"]);
  });
});
