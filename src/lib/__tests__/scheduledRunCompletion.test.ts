/**
 * The claim walk in `scheduledRunCompletion.ts`, asserted directly.
 *
 * This module had NO spec of its own. Its header records why: the JS port
 * and the cross-test that pinned the two equal were deleted in #1733, and
 * nothing replaced them. `useClaimMap.test.ts` picked up the distance and
 * bucket branches, but the part that decides WHICH run completes WHICH day
 * — the two-phase walk, its exclusivity, and the day-late window — was
 * covered by neither file.
 *
 * That gap has a track record. CLAUDE.md records two bugs in exactly this
 * predicate that survived a green suite for months: the 70% gate comparing
 * metres to kilometres, and `templateId === "race"` matching an id no
 * document carries. Both had the same shape — the accept path was fiction
 * and nothing asserted a rejection. So every property below is pinned with
 * the refusal alongside the acceptance.
 *
 * Deps are injected here rather than imported, which is the module's own
 * design (Q3 P41) — but it also means these fixtures could agree with
 * themselves while production disagrees. The hook spec drives the REAL
 * `RUN_TEMPLATES`-backed deps; this file is about the walk.
 */
import { describe, it, expect } from "vitest";
import {
  computeClaims,
  isRunDayComplete,
  getCompletionKind,
  type CompletionDeps,
  type SavedRunLike,
} from "../scheduledRunCompletion";
import type {
  ScheduledRunDay,
  ManualCompletion,
} from "@/features/program/programTypes";

/** Mirrors the shape `useClaimMap` injects: metres, a 270 s/km bucket,
 *  quality by template type, race ids by TYPE (never the literal "race"). */
const DEPS: CompletionDeps = {
  paceBucketFor: (s) =>
    typeof s.avgPace === "number" && s.avgPace < 270 ? "quality" : "easy",
  templateQualityBucket: {
    tempo_6k: "quality",
    intervals_8x400: "quality",
    marathon_race: "quality",
    easy_30: "easy",
    long_15k: "easy",
  },
  plannedDistanceFor: (rd) =>
    ({
      easy_30: 5000,
      long_15k: 15000,
      tempo_6k: 6000,
      marathon_race: 42200,
    })[rd.userOverride || rd.templateId] ?? 0,
  isRaceTemplate: (id) => id === "marathon_race",
};

function day(
  id: string,
  date: string,
  dayIndex: number,
  templateId = "easy_30",
  extra: Partial<ScheduledRunDay> = {}
): ScheduledRunDay {
  return {
    id,
    date,
    dayIndex,
    templateId,
    type: "easy",
    ...extra,
  } as ScheduledRunDay;
}

function run(
  id: string,
  date: string,
  seconds: number,
  extra: Partial<SavedRunLike> = {}
): SavedRunLike {
  return {
    id,
    date,
    distance: 5000,
    avgPace: 330,
    createdAt: { seconds },
    ...extra,
  };
}

const claimOf = (map: Map<string, { claimedSavedRunId?: string }>, id: string) =>
  map.get(id)?.claimedSavedRunId;

describe("the two-phase claim walk", () => {
  it("gives a run to the day it was actually run on, not to an older gap", () => {
    /* THE ordering property, and the reason the walk is two passes rather
       than one. Monday was missed; Tuesday is planned; one run exists, on
       Tuesday. A single pass in dayIndex order would hand it to Monday as
       a day-late claim and leave Tuesday — the day it was genuinely run —
       showing incomplete. Phase 1 (same-date) must drain before phase 2
       (day-late) considers anything. */
    const map = computeClaims(
      [day("mon", "2026-05-11", 1), day("tue", "2026-05-12", 2)],
      [run("r1", "2026-05-12", 100)],
      {},
      "2026-05-12",
      DEPS
    );
    expect(claimOf(map, "tue")).toBe("r1");
    expect(claimOf(map, "mon")).toBeUndefined();
  });

  it("still covers the missed day when a SECOND run exists to cover it", () => {
    // Same shape, one more run: Tuesday keeps its own, Monday gets made up.
    const map = computeClaims(
      [day("mon", "2026-05-11", 1), day("tue", "2026-05-12", 2)],
      [run("r1", "2026-05-12", 100), run("r2", "2026-05-12", 200)],
      {},
      "2026-05-12",
      DEPS
    );
    expect(claimOf(map, "tue")).toBe("r1");
    expect(claimOf(map, "mon")).toBe("r2");
  });

  it("lets one run complete exactly one day", () => {
    /* Two days planned, one run. Whichever day wins, the other must stay
       open — a run counted twice inflates adherence and, downstream, the
       weekly fell-behind check. */
    const map = computeClaims(
      [day("a", "2026-05-12", 2), day("b", "2026-05-12", 3)],
      [run("r1", "2026-05-12", 100)],
      {},
      "2026-05-12",
      DEPS
    );
    const claimed = [claimOf(map, "a"), claimOf(map, "b")].filter(Boolean);
    expect(claimed).toEqual(["r1"]);
  });

  it("accepts a run one day late and refuses one two days late", () => {
    const late1 = computeClaims(
      [day("mon", "2026-05-11", 1)],
      [run("r1", "2026-05-12", 100)],
      {},
      "2026-05-13",
      DEPS
    );
    expect(claimOf(late1, "mon")).toBe("r1");

    const late2 = computeClaims(
      [day("mon", "2026-05-11", 1)],
      [run("r1", "2026-05-13", 100)],
      {},
      "2026-05-14",
      DEPS
    );
    expect(claimOf(late2, "mon")).toBeUndefined();
  });

  it("refuses a run from BEFORE the planned day", () => {
    // The window is late-only. Running Sunday does not tick Monday's box.
    const map = computeClaims(
      [day("mon", "2026-05-11", 1)],
      [run("r1", "2026-05-10", 100)],
      {},
      "2026-05-11",
      DEPS
    );
    expect(claimOf(map, "mon")).toBeUndefined();
  });

  it("carries the day-late window across month and year boundaries", () => {
    /* The shift is arithmetic on a UTC date, so the rollovers are where it
       would break silently — and only for the handful of users whose
       missed day lands on the 28th/31st. */
    const feb = computeClaims(
      [day("d", "2026-02-28", 6)],
      [run("r1", "2026-03-01", 100)],
      {},
      "2026-03-01",
      DEPS
    );
    expect(claimOf(feb, "d")).toBe("r1");

    const dec = computeClaims(
      [day("d", "2026-12-31", 4)],
      [run("r1", "2027-01-01", 100)],
      {},
      "2027-01-01",
      DEPS
    );
    expect(claimOf(dec, "d")).toBe("r1");
  });

  it("skips a run that fails the gates rather than stopping at it", () => {
    /* The inner loop must keep scanning. An earlier-created run that is too
       short has to be stepped over, not treated as this day's answer —
       otherwise logging a shakeout before your long run costs you the slot. */
    const map = computeClaims(
      [day("long", "2026-05-12", 2, "long_15k")],
      [
        run("short", "2026-05-12", 100, { distance: 3000 }),
        run("real", "2026-05-12", 200, { distance: 15000 }),
      ],
      {},
      "2026-05-12",
      DEPS
    );
    expect(claimOf(map, "long")).toBe("real");
  });

  it("is deterministic when two runs are equally eligible", () => {
    // Earliest createdAt wins; re-running must not shuffle the ✅s.
    const runs = [run("b", "2026-05-12", 200), run("a", "2026-05-12", 100)];
    const first = computeClaims(
      [day("d", "2026-05-12", 2)],
      runs,
      {},
      "2026-05-12",
      DEPS
    );
    const second = computeClaims(
      [day("d", "2026-05-12", 2)],
      runs.slice().reverse(),
      {},
      "2026-05-12",
      DEPS
    );
    expect(claimOf(first, "d")).toBe("a");
    expect(claimOf(second, "d")).toBe("a");
  });
});

describe("race day", () => {
  const raceDay = day("race", "2026-05-12", 2, "marathon_race", {
    type: "race",
  });

  it("completes on an untemplated finish at an ordinary marathon pace", () => {
    /* The bug this pins: the short-circuit used to require the SAVED run to
       be race-templated too. `actualTemplateId` is only written when the run
       was launched from the scheduled slot, so starting the app at the start
       line left it null — and the fall-through pace bar (270 s/km) rejects
       any marathon outside the sub-4:30/km minority. */
    const map = computeClaims(
      [raceDay],
      [run("r1", "2026-05-12", 100, { distance: 42200, avgPace: 330 })],
      {},
      "2026-05-12",
      DEPS
    );
    expect(claimOf(map, "race")).toBe("r1");
  });

  it("still refuses a run that is not race-distance", () => {
    /* The leniency is bounded by the distance gate, which every race
       template has (5 / 10 / 21.1 / 42.2 km). Without this the fix would
       read as "anything logged on race day completes race day". */
    const map = computeClaims(
      [raceDay],
      [run("r1", "2026-05-12", 100, { distance: 10000, avgPace: 330 })],
      {},
      "2026-05-12",
      DEPS
    );
    expect(claimOf(map, "race")).toBeUndefined();
  });

  it("does not extend the leniency to ordinary quality days", () => {
    // A tempo day is still gated on pace — the short-circuit is race-only.
    const map = computeClaims(
      [day("tempo", "2026-05-12", 2, "tempo_6k")],
      [run("r1", "2026-05-12", 100, { distance: 6000, avgPace: 330 })],
      {},
      "2026-05-12",
      DEPS
    );
    expect(claimOf(map, "tempo")).toBeUndefined();
  });

  it("reads race identity from the override when the day was swapped", () => {
    // Consistent with every other resolution site: the swap is the session
    // the user actually chose.
    const map = computeClaims(
      [
        day("d", "2026-05-12", 2, "easy_30", {
          userOverride: "marathon_race",
        }),
      ],
      [run("r1", "2026-05-12", 100, { distance: 42200, avgPace: 330 })],
      {},
      "2026-05-12",
      DEPS
    );
    expect(claimOf(map, "d")).toBe("r1");
  });
});

describe("legacy and manual completions", () => {
  const legacy = day("old", "2026-05-12", 2, "easy_30", {
    status: "completed_exact",
  } as Partial<ScheduledRunDay>);

  it("reports a legacy day complete without consuming a saved run", () => {
    /* Pre-reframe docs are already settled, so they are excluded from the
       walk. The run they'd otherwise claim stays free for a real slot —
       which is also what keeps it out of the extras list twice. */
    const map = computeClaims(
      [legacy, day("today", "2026-05-12", 3)],
      [run("r1", "2026-05-12", 100)],
      {},
      "2026-05-12",
      DEPS
    );
    expect(isRunDayComplete("old", map)).toBe(true);
    expect(claimOf(map, "old")).toBeUndefined();
    expect(claimOf(map, "today")).toBe("r1");
  });

  it("counts a manual tick as complete with no run at all", () => {
    const manual: Record<string, ManualCompletion> = {
      d: { completedAt: 1 },
    };
    const map = computeClaims(
      [day("d", "2026-05-12", 2)],
      [],
      manual,
      "2026-05-12",
      DEPS
    );
    expect(isRunDayComplete("d", map)).toBe(true);
  });

  it("leaves an untouched day incomplete", () => {
    // Guards the guard: `isRunDayComplete` must be capable of false.
    const map = computeClaims(
      [day("d", "2026-05-12", 2)],
      [],
      {},
      "2026-05-12",
      DEPS
    );
    expect(isRunDayComplete("d", map)).toBe(false);
    expect(isRunDayComplete("never-existed", map)).toBe(false);
  });
});

describe("getCompletionKind", () => {
  /* Q2 P24 renders a manual ✅ differently from a real one, so the
     precedence is user-visible: the badge tells you whether a GPS run
     matched the slot or whether you ticked it yourself. */
  it("calls a claimed run real, and a bare tick manual", () => {
    const claimed = computeClaims(
      [day("d", "2026-05-12", 2)],
      [run("r1", "2026-05-12", 100)],
      {},
      "2026-05-12",
      DEPS
    );
    expect(getCompletionKind("d", claimed)).toBe("real");

    const ticked = computeClaims(
      [day("d", "2026-05-12", 2)],
      [],
      { d: { completedAt: 1 } },
      "2026-05-12",
      DEPS
    );
    expect(getCompletionKind("d", ticked)).toBe("manual");
  });

  it("prefers the real run when the user ALSO ticked the day", () => {
    // Ticking a day and then logging the run must upgrade the badge, not
    // leave it reading as self-reported.
    const map = computeClaims(
      [day("d", "2026-05-12", 2)],
      [run("r1", "2026-05-12", 100)],
      { d: { completedAt: 1 } },
      "2026-05-12",
      DEPS
    );
    expect(getCompletionKind("d", map)).toBe("real");
  });

  it("treats a legacy completion as real activity", () => {
    const map = computeClaims(
      [
        day("old", "2026-05-12", 2, "easy_30", {
          status: "completed_exact",
        } as Partial<ScheduledRunDay>),
      ],
      [],
      {},
      "2026-05-12",
      DEPS
    );
    expect(getCompletionKind("old", map)).toBe("real");
  });

  it("returns null for an incomplete day and for one it has never seen", () => {
    const map = computeClaims(
      [day("d", "2026-05-12", 2)],
      [],
      {},
      "2026-05-12",
      DEPS
    );
    expect(getCompletionKind("d", map)).toBeNull();
    expect(getCompletionKind("absent", map)).toBeNull();
  });
});
