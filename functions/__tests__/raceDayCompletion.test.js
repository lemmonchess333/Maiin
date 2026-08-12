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

  it("accepts an UNTEMPLATED run that went the distance", () => {
    /* The 2026-08-12 fix. `actualTemplateId` is only written when the run
       was launched from the scheduled slot (`freeformPlanMetadata` writes
       null), so tapping Start Run on the start line saved the marathon
       untemplated — and requiring the tag recorded a `race_no_show` for a
       race the user had just run, costing them the race goal 14 days
       later. ≥95% of the planned distance on the race date is the
       stronger evidence, and it is present exactly when the tag is not. */
    expect(
      isStrictRaceRun(
        rawRun({ actualTemplateId: null, distance: 42195 }),
        42195
      )
    ).toBe(true);
    expect(
      isStrictRaceRun(
        rawRun({ actualTemplateId: undefined, distance: 9600 }),
        10000
      )
    ).toBe(true);
  });

  it("still refuses an untemplated run that did NOT go the distance", () => {
    /* Guards the guard: the tag was dropped, the distance bar was not.
       Without this, "untemplated ⇒ accepted" would pass the test above. */
    expect(
      isStrictRaceRun(
        rawRun({ actualTemplateId: null, distance: 9499 }),
        10000
      )
    ).toBe(false);
  });

  it("does not care WHICH template a distance-clearing run carries", () => {
    /* Follows from the above and is worth stating: an easy_30 tag on a
       full-distance run on race day is someone who raced with the wrong
       template selected, not someone who skipped. */
    expect(
      isStrictRaceRun(rawRun({ actualTemplateId: "easy_30" }), 42195)
    ).toBe(true);
  });

  it("requires the template tag when there is no planned distance", () => {
    /* The zero-planned branch is where the tag still carries the whole
       decision — nothing else distinguishes a race from a jog — so all
       three id properties are pinned HERE rather than against a
       distance-clearing run, where they would pass for the wrong reason.

       Reads `actualTemplateId`, never a plain `templateId`: raw docs have
       no such field, which is half of why the predicate shipped
       always-false. */
    expect(
      isStrictRaceRun(
        { templateId: "5k_race", distance: 10000, actualTemplateId: undefined },
        0
      )
    ).toBe(false);
    expect(isStrictRaceRun(rawRun({ actualTemplateId: "easy_30" }), 0)).toBe(
      false
    );

    // Every race-type id counts, so adding a race template cannot quietly
    // go unrecognised on the server.
    for (const id of RACE_TEMPLATE_IDS) {
      expect(isStrictRaceRun(rawRun({ actualTemplateId: id }), 0), `id ${id}`)
        .toBe(true);
    }

    // …and the literal "race" is pinned as a REJECTION, not merely absent.
    // It was the sole accept fixture for months; if it starts being
    // accepted again, the id mirror has been bypassed.
    expect(isStrictRaceRun(rawRun({ actualTemplateId: "race" }), 0)).toBe(
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
          rawRun({ distance: "10000" }), // distance is not a number
          // A tempo tag on a SHORT run: the tag alone no longer decides
          // (see isStrictRaceRun above), so the distance has to fail too
          // for this entry to be a rejection at all.
          rawRun({ actualTemplateId: "tempo_20", distance: 4000 }),
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
