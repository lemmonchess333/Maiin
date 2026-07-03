import { describe, it, expect } from "vitest";
import {
  buildWeeklyReview,
  weekBounds,
  inWeek,
  verdictFor,
  type WeeklyReviewData,
} from "../weeklyReviewViewModel";

/* Reviewed week: Sunday 2026-06-21 .. Saturday 2026-06-27. */
const WEEK = "2026-06-21";

function base(overrides: Partial<WeeklyReviewData> = {}): WeeklyReviewData {
  return {
    weekKey: WEEK,
    workouts: [],
    runs: [],
    mealDays: [],
    weighIns: [],
    prsHit: null,
    perf: null,
    prevPi: null,
    plannedLifts: null,
    plannedRuns: null,
    calorieTarget: null,
    adaptiveRetunedInWeek: false,
    hideWeightNumber: false,
    established: true,
    weekAhead: { lifts: 4, runs: 3, phaseNote: null },
    goalProgram: null,
    now: new Date("2026-06-28T10:00:00"),
    ...overrides,
  };
}

describe("weekBounds / inWeek", () => {
  it("computes Sun..Sat local bounds", () => {
    expect(weekBounds(WEEK)).toEqual({
      start: "2026-06-21",
      end: "2026-06-27",
    });
  });

  it("bounds are inclusive", () => {
    expect(inWeek("2026-06-21", WEEK)).toBe(true);
    expect(inWeek("2026-06-27", WEEK)).toBe(true);
    expect(inWeek("2026-06-20", WEEK)).toBe(false);
    expect(inWeek("2026-06-28", WEEK)).toBe(false);
  });
});

describe("eligibility (Q6 amended)", () => {
  it("empty week + NOT established → null (silence for brand-new users)", () => {
    expect(buildWeeklyReview(base({ established: false }))).toBeNull();
  });

  it("empty week + established → quiet variant with week-ahead only", () => {
    const r = buildWeeklyReview(base());
    expect(r?.kind).toBe("quiet");
    expect(r?.headline).toBeNull();
    expect(r?.training).toBeNull();
    expect(r?.nutrition).toBeNull();
    expect(r?.body).toBeNull();
    expect(r?.weekAhead).toEqual({ lifts: 4, runs: 3, phaseNote: null });
  });

  it("a discarded/invalid run still counts as a deliberate act (no quiet framing) but not as a stat", () => {
    const r = buildWeeklyReview(
      base({
        runs: [{ date: "2026-06-23", distanceMeters: 4000, eligible: false }],
      })
    );
    expect(r?.kind).toBe("normal");
    expect(r?.training).toBeNull(); // no ELIGIBLE runs, no lifts
  });

  it("out-of-week rows are ignored (defensive re-filter)", () => {
    const r = buildWeeklyReview(
      base({
        established: false,
        workouts: [{ date: "2026-06-28", tonnageKg: 1000 }], // next week
      })
    );
    expect(r).toBeNull();
  });
});

describe("headline (PI collapse + delta suppression)", () => {
  const perf = { pi: 68.4, loadBand: "moderate", deloadRecommended: false };

  it("collapses for a zero-training week even when a perf doc exists", () => {
    const r = buildWeeklyReview(
      base({
        mealDays: [{ date: "2026-06-22", calories: 2100 }],
        perf,
        prevPi: 60,
      })
    );
    expect(r?.kind).toBe("normal");
    expect(r?.headline).toBeNull();
  });

  it("renders PI (rounded) with delta when prior week has a PI", () => {
    const r = buildWeeklyReview(
      base({
        workouts: [{ date: "2026-06-22", tonnageKg: 5000 }],
        perf,
        prevPi: 62,
      })
    );
    expect(r?.headline?.pi).toBe(68);
    expect(r?.headline?.delta).toBe(6);
  });

  it("suppresses delta when the prior week has no PI (no vacation spikes)", () => {
    const r = buildWeeklyReview(
      base({
        workouts: [{ date: "2026-06-22", tonnageKg: 5000 }],
        perf,
        prevPi: null,
      })
    );
    expect(r?.headline?.delta).toBeNull();
  });

  it("deload week: negative delta suppressed, verdict says by-design", () => {
    const r = buildWeeklyReview(
      base({
        workouts: [{ date: "2026-06-22", tonnageKg: 2000 }],
        perf: { pi: 50, loadBand: "deload", deloadRecommended: true },
        prevPi: 68,
      })
    );
    expect(r?.headline?.delta).toBeNull();
    expect(r?.headline?.deload).toBe(true);
    expect(r?.headline?.verdict).toMatch(/by design/i);
  });

  it("deload week keeps a POSITIVE delta", () => {
    const r = buildWeeklyReview(
      base({
        workouts: [{ date: "2026-06-22", tonnageKg: 2000 }],
        perf: { pi: 70, loadBand: "deload", deloadRecommended: true },
        prevPi: 65,
      })
    );
    expect(r?.headline?.delta).toBe(5);
  });
});

describe("verdict templates (no AI)", () => {
  it("maps engine flags to fixed copy", () => {
    expect(
      verdictFor({ delta: -10, loadBand: "deload", deloadRecommended: false })
    ).toMatch(/by design/i);
    expect(
      verdictFor({ delta: 0, loadBand: "overreach", deloadRecommended: false })
    ).toMatch(/recovery/i);
    expect(
      verdictFor({ delta: 0, loadBand: "high", deloadRecommended: false })
    ).toMatch(/high/i);
    expect(
      verdictFor({ delta: 7, loadBand: "moderate", deloadRecommended: false })
    ).toMatch(/momentum/i);
    expect(
      verdictFor({ delta: -7, loadBand: "moderate", deloadRecommended: false })
    ).toMatch(/softer/i);
    expect(
      verdictFor({ delta: 1, loadBand: "moderate", deloadRecommended: false })
    ).toMatch(/steady/i);
  });
});

describe("training lanes", () => {
  it("counts only ELIGIBLE runs in stats; converts metres→km; finds longest", () => {
    const r = buildWeeklyReview(
      base({
        runs: [
          { date: "2026-06-22", distanceMeters: 5210, eligible: true },
          { date: "2026-06-24", distanceMeters: 10480, eligible: true },
          { date: "2026-06-25", distanceMeters: 9000, eligible: false },
        ],
      })
    );
    expect(r?.training?.runs).toEqual({
      count: 2,
      km: 15.7,
      longestKm: 10.5,
      planned: null, // freeform → done-only framing
    });
  });

  it("planned comparisons pass through only when a plan exists", () => {
    const r = buildWeeklyReview(
      base({
        workouts: [
          { date: "2026-06-22", tonnageKg: 5000.4 },
          { date: "2026-06-24", tonnageKg: 4999.8 },
        ],
        runs: [{ date: "2026-06-23", distanceMeters: 8000, eligible: true }],
        plannedLifts: 4,
        plannedRuns: 3,
      })
    );
    expect(r?.training?.lifts).toEqual({
      done: 2,
      planned: 4,
      tonnageKg: 10000,
    });
    expect(r?.training?.runs?.planned).toBe(3);
  });

  it("lanes collapse independently", () => {
    const r = buildWeeklyReview(
      base({ workouts: [{ date: "2026-06-22", tonnageKg: 3000 }] })
    );
    expect(r?.training?.lifts?.done).toBe(1);
    expect(r?.training?.runs).toBeNull();
  });
});

describe("nutrition (adherence-neutral)", () => {
  it("averages logged days and carries the retune flag", () => {
    const r = buildWeeklyReview(
      base({
        mealDays: [
          { date: "2026-06-22", calories: 2000 },
          { date: "2026-06-23", calories: 2300 },
        ],
        calorieTarget: 2200,
        adaptiveRetunedInWeek: true,
      })
    );
    expect(r?.nutrition).toEqual({
      daysLogged: 2,
      avgCalories: 2150,
      target: 2200,
      retuned: true,
    });
  });

  it("collapses when nothing was logged", () => {
    const r = buildWeeklyReview(
      base({ workouts: [{ date: "2026-06-22", tonnageKg: 100 }] })
    );
    expect(r?.nutrition).toBeNull();
  });
});

describe("body (trend + projection reuse + hide-the-number)", () => {
  // Daily weigh-ins for ~6 weeks (clears the T3 ≥1-month confidence
  // window), trending down toward the goal; ends inside the reviewed week.
  const history = Array.from({ length: 40 }, (_, i) => {
    const d = new Date(2026, 4, 19 + i); // 19 May → 27 Jun 2026
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `2026-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      weight: 80 - i * 0.07,
    };
  });

  it("renders delta + direction from the shared EMA, projection when confident", () => {
    const r = buildWeeklyReview(
      base({
        weighIns: history,
        goalProgram: { startWeight: 80, goal: "cut" }, // goal 75kg
      })
    );
    expect(r?.body).not.toBeNull();
    expect(r?.body?.hidden).toBe(false);
    expect(r?.body?.direction).toBe("down");
    expect(typeof r?.body?.deltaKg).toBe("number");
    expect(r?.body?.projectionDate).toBeTruthy();
  });

  it("hideWeightNumber → no figure, direction only", () => {
    const r = buildWeeklyReview(
      base({
        weighIns: history,
        hideWeightNumber: true,
        goalProgram: { startWeight: 80, goal: "cut" },
      })
    );
    expect(r?.body?.hidden).toBe(true);
    expect(r?.body?.deltaKg).toBeNull();
    expect(r?.body?.direction).toBe("down");
  });

  it("collapses without a weigh-in IN the week", () => {
    const older = history.filter((h) => h.date < "2026-06-21");
    const r = buildWeeklyReview(
      base({
        weighIns: older,
        workouts: [{ date: "2026-06-22", tonnageKg: 100 }],
      })
    );
    expect(r?.body).toBeNull();
  });

  it("collapses with fewer than 3 total weigh-ins (EMA floor)", () => {
    const r = buildWeeklyReview(
      base({
        weighIns: [
          { date: "2026-06-22", weight: 80 },
          { date: "2026-06-24", weight: 79.8 },
        ],
      })
    );
    expect(r?.body).toBeNull();
  });
});
