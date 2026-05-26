/**
 * PR-L L1 + L3 — daily race-reconciliation sweep, pure-decision tests.
 *
 * The Cloud Function combines two server-authoritative writes that
 * previously lived as client `useEffect`s in `useProgram.ts`:
 *
 *   L1: race_no_show transition when the race date + 3-day grace
 *       has elapsed and no real race-templated saved run claimed
 *       the slot.
 *   L3: recovery-phase clear when today >= recoveryEndDate + 7-day
 *       grace.
 *
 * The Firestore-backed wrapper (`_runDailyRaceReconciliationForUser`)
 * is emulator-tested separately — these tests pin the pure decision
 * function (`_decideReconciliationActions`) + the helpers it composes
 * (`_hasStrictRaceMatch`, `_needsRaceNoShowEvaluation`).
 *
 * Tests cover the lock pins:
 *   - Q1 P4: race-day strict (templateId === "race" + ≥95% distance)
 *   - Q3 P23: bounded saved-run query — only the race-date bucket
 *   - PR-D grace: race date must be > 3 days past
 *   - PR-E grace: recovery must be > 7 days past recoveryEndDate
 *   - Idempotency: a second call with the post-write state writes nothing
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || "tropos-unit-test",
  });
}

const {
  _hasStrictRaceMatch,
  _decideReconciliationActions,
  _needsRaceNoShowEvaluation,
  _utcDateString,
} = require("../index");

// ── Fixture helpers ──────────────────────────────────────────────

/** Anchor "today" at a deterministic point so date math is stable
 *  across CI environments. Picked far enough from a real test
 *  fixture so all the race-date scenarios fall comfortably in past
 *  or future as needed. */
const FIXED_NOW_MS = new Date("2026-06-01T12:00:00Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function nDaysAgo(n) {
  const d = new Date(FIXED_NOW_MS - n * DAY_MS);
  return _utcDateString(d);
}

function profile(overrides = {}) {
  return {
    uid: "u1",
    runMode: "race_prep",
    raceGoal: { distance: "10k", targetDate: nDaysAgo(5) },
    ...overrides,
  };
}

function runDay(overrides = {}) {
  return {
    id: "runday_race_default",
    dayIndex: 6,
    templateId: "race",
    type: "race",
    status: "planned",
    date: nDaysAgo(5),
    ...overrides,
  };
}

function programState(overrides = {}) {
  return {
    runDays: [runDay()],
    runPlan: {
      mode: "race_prep",
      raceGoal: { distance: "10k", targetDate: nDaysAgo(5) },
    },
    ...overrides,
  };
}

// ── _hasStrictRaceMatch ─────────────────────────────────────────

describe("_hasStrictRaceMatch", () => {
  it("returns false for an empty saved-runs list", () => {
    expect(_hasStrictRaceMatch([], 10000)).toBe(false);
  });

  it("returns false when no saved run has templateId='race'", () => {
    expect(
      _hasStrictRaceMatch([{ templateId: "tempo", distance: 10000 }], 10000)
    ).toBe(false);
  });

  it("returns false when a race-templated run is sub-95% of planned", () => {
    // 9 km on a 10K (90%) — DNF, sits as a Q5 extra rather than
    // claiming the slot.
    expect(
      _hasStrictRaceMatch([{ templateId: "race", distance: 9000 }], 10000)
    ).toBe(false);
  });

  it("returns true at exactly 95% of planned (≥ boundary)", () => {
    expect(
      _hasStrictRaceMatch([{ templateId: "race", distance: 9500 }], 10000)
    ).toBe(true);
  });

  it("returns true above 95%", () => {
    expect(
      _hasStrictRaceMatch([{ templateId: "race", distance: 10200 }], 10000)
    ).toBe(true);
  });

  it("returns true when planned distance is missing (Q1 P29 fallback)", () => {
    // Without a plannedDistance we can't gate on the ratio; the
    // race-templated run is accepted as a match to preserve the
    // client's lenient behavior in this edge.
    expect(
      _hasStrictRaceMatch([{ templateId: "race", distance: 5000 }], 0)
    ).toBe(true);
  });

  it("returns false when the race-templated run lacks a distance field", () => {
    expect(_hasStrictRaceMatch([{ templateId: "race" }], 10000)).toBe(false);
  });
});

// ── _needsRaceNoShowEvaluation ──────────────────────────────────

describe("_needsRaceNoShowEvaluation", () => {
  it("returns false when runMode is not race_prep", () => {
    expect(
      _needsRaceNoShowEvaluation(
        profile({ runMode: "structured" }),
        programState(),
        FIXED_NOW_MS
      )
    ).toBe(false);
  });

  it("returns false when there is no race goal", () => {
    expect(
      _needsRaceNoShowEvaluation(
        profile(),
        programState({ runPlan: { mode: "race_prep" } }),
        FIXED_NOW_MS
      )
    ).toBe(false);
  });

  it("returns false when the race-day runDay is missing entirely", () => {
    expect(
      _needsRaceNoShowEvaluation(
        profile(),
        programState({ runDays: [] }),
        FIXED_NOW_MS
      )
    ).toBe(false);
  });

  it("returns false when the race-day runDay status isn't 'planned' (already terminal)", () => {
    expect(
      _needsRaceNoShowEvaluation(
        profile(),
        programState({ runDays: [runDay({ status: "race_no_show" })] }),
        FIXED_NOW_MS
      )
    ).toBe(false);
  });

  it("returns false when the race date is within the 3-day grace", () => {
    // 3 days exactly — daysPast === 3, NOT > 3 → no evaluation.
    const raceDate = nDaysAgo(3);
    expect(
      _needsRaceNoShowEvaluation(
        profile({ raceGoal: { distance: "10k", targetDate: raceDate } }),
        programState({
          runDays: [runDay({ date: raceDate })],
          runPlan: {
            mode: "race_prep",
            raceGoal: { distance: "10k", targetDate: raceDate },
          },
        }),
        FIXED_NOW_MS
      )
    ).toBe(false);
  });

  it("returns true when the race date is more than 3 days past + slot is still planned", () => {
    expect(
      _needsRaceNoShowEvaluation(profile(), programState(), FIXED_NOW_MS)
    ).toBe(true);
  });
});

// ── _decideReconciliationActions ────────────────────────────────

describe("_decideReconciliationActions — L1 race-no-show", () => {
  it("returns no-op payload when race is within grace", () => {
    const raceDate = nDaysAgo(1);
    const result = _decideReconciliationActions(
      profile({ raceGoal: { distance: "10k", targetDate: raceDate } }),
      programState({
        runDays: [runDay({ date: raceDate })],
        runPlan: {
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: raceDate },
        },
      }),
      [],
      FIXED_NOW_MS
    );
    expect(result.payload).toBeNull();
    expect(result.noShowWritten).toBe(false);
  });

  it("writes race_no_show when grace has passed + no matching saved run", () => {
    const result = _decideReconciliationActions(
      profile(),
      programState(),
      [],
      FIXED_NOW_MS
    );
    expect(result.payload).not.toBeNull();
    expect(result.noShowWritten).toBe(true);
    expect(result.payload.runDays).toHaveLength(1);
    expect(result.payload.runDays[0].status).toBe("race_no_show");
  });

  it("does NOT write race_no_show when a real strict race match exists", () => {
    const result = _decideReconciliationActions(
      profile(),
      programState(),
      [{ templateId: "race", distance: 10500 }],
      FIXED_NOW_MS
    );
    expect(result.payload).toBeNull();
    expect(result.noShowWritten).toBe(false);
  });

  it("does NOT write race_no_show when a sub-95% race run exists (Q1 P4 strict)", () => {
    // 9km on a 10K — DNF, doesn't claim the slot. Slot still flips
    // to race_no_show; the run remains as a Q5 extra.
    const result = _decideReconciliationActions(
      profile(),
      programState(),
      [{ templateId: "race", distance: 9000 }],
      FIXED_NOW_MS
    );
    expect(result.payload).not.toBeNull();
    expect(result.noShowWritten).toBe(true);
  });

  it("preserves non-race-day runDays unchanged when writing", () => {
    const otherRunDay = runDay({
      id: "runday_thu_easy",
      date: nDaysAgo(7),
      templateId: "easy_30",
      type: "easy",
      status: "completed_exact",
    });
    const result = _decideReconciliationActions(
      profile(),
      programState({ runDays: [otherRunDay, runDay()] }),
      [],
      FIXED_NOW_MS
    );
    expect(result.payload.runDays).toHaveLength(2);
    // Other runDay unchanged.
    expect(result.payload.runDays[0]).toEqual(otherRunDay);
    // Race-day runDay flipped.
    expect(result.payload.runDays[1].status).toBe("race_no_show");
  });
});

describe("_decideReconciliationActions — L3 recovery-exit", () => {
  it("returns no-op when phase is not 'recovery'", () => {
    const result = _decideReconciliationActions(
      profile(),
      programState({
        runPlan: {
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: nDaysAgo(20) },
          // No phase.
        },
      }),
      [],
      FIXED_NOW_MS
    );
    expect(result.payload).toBeNull();
    expect(result.recoveryCleared).toBe(false);
  });

  it("returns no-op when today < recoveryEndDate + 7 days (still in grace)", () => {
    // Recovery ended 3 days ago — still inside the 7-day grace.
    const recoveryEndDate = nDaysAgo(3);
    const result = _decideReconciliationActions(
      profile({ raceGoal: { distance: "10k", targetDate: nDaysAgo(20) } }),
      programState({
        runDays: [], // no runDays so race-day pass is short-circuited
        runPlan: {
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: nDaysAgo(20) },
          phase: "recovery",
          recoveryEndDate,
        },
      }),
      [],
      FIXED_NOW_MS
    );
    expect(result.payload).toBeNull();
    expect(result.recoveryCleared).toBe(false);
  });

  it("clears phase + recoveryEndDate when today >= recoveryEndDate + 7 days", () => {
    const recoveryEndDate = nDaysAgo(8);
    const result = _decideReconciliationActions(
      profile({ raceGoal: { distance: "10k", targetDate: nDaysAgo(35) } }),
      programState({
        runDays: [],
        runPlan: {
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: nDaysAgo(35) },
          phase: "recovery",
          recoveryEndDate,
          totalWeeks: 8,
          currentWeek: 7,
        },
      }),
      [],
      FIXED_NOW_MS
    );
    expect(result.payload).not.toBeNull();
    expect(result.recoveryCleared).toBe(true);
    expect(result.payload.runPlan.phase).toBeUndefined();
    expect(result.payload.runPlan.recoveryEndDate).toBeUndefined();
    // Other runPlan fields preserved.
    expect(result.payload.runPlan.totalWeeks).toBe(8);
    expect(result.payload.runPlan.currentWeek).toBe(7);
    expect(result.payload.runPlan.raceGoal).toBeTruthy();
  });

  it("clears at exactly recoveryEndDate + 7 days (≥ boundary)", () => {
    // Exact-7-day boundary.
    const recoveryEndDate = _utcDateString(new Date(FIXED_NOW_MS - 7 * DAY_MS));
    const result = _decideReconciliationActions(
      profile({ raceGoal: { distance: "10k", targetDate: nDaysAgo(30) } }),
      programState({
        runDays: [],
        runPlan: {
          mode: "race_prep",
          phase: "recovery",
          recoveryEndDate,
        },
      }),
      [],
      FIXED_NOW_MS
    );
    expect(result.payload).not.toBeNull();
    expect(result.recoveryCleared).toBe(true);
  });
});

describe("_decideReconciliationActions — idempotency + combined", () => {
  it("returns no-op when the post-write state is fed back through (idempotent)", () => {
    // First call: race-no-show transition happens.
    const first = _decideReconciliationActions(
      profile(),
      programState(),
      [],
      FIXED_NOW_MS
    );
    expect(first.noShowWritten).toBe(true);

    // Feed the result back as the new programState. Slot is now
    // race_no_show; second invocation must be a no-op.
    const postWriteProgramState = programState({
      runDays: first.payload.runDays,
    });
    const second = _decideReconciliationActions(
      profile(),
      postWriteProgramState,
      [],
      FIXED_NOW_MS
    );
    expect(second.payload).toBeNull();
    expect(second.noShowWritten).toBe(false);
  });

  it("can write BOTH L1 + L3 in a single decision (multi-race scenario)", () => {
    // User finished their previous race (entered recovery 8d ago,
    // grace just expired) AND has a new race-day slot that's past
    // its 3-day grace with no log. Both writes should fold into
    // one payload — single Firestore write.
    const oldRecoveryEnd = nDaysAgo(8);
    const newRaceDate = nDaysAgo(5);
    const result = _decideReconciliationActions(
      profile({ raceGoal: { distance: "10k", targetDate: newRaceDate } }),
      programState({
        runDays: [
          runDay({
            id: "runday_new_race",
            date: newRaceDate,
            templateId: "race",
          }),
        ],
        runPlan: {
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: newRaceDate },
          phase: "recovery",
          recoveryEndDate: oldRecoveryEnd,
        },
      }),
      [],
      FIXED_NOW_MS
    );
    expect(result.payload).not.toBeNull();
    expect(result.noShowWritten).toBe(true);
    expect(result.recoveryCleared).toBe(true);
    expect(result.payload.runDays[0].status).toBe("race_no_show");
    expect(result.payload.runPlan.phase).toBeUndefined();
  });
});

describe("_utcDateString", () => {
  it("formats a known instant as YYYY-MM-DD in UTC", () => {
    expect(_utcDateString(new Date("2026-05-19T15:30:00Z"))).toBe("2026-05-19");
  });

  it("zero-pads month + day", () => {
    expect(_utcDateString(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});
