/**
 * PR-J — soft-link reframe core helper.
 *
 * Tests for `computeClaims`, `isRunDayComplete`, and
 * `isRaceDayCompletedStrictly` per Q3 P32 + P33.
 *
 * The helper lives at `functions/lib/scheduledRunCompletion.js`
 * (CommonJS source of truth for client + server). TS re-exports
 * via `src/lib/scheduledRunStatus.ts`. PR-L's Cloud Functions
 * `require` it directly per Q3 P47.
 *
 * Methodology: TDD — red phase first, then green via the helper.
 * Tests pin Q1 + Q2 + Q3's locked behavior:
 *   - Q1 P1: asymmetric date window [planned.date, planned.date + 1]
 *   - Q1 P2: distance ≥ 70% of planned.distance
 *   - Q1 P3: quality-bucket guard for tempo/intervals/race
 *   - Q1 P4: race-day strict (templateId === "race" + ≥95%)
 *   - Q1 P5: single-claim — saved run credits ≤ 1 slot
 *   - Q2 P27: derivation OR over (saved match, manualCompletions, legacy status)
 *   - Q3 P44: walk order — same-date first by dayIndex, then date+1
 *   - Q3 P45: ClaimState shape locked
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Stub dep injectors per Q3 P41 — caller (test, client, server)
// supplies the lookups.
const TEMPLATE_QUALITY = {
  easy_30: "easy",
  long_60: "easy",
  recovery_20: "easy",
  tempo_45: "quality",
  intervals_6x800: "quality",
  race: "quality",
};
const templateQualityBucket = TEMPLATE_QUALITY;
const paceBucketFor = (saved) => {
  // Test stub: map avgPace (sec/km) to a coarse bucket.
  if (!saved || typeof saved.avgPace !== "number") return "easy";
  if (saved.avgPace < 270) return "quality"; // < 4:30/km
  return "easy";
};

const DEPS = { paceBucketFor, templateQualityBucket };

function runDay(overrides = {}) {
  return {
    id: "rd-1",
    date: "2026-05-18",
    weekKey: "2026-05-17",
    dayIndex: 1,
    templateId: "easy_30",
    type: "easy",
    ...overrides,
  };
}

function savedRun(overrides = {}) {
  return {
    id: "sr-1",
    date: "2026-05-18",
    distance: 5000,
    avgPace: 360,
    createdAt: { seconds: 1716000000, nanoseconds: 0 },
    ...overrides,
  };
}

describe("computeClaims — tracer", () => {
  it("Cycle 1: matching saved run claims the planned slot", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const runDays = [runDay({ id: "rd-A" })];
    const savedRuns = [savedRun({ id: "sr-A", distance: 5000 })];
    const map = computeClaims(runDays, savedRuns, {}, "2026-05-18", DEPS);
    expect(map.get("rd-A")?.claimedSavedRunId).toBe("sr-A");
    expect(map.get("rd-A")?.manualCompleted).toBe(false);
    expect(map.get("rd-A")?.legacyCompleted).toBe(false);
  });
});

describe("computeClaims — Q1 P1 date window", () => {
  it("matches same-date saved run", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A", date: "2026-05-18" })],
      [savedRun({ id: "sr-A", date: "2026-05-18" })],
      {},
      "2026-05-18",
      DEPS
    );
    expect(map.get("rd-A")?.claimedSavedRunId).toBe("sr-A");
  });

  it("matches day-late saved run (date + 1)", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A", date: "2026-05-18" })],
      [savedRun({ id: "sr-A", date: "2026-05-19" })],
      {},
      "2026-05-19",
      DEPS
    );
    expect(map.get("rd-A")?.claimedSavedRunId).toBe("sr-A");
  });

  it("does NOT match day-early saved run (planned future)", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A", date: "2026-05-19" })],
      [savedRun({ id: "sr-A", date: "2026-05-18" })],
      {},
      "2026-05-18",
      DEPS
    );
    expect(map.get("rd-A")?.claimedSavedRunId).toBeUndefined();
  });

  it("does NOT match 2+ days late", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A", date: "2026-05-18" })],
      [savedRun({ id: "sr-A", date: "2026-05-20" })],
      {},
      "2026-05-20",
      DEPS
    );
    expect(map.get("rd-A")?.claimedSavedRunId).toBeUndefined();
  });
});

describe("computeClaims — Q1 P2 distance threshold", () => {
  it("matches at exactly 70% of planned distance", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [
        runDay({
          id: "rd-A",
          templateId: "easy_30",
          // planned 10km
        }),
      ],
      [
        savedRun({
          id: "sr-A",
          distance: 7000, // 70% of 10000
        }),
      ],
      {},
      "2026-05-18",
      // Inject planned distance via deps for the test — real
      // production helper will read it from the templateId lookup.
      {
        ...DEPS,
        plannedDistanceFor: (rd) =>
          rd.templateId === "easy_30" ? 10000 : 5000,
      }
    );
    expect(map.get("rd-A")?.claimedSavedRunId).toBe("sr-A");
  });

  it("does NOT match below 70%", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A", templateId: "easy_30" })],
      [savedRun({ id: "sr-A", distance: 6999 })],
      {},
      "2026-05-18",
      {
        ...DEPS,
        plannedDistanceFor: () => 10000,
      }
    );
    expect(map.get("rd-A")?.claimedSavedRunId).toBeUndefined();
  });

  it("Q1 P29: planned distance ≤ 0 falls back to date + template-bucket match", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A", templateId: "easy_30" })],
      [savedRun({ id: "sr-A", distance: 100 })], // tiny but non-zero
      {},
      "2026-05-18",
      {
        ...DEPS,
        plannedDistanceFor: () => 0, // unconfigured slot
      }
    );
    // Falls back to date + template-bucket — non-quality easy template
    // claims any distance.
    expect(map.get("rd-A")?.claimedSavedRunId).toBe("sr-A");
  });
});

describe("computeClaims — Q1 P3 quality-bucket guard", () => {
  it("tempo planned + tempo pace saved → match", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A", templateId: "tempo_45" })],
      [savedRun({ id: "sr-A", distance: 5000, avgPace: 250 })], // quality pace
      {},
      "2026-05-18",
      DEPS
    );
    expect(map.get("rd-A")?.claimedSavedRunId).toBe("sr-A");
  });

  it("tempo planned + easy pace saved → NO match", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A", templateId: "tempo_45" })],
      [savedRun({ id: "sr-A", distance: 5000, avgPace: 400 })], // easy pace
      {},
      "2026-05-18",
      DEPS
    );
    expect(map.get("rd-A")?.claimedSavedRunId).toBeUndefined();
  });

  it("non-quality (easy) template accepts any pace (distance-only branch)", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A", templateId: "easy_30" })],
      [savedRun({ id: "sr-A", distance: 5000, avgPace: 200 })], // even quality pace OK
      {},
      "2026-05-18",
      DEPS
    );
    expect(map.get("rd-A")?.claimedSavedRunId).toBe("sr-A");
  });
});

describe("computeClaims — Q1 P5 + Q3 P44 single-claim + walk order", () => {
  it("two same-date runDays, one saved run — claims by dayIndex ASC", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [
        runDay({ id: "rd-LATE", dayIndex: 3, templateId: "easy_30" }),
        runDay({ id: "rd-EARLY", dayIndex: 1, templateId: "easy_30" }),
      ],
      [savedRun({ id: "sr-A", distance: 5000 })],
      {},
      "2026-05-18",
      DEPS
    );
    // Lower dayIndex wins
    expect(map.get("rd-EARLY")?.claimedSavedRunId).toBe("sr-A");
    expect(map.get("rd-LATE")?.claimedSavedRunId).toBeUndefined();
  });

  it("same-date wins over date+1 (Q3 P44 two-phase walk)", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [
        runDay({ id: "rd-MON", date: "2026-05-18", dayIndex: 1 }),
        runDay({ id: "rd-SUN", date: "2026-05-17", dayIndex: 0 }),
      ],
      // Saved run on Monday — could match Mon (same-date) or Sun (date+1).
      // Same-date wins.
      [savedRun({ id: "sr-A", date: "2026-05-18" })],
      {},
      "2026-05-18",
      DEPS
    );
    expect(map.get("rd-MON")?.claimedSavedRunId).toBe("sr-A");
    expect(map.get("rd-SUN")?.claimedSavedRunId).toBeUndefined();
  });

  it("ties broken by runDay.id lex (Q3 P34)", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [
        runDay({ id: "rd-Z", dayIndex: 1 }),
        runDay({ id: "rd-A", dayIndex: 1 }),
      ],
      [savedRun({ id: "sr-A", distance: 5000 })],
      {},
      "2026-05-18",
      DEPS
    );
    expect(map.get("rd-A")?.claimedSavedRunId).toBe("sr-A");
    expect(map.get("rd-Z")?.claimedSavedRunId).toBeUndefined();
  });
});

describe("computeClaims — Q2 P11 manualCompletions branch", () => {
  it("sets manualCompleted=true when map has the entry", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A" })],
      [], // no saved runs
      { "rd-A": { completedAt: new Date() } },
      "2026-05-18",
      DEPS
    );
    expect(map.get("rd-A")?.manualCompleted).toBe(true);
    expect(map.get("rd-A")?.claimedSavedRunId).toBeUndefined();
  });
});

describe("computeClaims — Q2 P27 legacy branch", () => {
  it("legacy status sets legacyCompleted=true (Q3 P35: doesn't claim saved runs)", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [
        runDay({
          id: "rd-LEGACY",
          status: "completed_exact",
        }),
      ],
      [savedRun({ id: "sr-A", distance: 5000 })],
      {},
      "2026-05-18",
      DEPS
    );
    expect(map.get("rd-LEGACY")?.legacyCompleted).toBe(true);
    // Q3 P35: legacy slots don't claim — sr-A is free for other slots.
    expect(map.get("rd-LEGACY")?.claimedSavedRunId).toBeUndefined();
  });

  it("legacy completed: true (pre-status) is NOT in the legacy branch here — migration boundary handles", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      // Note: no `status`. Helper only checks the status field;
      // `getScheduledRunStatus` in the client layer maps
      // `completed: true → completed_exact` BEFORE passing here.
      [runDay({ id: "rd-LEGACY", completed: true })],
      [],
      {},
      "2026-05-18",
      DEPS
    );
    // Without status, the helper doesn't flag legacyCompleted —
    // the boundary helper `getScheduledRunStatus` is the canonical
    // pre-translation step.
    expect(map.get("rd-LEGACY")?.legacyCompleted).toBe(false);
  });
});

describe("isRunDayComplete — OR over three branches (Q2 P27)", () => {
  it("returns true via saved-run claim", () => {
    const {
      computeClaims,
      isRunDayComplete,
    } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A" })],
      [savedRun({ id: "sr-A" })],
      {},
      "2026-05-18",
      DEPS
    );
    expect(isRunDayComplete("rd-A", map)).toBe(true);
  });

  it("returns true via manual completion", () => {
    const {
      computeClaims,
      isRunDayComplete,
    } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A" })],
      [],
      { "rd-A": { completedAt: new Date() } },
      "2026-05-18",
      DEPS
    );
    expect(isRunDayComplete("rd-A", map)).toBe(true);
  });

  it("returns true via legacy status", () => {
    const {
      computeClaims,
      isRunDayComplete,
    } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A", status: "completed_exact" })],
      [],
      {},
      "2026-05-18",
      DEPS
    );
    expect(isRunDayComplete("rd-A", map)).toBe(true);
  });

  it("returns false when nothing matches", () => {
    const {
      computeClaims,
      isRunDayComplete,
    } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A" })],
      [],
      {},
      "2026-05-18",
      DEPS
    );
    expect(isRunDayComplete("rd-A", map)).toBe(false);
  });

  it("returns false for unknown runDayId", () => {
    const {
      computeClaims,
      isRunDayComplete,
    } = require("../lib/scheduledRunCompletion");
    const map = computeClaims([], [], {}, "2026-05-18", DEPS);
    expect(isRunDayComplete("rd-MISSING", map)).toBe(false);
  });
});

describe("isRaceDayCompletedStrictly — Q1 P4 race-day strict", () => {
  it("returns true when templateId === 'race' + ≥95% distance", () => {
    const {
      computeClaims,
      isRaceDayCompletedStrictly,
    } = require("../lib/scheduledRunCompletion");
    const raceDay = runDay({ id: "rd-RACE", templateId: "race" });
    const savedRunRace = savedRun({
      id: "sr-RACE",
      templateId: "race",
      distance: 21000, // 21km vs 21.1km half-marathon
    });
    const map = computeClaims([raceDay], [savedRunRace], {}, "2026-05-18", {
      ...DEPS,
      plannedDistanceFor: () => 21100, // half marathon
    });
    expect(isRaceDayCompletedStrictly("rd-RACE", map, [savedRunRace])).toBe(
      true
    );
  });

  it("returns false when saved-run templateId is not 'race'", () => {
    const {
      computeClaims,
      isRaceDayCompletedStrictly,
    } = require("../lib/scheduledRunCompletion");
    const raceDay = runDay({ id: "rd-RACE", templateId: "race" });
    const savedFreeform = savedRun({
      id: "sr-A",
      distance: 21000,
      // no templateId
    });
    const map = computeClaims([raceDay], [savedFreeform], {}, "2026-05-18", {
      ...DEPS,
      plannedDistanceFor: () => 21100,
    });
    expect(isRaceDayCompletedStrictly("rd-RACE", map, [savedFreeform])).toBe(
      false
    );
  });

  it("returns false on sub-95% race (Round 3 #25 DNF case)", () => {
    const {
      computeClaims,
      isRaceDayCompletedStrictly,
    } = require("../lib/scheduledRunCompletion");
    const raceDay = runDay({ id: "rd-RACE", templateId: "race" });
    const dnf = savedRun({
      id: "sr-DNF",
      templateId: "race",
      distance: 19000, // 90% of 21100
    });
    const deps = { ...DEPS, plannedDistanceFor: () => 21100 };
    const map = computeClaims([raceDay], [dnf], {}, "2026-05-18", deps);
    // Pass runDay + deps so strict check enforces the 95% ratio
    expect(
      isRaceDayCompletedStrictly("rd-RACE", map, [dnf], raceDay, deps)
    ).toBe(false);
  });

  it("returns false when manual-only (Q1 P4 + Q2 P12 — manual completions don't count for race-day)", () => {
    const {
      computeClaims,
      isRaceDayCompletedStrictly,
    } = require("../lib/scheduledRunCompletion");
    const raceDay = runDay({ id: "rd-RACE", templateId: "race" });
    const map = computeClaims(
      [raceDay],
      [],
      { "rd-RACE": { completedAt: new Date() } },
      "2026-05-18",
      DEPS
    );
    expect(isRaceDayCompletedStrictly("rd-RACE", map, [])).toBe(false);
  });
});

describe("computeClaims — empty inputs", () => {
  it("handles empty runDays", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims([], [savedRun()], {}, "2026-05-18", DEPS);
    expect(map.size).toBe(0);
  });

  it("handles empty saved runs + no manual + no legacy", () => {
    const { computeClaims } = require("../lib/scheduledRunCompletion");
    const map = computeClaims(
      [runDay({ id: "rd-A" })],
      [],
      {},
      "2026-05-18",
      DEPS
    );
    expect(map.get("rd-A")).toEqual({
      manualCompleted: false,
      legacyCompleted: false,
    });
  });
});
