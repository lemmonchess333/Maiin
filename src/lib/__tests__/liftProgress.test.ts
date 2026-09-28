import { describe, it, expect } from "vitest";
import {
  liftProgress,
  HOLDING_DAYS,
  HOLDING_SESSIONS,
  NEW_BEST_DAYS,
} from "../liftProgress";
import { addLocalDays, localDateString } from "../dateHelpers";

/* A fixed "today" handed in, never read from the clock: the helper takes
   it as an argument, so these hold on any calendar day. */
const TODAY = new Date(2026, 8, 28);
const day = (n: number) => localDateString(addLocalDays(TODAY, -n));

type Set = { weightKg: number; reps: number; type?: string };

function session(
  daysAgo: number,
  lifts: {
    name: string;
    id?: string;
    sets: Set[];
    repUnit?: string;
  }[]
) {
  return {
    date: day(daysAgo),
    exercises: lifts.map((l) => ({
      exerciseId: l.id,
      exerciseName: l.name,
      repUnit: l.repUnit,
      sets: l.sets,
    })),
  };
}

const bench = (kg: number, reps: number, id = "bench-press") => ({
  name: "Bench Press",
  id,
  sets: [
    { weightKg: 40, reps: 8, type: "warmup" },
    { weightKg: kg, reps },
    { weightKg: kg, reps: reps - 1 },
  ],
});

const MONTH = { sinceKey: day(29), today: TODAY };

describe("liftProgress", () => {
  it("compares the latest top set with the first in the range", () => {
    const rows = liftProgress(
      [session(26, [bench(75, 6)]), session(5, [bench(82.5, 6)])],
      MONTH
    );
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.first).toMatchObject({ weight: 75, reps: 6, date: day(26) });
    expect(row.latest).toMatchObject({ weight: 82.5, reps: 6, date: day(5) });
    expect(row.direction).toBe("up");
    expect(row.sessions).toBe(2);
    expect(row.series).toHaveLength(2);
  });

  it("judges direction on e1RM, not on the bar", () => {
    // 80 × 8 (e1RM 101.3) → 85 × 5 (e1RM 99.2): heavier, and weaker.
    const rows = liftProgress(
      [session(20, [bench(80, 8)]), session(3, [bench(85, 5)])],
      MONTH
    );
    expect(rows[0].direction).toBe("down");
  });

  it("reads a change inside one per cent as level", () => {
    // 100 × 5 (116.7) → 102.5 × 4 (116.2).
    const rows = liftProgress(
      [session(20, [bench(100, 5)]), session(3, [bench(102.5, 4)])],
      MONTH
    );
    expect(rows[0].direction).toBe("level");
  });

  it("leaves out a lift trained once in the range", () => {
    const rows = liftProgress(
      [session(60, [bench(70, 6)]), session(3, [bench(80, 6)])],
      MONTH
    );
    expect(rows).toEqual([]);
  });

  it("skips warm-ups, timed holds and bodyweight lifts", () => {
    const rows = liftProgress(
      [
        session(20, [
          {
            name: "Plank",
            id: "plank",
            repUnit: "seconds",
            sets: [{ weightKg: 20, reps: 60 }],
          },
          {
            name: "Push-Ups",
            id: "push-ups",
            sets: [{ weightKg: 0, reps: 20 }],
          },
          {
            name: "Bench Press",
            id: "bench-press",
            sets: [
              { weightKg: 120, reps: 5, type: "warmup" },
              { weightKg: 80, reps: 6 },
            ],
          },
        ]),
        session(3, [
          {
            name: "Plank",
            id: "plank",
            repUnit: "seconds",
            sets: [{ weightKg: 20, reps: 90 }],
          },
          {
            name: "Push-Ups",
            id: "push-ups",
            sets: [{ weightKg: 0, reps: 25 }],
          },
          bench(82.5, 6),
        ]),
      ],
      MONTH
    );
    expect(rows.map((r) => r.name)).toEqual(["Bench Press"]);
    // The 120 kg warm-up is not the top set.
    expect(rows[0].first.weight).toBe(80);
  });

  describe("a new best", () => {
    it("is one that beat an earlier session in the last week", () => {
      const rows = liftProgress(
        [
          session(20, [bench(80, 6)]),
          session(NEW_BEST_DAYS - 1, [bench(85, 6)]),
        ],
        MONTH
      );
      expect(rows[0].newBest).toMatchObject({ weight: 85, reps: 6 });
    });

    it("is not news a week later", () => {
      const rows = liftProgress(
        [
          session(20, [bench(80, 6)]),
          session(NEW_BEST_DAYS + 1, [bench(85, 6)]),
          session(2, [bench(82.5, 6)]),
        ],
        MONTH
      );
      expect(rows[0].newBest).toBeNull();
    });

    it("is not the lift's first session, which beat nothing", () => {
      const rows = liftProgress(
        [session(4, [bench(85, 6)]), session(2, [bench(80, 6)])],
        MONTH
      );
      expect(rows[0].newBest).toBeNull();
    });

    it("is not a tie with an older best", () => {
      const rows = liftProgress(
        [
          session(40, [bench(85, 6)]),
          session(20, [bench(80, 6)]),
          session(3, [bench(85, 6)]),
        ],
        MONTH
      );
      expect(rows[0].newBest).toBeNull();
    });

    it("counts the whole history, not only the range", () => {
      // 85 kg in the range, but 90 kg two months ago: not a best.
      const rows = liftProgress(
        [
          session(60, [bench(90, 6)]),
          session(20, [bench(80, 6)]),
          session(3, [bench(85, 6)]),
        ],
        MONTH
      );
      expect(rows[0].newBest).toBeNull();
    });
  });

  describe("a lift that has stopped moving", () => {
    it("holds when its best is old and several sessions have not beaten it", () => {
      const bestDay = HOLDING_DAYS + 7;
      const workouts = [
        session(bestDay + 7, [bench(80, 5)]),
        session(bestDay, [bench(85, 5)]),
        ...Array.from({ length: HOLDING_SESSIONS }, (_, i) =>
          session(bestDay - 7 * (i + 1), [bench(85, 5)])
        ),
      ];
      const [row] = liftProgress(workouts, MONTH);
      expect(row.holding).toEqual({
        best: expect.objectContaining({ weight: 85, date: day(bestDay) }),
        sessionsSince: HOLDING_SESSIONS,
      });
    });

    it("does not hold after too few sessions, however long ago", () => {
      const workouts = [
        session(60, [bench(85, 5)]),
        session(20, [bench(80, 5)]),
        session(5, [bench(82.5, 5)]),
      ];
      expect(HOLDING_SESSIONS).toBeGreaterThan(2);
      const [row] = liftProgress(workouts, MONTH);
      expect(row.holding).toBeNull();
    });

    it("does not hold when the best is recent", () => {
      const workouts = [
        session(HOLDING_DAYS - 2, [bench(85, 5)]),
        ...Array.from({ length: HOLDING_SESSIONS + 1 }, (_, i) =>
          session(HOLDING_DAYS - 4 - 4 * i, [bench(82.5, 5)])
        ),
      ];
      const [row] = liftProgress(workouts, MONTH);
      expect(row.holding).toBeNull();
    });
  });

  it("lists the lifts sessions open with first, not the heaviest", () => {
    const legs = (squat: number, press: number) => [
      {
        name: "Barbell Squat",
        id: "squat",
        sets: [{ weightKg: squat, reps: 5 }],
      },
      {
        name: "Leg Press",
        id: "leg-press",
        sets: [{ weightKg: press, reps: 12 }],
      },
    ];
    const rows = liftProgress(
      [session(14, legs(100, 200)), session(7, legs(102.5, 205))],
      MONTH
    );
    expect(rows.map((r) => r.name)).toEqual(["Barbell Squat", "Leg Press"]);
  });

  it("files a lift under its catalogue id when a session saved only the name", () => {
    const rows = liftProgress(
      [
        session(20, [
          { name: "Bench Press", sets: [{ weightKg: 80, reps: 6 }] },
        ]),
        session(3, [bench(82.5, 6)]),
      ],
      MONTH
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ exerciseId: "bench-press", sessions: 2 });
  });
});
