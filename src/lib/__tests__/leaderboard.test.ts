import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { localDateString } from "../dateHelpers";

/**
 * leaderboard.ts builds a weekly leaderboard. The workouts query filters
 * `where('date', '>=', cutoff)` where `workout.date` is a LOCAL
 * "YYYY-MM-DD" string. The cutoff (`since` = local Sunday midnight) MUST
 * therefore be stringified with the LOCAL date helper, not
 * `since.toISOString().split('T')[0]` (UTC) — in positive-offset zones the
 * local-midnight instant is still the previous calendar day in UTC, so the
 * UTC stringify rolls the cutoff back to the previous Saturday and pulls an
 * extra day of workouts into the weekly window.
 *
 * This file pins the date-derivation invariant the fix relies on:
 * `localDateString(since)` is the local calendar date of `since` regardless
 * of timezone, and diverges from `toISOString()` for a local-midnight Date
 * in positive-offset zones. `leaderboardSessions.test.ts` drives
 * `buildLeaderboard` itself against the Firestore fake. The vitest runner is UTC, so that case is
 * exercised in a child process under TZ=Asia/Tokyo (UTC+9).
 */
describe("leaderboard weekly cutoff — local vs UTC date string", () => {
  it("localDateString returns the local calendar date (not UTC) for a midnight Date", () => {
    // Local Sunday midnight, the exact shape leaderboard's `since` takes.
    const since = new Date(2025, 0, 5, 0, 0, 0, 0);
    expect(localDateString(since)).toBe("2025-01-05");
  });

  it("uses the LOCAL date of `since` under a positive-offset TZ (regression)", () => {
    const helpersUrl = pathToFileURL(
      path.resolve(__dirname, "../dateHelpers.ts")
    ).href;
    // Reproduce leaderboard's `since` derivation under TZ=Asia/Tokyo (UTC+9):
    // Date() at a Sunday instant → rewind to local Sunday midnight. The local
    // cutoff must be 2025-01-05; the old toISOString() cutoff drifts back to
    // the previous Saturday because local midnight = 15:00 the prior day UTC.
    const script = `
      import { localDateString } from ${JSON.stringify(helpersUrl)};
      // pretend "now" is Sun 2025-01-05 09:00 local Tokyo
      const now = new Date(2025, 0, 5, 9, 0, 0);
      const since = new Date(now);
      since.setDate(since.getDate() - since.getDay()); // already Sunday
      since.setHours(0, 0, 0, 0);
      process.stdout.write(JSON.stringify({
        local: localDateString(since),
        utc: since.toISOString().split("T")[0],
      }));
    `;
    const out = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        env: { ...process.env, TZ: "Asia/Tokyo" },
        encoding: "utf8",
      }
    );
    const result = JSON.parse(out.trim().split("\n").pop() as string);
    expect(result.local).toBe("2025-01-05"); // correct cutoff (what the fix uses)
    expect(result.utc).toBe("2025-01-04"); // old buggy cutoff (previous Saturday)
    expect(result.local).not.toBe(result.utc); // fix is load-bearing in this TZ
  });
});

/* Lift18: the volume board ranks stored kg; an lb reader reads lb. */
describe("boardFigure", () => {
  it("converts the volume board, and only that one", async () => {
    const { boardFigure } = await import("../leaderboard");
    expect(boardFigure("weekly_volume", 4500, "kg")).toEqual({
      value: 4500,
      unit: "kg",
    });
    expect(boardFigure("weekly_volume", 4500, "lbs")).toEqual({
      value: 9921,
      unit: "lb",
    });
    expect(boardFigure("weekly_workouts", 4, "lbs")).toEqual({
      value: 4,
      unit: "sessions",
    });
  });
});
