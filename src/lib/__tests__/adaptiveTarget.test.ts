import { describe, it, expect } from "vitest";
import {
  resolveTargetSource,
  applyWeeklyCap,
  MAX_WEEKLY_STEP_KCAL,
  type CapState,
} from "../adaptiveTarget";

describe("resolveTargetSource", () => {
  const base = {
    isPro: true,
    ready: true,
    formulaTarget: 2200,
    learnedApplied: 2400,
    isManualOverride: false,
  };

  it("manual override always wins — formula value, no warmup (even Pro+ready)", () => {
    const r = resolveTargetSource({ ...base, isManualOverride: true });
    expect(r.source).toBe("formula");
    expect(r.value).toBe(2200);
    expect(r.showWarmup).toBe(false);
  });

  it("free user: plain formula, never learned, never warmup (no tease)", () => {
    expect(resolveTargetSource({ ...base, isPro: false })).toEqual({
      source: "formula",
      value: 2200,
      showWarmup: false,
    });
    // ...even once the gate is ready.
    expect(
      resolveTargetSource({ ...base, isPro: false, ready: true }).source
    ).toBe("formula");
    expect(
      resolveTargetSource({ ...base, isPro: false, ready: true }).showWarmup
    ).toBe(false);
  });

  it("Pro + not ready: formula value + warmup bar", () => {
    const r = resolveTargetSource({ ...base, ready: false });
    expect(r.source).toBe("formula");
    expect(r.value).toBe(2200);
    expect(r.showWarmup).toBe(true);
  });

  it("Pro + ready but no applied value yet: formula + warmup", () => {
    const r = resolveTargetSource({ ...base, learnedApplied: null });
    expect(r.source).toBe("formula");
    expect(r.showWarmup).toBe(true);
  });

  it("Pro + ready + applied value: learned takes over, no warmup", () => {
    const r = resolveTargetSource(base);
    expect(r.source).toBe("learned");
    expect(r.value).toBe(2400);
    expect(r.showWarmup).toBe(false);
  });
});

describe("applyWeeklyCap", () => {
  const NOW = new Date("2026-06-01T12:00:00.000Z");
  const daysAgo = (n: number) =>
    new Date(NOW.getTime() - n * 86_400_000).toISOString();

  describe("first engage (no prior state) — seeded from formula, no jump", () => {
    it("clamps a large jump to formula ± max step", () => {
      const r = applyWeeklyCap({
        rawLearned: 2600,
        formulaTarget: 2200,
        prev: null,
        now: NOW,
      });
      expect(r.applied).toBe(2200 + MAX_WEEKLY_STEP_KCAL); // 2350, not 2600
      expect(r.changed).toBe(true);
      expect(r.capState.lastApplied).toBe(2350);
    });

    it("applies exactly when the learned value is within one step of formula", () => {
      const r = applyWeeklyCap({
        rawLearned: 2300,
        formulaTarget: 2200,
        prev: null,
        now: NOW,
      });
      expect(r.applied).toBe(2300);
    });

    it("clamps a downward first step to formula − max step", () => {
      const r = applyWeeklyCap({
        rawLearned: 1800,
        formulaTarget: 2200,
        prev: null,
        now: NOW,
      });
      expect(r.applied).toBe(2200 - MAX_WEEKLY_STEP_KCAL); // 2050
    });
  });

  describe("cadence (rolling 7 days)", () => {
    const prev: CapState = { lastApplied: 2350, lastAppliedAt: daysAgo(3) };

    it("holds the value within the 7-day window (no movement)", () => {
      const r = applyWeeklyCap({
        rawLearned: 2600,
        formulaTarget: 2200,
        prev,
        now: NOW,
      });
      expect(r.applied).toBe(2350);
      expect(r.changed).toBe(false);
    });

    it("steps at most one cap past the window", () => {
      const r = applyWeeklyCap({
        rawLearned: 2600,
        formulaTarget: 2200,
        prev: { lastApplied: 2350, lastAppliedAt: daysAgo(8) },
        now: NOW,
      });
      expect(r.applied).toBe(2500); // 2350 + 150
      expect(r.changed).toBe(true);
    });

    it("settles exactly once within a step past the window", () => {
      const r = applyWeeklyCap({
        rawLearned: 2400,
        formulaTarget: 2200,
        prev: { lastApplied: 2350, lastAppliedAt: daysAgo(8) },
        now: NOW,
      });
      expect(r.applied).toBe(2400);
    });

    it("clamps downward movement too", () => {
      const r = applyWeeklyCap({
        rawLearned: 2000,
        formulaTarget: 2200,
        prev: { lastApplied: 2500, lastAppliedAt: daysAgo(8) },
        now: NOW,
      });
      expect(r.applied).toBe(2350); // 2500 − 150
    });
  });
});
