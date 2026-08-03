/**
 * Experience auto-detection — the behavioural classifier over main-lift
 * history. Each threshold is pinned with LITERAL fixtures (not values
 * computed by the module under test), and the failure modes the module's
 * header claims to handle each get a test that fails if the handling is
 * removed:
 *   - a FLAT window alone is a deload candidate, NOT phase exhaustion —
 *     promotion demands honest misses AND a survived reset (Rippetoe's
 *     2–3-resets protocol, the v2 gates)
 *   - a stall during a cut is expected physiology — suppressed
 *   - the programme must be ≥6 weeks old, the window inside 21–84 days
 *   - double-progression rep climbs must read as progress (e1RM, not load)
 *   - a one-week deload dip must not fake a stall (max-of-halves)
 *   - bodyweight/failed records carry no load signal
 *   - accessories never vote
 *   - advanced users are never classified
 */
import { describe, it, expect } from "vitest";

import {
  detectExperienceSuggestion,
  suggestionSignature,
  MIN_AGREEING_LIFTS,
  MIN_RECORDS_PER_LIFT,
  MIN_SPAN_DAYS,
  MAX_SPAN_DAYS,
  MIN_PROGRAM_WEEKS,
} from "../experienceDetection";
import type {
  PerformanceRecord,
  ProgramExercise,
  WorkoutDay,
} from "../programTypes";

/** Weekly records, one per week starting 2026-01-05 (a Monday). */
function weekly(
  entries: Array<{ weight: number; reps: number }>
): PerformanceRecord[] {
  return entries.map((e, i) => {
    const d = new Date(2026, 0, 5 + i * 7);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      date,
      weight: e.weight,
      repsCompleted: e.reps,
      repsTarget: e.reps,
    };
  });
}

function main(
  exerciseId: string,
  history: PerformanceRecord[],
  over: Partial<ProgramExercise> = {}
): ProgramExercise {
  return {
    name: exerciseId,
    exerciseId,
    instanceId: `i-${exerciseId}`,
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 8,
    baseReps: 8,
    weight: history[history.length - 1]?.weight ?? 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: history,
    lastPerformance: null,
    ...over,
  } as ProgramExercise;
}

function week(...exercises: ProgramExercise[]): WorkoutDay[] {
  return [
    { dayName: "Day A", dayType: "upper", completed: false, exercises },
  ] as WorkoutDay[];
}

// 6 weekly sessions, e1RM dead flat (60×8 every week, 35-day span).
const FLAT = weekly(Array.from({ length: 6 }, () => ({ weight: 60, reps: 8 })));
// 6 weekly sessions climbing every week, +2.5 kg per session (~19% total).
const CLIMB = weekly(
  Array.from({ length: 6 }, (_, i) => ({ weight: 60 + i * 2.5, reps: 8 }))
);
// The REAL phase-exhaustion shape (Rippetoe): honest misses, a ~4.2% reset,
// a rebuild that only reaches the old ceiling, another miss. Weekly reps
// are ACTUAL completions; the target is 8 throughout (repsTarget below).
// e1RMs: 76, 72, 72, 72.8, 76, 74 — flat by max-of-halves (76 vs 76), three
// sessions under target, and the dip's rebuild never beat the pre-dip high.
const STALL_WITH_RESET: PerformanceRecord[] = weekly([
  { weight: 60, reps: 8 },
  { weight: 60, reps: 6 },
  { weight: 60, reps: 6 },
  { weight: 57.5, reps: 8 }, // the reset (60 → 57.5)
  { weight: 60, reps: 8 }, // rebuilt…
  { weight: 60, reps: 7 }, // …to the same ceiling, and missed again
]).map((r) => ({ ...r, repsTarget: 8 }));
/** Context that satisfies the programme-level gates. */
const MATURE = { weekNumber: 8, nutritionGoal: "recomp" };

describe("data floors", () => {
  it("cold start (no history) → null", () => {
    expect(
      detectExperienceSuggestion(week(main("bench-press", [])), "beginner")
    ).toBeNull();
  });

  it("fewer than the minimum records → null", () => {
    const short = FLAT.slice(0, MIN_RECORDS_PER_LIFT - 1);
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", short), main("squat", short)),
        "beginner"
      )
    ).toBeNull();
  });

  it("enough records crammed into too few days → null", () => {
    // 6 sessions on consecutive days: span 5 days < MIN_SPAN_DAYS.
    const dense = Array.from({ length: 6 }, (_, i) => ({
      ...FLAT[i],
      date: `2026-01-${String(5 + i).padStart(2, "0")}`,
    }));
    expect(MIN_SPAN_DAYS).toBe(21);
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", dense), main("squat", dense)),
        "beginner"
      )
    ).toBeNull();
  });

  it("one stalled lift is not enough — lifts must agree", () => {
    expect(MIN_AGREEING_LIFTS).toBe(2);
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", STALL_WITH_RESET), main("squat", CLIMB)),
        "beginner",
        MATURE
      )
    ).toBeNull();
  });

  it("six sessions scattered over four months are inconsistency, not a ceiling", () => {
    // Same exhaustion shape, but one session every ~3 weeks: span 110 days
    // > MAX_SPAN_DAYS. Detraining between sessions explains the flat line.
    expect(MAX_SPAN_DAYS).toBe(84);
    const scattered = STALL_WITH_RESET.map((r, i) => {
      const d = new Date(2026, 0, 5 + i * 22);
      return {
        ...r,
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      };
    });
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", scattered), main("squat", scattered)),
        "beginner",
        MATURE
      )
    ).toBeNull();
  });
});

describe("beginner → intermediate (linear progress exhausted)", () => {
  it("fires ONLY on the full exhaustion shape: flat + misses + survived reset", () => {
    const out = detectExperienceSuggestion(
      week(
        main("bench-press", STALL_WITH_RESET),
        main("squat", STALL_WITH_RESET)
      ),
      "beginner",
      MATURE
    );
    expect(out).not.toBeNull();
    expect(out?.to).toBe("intermediate");
    expect(out?.reason).toBe("linear_progress_exhausted");
    expect(out?.evidence.map((e) => e.exerciseId).sort()).toEqual([
      "bench-press",
      "squat",
    ]);
    expect(out?.evidence[0].sessions).toBe(6);
    expect(out?.evidence[0].spanDays).toBe(35);
    // The evidence carries what the card must be able to SHOW: real misses
    // and a reset that failed to restart progress.
    expect(out?.evidence[0].failedSessions).toBe(3);
    expect(out?.evidence[0].resetSurvived).toBe(true);
  });

  it("a flat ALL-HITS window is a deload candidate, NOT a promotion", () => {
    // The objection this v2 exists for: "you haven't progressed" can just
    // mean "you need a deload". A dead-flat window with every rep target
    // hit and no reset in evidence has ruled nothing out — the engines
    // advance a compliant lifter automatically, so this shape is the
    // engine holding, or fatigue. Silence.
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", FLAT), main("squat", FLAT)),
        "beginner",
        MATURE
      )
    ).toBeNull();
  });

  it("a reset dip followed by all-HIT sessions is not exhaustion — no honest misses", () => {
    // The calendar deload's own shape: load dips, then every target is hit
    // (RPE holds keep the number flat). The rebuild never exceeding the old
    // high makes the dip read as "survived" — but with zero misses the
    // lifter never actually failed anything, so nothing was exhausted.
    const dipAllHits = weekly([
      { weight: 60, reps: 8 },
      { weight: 60, reps: 8 },
      { weight: 57.5, reps: 8 }, // deload week
      { weight: 60, reps: 8 },
      { weight: 60, reps: 8 },
      { weight: 60, reps: 8 },
    ]);
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", dipAllHits), main("squat", dipAllHits)),
        "beginner",
        MATURE
      )
    ).toBeNull();
  });

  it("misses WITHOUT a reset are still not exhaustion — reset must be tried first", () => {
    // Grinding and missing, but no back-off ever happened: Rippetoe's
    // protocol says reset ~10% and rebuild BEFORE concluding the phase is
    // over. The engine's own backoff will produce the dip; until it does,
    // this is a plateau being worked, not a graduation.
    const missesNoReset = STALL_WITH_RESET.map((r) => ({
      ...r,
      weight: 60, // flatten the dip away
    }));
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", missesNoReset), main("squat", missesNoReset)),
        "beginner",
        MATURE
      )
    ).toBeNull();
  });

  it("a stall during a CUT is expected physiology — suppressed", () => {
    expect(
      detectExperienceSuggestion(
        week(
          main("bench-press", STALL_WITH_RESET),
          main("squat", STALL_WITH_RESET)
        ),
        "beginner",
        { weekNumber: 8, nutritionGoal: "cut" }
      )
    ).toBeNull();
  });

  it("programme maturity gates promotion: young or unknown tenure → null", () => {
    expect(MIN_PROGRAM_WEEKS).toBe(6);
    const days = week(
      main("bench-press", STALL_WITH_RESET),
      main("squat", STALL_WITH_RESET)
    );
    // Younger than one full mesocycle + deload:
    expect(
      detectExperienceSuggestion(days, "beginner", {
        weekNumber: 4,
        nutritionGoal: "recomp",
      })
    ).toBeNull();
    // Unprovable tenure fails SAFE:
    expect(detectExperienceSuggestion(days, "beginner")).toBeNull();
  });

  it("a double-progression rep climb is PROGRESS, not a stall", () => {
    // Weight pinned at 60 while completed reps climb 8→12: raw load is
    // flat, e1RM rises ~13%. A weight-based classifier fails here.
    const repClimb = weekly([
      { weight: 60, reps: 8 },
      { weight: 60, reps: 9 },
      { weight: 60, reps: 9 },
      { weight: 60, reps: 10 },
      { weight: 60, reps: 11 },
      { weight: 60, reps: 12 },
    ]);
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", repClimb), main("squat", repClimb)),
        "beginner"
      )
    ).toBeNull();
  });

  it("a one-week deload dip does not fake a stall", () => {
    // Still gaining overall; session 4 is the deload week (load ×0.85).
    const withDeload = weekly([
      { weight: 60, reps: 8 },
      { weight: 62.5, reps: 8 },
      { weight: 65, reps: 8 },
      { weight: 55, reps: 8 }, // deload
      { weight: 67.5, reps: 8 },
      { weight: 70, reps: 8 },
    ]);
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", withDeload), main("squat", withDeload)),
        "beginner"
      )
    ).toBeNull();
  });

  it("a window ENDING on the deload session does not fake a stall", () => {
    // The case max-of-halves exists for: the user opens the app during the
    // deload week, so the LAST record is the deliberately light one. An
    // endpoint comparison reads 59.5 vs 60 as a stall; the halves' maxima
    // (65 → 70) show the truth.
    const endsOnDeload = weekly([
      { weight: 60, reps: 8 },
      { weight: 62.5, reps: 8 },
      { weight: 65, reps: 8 },
      { weight: 67.5, reps: 8 },
      { weight: 70, reps: 8 },
      { weight: 59.5, reps: 8 }, // deload is the latest session
    ]);
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", endsOnDeload), main("squat", endsOnDeload)),
        "beginner"
      )
    ).toBeNull();
  });

  it("bodyweight and failed records carry no signal", () => {
    // All-zero weights (pull-ups) and zero-rep failures: no classifiable
    // history at all → null, not a phantom stall.
    const zeros = weekly(
      Array.from({ length: 6 }, () => ({ weight: 0, reps: 10 }))
    );
    const fails = FLAT.map((r) => ({ ...r, repsCompleted: 0 }));
    expect(
      detectExperienceSuggestion(
        week(main("pull-ups", zeros), main("squat", fails)),
        "beginner"
      )
    ).toBeNull();
  });

  it("accessories never vote", () => {
    expect(
      detectExperienceSuggestion(
        week(
          main("lat-pulldown", STALL_WITH_RESET, { isAccessory: true }),
          main("cable-fly", STALL_WITH_RESET, { isAccessory: true }),
          main("bench-press", CLIMB)
        ),
        "beginner",
        MATURE
      )
    ).toBeNull();
  });

  it("a lift with two weekly slots qualifies through EITHER slot", () => {
    // Slot 1 too short, slot 2 carries the evidence — the stalled slot
    // must win the merge.
    const days: WorkoutDay[] = [
      ...week(
        main("bench-press", STALL_WITH_RESET.slice(0, 3)),
        main("squat", STALL_WITH_RESET)
      ),
      ...week(main("bench-press", STALL_WITH_RESET)),
    ];
    const out = detectExperienceSuggestion(days, "beginner", MATURE);
    expect(out?.to).toBe("intermediate");
  });
});

describe("intermediate → beginner (novice window still open)", () => {
  it("two mains climbing every session suggest the simpler scheme", () => {
    const out = detectExperienceSuggestion(
      week(main("bench-press", CLIMB), main("squat", CLIMB)),
      "intermediate"
    );
    expect(out?.to).toBe("beginner");
    expect(out?.reason).toBe("novice_window_active");
    expect(out?.evidence).toHaveLength(2);
  });

  it("tolerates exactly one down-week in the climb (the deload)", () => {
    const climbWithDip = weekly([
      { weight: 60, reps: 8 },
      { weight: 62.5, reps: 8 },
      { weight: 65, reps: 8 },
      { weight: 55, reps: 8 }, // deload breaks one delta
      { weight: 67.5, reps: 8 },
      { weight: 70, reps: 8 },
    ]);
    const out = detectExperienceSuggestion(
      week(main("bench-press", climbWithDip), main("squat", climbWithDip)),
      "intermediate"
    );
    expect(out?.to).toBe("beginner");
  });

  it("jitter around a flat line is not a climb (total-gain floor)", () => {
    // 4 of 5 deltas positive but only +1.7% total — noise, not a window.
    const jitter = weekly([
      { weight: 60, reps: 8 },
      { weight: 60.5, reps: 8 },
      { weight: 60.25, reps: 8 },
      { weight: 60.75, reps: 8 },
      { weight: 61, reps: 8 },
      { weight: 61, reps: 9 },
    ]);
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", jitter), main("squat", jitter)),
        "intermediate"
      )
    ).toBeNull();
  });

  it("a stalled intermediate gets NO suggestion — that state is correct", () => {
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", FLAT), main("squat", FLAT)),
        "intermediate"
      )
    ).toBeNull();
  });
});

describe("boundaries the module promises", () => {
  it("advanced users are never classified, whatever the evidence", () => {
    expect(
      detectExperienceSuggestion(
        week(main("bench-press", CLIMB), main("squat", CLIMB)),
        "advanced",
        MATURE
      )
    ).toBeNull();
    expect(
      detectExperienceSuggestion(
        week(
          main("bench-press", STALL_WITH_RESET),
          main("squat", STALL_WITH_RESET)
        ),
        "advanced",
        MATURE
      )
    ).toBeNull();
  });

  it("unknown/legacy stored values coerce to intermediate behaviour", () => {
    // toExperience coerces garbage to "intermediate", whose only suggestion
    // direction is the novice window.
    const out = detectExperienceSuggestion(
      week(main("bench-press", CLIMB), main("squat", CLIMB)),
      "Novice"
    );
    expect(out?.to).toBe("beginner");
  });

  it("suggestionSignature is stable per (to, reason)", () => {
    const a = detectExperienceSuggestion(
      week(
        main("bench-press", STALL_WITH_RESET),
        main("squat", STALL_WITH_RESET)
      ),
      "beginner",
      MATURE
    );
    expect(a && suggestionSignature(a)).toBe(
      "intermediate:linear_progress_exhausted"
    );
  });
});
