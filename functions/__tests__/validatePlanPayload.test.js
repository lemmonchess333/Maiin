/**
 * Unit tests for `validatePlanPayload` (P0-4) — the authoritative
 * server-side gate on v7 plan writes.
 *
 * Lives alongside helpers.test.js / profileSanitizer.test.js as a
 * pure unit suite. No firebase-admin boot, no emulator, runs in
 * sub-second time so it's cheap to add cases.
 *
 * Each test pins ONE invariant; the test name describes the
 * invariant. If a test fails, don't relax the assertion — figure
 * out what regressed in `lib/validatePlanPayload.js` (or, equally
 * importantly, in the matching client validator
 * `src/features/program/planBuilder.ts:validatePlanOutput`).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validatePlanPayload } = require("../lib/validatePlanPayload");

/** A known-good payload. Tests mutate one field and assert. */
function validPayload() {
  return {
    profileData: {
      weekScheduleVersion: 1,
      runMode: "structured",
    },
    programState: {
      programSchemaVersion: 2,
      runDays: [
        {
          id: "runday_2026-05-10_2_easy_30min",
          date: "2026-05-12",
          weekKey: "2026-05-10",
          templateId: "easy_30min",
          status: "planned",
        },
      ],
      runPlan: { mode: "structured" },
    },
    weekSchedule: [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "run" },
      { day: 5, type: "rest" },
      { day: 6, type: "lift" },
    ],
  };
}

describe("validatePlanPayload — happy path", () => {
  it("returns empty array for a well-formed structured payload", () => {
    expect(validatePlanPayload(validPayload())).toEqual([]);
  });

  it("returns empty array for a well-formed race_prep payload", () => {
    const p = validPayload();
    p.profileData.runMode = "race_prep";
    p.profileData.raceGoal = { distance: "10k", targetDate: "2026-08-01" };
    p.programState.runPlan = {
      mode: "race_prep",
      raceGoal: { distance: "10k", targetDate: "2026-08-01" },
      totalWeeks: 12,
      currentWeek: 0,
    };
    expect(validatePlanPayload(p)).toEqual([]);
  });

  it("returns empty array for a well-formed freeform payload (no runDays needed)", () => {
    const p = validPayload();
    p.profileData.runMode = "freeform";
    p.programState.runDays = [];
    p.programState.runPlan = undefined;
    expect(validatePlanPayload(p)).toEqual([]);
  });
});

describe("validatePlanPayload — shape gate", () => {
  it("rejects null profileData", () => {
    const errors = validatePlanPayload({ ...validPayload(), profileData: null });
    expect(errors).toContain("profileData must be an object");
  });

  it("rejects array profileData", () => {
    const errors = validatePlanPayload({ ...validPayload(), profileData: [] });
    expect(errors).toContain("profileData must be an object");
  });

  it("rejects null programState", () => {
    const errors = validatePlanPayload({ ...validPayload(), programState: null });
    expect(errors).toContain("programState must be an object");
  });

  it("returns early on top-level shape failure (no cascading TypeErrors)", () => {
    // If the shape gate doesn't short-circuit, subsequent field reads
    // throw on `null.runMode` etc. and we lose the error list.
    const errors = validatePlanPayload({
      profileData: null,
      programState: null,
      weekSchedule: null,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain("profileData must be an object");
    expect(errors).toContain("programState must be an object");
  });
});

describe("validatePlanPayload — weekSchedule structure", () => {
  it("rejects non-array weekSchedule", () => {
    const errors = validatePlanPayload({ ...validPayload(), weekSchedule: "not an array" });
    expect(errors).toContain("weekSchedule must be an array");
  });

  it("rejects weekSchedule with wrong length", () => {
    const p = validPayload();
    p.weekSchedule = p.weekSchedule.slice(0, 6);
    expect(validatePlanPayload(p)).toContain("weekSchedule must have exactly 7 entries (got 6)");
  });

  it("rejects invalid day type", () => {
    const p = validPayload();
    p.weekSchedule[3].type = "yoga";
    expect(validatePlanPayload(p)).toContain(`weekSchedule[3].type = "yoga" is invalid`);
  });

  it("rejects day index mismatch (shuffled ordering)", () => {
    const p = validPayload();
    p.weekSchedule[2].day = 5;
    expect(validatePlanPayload(p)).toContain("weekSchedule[2].day mismatch (expected 2, got 5)");
  });

  it("accepts all four valid day types", () => {
    const p = validPayload();
    p.weekSchedule = [
      { day: 0, type: "rest" },
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "both" },
      { day: 4, type: "rest" },
      { day: 5, type: "lift" },
      { day: 6, type: "run" },
    ];
    expect(validatePlanPayload(p)).toEqual([]);
  });
});

describe("validatePlanPayload — runDays shape", () => {
  it("rejects runDay missing id", () => {
    const p = validPayload();
    delete p.programState.runDays[0].id;
    expect(validatePlanPayload(p)).toContain("runDays[0].id missing");
  });

  it("rejects runDay with malformed date", () => {
    const p = validPayload();
    p.programState.runDays[0].date = "5/12/2026";
    expect(validatePlanPayload(p)).toContain(
      `runDays[0].date invalid format (must be YYYY-MM-DD, got "5/12/2026")`,
    );
  });

  it("rejects runDay with UTC ISO date (T-separator leak)", () => {
    // Specifically guards against the toISOString().split('T') bug
    // where late-night PST users get bumped to the next UTC day.
    const p = validPayload();
    p.programState.runDays[0].date = "2026-05-12T07:00:00.000Z";
    const errors = validatePlanPayload(p);
    // Format check also catches this, but the explicit T-check pins
    // the bug class on its own.
    expect(errors.some((e) => e.includes("UTC ISO"))).toBe(true);
  });

  it("rejects runDay with UTC ISO weekKey", () => {
    const p = validPayload();
    p.programState.runDays[0].weekKey = "2026-05-10T00:00:00.000Z";
    expect(validatePlanPayload(p)).toContain(
      "runDays[0].weekKey appears to be UTC ISO format (contains 'T')",
    );
  });

  it("rejects runDay missing weekKey", () => {
    const p = validPayload();
    delete p.programState.runDays[0].weekKey;
    expect(validatePlanPayload(p)).toContain("runDays[0].weekKey missing");
  });

  it("rejects runDay missing templateId", () => {
    const p = validPayload();
    delete p.programState.runDays[0].templateId;
    expect(validatePlanPayload(p)).toContain("runDays[0].templateId missing");
  });

  it("rejects unknown status enum", () => {
    const p = validPayload();
    p.programState.runDays[0].status = "moved";
    expect(validatePlanPayload(p)).toContain(`runDays[0].status = "moved" is invalid`);
  });

  it("rejects 'missed' status (derived, not stored)", () => {
    // 'missed' is a derived state from date < today + status === 'planned'.
    // Storing it directly would diverge from the derivation logic.
    const p = validPayload();
    p.programState.runDays[0].status = "missed";
    expect(validatePlanPayload(p)).toContain(`runDays[0].status = "missed" is invalid`);
  });

  it("rejects 'freeform_extra' status (lives on run doc, not scheduledRunDay)", () => {
    const p = validPayload();
    p.programState.runDays[0].status = "freeform_extra";
    expect(validatePlanPayload(p)).toContain(`runDays[0].status = "freeform_extra" is invalid`);
  });

  it("accepts all listed terminal statuses", () => {
    const terminals = [
      "completed_exact",
      "completed_modified",
      "completed_late",
      "skipped",
      "race_no_show",
      "race_completed_unlinked",
    ];
    for (const status of terminals) {
      const p = validPayload();
      p.programState.runDays[0].status = status;
      expect(validatePlanPayload(p)).toEqual([]);
    }
  });

  it("rejects non-string userOverride", () => {
    // userOverride MUST stay as a string (template ID). A boolean
    // would break the existing `day.userOverride ?? day.templateId`
    // template-override logic in runPlanMetadata.
    const p = validPayload();
    p.programState.runDays[0].userOverride = true;
    expect(validatePlanPayload(p)).toContain(
      "runDays[0].userOverride must be string (template ID), not boolean",
    );
  });

  it("accepts undefined userOverride (the no-override case)", () => {
    const p = validPayload();
    p.programState.runDays[0].userOverride = undefined;
    expect(validatePlanPayload(p)).toEqual([]);
  });

  it("rejects non-array runDays when present", () => {
    const p = validPayload();
    p.programState.runDays = "not an array";
    expect(validatePlanPayload(p)).toContain(
      "programState.runDays must be an array when present",
    );
  });

  it("accepts missing runDays (freeform mode)", () => {
    const p = validPayload();
    p.profileData.runMode = "freeform";
    delete p.programState.runDays;
    p.programState.runPlan = undefined;
    expect(validatePlanPayload(p)).toEqual([]);
  });
});

describe("validatePlanPayload — runMode + raceGoal consistency", () => {
  it("rejects invalid runMode enum", () => {
    const p = validPayload();
    p.profileData.runMode = "cardio";
    expect(validatePlanPayload(p)).toContain(`profileData.runMode = "cardio" is invalid`);
  });

  it("rejects race_prep without profileData.raceGoal", () => {
    const p = validPayload();
    p.profileData.runMode = "race_prep";
    // raceGoal absent from profileData
    p.programState.runPlan = {
      mode: "race_prep",
      raceGoal: { distance: "5k", targetDate: "2026-07-01" },
    };
    expect(validatePlanPayload(p)).toContain("race_prep mode requires profileData.raceGoal");
  });

  it("rejects race_prep without programState.runPlan.raceGoal", () => {
    const p = validPayload();
    p.profileData.runMode = "race_prep";
    p.profileData.raceGoal = { distance: "5k", targetDate: "2026-07-01" };
    p.programState.runPlan = { mode: "race_prep" }; // raceGoal missing inside runPlan
    expect(validatePlanPayload(p)).toContain(
      "race_prep mode requires programState.runPlan.raceGoal",
    );
  });

  it("rejects race_prep with runPlan entirely absent", () => {
    const p = validPayload();
    p.profileData.runMode = "race_prep";
    p.profileData.raceGoal = { distance: "5k", targetDate: "2026-07-01" };
    delete p.programState.runPlan;
    expect(validatePlanPayload(p)).toContain(
      "race_prep mode requires programState.runPlan.raceGoal",
    );
  });
});

describe("validatePlanPayload — schema version gates", () => {
  it("rejects missing weekScheduleVersion", () => {
    const p = validPayload();
    delete p.profileData.weekScheduleVersion;
    expect(validatePlanPayload(p)).toContain(
      "profileData.weekScheduleVersion required (number >= 1)",
    );
  });

  it("rejects zero weekScheduleVersion (must be >= 1)", () => {
    const p = validPayload();
    p.profileData.weekScheduleVersion = 0;
    expect(validatePlanPayload(p)).toContain(
      "profileData.weekScheduleVersion required (number >= 1)",
    );
  });

  it("rejects string-coerced weekScheduleVersion", () => {
    const p = validPayload();
    p.profileData.weekScheduleVersion = "1";
    expect(validatePlanPayload(p)).toContain(
      "profileData.weekScheduleVersion required (number >= 1)",
    );
  });

  it("rejects missing programSchemaVersion", () => {
    const p = validPayload();
    delete p.programState.programSchemaVersion;
    expect(validatePlanPayload(p)).toContain(
      "programState.programSchemaVersion required (number >= 1)",
    );
  });

  it("rejects zero programSchemaVersion", () => {
    const p = validPayload();
    p.programState.programSchemaVersion = 0;
    expect(validatePlanPayload(p)).toContain(
      "programState.programSchemaVersion required (number >= 1)",
    );
  });
});

describe("validatePlanPayload — accumulates multiple errors", () => {
  it("returns all errors, not just the first one", () => {
    // Concrete diagnosability: a single submit that's wrong on
    // multiple axes should surface every problem, not the first one
    // alphabetically. The client validator does the same so retake
    // flows see the full repair list.
    const errors = validatePlanPayload({
      profileData: {
        // weekScheduleVersion missing
        runMode: "race_prep", // requires raceGoal
      },
      programState: {
        // programSchemaVersion missing
        runDays: [
          {
            // id, date, weekKey, templateId, status all missing
          },
        ],
      },
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "lift" },
        // only 2 entries — wrong length
      ],
    });
    expect(errors.length).toBeGreaterThan(5);
    expect(errors.some((e) => e.includes("weekSchedule must have exactly 7"))).toBe(true);
    expect(errors.some((e) => e.includes("weekScheduleVersion"))).toBe(true);
    expect(errors.some((e) => e.includes("programSchemaVersion"))).toBe(true);
    expect(errors.some((e) => e.includes("runDays[0].id missing"))).toBe(true);
    expect(errors.some((e) => e.includes("race_prep mode requires"))).toBe(true);
  });
});
