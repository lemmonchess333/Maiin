import { describe, expect, it } from "vitest";
import {
  anniversariesToCheck,
  anniversaryDay,
  anniversaryWords,
  ANNIVERSARY_KINDS,
  priorTally,
  settleAnniversaries,
  unshownAnniversaries,
  type AnniversaryMarks,
  type FinishedSession,
  type PriorTally,
} from "../anniversaries";
import { group } from "@/test/localeGrouping";

/**
 * Earned anniversaries (App1 Q58): the thresholds, and that each is
 * earned once per account.
 */

const lift = (day: string, id = "this"): FinishedSession => ({
  id,
  sport: "lift",
  day,
  counts: true,
  metres: 0,
});
const run = (day: string, metres: number, counts = true): FinishedSession => ({
  id: "this",
  sport: "run",
  day,
  counts,
  metres,
});
const tally = (fields: Partial<PriorTally>): PriorTally => ({
  sessions: null,
  metres: null,
  lastDay: undefined,
  firstDay: undefined,
  firstRunDay: undefined,
  ...fields,
});
const settle = (
  before: PriorTally,
  session: FinishedSession,
  {
    marks = {},
    startDay = null,
  }: { marks?: AnniversaryMarks; startDay?: string | null } = {}
) => settleAnniversaries({ marks, before, session, startDay });

describe("priorTally", () => {
  const runDoc = (id: string, day: string, distance: number, extra = {}) => ({
    id,
    day,
    distance,
    duration: 1800,
    ...extra,
  });

  it("counts every saved lift and the runs that count, less the session", () => {
    const before = priorTally(
      [
        { id: "w1", date: "2026-01-03" },
        { id: "w2", date: "2026-02-01" },
        { id: "this", date: "2026-03-01" },
      ],
      [
        runDoc("r1", "2026-01-01", 5000),
        // Saved anyway: counts nowhere, as the week's count leaves it out.
        runDoc("r2", "2026-02-10", 9000, { savedAnyway: true }),
        runDoc("r3", "2026-02-20", 8000),
      ],
      "this",
      { workouts: true, runs: true }
    );
    expect(before).toEqual({
      sessions: 4,
      metres: 13000,
      lastDay: "2026-02-20",
      firstDay: "2026-01-01",
      firstRunDay: "2026-01-01",
    });
  });

  it("claims no count from lists read only for their newest", () => {
    const before = priorTally(
      [{ id: "w1", date: "2026-02-01" }],
      [runDoc("r1", "2026-02-05", 5000)],
      "this",
      { workouts: false, runs: false }
    );
    expect(before).toMatchObject({
      sessions: null,
      metres: null,
      lastDay: "2026-02-05",
    });
  });
});

describe("the session counts", () => {
  it("the 50th session earns the 50th", () => {
    expect(settle(tally({ sessions: 49 }), lift("2026-11-14"))).toEqual({
      earned: ["sessions50"],
      passed: [],
    });
  });

  it("a 49th earns nothing", () => {
    expect(settle(tally({ sessions: 48 }), lift("2026-11-14")).earned).toEqual(
      []
    );
  });

  it("the 100th session earns the 100th", () => {
    expect(
      settle(tally({ sessions: 99 }), lift("2026-11-14"), {
        marks: { sessions50: { day: "2026-06-01", shown: true } },
      })
    ).toEqual({ earned: ["sessions100"], passed: [] });
  });

  it("a run that does not count earns nothing", () => {
    expect(
      settle(tally({ sessions: 49, metres: 0 }), run("2026-11-14", 40, false))
        .earned
    ).toEqual([]);
  });

  it("records as passed what was passed before it was counted, and shows none", () => {
    // An account with 300 sessions when anniversaries arrived.
    expect(settle(tally({ sessions: 300 }), lift("2026-11-14"))).toEqual({
      earned: [],
      passed: ["sessions50", "sessions100"],
    });
  });

  it("decides nothing on a count it did not read", () => {
    expect(settle(tally({ sessions: null }), lift("2026-11-14"))).toEqual({
      earned: [],
      passed: [],
    });
  });
});

describe("1,000 km", () => {
  it("the run that takes the total past it earns it", () => {
    expect(
      settle(tally({ metres: 999_500 }), run("2026-11-14", 5000)).earned
    ).toEqual(["km1000"]);
    expect(
      settle(tally({ metres: 994_000 }), run("2026-11-14", 5000)).earned
    ).toEqual([]);
  });

  it("is never earned by a lift, nor by a run that does not count", () => {
    expect(
      settle(tally({ metres: 999_500 }), lift("2026-11-14")).earned
    ).toEqual([]);
    expect(
      settle(tally({ metres: 999_500 }), run("2026-11-14", 5000, false)).earned
    ).toEqual([]);
  });

  it("is recorded as passed for a runner already past it", () => {
    expect(
      settle(tally({ metres: 1_400_000 }), run("2026-11-14", 5000)).passed
    ).toEqual(["km1000"]);
  });
});

describe("a year of Tropos", () => {
  const startDay = "2025-11-14";

  it("is the account's first birthday, a start on 29 February a day later", () => {
    expect(anniversaryDay(startDay)).toBe("2026-11-14");
    expect(anniversaryDay("2024-02-29")).toBe("2025-03-01");
  });

  it("is earned by the first session on or after it, by someone who trained in the year", () => {
    expect(
      settle(tally({ lastDay: "2026-11-02" }), lift("2026-11-14"), { startDay })
        .earned
    ).toEqual(["oneYear"]);
    expect(
      settle(tally({ lastDay: "2026-11-02" }), lift("2026-11-13"), { startDay })
        .earned
    ).toEqual([]);
  });

  it("is passed when a session on or after it came first", () => {
    expect(
      settle(tally({ lastDay: "2026-11-14" }), lift("2026-11-16"), {
        startDay,
      }).passed
    ).toEqual(["oneYear"]);
  });

  it("is not earned by a first session that comes after it", () => {
    expect(
      settle(tally({ lastDay: null }), lift("2026-12-01"), { startDay })
    ).toEqual({ earned: [], passed: [] });
  });

  it("waits for the account's start and the newest sessions", () => {
    expect(
      settle(tally({ lastDay: "2026-11-02" }), lift("2026-11-14")).earned
    ).toEqual([]);
    expect(
      settle(tally({ lastDay: undefined }), lift("2026-11-14"), { startDay })
        .earned
    ).toEqual([]);
  });
});

describe("once per account", () => {
  it("never decides a kind it has already marked", () => {
    const marks: AnniversaryMarks = {
      sessions50: { day: "2026-06-01", shown: true },
      sessions100: { day: null, shown: true },
      oneYear: { day: "2026-11-14", shown: true },
      km1000: { day: "2026-10-01", shown: false },
    };
    // Below every line again after a deletion, then over it again.
    expect(
      settle(
        tally({ sessions: 49, metres: 999_000, lastDay: "2026-11-01" }),
        run("2026-11-20", 5000),
        { marks, startDay: "2025-11-14" }
      )
    ).toEqual({ earned: [], passed: [] });
  });

  it("reads nothing more once every kind is marked", () => {
    const all = Object.fromEntries(
      ANNIVERSARY_KINDS.map((kind) => [kind, { day: null, shown: true }])
    ) as AnniversaryMarks;
    expect(
      anniversariesToCheck(
        all,
        { sport: "run", day: "2027-01-01" },
        "2025-01-01"
      )
    ).toEqual({ sessions: false, metres: false, year: false });
  });

  it("reads the kilometres only on a run, and the year only from its day", () => {
    const marks: AnniversaryMarks = {
      sessions50: { day: null, shown: true },
      sessions100: { day: null, shown: true },
    };
    expect(
      anniversariesToCheck(
        marks,
        { sport: "lift", day: "2026-11-13" },
        "2025-11-14"
      )
    ).toEqual({ sessions: false, metres: false, year: false });
    expect(
      anniversariesToCheck(
        marks,
        { sport: "run", day: "2026-11-14" },
        "2025-11-14"
      )
    ).toEqual({ sessions: false, metres: true, year: true });
  });

  it("shows what was earned and not yet shown, in order", () => {
    expect(
      unshownAnniversaries({
        km1000: { day: "2026-11-14", shown: false },
        sessions100: { day: "2026-11-14", shown: false },
        sessions50: { day: "2026-06-01", shown: true },
        oneYear: { day: null, shown: true },
      })
    ).toEqual([
      { kind: "sessions100", day: "2026-11-14" },
      { kind: "km1000", day: "2026-11-14" },
    ]);
  });
});

describe("the words", () => {
  it("say what, how much and since when", () => {
    expect(anniversaryWords("sessions50", "2025-03-03")).toMatchObject({
      headline: "Your 50th session",
      figure: "50",
      unit: "sessions",
      line: "You’ve trained 50 times since 3 Mar 2025. 100 is next.",
      tone: "lifting",
    });
    expect(anniversaryWords("oneYear", "2025-11-14").line).toBe(
      "You’ve trained with Tropos since 14 Nov 2025."
    );
    expect(anniversaryWords("sessions100", null).line).toBe(
      "You’ve trained 100 times."
    );
  });

  it("name kilometres in the running coral, grouped as the reader groups", () => {
    const km = anniversaryWords("km1000", null);
    expect(km).toMatchObject({
      headline: `${group(1000)} km run`,
      figure: group(1000),
      unit: "km",
      tone: "running",
    });
  });

  it("keep every headline to five words or fewer", () => {
    for (const kind of ANNIVERSARY_KINDS)
      expect(
        anniversaryWords(kind, null).headline.split(/\s+/).length
      ).toBeLessThanOrEqual(5);
  });
});
