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
