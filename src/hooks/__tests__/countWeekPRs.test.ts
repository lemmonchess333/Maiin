/**
 * countWeekPRs — the weekly recap's "PRs hit" number.
 *
 * A pure function that had no test, exported from a hook module — the same
 * unreachability that kept `nextVolumeBest` and `exerciseFromRoutine`
 * unpinned until they moved. It stays here because the module boundary is
 * fine; only the coverage was missing.
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

import { countWeekPRs } from "../useWeeklyReview";

/** ≥3 baseline sessions so the min-session gate is open. */
function baseline(exerciseName: string, weightKg: number, reps: number) {
  return ["2026-07-01", "2026-07-08", "2026-07-15"].map((date) => ({
    date,
    exercises: [{ exerciseName, sets: [{ weightKg, reps }] }],
  }));
}

describe("countWeekPRs", () => {
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
