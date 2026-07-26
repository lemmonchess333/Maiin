/**
 * Race-day completion — golden fixtures for the rule that ACTUALLY RUNS.
 *
 * This module is a deliberate NON-mirror of the client's claim-map rule
 * (`src/lib/scheduledRunCompletion.ts`) — different question, different
 * data shape — so it is pinned by fixtures rather than by a cross-test.
 * See `functions/lib/raceDayCompletion.js` for the full reasoning and
 * the history (a cross-tested server port existed for months, was never
 * `require`d, and read a field raw docs don't have).
 *
 * Fixtures are written in the RAW Firestore doc shape (`actualTemplateId`,
 * flattened planMetadata) — the shape the sweep and `onRunCreated` really
 * receive. If a future change makes the server read normalised runs, these
 * fixtures must change with it, loudly.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  RACE_STRICT_DISTANCE_RATIO,
  PLANNED_RACE_DISTANCE_METERS,
  RECOVERY_WEEKS_BY_DISTANCE,
  plannedDistanceFor,
  recoveryWeeksFor,
  isStrictRaceRun,
  hasStrictRaceMatch,
} = require("../lib/raceDayCompletion");
const { RACE_TEMPLATE_IDS } = require("../lib/raceTemplateIds");

/**
 * Raw saved-run doc, as RunSummary writes it.
 *
 * `actualTemplateId` is a REAL template id. It was `"race"` until
 * 2026-07-26 — a value production never writes — so the accept path was
 * verified against an impossible doc while the reject paths used real ids
 * (`easy_30`, `tempo_20`). Every rejection was therefore honest and the
 * one acceptance was fiction, which is how `isStrictRaceRun` shipped
 * always-false and read every completed race as a no-show.
 */
function rawRun(overrides = {}) {
  return {
    date: "2027-04-18",
    actualTemplateId: "marathon_race",
    distance: 42195,
    ...overrides,
  };
}

describe("constants", () => {
  it("pins the strict ratio and the planned-distance table", () => {
    expect(RACE_STRICT_DISTANCE_RATIO).toBe(0.95);
    expect(PLANNED_RACE_DISTANCE_METERS).toEqual({
      "5k": 5000,
      "10k": 10000,
      half: 21097,
      marathon: 42195,
    });
  });

  it("pins recovery weeks by distance — the server derives recoveryEndDate from this AND uses that date to identify which race recovery came from", () => {
    expect(RECOVERY_WEEKS_BY_DISTANCE).toEqual({
      "5k": 1,
      "10k": 2,
      half: 3,
      marathon: 4,
    });
  });

  it("tables are frozen (a stray mutation would drift every consumer)", () => {
    expect(Object.isFrozen(PLANNED_RACE_DISTANCE_METERS)).toBe(true);
    expect(Object.isFrozen(RECOVERY_WEEKS_BY_DISTANCE)).toBe(true);
  });

  it("lookups fall back to 0 for an unknown distance key", () => {
    expect(plannedDistanceFor("half")).toBe(21097);
    expect(plannedDistanceFor("ultra")).toBe(0);
    expect(plannedDistanceFor(undefined)).toBe(0);
    expect(recoveryWeeksFor("marathon")).toBe(4);
    expect(recoveryWeeksFor("ultra")).toBe(0);
  });
});

describe("isStrictRaceRun", () => {
  it("accepts a race-templated run at or above 95% of planned", () => {
    expect(isStrictRaceRun(rawRun({ distance: 10000 }), 10000)).toBe(true);
    expect(isStrictRaceRun(rawRun({ distance: 9500 }), 10000)).toBe(true);
  });

  it("rejects below 95%", () => {
    expect(isStrictRaceRun(rawRun({ distance: 9499 }), 10000)).toBe(false);
    expect(isStrictRaceRun(rawRun({ distance: 9000 }), 10000)).toBe(false);
  });

  it("reads actualTemplateId — NOT templateId (raw docs have no templateId)", () => {
    expect(
      isStrictRaceRun(
        { templateId: "race", distance: 10000, actualTemplateId: undefined },
        10000
      )
    ).toBe(false);
    expect(
      isStrictRaceRun(rawRun({ actualTemplateId: "easy_30" }), 10000)
    ).toBe(false);
  });

  it("accepts EVERY race-type id, not one hard-coded distance", () => {
    // The bug was a single impossible literal. Enumerating the real ids
    // makes "which values count" explicit, so adding a race template
    // cannot quietly go unrecognised on the server.
    for (const id of RACE_TEMPLATE_IDS) {
      expect(
        isStrictRaceRun(rawRun({ actualTemplateId: id }), 10000),
        `id ${id}`
      ).toBe(true);
    }
  });

  it('REJECTS the literal "race" — production never writes it', () => {
    // Pinned as a rejection, not merely absent. This exact value was the
    // sole accept fixture for months; if it starts being accepted again,
    // the id mirror has been bypassed.
    expect(isStrictRaceRun(rawRun({ actualTemplateId: "race" }), 10000)).toBe(
      false
    );
  });

  it("rejects an isInvalid / savedAnyway run however far it went", () => {
    expect(isStrictRaceRun(rawRun({ isInvalid: true }), 42195)).toBe(false);
    expect(isStrictRaceRun(rawRun({ savedAnyway: true }), 42195)).toBe(false);
  });

  it("requires a numeric distance BEFORE the zero-planned fallback", () => {
    // Gate order is load-bearing — see the unification note in the module.
    expect(isStrictRaceRun(rawRun({ distance: undefined }), 0)).toBe(false);
    expect(isStrictRaceRun(rawRun({ distance: "42195" }), 10000)).toBe(false);
  });

  it("an unconfigured goal (planned 0) accepts any race-templated run with a distance", () => {
    expect(isStrictRaceRun(rawRun({ distance: 1 }), 0)).toBe(true);
  });

  it("handles null/undefined runs", () => {
    expect(isStrictRaceRun(null, 10000)).toBe(false);
    expect(isStrictRaceRun(undefined, 10000)).toBe(false);
  });
});

describe("hasStrictRaceMatch", () => {
  it("is false for an empty or non-array list", () => {
    expect(hasStrictRaceMatch([], 10000)).toBe(false);
    expect(hasStrictRaceMatch(null, 10000)).toBe(false);
    expect(hasStrictRaceMatch(undefined, 10000)).toBe(false);
  });

  it("is true when ANY run in the date-scoped list qualifies", () => {
    expect(
      hasStrictRaceMatch(
        [
          rawRun({ actualTemplateId: "easy_30", distance: 5000 }),
          rawRun({ distance: 9600 }),
        ],
        10000
      )
    ).toBe(true);
  });

  it("is false when every run fails a gate", () => {
    expect(
      hasStrictRaceMatch(
        [
          rawRun({ distance: 9000 }), // short
          rawRun({ isInvalid: true }), // flagged
          rawRun({ actualTemplateId: "tempo_20" }), // wrong template
        ],
        10000
      )
    ).toBe(false);
  });

  it("skips malformed entries without throwing", () => {
    expect(hasStrictRaceMatch([null, undefined, rawRun()], 42195)).toBe(true);
    expect(hasStrictRaceMatch([null, undefined], 42195)).toBe(false);
  });
});

describe("index.js still exposes the same predicate (test-surface stability)", () => {
  it("_hasStrictRaceMatch is the extracted function", () => {
    const { _hasStrictRaceMatch } = require("../index");
    expect(_hasStrictRaceMatch).toBe(hasStrictRaceMatch);
  });
});
