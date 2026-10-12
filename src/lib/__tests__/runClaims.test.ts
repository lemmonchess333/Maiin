import { describe, expect, it } from "vitest";
import { claimableRuns, claimMapFor } from "../runClaims";
import type { SavedRun } from "../savedRuns";
import type { ScheduledRunDay } from "@/features/program/programTypes";

/* The claim map as a pure call, the way the simulator reads it. The rules
   themselves are pinned through the hook (useClaimMapForProgram.test.ts). */

function run(id: string, day: string, overrides: Partial<SavedRun> = {}) {
  return {
    id,
    distance: 5000,
    duration: 1800,
    avgPace: 360,
    elevationGain: 0,
    calories: 0,
    activityType: "outdoor",
    completedAt: new Date(`${day}T07:30:00`),
    day,
    relativeEffort: null,
    savedAtSeconds: 1,
    ...overrides,
  } satisfies SavedRun;
}

function runDay(
  id: string,
  date: string,
  templateId: string,
  type: ScheduledRunDay["type"]
): ScheduledRunDay {
  return { id, weekKey: date, date, dayIndex: 2, templateId, type };
}

describe("claimMapFor", () => {
  it("fills a planned day with a run that counts on its date", () => {
    const days = [runDay("d1", "2026-09-08", "easy_30", "easy")];
    const claims = claimMapFor(
      days,
      claimableRuns([run("r1", "2026-09-08")]),
      {},
      "2026-09-08"
    );
    expect(claims.get("d1")?.claimedSavedRunId).toBe("r1");
  });

  it("fills a planned tempo with the tempo done on the treadmill, by its type (Pgm8)", () => {
    const days = [runDay("d1", "2026-09-08", "tempo_30", "tempo")];
    // 5:30 /km on the belt: no pace that counts a run of no quality type.
    const since = claimMapFor(
      days,
      claimableRuns([
        run("r1", "2026-09-08", {
          activityType: "tempo",
          place: "treadmill",
          avgPace: 330,
        }),
      ]),
      {},
      "2026-09-08"
    );
    expect(since.get("d1")?.claimedSavedRunId).toBe("r1");
    // Saved before Pgm8, the treadmill was its type, and the same tempo
    // left the day to a mark by hand.
    const before = claimMapFor(
      days,
      claimableRuns([
        run("r1", "2026-09-08", { activityType: "treadmill", avgPace: 330 }),
      ]),
      {},
      "2026-09-08"
    );
    expect(before.get("d1")?.claimedSavedRunId).toBeUndefined();
  });

  it("leaves a day to a run saved anyway, and marks by hand still count", () => {
    const days = [runDay("d1", "2026-09-08", "easy_30", "easy")];
    const runs = claimableRuns([
      run("r1", "2026-09-08", { savedAnyway: true }),
    ]);
    expect(runs).toEqual([]);
    expect(runs).toBe(claimableRuns([]));
    const claims = claimMapFor(
      days,
      runs,
      { d1: { completedAt: new Date("2026-09-08T08:00:00") } },
      "2026-09-08"
    );
    expect(claims.get("d1")).toEqual({
      claimedSavedRunId: undefined,
      manualCompleted: true,
      legacyCompleted: false,
    });
  });
});
