/**
 * PR-L L4 — weekly fell-behind detection, pure-decision tests.
 *
 * Tests pin the lock pins:
 *   - <50% threshold per the PR-L plan
 *   - Freeform users skipped (no prescription)
 *   - Recovery-phase users skipped (recovery isn't fell-behind)
 *   - Real saved runs only (Q5 P25 — gamification math reads
 *     `realSavedRunMatch && !manualComplete`)
 *   - Idempotent on re-runs (same week → no spurious writes)
 *   - Clear path for users who recover during the same week
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
  _priorWeekUtcRange,
  _isVolumeEligibleRun,
  _fellBehindRatio,
  _decideFellBehindFlag,
} = require("../index");

// ── Fixture helpers ──────────────────────────────────────────────

const WEEK_KEY = "2026-05-24"; // a Sunday

function profile(overrides = {}) {
  return {
    uid: "u1",
    runMode: "structured",
    weeklyRunDaysTarget: 4,
    ...overrides,
  };
}

function programState(overrides = {}) {
  return {
    runDays: [],
    runPlan: { mode: "structured" },
    ...overrides,
  };
}

function realRun(overrides = {}) {
  return {
    date: WEEK_KEY,
    distance: 5000,
    duration: 1800,
    isInvalid: false,
    savedAnyway: false,
    ...overrides,
  };
}

// ── _priorWeekUtcRange ──────────────────────────────────────────

describe("_priorWeekUtcRange", () => {
  it("for a Monday, returns the prior Sun..Sat week", () => {
    // Mon 2026-06-01 → prior week Sun 2026-05-24, Sat 2026-05-30
    const monday = new Date("2026-06-01T05:00:00Z").getTime();
    const range = _priorWeekUtcRange(monday);
    expect(range.weekStart).toBe("2026-05-24");
    expect(range.weekEnd).toBe("2026-05-30");
    expect(range.weekKey).toBe("2026-05-24");
  });

  it("for a Sunday, returns last Sun..Sat (the prior calendar week)", () => {
    // Sun 2026-05-31 → prior week Sun 2026-05-24, Sat 2026-05-30
    const sunday = new Date("2026-05-31T05:00:00Z").getTime();
    const range = _priorWeekUtcRange(sunday);
    expect(range.weekStart).toBe("2026-05-24");
    expect(range.weekEnd).toBe("2026-05-30");
  });

  it("for a Wednesday, prior week is Sun..Sat ending the previous Saturday", () => {
    // Wed 2026-06-03 → prior week Sun 2026-05-24, Sat 2026-05-30
    const wednesday = new Date("2026-06-03T05:00:00Z").getTime();
    const range = _priorWeekUtcRange(wednesday);
    expect(range.weekStart).toBe("2026-05-24");
    expect(range.weekEnd).toBe("2026-05-30");
  });
});

// ── _isVolumeEligibleRun ────────────────────────────────────────

describe("_isVolumeEligibleRun", () => {
  it("returns true for a normal saved run", () => {
    expect(_isVolumeEligibleRun(realRun())).toBe(true);
  });

  it("returns false when isInvalid is true", () => {
    expect(_isVolumeEligibleRun(realRun({ isInvalid: true }))).toBe(false);
  });

  it("returns false when savedAnyway is true", () => {
    expect(_isVolumeEligibleRun(realRun({ savedAnyway: true }))).toBe(false);
  });

  it("returns false for sub-50m distance (zombie run)", () => {
    expect(_isVolumeEligibleRun(realRun({ distance: 10 }))).toBe(false);
  });

  it("returns false for sub-30s duration", () => {
    expect(_isVolumeEligibleRun(realRun({ duration: 5 }))).toBe(false);
  });

  it("returns false for missing distance / duration", () => {
    expect(_isVolumeEligibleRun({ date: WEEK_KEY })).toBe(false);
  });

  it("returns false for a null / undefined input (defensive)", () => {
    expect(_isVolumeEligibleRun(null)).toBe(false);
    expect(_isVolumeEligibleRun(undefined)).toBe(false);
  });
});

// ── _fellBehindRatio (shared single source of truth) ────────────

describe("_fellBehindRatio", () => {
  it("returns null when the user has no prescriptive target", () => {
    expect(
      _fellBehindRatio(profile({ runMode: "freeform" }), programState(), [])
    ).toBeNull();
    expect(
      _fellBehindRatio(profile({ runMode: undefined }), programState(), [])
    ).toBeNull();
    expect(
      _fellBehindRatio(
        profile(),
        programState({ runPlan: { mode: "race_prep", phase: "recovery" } }),
        []
      )
    ).toBeNull();
    expect(
      _fellBehindRatio(
        profile({ weeklyRunDaysTarget: 0, weeklyRunsTarget: 0 }),
        programState(),
        []
      )
    ).toBeNull();
  });

  it("computes ratio + fellBehind against the weekly target", () => {
    const s = _fellBehindRatio(
      profile({ weeklyRunDaysTarget: 4 }),
      programState(),
      [realRun()] // 1 of 4
    );
    expect(s).toEqual({
      realRunCount: 1,
      weeklyTarget: 4,
      completedRatio: 0.25,
      fellBehind: true,
    });
  });

  it("is not behind at exactly 50% (strict <) and counts real runs only", () => {
    const onBoundary = _fellBehindRatio(
      profile({ weeklyRunDaysTarget: 4 }),
      programState(),
      [realRun(), realRun()] // 2 of 4 = 50%
    );
    expect(onBoundary.fellBehind).toBe(false);

    const realOnly = _fellBehindRatio(
      profile({ weeklyRunDaysTarget: 4 }),
      programState(),
      [realRun(), realRun({ isInvalid: true }), realRun({ savedAnyway: true })]
    );
    expect(realOnly.realRunCount).toBe(1);
    expect(realOnly.fellBehind).toBe(true);
  });
});

// ── _decideFellBehindFlag ───────────────────────────────────────

describe("_decideFellBehindFlag — skip conditions", () => {
  it("freeform users → noop (no prescription)", () => {
    expect(
      _decideFellBehindFlag(
        profile({ runMode: "freeform" }),
        programState(),
        [],
        WEEK_KEY
      )
    ).toEqual({ action: "noop" });
  });

  it("runMode missing → noop", () => {
    expect(
      _decideFellBehindFlag(
        profile({ runMode: undefined }),
        programState(),
        [],
        WEEK_KEY
      )
    ).toEqual({ action: "noop" });
  });

  it("recovery-phase users → noop (recovery isn't fell-behind territory)", () => {
    expect(
      _decideFellBehindFlag(
        profile(),
        programState({
          runPlan: { mode: "race_prep", phase: "recovery" },
        }),
        [],
        WEEK_KEY
      )
    ).toEqual({ action: "noop" });
  });

  it("weeklyTarget is 0 (malformed state) → noop", () => {
    expect(
      _decideFellBehindFlag(
        profile({ weeklyRunDaysTarget: 0, weeklyRunsTarget: 0 }),
        programState(),
        [],
        WEEK_KEY
      )
    ).toEqual({ action: "noop" });
  });
});

describe("_decideFellBehindFlag — set / no-set decisions", () => {
  it("sets fell-behind flag when ratio < 0.5 (1/4 prescribed runs)", () => {
    const result = _decideFellBehindFlag(
      profile({ weeklyRunDaysTarget: 4 }),
      programState(),
      [realRun()], // 1 real run
      WEEK_KEY
    );
    expect(result.action).toBe("set");
    expect(result.payload.pendingFellBehindPrompt.weekKey).toBe(WEEK_KEY);
    expect(result.payload.pendingFellBehindPrompt.completedRatio).toBe(0.25);
    expect(result.payload.pendingFellBehindPrompt.realRunCount).toBe(1);
    expect(result.payload.pendingFellBehindPrompt.weeklyTarget).toBe(4);
  });

  it("does NOT set the flag at exactly 50% (the 'fell behind' threshold is strict <)", () => {
    const result = _decideFellBehindFlag(
      profile({ weeklyRunDaysTarget: 4 }),
      programState(),
      [realRun(), realRun()], // 2/4 = 50% exactly
      WEEK_KEY
    );
    expect(result.action).toBe("noop");
  });

  it("does NOT set the flag at 75% (3/4 — solid week)", () => {
    const result = _decideFellBehindFlag(
      profile({ weeklyRunDaysTarget: 4 }),
      programState(),
      [realRun(), realRun(), realRun()],
      WEEK_KEY
    );
    expect(result.action).toBe("noop");
  });

  it("ignores invalid / save-anyway runs in the count (Q5 P25 — real only)", () => {
    // 4 runs but only 1 real → 25% → fell behind.
    const result = _decideFellBehindFlag(
      profile({ weeklyRunDaysTarget: 4 }),
      programState(),
      [
        realRun(),
        realRun({ isInvalid: true }),
        realRun({ savedAnyway: true }),
        realRun({ distance: 0 }),
      ],
      WEEK_KEY
    );
    expect(result.action).toBe("set");
    expect(result.payload.pendingFellBehindPrompt.realRunCount).toBe(1);
  });

  it("works with the legacy weeklyRunsTarget field (back-compat)", () => {
    const result = _decideFellBehindFlag(
      profile({ weeklyRunDaysTarget: undefined, weeklyRunsTarget: 4 }),
      programState(),
      [realRun()],
      WEEK_KEY
    );
    expect(result.action).toBe("set");
    expect(result.payload.pendingFellBehindPrompt.weeklyTarget).toBe(4);
  });

  it("treats explicit weeklyRunDaysTarget=0 as authoritative (no fallback to legacy field)", () => {
    // `??` (not `||`) — an explicit zero on the new field shouldn't
    // fall through to the legacy `weeklyRunsTarget`. Mirrors
    // `getWeeklyRunTarget` in src/lib/scheduleUtils.ts so server +
    // client agree on the resolved target.
    const result = _decideFellBehindFlag(
      profile({ weeklyRunDaysTarget: 0, weeklyRunsTarget: 4 }),
      programState(),
      [],
      WEEK_KEY
    );
    expect(result.action).toBe("noop");
  });
});

describe("_decideFellBehindFlag — idempotency + clear path", () => {
  it("re-firing on the same week with the same ratio → noop", () => {
    const programWithFlag = programState({
      pendingFellBehindPrompt: {
        weekKey: WEEK_KEY,
        completedRatio: 0.25,
        realRunCount: 1,
        weeklyTarget: 4,
      },
    });
    const result = _decideFellBehindFlag(
      profile({ weeklyRunDaysTarget: 4 }),
      programWithFlag,
      [realRun()],
      WEEK_KEY
    );
    expect(result.action).toBe("noop");
  });

  it("re-firing on the same week with a different ratio → set (update flag)", () => {
    // User back-filled one more run between sweeps. Ratio changes
    // 0.25 → 0.50 — still below the strict threshold? No, 0.50 is
    // the exact boundary so the flag clears. Try 0.5/4 = 0.125
    // initially, then 0.25 after a backfill.
    const programWithFlag = programState({
      pendingFellBehindPrompt: {
        weekKey: WEEK_KEY,
        completedRatio: 0.125,
        realRunCount: 0,
        weeklyTarget: 4,
      },
    });
    // Backfill brings count to 1 / target 4 = 0.25 → still
    // fell-behind, but the ratio's different → set updates.
    const result = _decideFellBehindFlag(
      profile({ weeklyRunDaysTarget: 4 }),
      programWithFlag,
      [realRun()],
      WEEK_KEY
    );
    expect(result.action).toBe("set");
    expect(result.payload.pendingFellBehindPrompt.completedRatio).toBe(0.25);
  });

  it("user recovered to ≥50% on the SAME week → clear the stale flag", () => {
    const programWithFlag = programState({
      pendingFellBehindPrompt: {
        weekKey: WEEK_KEY,
        completedRatio: 0.25,
        realRunCount: 1,
        weeklyTarget: 4,
      },
    });
    const result = _decideFellBehindFlag(
      profile({ weeklyRunDaysTarget: 4 }),
      programWithFlag,
      [realRun(), realRun()], // 2/4 = 50% → no fell-behind
      WEEK_KEY
    );
    expect(result.action).toBe("clear");
  });

  it("existing flag for an OLDER week is left untouched (client owns dismissal)", () => {
    // User has a fell-behind flag from 2 weeks ago they haven't
    // dismissed. This week (the one being evaluated) doesn't qualify
    // — but we DON'T overwrite the older flag.
    const programWithOldFlag = programState({
      pendingFellBehindPrompt: {
        weekKey: "2026-05-17",
        completedRatio: 0.25,
        realRunCount: 1,
        weeklyTarget: 4,
      },
    });
    const result = _decideFellBehindFlag(
      profile({ weeklyRunDaysTarget: 4 }),
      programWithOldFlag,
      [realRun(), realRun(), realRun()], // 3/4 = 75% — no fell-behind
      WEEK_KEY
    );
    expect(result.action).toBe("noop");
  });
});
