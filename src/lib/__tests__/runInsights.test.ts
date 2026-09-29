import { describe, it, expect } from "vitest";
import {
  bestEfforts,
  fastestStretch,
  longestRunIn,
  MIN_RUNS_TO_COMPARE,
  paceByRunKind,
  runningPageInsight,
  SPLIT_MIN_SECONDS,
  type InsightRun,
} from "../runInsights";
import { parseRunSummary } from "@/hooks/useRunningStats";
import { addLocalDays, localDateString } from "../dateHelpers";

/* "today" is handed in, never read from the clock; every date below is
   derived from it. */
const TODAY = new Date(2026, 8, 28);
const key = (daysAgo: number) => localDateString(addLocalDays(TODAY, -daysAgo));
const WINDOW = { sinceKey: key(29), todayKey: key(0) };
const WITH_PREVIOUS = { ...WINDOW, prevSinceKey: key(59) };

let nextId = 0;
function run(
  daysAgo: number,
  km: number,
  paceSec: number,
  activityType = "easy",
  extra: Partial<InsightRun> = {}
): InsightRun {
  const completedAt = addLocalDays(TODAY, -daysAgo);
  completedAt.setHours(7, 30);
  return {
    id: `run-${nextId++}`,
    distance: km * 1000,
    duration: km * paceSec,
    avgPace: paceSec,
    activityType,
    completedAt,
    date: key(daysAgo),
    ...extra,
  };
}

describe("paceByRunKind", () => {
  it("weights pace by distance within a kind", () => {
    const { rows } = paceByRunKind(
      [run(3, 10, 360), run(5, 2, 300)],
      WITH_PREVIOUS
    );
    // (10 × 360 + 2 × 300) / 12 = 350, where a plain mean says 330.
    expect(rows).toEqual([
      expect.objectContaining({ kind: "easy", runs: 2, paceSecPerKm: 350 }),
    ]);
  });

  it("keeps kinds apart, in a fixed order", () => {
    const { rows } = paceByRunKind(
      [
        run(2, 5, 300, "tempo"),
        run(9, 5, 305, "tempo"),
        run(4, 16, 370, "long"),
        run(11, 14, 375, "long"),
        run(6, 8, 360, "easy"),
        run(8, 8, 362, "easy"),
      ],
      WITH_PREVIOUS
    );
    expect(rows.map((r) => r.kind)).toEqual(["easy", "long", "tempo"]);
  });

  it("files a long run saved as 'longrun' with the long runs", () => {
    const { rows } = paceByRunKind(
      [run(4, 16, 370, "long"), run(11, 14, 380, "longrun")],
      WITH_PREVIOUS
    );
    expect(rows).toEqual([expect.objectContaining({ kind: "long", runs: 2 })]);
  });

  it("shows a kind from its first run: its pace is a plain figure", () => {
    const { rows } = paceByRunKind([run(3, 5, 300, "tempo")], WITH_PREVIOUS);
    expect(rows).toEqual([
      expect.objectContaining({ kind: "tempo", runs: 1, paceSecPerKm: 300 }),
    ]);
  });

  /** Easy runs `n` apiece in the range and in the one before it. */
  const both = (n: number, m: number) => [
    ...Array.from({ length: n }, (_, i) => run(2 + i * 3, 8, 355)),
    ...Array.from({ length: m }, (_, i) => run(32 + i * 3, 8, 365)),
    // Older than the range before: part of neither.
    run(80, 8, 400),
  ];

  it("compares with the range before when both hold enough runs", () => {
    expect(MIN_RUNS_TO_COMPARE).toBe(4);
    const { rows } = paceByRunKind(both(4, 4), WITH_PREVIOUS);
    expect(rows[0]).toMatchObject({
      paceSecPerKm: 355,
      previousPaceSecPerKm: 365,
    });
  });

  it("makes no comparison when either range is short of runs", () => {
    expect(
      paceByRunKind(both(4, 3), WITH_PREVIOUS).rows[0].previousPaceSecPerKm
    ).toBeNull();
    expect(
      paceByRunKind(both(3, 4), WITH_PREVIOUS).rows[0].previousPaceSecPerKm
    ).toBeNull();
  });

  it("leaves intervals out and counts them, so the card can say why", () => {
    const { rows, intervalsLeftOut } = paceByRunKind(
      [run(3, 6, 330, "intervals"), run(10, 6, 335, "intervals")],
      WITH_PREVIOUS
    );
    expect(rows).toEqual([]);
    expect(intervalsLeftOut).toBe(2);
  });

  it("takes only runs whose pace can be trusted", () => {
    const { rows } = paceByRunKind(
      [
        run(3, 8, 355),
        run(4, 8, 200, "easy", { isInvalid: true }),
        run(5, 8, 200, "easy", { savedAnyway: true }),
        run(6, 8, 200, "treadmill"),
        run(7, 8, 360),
      ],
      WITH_PREVIOUS
    );
    expect(rows).toEqual([expect.objectContaining({ kind: "easy", runs: 2 })]);
  });
});

describe("fastestStretch", () => {
  it("finds the quickest whole kilometres in a row", () => {
    expect(fastestStretch([300, 290, 280, 295, 310], 1)).toBe(280);
    expect(fastestStretch([300, 290, 280, 295, 310], 2)).toBe(570);
    expect(fastestStretch([300, 290, 280, 295, 310], 5)).toBe(1475);
  });

  it("needs the run to have gone that far", () => {
    expect(fastestStretch([300, 290, 280, 295], 5)).toBeNull();
  });

  it("skips a stretch holding a kilometre no one ran", () => {
    // A GPS jump: a 30-second kilometre.
    const splits = [300, 30, 280, 295, 310, 305, 300];
    expect(fastestStretch(splits, 1)).toBe(280);
    // 280 + 295 + 310 + 305 + 300: the only five in a row without it.
    expect(fastestStretch(splits, 5)).toBe(1490);
    expect(fastestStretch([SPLIT_MIN_SECONDS - 1], 1)).toBeNull();
  });
});

describe("bestEfforts", () => {
  const splits = (n: number, each: number) =>
    Array.from({ length: n }, () => each);

  it("gives each distance's fastest in the range and ever", () => {
    const race = run(40, 10, 291, "race", { kmSplitSeconds: splits(10, 291) });
    const recent = run(3, 10, 300, "easy", {
      kmSplitSeconds: splits(10, 300),
    });
    const rows = bestEfforts([race, recent], WINDOW);
    expect(rows.map((r) => r.km)).toEqual([1, 5, 10]);
    const tenK = rows.find((r) => r.km === 10)!;
    expect(tenK.allTime).toEqual({
      seconds: 2910,
      runId: race.id,
      date: key(40),
    });
    expect(tenK.inRange).toEqual({
      seconds: 3000,
      runId: recent.id,
      date: key(3),
    });
  });

  it("leaves out a distance no run has covered", () => {
    const rows = bestEfforts(
      [run(3, 4, 300, "easy", { kmSplitSeconds: splits(4, 300) })],
      WINDOW
    );
    expect(rows.map((r) => r.km)).toEqual([1]);
  });

  it("has no effort in the range when no run in it went that far", () => {
    const rows = bestEfforts(
      [
        run(40, 5, 300, "easy", { kmSplitSeconds: splits(5, 300) }),
        run(3, 3, 290, "easy", { kmSplitSeconds: splits(3, 290) }),
      ],
      WINDOW
    );
    expect(rows.find((r) => r.km === 5)?.inRange).toBeNull();
  });

  it("keeps the run that set a time first when a later one ties it", () => {
    const first = run(20, 5, 300, "easy", { kmSplitSeconds: splits(5, 300) });
    const second = run(3, 5, 300, "easy", { kmSplitSeconds: splits(5, 300) });
    const rows = bestEfforts([second, first], WINDOW);
    expect(rows.find((r) => r.km === 5)?.allTime.runId).toBe(first.id);
  });

  it("takes no effort from a run whose pace cannot be trusted", () => {
    const rows = bestEfforts(
      [
        run(3, 5, 200, "easy", {
          kmSplitSeconds: splits(5, 200),
          isInvalid: true,
        }),
        run(4, 5, 200, "treadmill", { kmSplitSeconds: splits(5, 200) }),
      ],
      WINDOW
    );
    expect(rows).toEqual([]);
  });
});

describe("longestRunIn", () => {
  it("is the longest run that counts, in the range", () => {
    const long = run(5, 16, 370, "long");
    expect(
      longestRunIn(
        [
          run(40, 21, 380, "long"),
          long,
          run(6, 30, 370, "easy", { isInvalid: true }),
        ],
        WINDOW
      )
    ).toEqual({ distanceM: 16000, runId: long.id, date: key(5) });
  });

  it("is nothing in a range without runs", () => {
    expect(longestRunIn([run(40, 21, 380, "long")], WINDOW)).toBeNull();
  });
});

describe("a saved run's splits, as parsed", () => {
  const doc = (splits: unknown) => ({
    completedAt: new Date(TODAY),
    distance: 3000,
    duration: 900,
    avgPace: 300,
    activityType: "easy",
    splits,
  });

  it("are each kilometre's seconds, in order", () => {
    const parsed = parseRunSummary(
      "r",
      doc([
        { km: 1, time: 301, paceSeconds: 301 },
        { km: 2, time: 298.5, paceSeconds: 298.5 },
      ])
    );
    expect(parsed?.kmSplitSeconds).toEqual([301, 298.5]);
  });

  it("refuse a row cut on some other lap", () => {
    // A mile's time, whose pace per km is 1.609 times shorter.
    const parsed = parseRunSummary(
      "r",
      doc([
        { km: 1, time: 483, paceSeconds: 300 },
        { km: 2, time: 300 },
        { km: 3, time: "5:00" },
      ])
    );
    expect(parsed?.kmSplitSeconds).toEqual([0, 300, 0]);
  });

  it("are empty for a run that saved none", () => {
    expect(parseRunSummary("r", doc(undefined))?.kmSplitSeconds).toEqual([]);
  });
});

describe("runningPageInsight", () => {
  const splits = (n: number, each: number) =>
    Array.from({ length: n }, () => each);
  const race = run(40, 10, 291, "race", { kmSplitSeconds: splits(10, 291) });
  const longRun = run(2, 16, 342, "long", { kmSplitSeconds: splits(16, 342) });
  const week = (daysAgo: number, distanceM: number) => ({
    key: key(daysAgo),
    lifts: 0,
    runs: 1,
    volumeKg: 0,
    distanceM,
    current: false,
  });
  const base = {
    sinceKey: WINDOW.sinceKey,
    prevSinceKey: WITH_PREVIOUS.prevSinceKey,
    todayKey: WINDOW.todayKey,
    // Two whole weeks: enough for an average, once the first run is known.
    bins: [week(20, 20_000), week(13, 30_000)],
  };

  it("makes no best-ever claim before every run has loaded", () => {
    // The window's runs alone: the long run's 10K would read as the best
    // ever, with a faster race a month before it not yet read.
    const insight = runningPageInsight({
      ...base,
      // An early run in the window too, so the weeks could be averaged
      // from the window alone: the average waits all the same, because
      // the user's first run may be older than anything in it.
      windowRuns: [run(25, 8, 360), longRun],
      allRuns: [],
      allRunsKnown: false,
    });
    expect(insight.efforts).toEqual([]);
    expect(insight.averageM).toBeNull();
  });

  it("measures the range against every run once they have", () => {
    const insight = runningPageInsight({
      ...base,
      windowRuns: [longRun],
      allRuns: [race, longRun],
      allRunsKnown: true,
    });
    const tenK = insight.efforts.find((r) => r.km === 10)!;
    expect(tenK.allTime.runId).toBe(race.id);
    expect(tenK.inRange?.runId).toBe(longRun.id);
    expect(insight.averageM).toBe(25_000);
  });

  it("counts a run saved after the one-shot read, once", () => {
    const edited = { ...longRun, duration: longRun.duration + 60 };
    const insight = runningPageInsight({
      ...base,
      windowRuns: [edited],
      allRuns: [race, longRun],
      allRunsKnown: true,
    });
    expect(insight.seconds).toBe(edited.duration);
    expect(insight.longest?.runId).toBe(longRun.id);
  });
});
