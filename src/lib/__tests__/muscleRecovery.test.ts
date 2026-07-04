/**
 * Per-muscle recovery model (Tier-2 #6 second half). Pins the date-based
 * window model, the primary/secondary half-window convention (shared with
 * weeklyVolumeByMuscle's 1.0/0.5 involvement), the most-binding-hit rule,
 * and the saved-doc → hits attribution (id first, name fallback,
 * unattributable lifts skipped).
 */
import { describe, it, expect } from "vitest";
import {
  computeMuscleRecovery,
  hitsFromWorkoutDocs,
  recoveryForHeatMapGroups,
  RECOVERY_WINDOW_DAYS,
  type MuscleHit,
} from "../muscleRecovery";
import { CANONICAL_MUSCLE_ORDER } from "@/features/program/volumeModel";

const TODAY = "2026-07-04";

function entry(
  entries: ReturnType<typeof computeMuscleRecovery>,
  muscle: string
) {
  const e = entries.find((x) => x.muscle === muscle);
  if (!e) throw new Error(`no entry for ${muscle}`);
  return e;
}

describe("computeMuscleRecovery", () => {
  it("trained today → recovering, full window remaining", () => {
    const hits: MuscleHit[] = [
      { muscle: "Chest", date: TODAY, involvement: "primary" },
    ];
    const chest = entry(computeMuscleRecovery(hits, TODAY), "Chest");
    expect(chest.status).toBe("recovering");
    expect(chest.fraction).toBe(0);
    expect(chest.readyInDays).toBe(RECOVERY_WINDOW_DAYS.Chest);
    expect(chest.lastTrained).toBe(TODAY);
  });

  it("large muscle 2 of 3 days through → nearly", () => {
    const hits: MuscleHit[] = [
      { muscle: "Quads", date: "2026-07-02", involvement: "primary" },
    ];
    const quads = entry(computeMuscleRecovery(hits, TODAY), "Quads");
    expect(quads.status).toBe("nearly");
    expect(quads.fraction).toBeCloseTo(2 / 3);
    expect(quads.readyInDays).toBe(1);
  });

  it("core trained yesterday (1-day window) → ready", () => {
    const hits: MuscleHit[] = [
      { muscle: "Core", date: "2026-07-03", involvement: "primary" },
    ];
    const core = entry(computeMuscleRecovery(hits, TODAY), "Core");
    expect(core.status).toBe("ready");
    expect(core.readyInDays).toBe(0);
  });

  it("never-trained muscles are ready with null lastTrained", () => {
    const entries = computeMuscleRecovery([], TODAY);
    expect(entries).toHaveLength(CANONICAL_MUSCLE_ORDER.length);
    for (const e of entries) {
      expect(e.status).toBe("ready");
      expect(e.lastTrained).toBeNull();
      expect(e.readyInDays).toBe(0);
    }
  });

  it("secondary involvement recovers over half the window", () => {
    // Triceps window 2 → secondary window ceil(2/2) = 1: yesterday → ready.
    const secondaryOnly: MuscleHit[] = [
      { muscle: "Triceps", date: "2026-07-03", involvement: "secondary" },
    ];
    expect(
      entry(computeMuscleRecovery(secondaryOnly, TODAY), "Triceps").status
    ).toBe("ready");
    // Same date as a PRIMARY hit → 1/2 through → nearly.
    const primary: MuscleHit[] = [
      { muscle: "Triceps", date: "2026-07-03", involvement: "primary" },
    ];
    expect(entry(computeMuscleRecovery(primary, TODAY), "Triceps").status).toBe(
      "nearly"
    );
  });

  it("the most-binding hit wins — a light secondary touch can't wash out a fresh primary session", () => {
    const hits: MuscleHit[] = [
      { muscle: "Chest", date: TODAY, involvement: "primary" },
      { muscle: "Chest", date: "2026-06-28", involvement: "secondary" },
    ];
    const chest = entry(computeMuscleRecovery(hits, TODAY), "Chest");
    expect(chest.status).toBe("recovering");
    expect(chest.lastTrained).toBe(TODAY); // most recent date, any involvement
  });

  it("future-dated hits (clock skew) clamp to 0 days since", () => {
    const hits: MuscleHit[] = [
      { muscle: "Back", date: "2026-07-06", involvement: "primary" },
    ];
    const back = entry(computeMuscleRecovery(hits, TODAY), "Back");
    expect(back.status).toBe("recovering");
    expect(back.fraction).toBe(0);
  });

  it("returns every canonical muscle in display order", () => {
    const entries = computeMuscleRecovery(
      [{ muscle: "Biceps", date: TODAY, involvement: "primary" }],
      TODAY
    );
    expect(entries.map((e) => e.muscle)).toEqual(CANONICAL_MUSCLE_ORDER);
  });
});

describe("hitsFromWorkoutDocs", () => {
  it("attributes by exerciseId with primary + secondary hits", () => {
    // Bench Press: Pectorals primary; Triceps + Front Delts secondary.
    const hits = hitsFromWorkoutDocs([
      {
        date: "2026-07-03",
        exercises: [{ exerciseId: "bench-press", exerciseName: "Bench Press" }],
      },
    ]);
    expect(hits).toContainEqual({
      muscle: "Chest",
      date: "2026-07-03",
      involvement: "primary",
    });
    expect(hits).toContainEqual({
      muscle: "Triceps",
      date: "2026-07-03",
      involvement: "secondary",
    });
    expect(hits).toContainEqual({
      muscle: "Shoulders",
      date: "2026-07-03",
      involvement: "secondary",
    });
  });

  it("falls back to name lookup when the id is missing (legacy docs)", () => {
    const hits = hitsFromWorkoutDocs([
      { date: "2026-07-03", exercises: [{ exerciseName: "Barbell Squat" }] },
    ]);
    expect(hits).toContainEqual({
      muscle: "Quads",
      date: "2026-07-03",
      involvement: "primary",
    });
    // Squat secondaries: Glutes, Hamstrings, Core.
    expect(hits.filter((h) => h.involvement === "secondary")).toHaveLength(3);
  });

  it("skips unknown exercises and malformed dates", () => {
    expect(
      hitsFromWorkoutDocs([
        { date: "2026-07-03", exercises: [{ exerciseName: "Made Up Lift" }] },
        {
          date: "not-a-date",
          exercises: [{ exerciseName: "Bench Press" }],
        },
        { exercises: [{ exerciseName: "Bench Press" }] },
      ])
    ).toEqual([]);
  });

  it("end-to-end: a bench day yesterday reads recovering chest, ready core", () => {
    const hits = hitsFromWorkoutDocs([
      {
        date: "2026-07-03",
        exercises: [{ exerciseId: "bench-press" }],
      },
    ]);
    const entries = computeMuscleRecovery(hits, TODAY);
    expect(entry(entries, "Chest").status).toBe("recovering");
    expect(entry(entries, "Core").status).toBe("ready");
  });
});

describe("recoveryForHeatMapGroups", () => {
  it("Legs aggregates its four muscles by the most-binding member", () => {
    // Quads trained today (recovering); calves ready → Legs must read
    // recovering with the quads' remaining days.
    const entries = computeMuscleRecovery(
      [{ muscle: "Quads", date: TODAY, involvement: "primary" }],
      TODAY
    );
    const groups = recoveryForHeatMapGroups(entries);
    expect(groups.Legs.status).toBe("recovering");
    expect(groups.Legs.readyInDays).toBe(RECOVERY_WINDOW_DAYS.Quads);
  });

  it("simple groups mirror their single muscle; untrained groups read ready", () => {
    const entries = computeMuscleRecovery(
      [{ muscle: "Chest", date: "2026-07-02", involvement: "primary" }],
      TODAY
    );
    const groups = recoveryForHeatMapGroups(entries);
    expect(groups.Chest.status).toBe("nearly"); // 2/3 through
    expect(groups.Back.status).toBe("ready");
    expect(groups.Back.readyInDays).toBe(0);
  });

  it("legacy alias rows resolve and Full Body is omitted (no honest single state)", () => {
    const entries = computeMuscleRecovery(
      [{ muscle: "Back", date: TODAY, involvement: "primary" }],
      TODAY
    );
    const groups = recoveryForHeatMapGroups(entries);
    expect(groups["Lats"].status).toBe("recovering");
    expect(groups["Hamstrings & Back"].status).toBe("recovering");
    expect(groups["Full Body"]).toBeUndefined();
  });
});
