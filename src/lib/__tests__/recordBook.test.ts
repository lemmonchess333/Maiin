// @vitest-environment jsdom
/**
 * One record book (App1 Q15, 13 November 2026): whatever a finish screen
 * celebrates as a best is a row on Bests afterwards, from the same source.
 *
 * Before it, the run finish screen could say "You ran 5K in 24:31, your
 * fastest yet" and Bests had no 5K at all; a treadmill run could be "your
 * longest run yet" while Bests' only longest run was outdoor; the pace chip
 * said "New best" for the fastest of a run's own distance, which Bests
 * does not list; and a lift celebrated against a map built from the newest
 * 50 sessions could be one Bests, reading every session, never named.
 *
 * Each rule is driven here as the finish screens drive it, and the row it
 * must hold is read from the builders Bests renders (`runRecordRows`,
 * `bestSetPerExercise`). The run cases are fuzzed over seeded histories,
 * since the property is "every time", not "in this example".
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("@/lib/routeMapUpload", () => ({ attachRouteMap: vi.fn() }));

import { earlierRunHistory } from "../runCompletion";
import {
  fastestEffortMoments,
  firstDistanceMoment,
  longestRunMoment,
  type PostMoment,
} from "../postMoments";
import { runRecordRows, type RunRecordRows } from "../historyFigures";
import { parseSavedRun, type SavedRun } from "../savedRuns";
import { calculatePaceTrend } from "../paceTrends";
import { isPaceEligible } from "../runStatsEligibility";
import { bestSetPerExercise } from "../liftRecords";
import { buildPRMap, checkSetPR } from "../prTracking";
import { addLocalDays, localDateString } from "../dateHelpers";
import { mulberry32 } from "@/test/prng";

const TODAY = new Date(2026, 9, 14, 18, 0);
const key = (daysAgo: number) => localDateString(addLocalDays(TODAY, -daysAgo));
const RANGE = {
  todayKey: key(0),
  recentSinceKey: key(29),
  newSinceKey: key(7),
};

/** A saved run as the app writes it, read back through the one reader. */
function savedRun(
  id: string,
  daysAgo: number,
  {
    km,
    pace,
    place,
    efforts,
    splits,
  }: {
    km: number;
    pace: number;
    place?: "treadmill";
    /** Saved best efforts; absent on a run saved before they were kept. */
    efforts?: { distance: number; time: number }[];
    splits?: number[];
  }
): SavedRun {
  const day = addLocalDays(TODAY, -daysAgo);
  day.setHours(7, 30);
  const run = parseSavedRun(id, {
    completedAt: day,
    date: localDateString(day),
    distance: km * 1000,
    duration: Math.round(km * pace),
    avgPace: pace,
    activityType: "easy",
    ...(place ? { place } : {}),
    splits: (splits ?? []).map((time, i) => ({
      km: i + 1,
      time,
      paceSeconds: time,
    })),
    ...(efforts
      ? { bestEfforts: efforts.map((e) => ({ ...e, label: "" })) }
      : {}),
  });
  if (!run) throw new Error("unreadable fixture");
  return run;
}

/** A GPS run's whole kilometres, and the efforts the finish screen would
 *  have found in its track: never slower than the splits. */
function gpsRun(
  id: string,
  daysAgo: number,
  km: number,
  rnd: () => number,
  {
    keptEfforts,
    fastest = 250,
    spread = 120,
  }: {
    keptEfforts: boolean;
    /** Seconds a kilometre the run's pace is drawn from, and above. */
    fastest?: number;
    spread?: number;
  }
): SavedRun {
  const base = fastest + rnd() * spread;
  const splits = Array.from({ length: Math.floor(km) }, () =>
    Math.round(base + (rnd() - 0.5) * 30)
  );
  const pace = splits.length
    ? splits.reduce((a, b) => a + b, 0) / splits.length
    : base;
  const efforts = [1000, 5000, 10000]
    .filter((m) => km * 1000 >= m)
    .map((distance) => {
      const n = distance / 1000;
      let best = Infinity;
      for (let i = 0; i + n <= splits.length; i++)
        best = Math.min(
          best,
          splits.slice(i, i + n).reduce((a, b) => a + b, 0)
        );
      return { distance, time: Math.round(best - rnd() * 5) };
    })
    .filter((e) => Number.isFinite(e.time));
  return savedRun(id, daysAgo, {
    km,
    pace,
    splits,
    ...(keptEfforts ? { efforts } : {}),
  });
}

function rows(runs: readonly SavedRun[]): RunRecordRows {
  return runRecordRows(runs, RANGE, "km");
}

const EFFORT_LABEL: Record<number, string> = {
  1000: "Fastest 1K",
  5000: "Fastest 5K",
  10000: "Fastest 10K",
};

/** The Bests row a celebrated run moment must be: held by `runId`. */
function rowFor(
  moment: PostMoment,
  bests: RunRecordRows,
  indoor: boolean
): { runId?: string } | undefined {
  const card = indoor ? bests.indoor : bests.lifetime;
  switch (moment.kind) {
    case "fastestEffort":
      return card.find((r) => r.label === EFFORT_LABEL[moment.meters]);
    case "longestRun":
    case "firstDistance":
      return card.find((r) => r.label === "Longest run");
    default:
      return undefined;
  }
}

/** The best moments a finish screen works out for a run, before the post
 *  keeps its three: every candidate, so none hides behind another. */
function celebratedBests(run: SavedRun, all: readonly SavedRun[]) {
  const history = earlierRunHistory(all, run.id);
  return [
    ...fastestEffortMoments(run.bestEfforts, history),
    longestRunMoment(run.distance, history),
    firstDistanceMoment(run.distance, history),
  ].filter((m): m is PostMoment => m !== null);
}

describe("a run's celebrated bests are rows on Bests", () => {
  it("a new fastest 5K is Bests' Fastest 5K, against an older run's splits", () => {
    const old = savedRun("old", 60, {
      km: 10,
      pace: 300,
      splits: Array.from({ length: 10 }, () => 300),
    });
    const recent = savedRun("recent", 20, {
      km: 6,
      pace: 305,
      splits: [305, 300, 310, 300, 305, 310],
      efforts: [
        { distance: 1000, time: 296 },
        { distance: 5000, time: 1515 },
      ],
    });
    const fresh = savedRun("fresh", 0, {
      km: 5.2,
      pace: 290,
      splits: [290, 288, 292, 291, 289],
      efforts: [
        { distance: 1000, time: 284 },
        { distance: 5000, time: 1440 },
      ],
    });
    const all = [old, recent, fresh];
    const moments = celebratedBests(fresh, all);
    expect(moments).toContainEqual({
      kind: "fastestEffort",
      meters: 5000,
      seconds: 1440,
    });
    const bests = rows(all);
    for (const moment of moments)
      expect(rowFor(moment, bests, false)?.runId, moment.kind).toBe("fresh");
  });

  it("a treadmill run that is the longest yet is Bests' indoor longest run", () => {
    const all = [
      savedRun("a", 30, { km: 8, pace: 320, splits: [] }),
      savedRun("b", 20, { km: 10, pace: 320, splits: [] }),
      savedRun("c", 10, { km: 12, pace: 320, splits: [] }),
      savedRun("belt", 0, { km: 21.2, pace: 330, place: "treadmill" }),
    ];
    const moments = celebratedBests(all[3], all);
    expect(moments.map((m) => m.kind).sort()).toEqual([
      "firstDistance",
      "longestRun",
    ]);
    const bests = rows(all);
    for (const moment of moments)
      expect(rowFor(moment, bests, true)?.runId, moment.kind).toBe("belt");
  });

  it("holds over seeded histories, outdoor and treadmill", () => {
    const rnd = mulberry32(1513);
    let checked = 0;
    for (let trial = 0; trial < 300; trial++) {
      const earlier: SavedRun[] = [];
      const count = 2 + Math.floor(rnd() * 10);
      for (let i = 0; i < count; i++) {
        const daysAgo = 200 - i * 15;
        const km = 1 + rnd() * 22;
        earlier.push(
          rnd() < 0.2
            ? savedRun(`t${i}`, daysAgo, {
                km,
                pace: 280 + rnd() * 100,
                place: "treadmill",
              })
            : gpsRun(`r${i}`, daysAgo, km, rnd, { keptEfforts: rnd() < 0.5 })
        );
      }
      const km = 1 + rnd() * 24;
      const indoor = rnd() < 0.2;
      const fresh = indoor
        ? savedRun("fresh", 0, {
            km,
            pace: 280 + rnd() * 100,
            place: "treadmill",
          })
        : gpsRun("fresh", 0, km, rnd, { keptEfforts: true });
      const all = [...earlier, fresh];
      const bests = rows(all);
      for (const moment of celebratedBests(fresh, all)) {
        checked += 1;
        expect(rowFor(moment, bests, indoor)?.runId, moment.kind).toBe("fresh");
      }
    }
    // Enough celebrations to mean something.
    expect(checked).toBeGreaterThan(100);
  });
});

describe("the finish screen's New best pace is a row on Bests", () => {
  it("holds over seeded histories", () => {
    const rnd = mulberry32(1514);
    let celebrated = 0;
    for (let trial = 0; trial < 400; trial++) {
      // Mostly runs of about 5 km, so there are enough to compare with,
      // and some shorter and longer ones that can hold the records.
      const earlier = Array.from(
        { length: 10 + Math.floor(rnd() * 8) },
        (_, i) =>
          gpsRun(
            `r${i}`,
            100 - i * 5,
            rnd() < 0.75 ? 4.6 + rnd() * 0.8 : 1 + rnd() * 11,
            rnd,
            { keptEfforts: rnd() < 0.5 }
          )
      );
      const fresh = gpsRun("fresh", 0, 4.6 + rnd() * 0.8, rnd, {
        keptEfforts: true,
        fastest: 240,
        spread: 60,
      });
      const all = [...earlier, fresh];
      const trend = calculatePaceTrend(fresh, all, {
        records: all.filter((run) => isPaceEligible(run)),
      });
      if (trend.trend !== "pr") continue;
      celebrated += 1;
      const held = rows(all).lifetime.filter(
        (r) => r.label === "Best pace" || r.label === "Best pace · 5K+"
      );
      expect(held.map((r) => r.runId)).toContain("fresh");
    }
    expect(celebrated).toBeGreaterThan(10);
  });
});

describe("a lift's new best is its row on Bests", () => {
  const session = (
    date: string,
    name: string,
    sets: { weightKg: number; reps: number }[]
  ) => ({ date, exercises: [{ exerciseName: name, sets }] });

  it.each([
    ["Bench Press", [80, 8], [85, 8], [100, 3]],
    // Bodyweight: the screen celebrates loaded sets only, so 20 bare reps
    // must not outrank the +12.5 kg × 5 it called a new best.
    ["Pull-Ups", [0, 20], [10, 5], [12.5, 5]],
  ] as const)("%s", (name, first, second, today) => {
    const history = [
      session(key(30), name, [{ weightKg: first[0], reps: first[1] }]),
      session(key(20), name, [{ weightKg: second[0], reps: second[1] }]),
      session(key(10), name, [{ weightKg: second[0], reps: second[1] }]),
      session(key(5), name, [{ weightKg: second[0], reps: second[1] }]),
    ];
    const pr = checkSetPR(name, today[0], today[1], buildPRMap(history), {
      [name]: history.length,
    });
    expect(pr?.kind).toBe("best");
    const [row] = bestSetPerExercise(
      [
        ...history,
        session(key(0), name, [{ weightKg: today[0], reps: today[1] }]),
      ],
      { newSinceKey: RANGE.newSinceKey }
    );
    expect(row).toMatchObject({
      name,
      weight: today[0],
      reps: today[1],
      date: key(0),
      isNew: true,
    });
  });
});
