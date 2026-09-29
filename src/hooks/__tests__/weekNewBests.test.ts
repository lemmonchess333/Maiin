/**
 * weekNewBests — the weekly recap's new bests: how many the week's
 * sessions fired, and the one its Best moment card shows.
 *
 * The count was `countWeekPRs` until DS3's recap needed the best itself
 * as well; the count is now read off the same pass, so the two cannot
 * disagree about which sets counted.
 *
 * What it must replay is the LIVE gate: the recap is a claim about what
 * that week's sessions celebrated, and the sessions refuse warm-ups and
 * timed holds via isSetEligibleForStrengthPr before firing anything. The
 * ungated version counted both — a warm-up that happened to beat a bucket,
 * and a hold whose longer duration read as same-weight-more-reps — so the
 * recap could report PRs no session ever showed.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { weekNewBests } from "../useWeeklyReview";

type Docs = Parameters<typeof weekNewBests>[0];

/** The count half: how many new bests the week fired. */
const countWeekPRs = (baseline: Docs, week: Docs) =>
  weekNewBests(baseline, week).count;

/** ≥3 baseline sessions so the min-session gate is open. */
function baseline(exerciseName: string, weightKg: number, reps: number) {
  return ["2026-07-01", "2026-07-08", "2026-07-15"].map((date) => ({
    date,
    exercises: [{ exerciseName, sets: [{ weightKg, reps }] }],
  }));
}

describe("weekNewBests — how many the week fired", () => {
  it("counts a working set that beats the baseline", () => {
    expect(
      countWeekPRs(baseline("Bench", 100, 5), [
        {
          date: "2026-08-11",
          exercises: [
            {
              exerciseName: "Bench",
              sets: [{ weightKg: 102.5, reps: 5, type: "working" }],
            },
          ],
        },
      ])
    ).toBe(1);
  });

  it("counts a pre-D2 set with no type field as working", () => {
    /* Older documents carry no `type` at all; absent has always meant
       working (export.ts's documented default). A gate that read absence
       as ineligible would zero the recap for exactly the users with the
       longest histories. */
    expect(
      countWeekPRs(baseline("Bench", 100, 5), [
        {
          date: "2026-08-11",
          exercises: [
            { exerciseName: "Bench", sets: [{ weightKg: 102.5, reps: 5 }] },
          ],
        },
      ])
    ).toBe(1);
  });

  it("does not count a warm-up, even one that beats a bucket", () => {
    /* The same 102.5×5 that counts above, tagged as the warm-up ramp the
       session generated. The live session fired nothing for it; the recap
       must not claim otherwise. */
    expect(
      countWeekPRs(baseline("Bench", 100, 5), [
        {
          date: "2026-08-11",
          exercises: [
            {
              exerciseName: "Bench",
              sets: [{ weightKg: 102.5, reps: 5, type: "warmup" }],
            },
          ],
        },
      ])
    ).toBe(0);
  });

  it("does not count a hold that progressed, and a longer hold is not more reps", () => {
    /* 60 s → 75 s at the same 20 kg. Ungated, the 75 lands in the same
       "10rm" bucket and the same-weight-more-reps tiebreak fires a "PR"
       for what is a duration improvement — an axis the app already
       celebrates elsewhere ("Longest hold"), not here. */
    const holdBaseline = ["2026-07-01", "2026-07-08", "2026-07-15"].map(
      (date) => ({
        date,
        exercises: [
          {
            exerciseName: "Weighted Plank",
            repUnit: "seconds" as const,
            sets: [{ weightKg: 20, reps: 60 }],
          },
        ],
      })
    );
    expect(
      countWeekPRs(holdBaseline, [
        {
          date: "2026-08-11",
          exercises: [
            {
              exerciseName: "Weighted Plank",
              repUnit: "seconds",
              sets: [{ weightKg: 20, reps: 75, type: "working" }],
            },
          ],
        },
      ])
    ).toBe(0);
  });

  it("a mixed session counts only its eligible sets", () => {
    // One recap number, three set kinds — only the working set's PR is real.
    expect(
      countWeekPRs(baseline("Bench", 100, 5), [
        {
          date: "2026-08-11",
          exercises: [
            {
              exerciseName: "Bench",
              sets: [
                { weightKg: 105, reps: 5, type: "warmup" },
                { weightKg: 102.5, reps: 5, type: "working" },
              ],
            },
            {
              exerciseName: "Weighted Plank",
              repUnit: "seconds",
              sets: [{ weightKg: 20, reps: 90, type: "working" }],
            },
          ],
        },
      ])
    ).toBe(1);
  });
});

describe("weekNewBests — the recap's Best moment", () => {
  const session = (
    date: string,
    sets: { exerciseName: string; weightKg: number; reps: number }[]
  ) => ({
    date,
    exercises: sets.map(({ exerciseName, weightKg, reps }) => ({
      exerciseName,
      sets: [{ weightKg, reps, type: "working" }],
    })),
  });

  it("names the best that moved furthest past what it beat", () => {
    const history = [
      ...baseline("Bench", 100, 5),
      ...baseline("Squat", 140, 5),
    ];
    const { count, best } = weekNewBests(history, [
      // Bench 100 -> 102.5 at 5 reps is +2.5%; squat 140 -> 150 is +7.1%.
      session("2026-08-11", [
        { exerciseName: "Bench", weightKg: 102.5, reps: 5 },
      ]),
      session("2026-08-13", [
        { exerciseName: "Squat", weightKg: 150, reps: 5 },
      ]),
    ]);
    expect(count).toBe(2);
    expect(best).toEqual({
      exerciseId: null,
      exerciseName: "Squat",
      weight: 150,
      reps: 5,
      date: "2026-08-13",
      // The best dates from the session that first set it; matching it
      // later does not move it.
      previous: { weight: 140, reps: 5, date: "2026-07-01" },
    });
  });

  it("measures the gain against the best it beat, not the heavier lift", () => {
    // 20 kg on curls is a smaller number than 150 kg on squat, and the
    // bigger step: +25% against +3.6%.
    const { best } = weekNewBests(
      [...baseline("Curl", 16, 8), ...baseline("Squat", 145, 5)],
      [
        session("2026-08-11", [
          { exerciseName: "Squat", weightKg: 150, reps: 5 },
          { exerciseName: "Curl", weightKg: 20, reps: 8 },
        ]),
      ]
    );
    expect(best?.exerciseName).toBe("Curl");
  });

  it("gives a tie to the later session", () => {
    const { best } = weekNewBests(
      [...baseline("Bench", 100, 5), ...baseline("Row", 100, 5)],
      [
        session("2026-08-11", [
          { exerciseName: "Bench", weightKg: 105, reps: 5 },
        ]),
        session("2026-08-14", [
          { exerciseName: "Row", weightKg: 105, reps: 5 },
        ]),
      ]
    );
    expect(best?.exerciseName).toBe("Row");
  });

  it("is empty when nothing beat a best", () => {
    expect(
      weekNewBests(baseline("Bench", 100, 5), [
        session("2026-08-11", [
          { exerciseName: "Bench", weightKg: 95, reps: 5 },
        ]),
      ])
    ).toEqual({ count: 0, best: null });
  });
});

describe("weekNewBests — one new best per exercise and rep range", () => {
  /* The recap is a week-level claim, so a best the same week went on to
     beat is not the week's best, and beating it twice is one new best,
     not two. Measured against the running record, Monday's 102.5 (+2.5%
     on 100) outranked Thursday's 105 (+2.4% on 102.5), and the card read
     "New best Bench 102.5 kg × 5 … And 1 more new best this week" for a
     week whose bench best was 105. The finish screen already keys its
     bests by exercise and rep range; the recap now counts the same way. */
  const bench = (date: string, ...weights: number[]) => ({
    date,
    exercises: [
      {
        exerciseName: "Bench",
        sets: weights.map((weightKg) => ({ weightKg, reps: 5 })),
      },
    ],
  });
  const beforeTheWeek = { weight: 100, reps: 5, date: "2026-07-01" };

  it("names the later, bigger best, against the best before the week", () => {
    expect(
      weekNewBests(baseline("Bench", 100, 5), [
        bench("2026-08-10", 102.5),
        bench("2026-08-13", 105),
      ])
    ).toEqual({
      count: 1,
      best: {
        exerciseId: null,
        exerciseName: "Bench",
        weight: 105,
        reps: 5,
        date: "2026-08-13",
        previous: beforeTheWeek,
      },
    });
  });

  it("counts one session's climbing sets as one new best, the top one", () => {
    expect(
      weekNewBests(baseline("Bench", 100, 5), [
        bench("2026-08-10", 102.5, 105, 107.5),
      ])
    ).toEqual({
      count: 1,
      best: {
        exerciseId: null,
        exerciseName: "Bench",
        weight: 107.5,
        reps: 5,
        date: "2026-08-10",
        previous: beforeTheWeek,
      },
    });
  });

  it("counts a best in another rep range as another new best", () => {
    // 115 × 3 (≈126.5) beat Monday's 105 × 5 (≈122.5), so Thursday's
    // session fired a best of its own, in the 3-rep range.
    const { count, best } = weekNewBests(baseline("Bench", 100, 5), [
      bench("2026-08-10", 105),
      {
        date: "2026-08-13",
        exercises: [
          { exerciseName: "Bench", sets: [{ weightKg: 115, reps: 3 }] },
        ],
      },
    ]);
    expect(count).toBe(2);
    expect(best).toMatchObject({
      weight: 115,
      reps: 3,
      previous: beforeTheWeek,
    });
  });

  it("still judges each set as its session did, so a set the week had beaten fires nothing", () => {
    // 110 × 3 (≈121) clears the best from before the week (≈116.7) but
    // not Monday's 105 × 5 (≈122.5), so Thursday's session celebrated
    // nothing and the recap must not either.
    expect(
      weekNewBests(baseline("Bench", 100, 5), [
        bench("2026-08-10", 105),
        {
          date: "2026-08-13",
          exercises: [
            { exerciseName: "Bench", sets: [{ weightKg: 110, reps: 3 }] },
          ],
        },
      ])
    ).toMatchObject({ count: 1, best: { weight: 105, reps: 5 } });
  });
});
