import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import {
  computeRunMove,
  runOriginDate,
  runMoveSourceSignature,
  runMoveCompletionEvidence,
} from "@/lib/runReschedule";
import { parseSavedRun } from "@/lib/savedRuns";
import { HARD_RUN_TYPES } from "../programTypes";
import type { ScheduledRunDay } from "../programTypes";

/**
 * Parity guard (RUN-RESCHEDULE-01 / P6): the one-off run move is now
 * double-sited — `src/lib/runReschedule.ts` computes it optimistically on the
 * client, and `functions/lib/runReschedule.js` recomputes it inside the
 * command transaction, which is the copy that decides what gets stored.
 *
 * The failure mode if they drift is quiet: the client paints the run on one
 * day, the server writes another, and the next read snaps it somewhere the
 * user did not put it. Nothing throws.
 *
 * The timezone claim is PROVED here rather than asserted. Both copies do whole
 * day arithmetic on plain YYYY-MM-DD strings — the client parses local, the
 * server parses UTC — so every day of the week is walked, not just one.
 */
const require = createRequire(import.meta.url);
const { localDateInZone } =
  require("../../../../functions/lib/programCommands") as {
    localDateInZone: (instant: number, timezone: string) => string;
  };
const cf = require("../../../../functions/lib/runReschedule") as {
  HARD_RUN_TYPES: readonly string[];
  computeRunMove: (
    source: unknown,
    targetDayIndex: number,
    weekSchedule: unknown
  ) => Record<string, unknown> | null;
  runOriginDate: (source: unknown) => string;
  dateForDay: (weekKey: string, dayIndex: number) => string | null;
  runMoveSourceSignature: typeof runMoveSourceSignature;
  runMoveCompletionEvidence: typeof runMoveCompletionEvidence;
  runMoveSavedEvidenceRow: (
    id: string,
    data: Record<string, unknown>,
    localDateForInstant: (ms: number) => string
  ) => unknown;
};

/* Mon 2026-03-02 — the week anchor since RunWk2. The server reads the
   anchor off the key itself during the transition, so the legacy Sunday
   case is exercised separately below rather than by pointing this at a
   Sunday. */
const WEEK_KEY = "2026-03-02";

function run(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: "run-1",
    dayIndex: 2,
    date: "2026-03-03",
    weekKey: WEEK_KEY,
    templateId: "tempo_20",
    type: "tempo",
    status: "planned",
    completed: false,
    ...overrides,
  } as ScheduledRunDay;
}

const SCHEDULE = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "both" },
  { day: 4, type: "rest" },
  { day: 5, type: "lift" },
  { day: 6, type: "run" },
];

describe("run move — client vs functions mirror", () => {
  it("reviewed source signatures agree, and prescription/date changes invalidate them", () => {
    for (const source of [
      run(),
      run({ status: undefined }),
      run({
        userOverride: "easy_30",
        timeLimit: { minutes: 20, originalTemplateId: "tempo_30" },
      }),
    ]) {
      expect(cf.runMoveSourceSignature(source)).toBe(
        runMoveSourceSignature(source)
      );
    }
    expect(runMoveSourceSignature(run({ userOverride: "easy_30" }))).not.toBe(
      runMoveSourceSignature(run())
    );
    expect(runMoveSourceSignature(run({ date: "2026-03-04" }))).not.toBe(
      runMoveSourceSignature(run())
    );
  });

  it("review evidence agrees with the real saved-run parser and catches corrections as well as additions", () => {
    const data = {
      date: "2026-03-03",
      completedAt: new Date("2026-03-03T12:00:00Z"),
      distance: 5000,
      duration: 1800,
      avgPace: 360,
      actualTemplateId: "easy_30",
      plannedTemplateId: "tempo_20",
      activityType: "freerun",
      isInvalid: false,
    };
    const client = parseSavedRun("saved-1", data)!;
    const server = cf.runMoveSavedEvidenceRow("saved-1", data, (ms) =>
      new Date(ms).toISOString().slice(0, 10)
    );
    const expected = runMoveCompletionEvidence([run()], [client]);
    expect(cf.runMoveCompletionEvidence([run()], [server] as never)).toBe(
      expected
    );
    expect(
      runMoveCompletionEvidence([run()], [{ ...client, distance: 8000 }])
    ).not.toBe(expected);
    expect(runMoveCompletionEvidence([run()], [])).not.toBe(expected);
    expect(
      runMoveCompletionEvidence([run({ userOverride: "easy_30" })], [client])
    ).not.toBe(expected);
  });

  it("captures evidence for earlier slots too, since an earlier claim can free a source-date run", () => {
    const days = [
      run({ id: "earlier", date: "2026-03-02", dayIndex: 1 }),
      run(),
    ];
    const saved = parseSavedRun("earlier-save", {
      date: "2026-03-02",
      completedAt: new Date("2026-03-02T12:00:00Z"),
      distance: 5000,
      duration: 1800,
    })!;
    expect(runMoveCompletionEvidence(days, [saved])).not.toBe(
      runMoveCompletionEvidence(days, [])
    );
    expect(cf.runMoveCompletionEvidence(days, [saved])).toBe(
      runMoveCompletionEvidence(days, [saved])
    );
  });

  it.each([
    "2026-03-04T00:30:00Z",
    "2026-03-04T12:00:00Z",
    "2026-03-04T23:30:00Z",
  ])(
    "legacy dates and template fallbacks normalise identically at %s",
    (completedAt) => {
      const data = {
        completedAt: { seconds: Date.parse(completedAt) / 1000 },
        plannedTemplateId: "tempo_20",
        distance: -1,
        duration: 1800,
        avgPace: NaN,
        savedAnyway: true,
      };
      const client = parseSavedRun("legacy", data)!;
      // The transaction formats legacy timestamps in the profile's IANA zone.
      // Model a profile in this device's zone, including midnight/DST offsets.
      const timezone = new Intl.DateTimeFormat("en-GB").resolvedOptions()
        .timeZone;
      const server = cf.runMoveSavedEvidenceRow("legacy", data, (ms) =>
        localDateInZone(ms, timezone)
      );
      expect(server).toMatchObject({
        day: client.day,
        templateId: "tempo_20",
        distance: 0,
        duration: 1800,
        avgPace: 0,
        savedAnyway: true,
      });
      // Keep the record inside the window so two filtered-out rows cannot pass.
      const days = [
        run({ date: client.day, dayIndex: client.completedAt.getDay() }),
      ];
      const evidence = runMoveCompletionEvidence(days, [client]);
      expect(evidence).not.toBe(runMoveCompletionEvidence(days, []));
      expect(cf.runMoveCompletionEvidence(days, [server] as never)).toBe(
        evidence
      );
    }
  );
  it("HARD_RUN_TYPES agrees as a set", () => {
    expect(new Set(cf.HARD_RUN_TYPES)).toEqual(new Set(HARD_RUN_TYPES));
  });

  it("agrees on every target day of the week", () => {
    for (let day = 0; day <= 6; day++) {
      expect(
        cf.computeRunMove(run(), day, SCHEDULE),
        `target day ${day}`
      ).toEqual(
        computeRunMove(run(), day, SCHEDULE as never) as unknown as Record<
          string,
          unknown
        >
      );
    }
  });

  it("agrees on the snap-back-to-origin case (markers DROPPED)", () => {
    // A run already moved away from Tuesday, moved back to Tuesday.
    const moved = run({
      dayIndex: 5,
      date: "2026-03-06",
      movedFromDate: "2026-03-03",
      movedToDate: "2026-03-06",
    });
    const server = cf.computeRunMove(moved, 2, SCHEDULE);
    const client = computeRunMove(moved, 2, SCHEDULE as never);
    expect(server).toEqual(client as unknown as Record<string, unknown>);
    // The property that matters: no markers, so the caller deletes them.
    expect(server?.movedFromDate).toBeUndefined();
    expect(server?.movedToDate).toBeUndefined();
  });

  it("agrees on the clash flag for every run type", () => {
    for (const type of ["long", "tempo", "intervals", "easy", "recovery"]) {
      for (const day of [1, 2, 3]) {
        const src = run({ type: type as ScheduledRunDay["type"] });
        expect(
          cf.computeRunMove(src, day, SCHEDULE)?.clashesWithLift,
          `${type} → day ${day}`
        ).toBe(computeRunMove(src, day, SCHEDULE as never)?.clashesWithLift);
      }
    }
  });

  it("agrees when the week schedule is empty or missing the day", () => {
    expect(cf.computeRunMove(run(), 4, [])).toEqual(
      computeRunMove(run(), 4, []) as unknown as Record<string, unknown>
    );
  });

  it("agrees that a run with no week anchor cannot move", () => {
    const anchorless = run({ weekKey: undefined });
    expect(cf.computeRunMove(anchorless, 3, SCHEDULE)).toBeNull();
    expect(computeRunMove(anchorless, 3, SCHEDULE as never)).toBeNull();
  });

  it("runOriginDate agrees", () => {
    expect(cf.runOriginDate(run())).toBe(runOriginDate(run()));
    const moved = run({ movedFromDate: "2026-03-02" });
    expect(cf.runOriginDate(moved)).toBe(runOriginDate(moved));
  });

  it("the server rejects an out-of-week day index", () => {
    // Client-side this is unreachable (the UI offers 0-6), but the command
    // validator bounds it and the mirror must not invent a date beyond the
    // week if that bound ever moves.
    expect(cf.dateForDay(WEEK_KEY, 7)).toBeNull();
    expect(cf.dateForDay(WEEK_KEY, -1)).toBeNull();
  });
});

describe("transition — a Sunday-anchored key from a client not yet on schema v4", () => {
  /* The server reads the anchor off the key itself, so a run stored by an
     old build (Sunday key, `dayIndex` == offset) still moves to the day it
     asked for. There is no client-side equivalent to mirror: every key the
     new client sees has been re-anchored to Monday by migration, so the
     assertion here is against the OLD client's arithmetic — the day index
     added straight onto the key — which is what that client would paint. */
  const SUNDAY_KEY = "2026-03-01";
  const legacyDate = (dayIndex: number) => `2026-03-0${1 + dayIndex}`; // Sun 1 .. Sat 7 March, the old week

  it("lands every weekday where the old client's arithmetic put it", () => {
    for (let dayIndex = 0; dayIndex <= 6; dayIndex++) {
      expect(cf.dateForDay(SUNDAY_KEY, dayIndex), `weekday ${dayIndex}`).toBe(
        legacyDate(dayIndex)
      );
    }
  });

  it("is distinguishable from the Monday case — the anchor is read, not assumed", () => {
    // Same weekday, different anchor, different date. If the server ever
    // hard-codes Monday before the Sunday branch is retired (RunWk2 PR 4),
    // this is the assertion that says so.
    expect(cf.dateForDay(SUNDAY_KEY, 0)).toBe("2026-03-01");
    expect(cf.dateForDay(WEEK_KEY, 0)).toBe("2026-03-08");
  });
});
