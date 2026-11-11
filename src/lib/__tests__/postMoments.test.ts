import { describe, expect, it } from "vitest";
import {
  fastestEffortMoments,
  firstDistanceMoment,
  firstSessionMoment,
  isPostMoment,
  liftPostMoments,
  longestRunMoment,
  MAX_POST_MOMENTS,
  MOMENT_EXERCISE_MAX,
  pickMoments,
  planMoment,
  postMomentsOf,
  prMoments,
  runHistoryOf,
  runPostMoments,
  streakMoment,
  type PostMoment,
  type RunHistory,
} from "../postMoments";

/**
 * Moments on a post (Soc15): each rule is a pure function of what the
 * finish screen holds, and every cold start (a first run, a first lift, a
 * history that has not loaded) names nothing it cannot back.
 */

const history = (over: Partial<RunHistory> = {}): RunHistory => ({
  count: 5,
  longestMeters: 8000,
  fastestSeconds: {},
  ...over,
});

describe("prMoments", () => {
  it("names each exercise's strongest new best, once, in the order set", () => {
    expect(
      prMoments([
        { exercise: "Bench Press", weightKg: 90, reps: 3 },
        { exercise: "Squat", weightKg: 120, reps: 5 },
        // A heavier eight beats the triple by estimated one-rep max.
        { exercise: "Bench Press", weightKg: 85, reps: 8 },
      ])
    ).toEqual([
      { kind: "pr", exercise: "Bench Press", weightKg: 85, reps: 8 },
      { kind: "pr", exercise: "Squat", weightKg: 120, reps: 5 },
    ]);
  });

  it("names nothing for a session with no new best, or a blank name", () => {
    expect(prMoments([])).toEqual([]);
    expect(prMoments(undefined)).toEqual([]);
    expect(prMoments([{ exercise: "  ", weightKg: 90, reps: 5 }])).toEqual([]);
  });
});

describe("longestRunMoment", () => {
  it("is a run longer than every earlier one", () => {
    expect(longestRunMoment(8500, history())).toEqual({
      kind: "longestRun",
      meters: 8500,
    });
    expect(longestRunMoment(8000, history())).toBeNull();
    expect(longestRunMoment(6000, history())).toBeNull();
  });

  it("waits for three earlier runs: a first, second or third run is no longest run", () => {
    for (const count of [0, 1, 2]) {
      expect(
        longestRunMoment(12000, history({ count, longestMeters: 3000 }))
      ).toBeNull();
    }
    expect(
      longestRunMoment(12000, history({ count: 3, longestMeters: 3000 }))
    ).toEqual({ kind: "longestRun", meters: 12000 });
  });

  it("names nothing while the history is unknown", () => {
    expect(longestRunMoment(50000, null)).toBeNull();
    expect(longestRunMoment(50000, undefined)).toBeNull();
  });
});

describe("firstDistanceMoment", () => {
  it("is the first run to reach a distance, the largest one reached", () => {
    expect(
      firstDistanceMoment(10050, history({ longestMeters: 9000 }))
    ).toEqual({ kind: "firstDistance", meters: 10000 });
    // Past both 5K and 10K for the first time: the 10K is named.
    expect(
      firstDistanceMoment(10200, history({ longestMeters: 4000 }))
    ).toEqual({ kind: "firstDistance", meters: 10000 });
    expect(
      firstDistanceMoment(42195, history({ longestMeters: 30000 }))
    ).toEqual({ kind: "firstDistance", meters: 42195 });
  });

  it("names nothing once an earlier run reached it, or short of it", () => {
    expect(
      firstDistanceMoment(10500, history({ longestMeters: 10000 }))
    ).toBeNull();
    expect(
      firstDistanceMoment(9990, history({ longestMeters: 6000 }))
    ).toBeNull();
    // Reaching 5K again after an earlier 7K is no first 5K.
    expect(
      firstDistanceMoment(5200, history({ longestMeters: 7000 }))
    ).toBeNull();
  });

  it("counts a first-ever run that reaches 5K as a first 5K", () => {
    expect(
      firstDistanceMoment(5100, history({ count: 0, longestMeters: 0 }))
    ).toEqual({ kind: "firstDistance", meters: 5000 });
  });

  it("names nothing while the history is unknown", () => {
    expect(firstDistanceMoment(10000, null)).toBeNull();
  });
});

describe("fastestEffortMoments", () => {
  const earlier = history({ fastestSeconds: { 1000: 260, 5000: 1500 } });

  it("names each effort faster than every earlier one at its distance", () => {
    expect(
      fastestEffortMoments(
        [
          { distance: 1000, time: 250 },
          { distance: 5000, time: 1490.5 },
        ],
        earlier
      )
    ).toEqual([
      { kind: "fastestEffort", meters: 1000, seconds: 250 },
      { kind: "fastestEffort", meters: 5000, seconds: 1490.5 },
    ]);
  });

  it("names nothing equal or slower", () => {
    expect(
      fastestEffortMoments(
        [
          { distance: 1000, time: 260 },
          { distance: 5000, time: 1600 },
        ],
        earlier
      )
    ).toEqual([]);
  });

  it("only against an earlier effort: the first 10K timed is not the fastest of anything", () => {
    expect(
      fastestEffortMoments([{ distance: 10000, time: 3000 }], earlier)
    ).toEqual([]);
    expect(
      fastestEffortMoments(
        [{ distance: 1000, time: 200 }],
        history({ count: 0, fastestSeconds: {} })
      )
    ).toEqual([]);
    expect(fastestEffortMoments([{ distance: 1000, time: 200 }], null)).toEqual(
      []
    );
  });
});

describe("runHistoryOf", () => {
  it("takes the longest run and the fastest effort at each distance", () => {
    expect(
      runHistoryOf([
        { distance: 5200, bestEfforts: [{ distance: 1000, time: 270 }] },
        {
          distance: 10400,
          bestEfforts: [
            { distance: 1000, time: 262 },
            { distance: 5000, time: 1420 },
          ],
        },
        // Saved before best efforts were kept.
        { distance: 3000 },
      ])
    ).toEqual({
      count: 3,
      longestMeters: 10400,
      fastestSeconds: { 1000: 262, 5000: 1420 },
    });
  });

  it("is empty with no earlier runs", () => {
    expect(runHistoryOf([])).toEqual({
      count: 0,
      longestMeters: 0,
      fastestSeconds: {},
    });
  });
});

describe("streakMoment", () => {
  it("is the milestone the session took the streak to", () => {
    expect(streakMoment({ before: 6, after: 7 })).toEqual({
      kind: "streak",
      days: 7,
    });
    expect(streakMoment({ before: 99, after: 100 })).toEqual({
      kind: "streak",
      days: 100,
    });
  });

  it("names the milestone passed when grace carried the streak over it", () => {
    // The morning after a rest day: 6 days kept, the session bridges the
    // rest day, and the streak reads 8.
    expect(streakMoment({ before: 6, after: 8 })).toEqual({
      kind: "streak",
      days: 7,
    });
  });

  it("names nothing between milestones, on a day already active, or unknown", () => {
    expect(streakMoment({ before: 7, after: 8 })).toBeNull();
    expect(streakMoment({ before: 30, after: 30 })).toBeNull();
    expect(streakMoment({ before: 0, after: 1 })).toBeNull();
    expect(streakMoment(null)).toBeNull();
    expect(streakMoment(undefined)).toBeNull();
  });
});

describe("planMoment", () => {
  it("is week N of M done for the lift that finished the week", () => {
    expect(
      planMoment({ week: 4, weeks: 12, ends: true, weekDone: true })
    ).toEqual({ kind: "planWeek", week: 4, weeks: 12 });
  });

  it("is the programme complete with a block's last week", () => {
    expect(
      planMoment({ week: 8, weeks: 8, ends: true, weekDone: true })
    ).toEqual({ kind: "planComplete" });
  });

  it("is only week N of M with a race block's last week: the lifting carries on", () => {
    expect(
      planMoment({ week: 16, weeks: 16, ends: false, weekDone: true })
    ).toEqual({ kind: "planWeek", week: 16, weeks: 16 });
  });

  it("names nothing for a lift that left the week's plan unfinished, or no plan", () => {
    expect(
      planMoment({ week: 4, weeks: 12, ends: true, weekDone: false })
    ).toBeNull();
    expect(planMoment(null)).toBeNull();
  });
});

describe("firstSessionMoment", () => {
  it("is claimed only when the read found no earlier session", () => {
    expect(firstSessionMoment(true)).toEqual({ kind: "firstSession" });
    expect(firstSessionMoment(false)).toBeNull();
    expect(firstSessionMoment(null)).toBeNull();
    expect(firstSessionMoment(undefined)).toBeNull();
  });
});

describe("pickMoments", () => {
  it("puts the most significant first and keeps three", () => {
    const picked = pickMoments([
      { kind: "planWeek", week: 2, weeks: 8 },
      { kind: "pr", exercise: "Squat", weightKg: 100, reps: 5 },
      { kind: "streak", days: 30 },
      { kind: "longestRun", meters: 12000 },
      { kind: "firstSession" },
    ]);
    expect(picked).toEqual([
      { kind: "firstSession" },
      { kind: "streak", days: 30 },
      { kind: "pr", exercise: "Squat", weightKg: 100, reps: 5 },
    ]);
    expect(picked).toHaveLength(MAX_POST_MOMENTS);
  });

  it("orders a kind's run moments by distance, longest first", () => {
    expect(
      pickMoments([
        { kind: "fastestEffort", meters: 1000, seconds: 250 },
        { kind: "fastestEffort", meters: 10000, seconds: 2900 },
        { kind: "fastestEffort", meters: 5000, seconds: 1400 },
      ]).map((m) => (m.kind === "fastestEffort" ? m.meters : 0))
    ).toEqual([10000, 5000, 1000]);
  });

  it("drops what the rules would refuse rather than lose the post", () => {
    expect(
      pickMoments([
        null,
        undefined,
        {
          kind: "pr",
          exercise: "x".repeat(MOMENT_EXERCISE_MAX + 1),
          weightKg: 90,
          reps: 5,
        },
        { kind: "pr", exercise: "Row", weightKg: 60, reps: 7.5 },
        { kind: "streak", days: 8 },
        { kind: "firstDistance", meters: 7000 } as unknown as PostMoment,
      ])
    ).toEqual([]);
  });
});

describe("isPostMoment", () => {
  it("takes every kind as the builders write it", () => {
    for (const moment of [
      { kind: "pr", exercise: "Bench Press", weightKg: 92.5, reps: 5 },
      { kind: "longestRun", meters: 21345.6 },
      { kind: "firstDistance", meters: 21097 },
      { kind: "fastestEffort", meters: 5000, seconds: 1361.4 },
      { kind: "streak", days: 365 },
      { kind: "planWeek", week: 12, weeks: 12 },
      { kind: "planComplete" },
      { kind: "firstSession" },
    ])
      expect(isPostMoment(moment), JSON.stringify(moment)).toBe(true);
  });

  it("refuses a key too many, a key missing, an unknown kind and a number out of range", () => {
    for (const value of [
      { kind: "streak", days: 30, note: "nice" },
      { kind: "pr", exercise: "Squat", reps: 5 },
      { kind: "localLegend" },
      { kind: "firstSession", text: "hello" },
      { kind: "planWeek", week: 13, weeks: 12 },
      { kind: "planWeek", week: 1, weeks: 105 },
      { kind: "longestRun", meters: 0 },
      { kind: "fastestEffort", meters: 21097, seconds: 5400 },
      { kind: "pr", exercise: "Squat", weightKg: 0, reps: 5 },
      "firstSession",
      ["firstSession"],
      null,
    ])
      expect(isPostMoment(value), JSON.stringify(value)).toBe(false);
  });
});

describe("liftPostMoments and runPostMoments", () => {
  it("a lift: plan, first session, streak and PRs, most significant first", () => {
    expect(
      liftPostMoments({
        prs: [{ exercise: "Deadlift", weightKg: 160, reps: 3 }],
        streak: { before: 13, after: 14 },
        firstSession: false,
        plan: { week: 3, weeks: 8, ends: true, weekDone: true },
      })
    ).toEqual([
      { kind: "streak", days: 14 },
      { kind: "pr", exercise: "Deadlift", weightKg: 160, reps: 3 },
      { kind: "planWeek", week: 3, weeks: 8 },
    ]);
  });

  it("a first-ever lift: first session, and no PR a first lift cannot have", () => {
    expect(
      liftPostMoments({
        prs: [],
        streak: { before: 0, after: 1 },
        firstSession: true,
        plan: null,
      })
    ).toEqual([{ kind: "firstSession" }]);
    expect(liftPostMoments(undefined)).toEqual([]);
  });

  it("a first-ever run of 10K: first session and first 10K, no longest run", () => {
    expect(
      runPostMoments(
        { distance: 10120, bestEfforts: [{ distance: 1000, time: 280 }] },
        {
          history: runHistoryOf([]),
          streak: { before: 0, after: 1 },
          firstSession: true,
        }
      )
    ).toEqual([
      { kind: "firstSession" },
      { kind: "firstDistance", meters: 10000 },
    ]);
  });

  it("a run against its history: a first half, the fastest 5K, the longest run", () => {
    expect(
      runPostMoments(
        {
          distance: 21300,
          bestEfforts: [
            { distance: 1000, time: 290 },
            { distance: 5000, time: 1490 },
          ],
        },
        {
          history: history({
            longestMeters: 16000,
            fastestSeconds: { 1000: 270, 5000: 1500 },
          }),
        }
      )
    ).toEqual([
      { kind: "firstDistance", meters: 21097 },
      { kind: "fastestEffort", meters: 5000, seconds: 1490 },
      { kind: "longestRun", meters: 21300 },
    ]);
  });

  it("a run whose history did not load names only what it knows", () => {
    expect(
      runPostMoments(
        { distance: 21300 },
        { history: null, streak: { before: 29, after: 30 } }
      )
    ).toEqual([{ kind: "streak", days: 30 }]);
    expect(runPostMoments({ distance: 21300 }, undefined)).toEqual([]);
  });
});

describe("postMomentsOf", () => {
  it("reads a post's moments, leaving out what it cannot draw", () => {
    expect(
      postMomentsOf([
        { kind: "streak", days: 7 },
        { kind: "unknown" },
        "New PR",
        { kind: "firstSession" },
      ])
    ).toEqual([{ kind: "streak", days: 7 }, { kind: "firstSession" }]);
  });

  it("reads none from a post written before moments", () => {
    expect(postMomentsOf(undefined)).toEqual([]);
    expect(postMomentsOf({ kind: "streak", days: 7 })).toEqual([]);
  });

  it("draws at most three", () => {
    expect(
      postMomentsOf(Array.from({ length: 5 }, () => ({ kind: "firstSession" })))
    ).toHaveLength(MAX_POST_MOMENTS);
  });
});
