/**
 * Cross-consistency test for the TS + JS ports of the PR-J helper.
 *
 * Q3 P32 intended a single CommonJS source-of-truth for client +
 * server. The TS port at `src/lib/scheduledRunCompletion.ts` exists
 * because `tsconfig.app.json:include = ["src"]` makes the
 * cross-module-import-with-.d.ts approach awkward. To prevent the
 * two copies from drifting, this test runs identical fixtures
 * through both implementations and asserts the resulting claim
 * maps are byte-identical.
 *
 * If a future PR-L or refactor switches to a real shared CommonJS
 * source, this test can be deleted in favor of importing the JS
 * directly via the bridge.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  computeClaims as computeClaimsTs,
  isRunDayComplete as isRunDayCompleteTs,
  isRaceDayCompletedStrictly as isRaceDayCompletedStrictlyTs,
  getCompletionKind,
  type ClaimState,
} from "../scheduledRunCompletion";
import type { CompletionDeps, SavedRunLike } from "../scheduledRunCompletion";
import type { ScheduledRunDay } from "@/features/program/programTypes";

const require = createRequire(import.meta.url);
const js = require("../../../functions/lib/scheduledRunCompletion");

const TEMPLATE_QUALITY: Record<string, "quality" | "easy"> = {
  easy_30: "easy",
  long_60: "easy",
  recovery_20: "easy",
  tempo_45: "quality",
  intervals_6x800: "quality",
  race: "quality",
};

const DEPS: CompletionDeps = {
  paceBucketFor: (saved: SavedRunLike) => {
    if (!saved || typeof saved.avgPace !== "number") return "easy";
    if (saved.avgPace < 270) return "quality";
    return "easy";
  },
  templateQualityBucket: TEMPLATE_QUALITY,
};

function runDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
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

function savedRun(overrides: Partial<SavedRunLike> = {}): SavedRunLike {
  return {
    id: "sr-1",
    date: "2026-05-18",
    distance: 5000,
    avgPace: 360,
    createdAt: { seconds: 1716000000 },
    ...overrides,
  };
}

function serializeClaimMap(m: Map<string, unknown>): Array<[string, unknown]> {
  // Sort for stable comparison
  return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
}

describe("scheduledRunCompletion — TS / JS parity", () => {
  it("tracer: same claim map for a basic single-claim case", () => {
    const runDays = [runDay({ id: "rd-A" })];
    const savedRuns = [savedRun({ id: "sr-A" })];
    const today = "2026-05-18";

    const tsMap = computeClaimsTs(runDays, savedRuns, {}, today, DEPS);
    const jsMap = js.computeClaims(runDays, savedRuns, {}, today, DEPS);

    expect(serializeClaimMap(tsMap)).toEqual(serializeClaimMap(jsMap));
  });

  it("parity: same-date + dayIndex tiebreaker", () => {
    const runDays = [
      runDay({ id: "rd-LATE", dayIndex: 3 }),
      runDay({ id: "rd-EARLY", dayIndex: 1 }),
    ];
    const savedRuns = [savedRun({ id: "sr-A" })];
    const today = "2026-05-18";

    const tsMap = computeClaimsTs(runDays, savedRuns, {}, today, DEPS);
    const jsMap = js.computeClaims(runDays, savedRuns, {}, today, DEPS);

    expect(serializeClaimMap(tsMap)).toEqual(serializeClaimMap(jsMap));
  });

  it("parity: legacy completed_* skips the walk", () => {
    const runDays = [
      runDay({ id: "rd-LEGACY", status: "completed_exact" }),
      runDay({ id: "rd-FRESH", dayIndex: 2 }),
    ];
    const savedRuns = [savedRun({ id: "sr-A", date: "2026-05-18" })];
    const today = "2026-05-18";

    const tsMap = computeClaimsTs(runDays, savedRuns, {}, today, DEPS);
    const jsMap = js.computeClaims(runDays, savedRuns, {}, today, DEPS);

    expect(serializeClaimMap(tsMap)).toEqual(serializeClaimMap(jsMap));
  });

  it("parity: manual completions branch", () => {
    const runDays = [runDay({ id: "rd-A" })];
    const tsMap = computeClaimsTs(
      runDays,
      [],
      { "rd-A": { completedAt: new Date(2026, 4, 18) } },
      "2026-05-18",
      DEPS
    );
    const jsMap = js.computeClaims(
      runDays,
      [],
      { "rd-A": { completedAt: new Date(2026, 4, 18) } },
      "2026-05-18",
      DEPS
    );
    expect(serializeClaimMap(tsMap)).toEqual(serializeClaimMap(jsMap));
  });

  it("parity: date+1 day-late window", () => {
    const runDays = [runDay({ id: "rd-A", date: "2026-05-18" })];
    const savedRuns = [savedRun({ id: "sr-A", date: "2026-05-19" })];
    const today = "2026-05-19";

    const tsMap = computeClaimsTs(runDays, savedRuns, {}, today, DEPS);
    const jsMap = js.computeClaims(runDays, savedRuns, {}, today, DEPS);

    expect(serializeClaimMap(tsMap)).toEqual(serializeClaimMap(jsMap));
  });

  it("parity: quality-bucket guard rejects easy-pace tempo", () => {
    const runDays = [runDay({ id: "rd-A", templateId: "tempo_45" })];
    const savedRuns = [savedRun({ id: "sr-A", avgPace: 400 })]; // easy pace
    const today = "2026-05-18";

    const tsMap = computeClaimsTs(runDays, savedRuns, {}, today, DEPS);
    const jsMap = js.computeClaims(runDays, savedRuns, {}, today, DEPS);

    expect(serializeClaimMap(tsMap)).toEqual(serializeClaimMap(jsMap));
  });

  it("parity: isRunDayComplete returns the same for all three branches", () => {
    const runDays = [
      runDay({ id: "rd-A" }),
      runDay({ id: "rd-B", dayIndex: 2 }),
      runDay({ id: "rd-LEG", dayIndex: 3, status: "completed_late" }),
    ];
    const savedRuns = [savedRun({ id: "sr-B", date: "2026-05-18" })];
    const manual = { "rd-A": { completedAt: new Date() } };
    const today = "2026-05-18";

    const tsMap = computeClaimsTs(runDays, savedRuns, manual, today, DEPS);
    const jsMap = js.computeClaims(runDays, savedRuns, manual, today, DEPS);

    for (const id of ["rd-A", "rd-B", "rd-LEG", "rd-MISSING"]) {
      expect(isRunDayCompleteTs(id, tsMap)).toBe(
        js.isRunDayComplete(id, jsMap)
      );
    }
  });

  it("parity: isRaceDayCompletedStrictly with templateId match + distance", () => {
    const raceDay = runDay({ id: "rd-RACE", templateId: "race" });
    const savedRace = savedRun({
      id: "sr-RACE",
      templateId: "race",
      distance: 21000,
    });
    const deps = {
      ...DEPS,
      plannedDistanceFor: () => 21100,
    };
    const tsMap = computeClaimsTs(
      [raceDay],
      [savedRace],
      {},
      "2026-05-18",
      deps
    );
    const jsMap = js.computeClaims(
      [raceDay],
      [savedRace],
      {},
      "2026-05-18",
      deps
    );

    expect(
      isRaceDayCompletedStrictlyTs("rd-RACE", tsMap, [savedRace], raceDay, deps)
    ).toBe(
      js.isRaceDayCompletedStrictly(
        "rd-RACE",
        jsMap,
        [savedRace],
        raceDay,
        deps
      )
    );
  });
});

describe("getCompletionKind (TS-only — PR-J Q2 P24 / chunk B3k)", () => {
  // Helper isn't ported to JS — it's a UI-level discriminator used
  // by RunWeekStrip / DayPeekCard / DayActionSheet to render the
  // manual ✅ visually distinct from real ✅. Server-side has no
  // analogous need (PR-L recomputes claim state on triggers, not
  // render).
  function entry(partial: Partial<ClaimState>): ClaimState {
    return {
      claimedSavedRunId: undefined,
      manualCompleted: false,
      legacyCompleted: false,
      ...partial,
    };
  }

  it("returns null when the entry isn't in the map", () => {
    expect(getCompletionKind("nope", new Map())).toBeNull();
  });

  it("returns null when the entry exists but no completion source is set", () => {
    const m = new Map<string, ClaimState>([["rd-1", entry({})]]);
    expect(getCompletionKind("rd-1", m)).toBeNull();
  });

  it("returns 'real' for an organic saved-run claim", () => {
    const m = new Map<string, ClaimState>([
      ["rd-1", entry({ claimedSavedRunId: "saved-a" })],
    ]);
    expect(getCompletionKind("rd-1", m)).toBe("real");
  });

  it("returns 'real' for a legacy completed_* doc", () => {
    // P24 bucketing: legacy docs represent actual activity recorded
    // under the old writer — they read as 'real' so the UI doesn't
    // misclassify archived weeks as manual.
    const m = new Map<string, ClaimState>([
      ["rd-1", entry({ legacyCompleted: true })],
    ]);
    expect(getCompletionKind("rd-1", m)).toBe("real");
  });

  it("returns 'manual' for a manualCompletions-only entry", () => {
    const m = new Map<string, ClaimState>([
      ["rd-1", entry({ manualCompleted: true })],
    ]);
    expect(getCompletionKind("rd-1", m)).toBe("manual");
  });

  it("prefers 'real' when both real-source AND manual are present", () => {
    // Defensive precedence — if a real saved-run match landed AFTER
    // a manual completion was already written, the real source wins
    // for display purposes (the actual activity is the stronger
    // signal). manualCompletions cleanup is a separate concern.
    const m = new Map<string, ClaimState>([
      [
        "rd-1",
        entry({
          claimedSavedRunId: "saved-a",
          manualCompleted: true,
        }),
      ],
    ]);
    expect(getCompletionKind("rd-1", m)).toBe("real");
  });

  it("prefers 'real' when legacyCompleted AND manualCompleted are both set", () => {
    const m = new Map<string, ClaimState>([
      [
        "rd-1",
        entry({
          legacyCompleted: true,
          manualCompleted: true,
        }),
      ],
    ]);
    expect(getCompletionKind("rd-1", m)).toBe("real");
  });
});
