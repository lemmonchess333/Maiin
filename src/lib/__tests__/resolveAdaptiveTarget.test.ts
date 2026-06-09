/**
 * Table tests for the adaptive-target ENGINE entry point
 * (`resolveAdaptiveTarget`) — the estimate → weekly-cap → source-precedence →
 * view-assembly pipeline as ONE pure function.
 *
 * Before the Nutr2 consolidation this decision matrix could only be exercised
 * by mocking auth + subscription + Firestore through `useAdaptiveTdee`. Pulling
 * the orchestration into a pure function gives it a direct test surface; the
 * hook is now plumbing and keeps a thin regression test for I/O + the latch.
 */
import { describe, it, expect } from "vitest";
import {
  resolveAdaptiveTarget,
  isAdaptiveActive,
  type CapState,
} from "../adaptiveTarget";

const NOW = new Date("2026-05-20T12:00:00.000Z");

/** A full-window, flat-weight dataset: avgIntake 2350, slope 0 → learned 2350. */
function fullWindow() {
  const intakeByDay = Array.from({ length: 14 }, (_, i) => ({
    dateKey: `2026-05-${String(i + 1).padStart(2, "0")}`,
    kcal: 2350,
  }));
  // 8 weigh-ins spanning 2026-05-01 .. 2026-05-15 (span = 14d), flat 80kg.
  const weighIns = [1, 3, 5, 7, 9, 11, 13, 15].map((d) => ({
    dateKey: `2026-05-${String(d).padStart(2, "0")}`,
    weightKg: 80,
  }));
  return { intakeByDay, weighIns };
}

const baseInput = {
  hasUser: true,
  isPro: true,
  isManualOverride: false,
  formulaTarget: 2200,
  goalOffset: 0,
  intakeByDay: [] as { dateKey: string; kcal: number }[],
  weighIns: [] as { dateKey: string; weightKg: number }[],
  loaded: true,
  capPrev: null as CapState | null,
  now: NOW,
  latched: 0,
};

describe("isAdaptiveActive — the single eligibility gate", () => {
  it("requires signed-in + Pro + no manual override", () => {
    expect(
      isAdaptiveActive({ hasUser: true, isPro: true, isManualOverride: false })
    ).toBe(true);
    expect(
      isAdaptiveActive({ hasUser: false, isPro: true, isManualOverride: false })
    ).toBe(false);
    expect(
      isAdaptiveActive({ hasUser: true, isPro: false, isManualOverride: false })
    ).toBe(false);
    expect(
      isAdaptiveActive({ hasUser: true, isPro: true, isManualOverride: true })
    ).toBe(false);
  });
});

describe("resolveAdaptiveTarget — precedence ladder", () => {
  it("inactive (logged out) → plain formula, no estimator work, no cap", () => {
    const { view, capState, capChanged } = resolveAdaptiveTarget({
      ...baseInput,
      hasUser: false,
    });
    expect(view).toEqual({
      active: false,
      ready: false,
      source: "formula",
      value: 2200,
      showWarmup: false,
      warmupFraction: 0,
      stalled: false,
    });
    expect(capState).toBeNull();
    expect(capChanged).toBe(false);
  });

  it("free user → formula, never teased with the warmup", () => {
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      isPro: false,
      ...fullWindow(),
    });
    expect(view.active).toBe(false);
    expect(view.showWarmup).toBe(false);
    expect(view.source).toBe("formula");
  });

  it("manual override → formula even for a Pro with a full window", () => {
    const { view, capChanged } = resolveAdaptiveTarget({
      ...baseInput,
      isManualOverride: true,
      ...fullWindow(),
    });
    expect(view.active).toBe(false);
    expect(view.value).toBe(2200);
    expect(capChanged).toBe(false);
  });

  it("active Pro, below the gate, loaded → warmup shows, formula value", () => {
    const { view } = resolveAdaptiveTarget(baseInput); // no data
    expect(view.active).toBe(true);
    expect(view.ready).toBe(false);
    expect(view.source).toBe("formula");
    expect(view.value).toBe(2200);
    expect(view.showWarmup).toBe(true);
  });

  it("active Pro, below the gate, NOT loaded → warmup suppressed until first read resolves", () => {
    const { view } = resolveAdaptiveTarget({ ...baseInput, loaded: false });
    expect(view.showWarmup).toBe(false);
  });

  it("active Pro, full window → learned value, capped off the formula (no jump)", () => {
    const { view, capState, capChanged } = resolveAdaptiveTarget({
      ...baseInput,
      ...fullWindow(),
    });
    expect(view.ready).toBe(true);
    expect(view.source).toBe("learned");
    // learned 2350, but first engage seeds from formula 2200 and caps the step at +150.
    expect(view.value).toBe(2350);
    expect(view.showWarmup).toBe(false);
    expect(capChanged).toBe(true);
    expect(capState?.lastApplied).toBe(2350);
  });

  it("holds the applied value (no re-persist) within the 7-day cadence", () => {
    const recent: CapState = {
      lastApplied: 2350,
      lastAppliedAt: "2026-05-18T12:00:00.000Z",
    }; // 2d ago
    const { view, capChanged } = resolveAdaptiveTarget({
      ...baseInput,
      ...fullWindow(),
      capPrev: recent,
    });
    expect(view.value).toBe(2350);
    expect(capChanged).toBe(false);
  });
});

describe("resolveAdaptiveTarget — latch-derived display", () => {
  it("warmupFraction never drops below the session high-water latch", () => {
    const { view } = resolveAdaptiveTarget({ ...baseInput, latched: 0.7 }); // liveFraction 0 (no data)
    expect(view.warmupFraction).toBe(0.7);
  });

  it("stalled when live progress has slipped behind the latch", () => {
    const { view } = resolveAdaptiveTarget({ ...baseInput, latched: 0.5 }); // live 0, loaded, not ready
    expect(view.stalled).toBe(true);
  });

  it("not stalled once the gate is ready", () => {
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      ...fullWindow(),
      latched: 0.9,
    });
    expect(view.ready).toBe(true);
    expect(view.stalled).toBe(false);
  });
});

describe("resolveAdaptiveTarget — deficit/surplus preservation (C-NUTRITION)", () => {
  // avgIntake N, flat weight (slope 0) → learned MAINTENANCE = N.
  function windowAtIntake(kcal: number) {
    const intakeByDay = Array.from({ length: 14 }, (_, i) => ({
      dateKey: `2026-05-${String(i + 1).padStart(2, "0")}`,
      kcal,
    }));
    const weighIns = [1, 3, 5, 7, 9, 11, 13, 15].map((d) => ({
      dateKey: `2026-05-${String(d).padStart(2, "0")}`,
      weightKg: 80,
    }));
    return { intakeByDay, weighIns };
  }

  it("cut: learned target keeps the deficit (maintenance + offset), not bare maintenance", () => {
    // Learned maintenance 2350; cut formula target 1850 (= base 2350 − 500).
    const { view, capState } = resolveAdaptiveTarget({
      ...baseInput,
      formulaTarget: 1850,
      goalOffset: -500,
      ...windowAtIntake(2350),
    });
    expect(view.source).toBe("learned");
    // rawLearned = 2350 + (−500) = 1850; seeded from formula 1850 → holds 1850.
    // Pre-fix this walked toward bare maintenance 2350 (deficit silently erased).
    expect(view.value).toBe(1850);
    expect(capState?.lastApplied).toBe(1850);
  });

  it("lean bulk: learned target keeps the surplus (maintenance + offset)", () => {
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      formulaTarget: 2650, // base 2350 + 300
      goalOffset: 300,
      ...windowAtIntake(2350),
    });
    expect(view.value).toBe(2650);
  });

  it("applies the learned correction but still keeps the deficit when real maintenance exceeds the formula", () => {
    // Real learned maintenance 2500 > formula's assumed 2350; cut.
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      formulaTarget: 1850, // formula assumed base 2350 − 500
      goalOffset: -500,
      ...windowAtIntake(2500),
    });
    // rawLearned = 2500 − 500 = 2000; first step from 1850 capped at +150 → 2000.
    // Target rises to reflect the higher real maintenance but stays 500 below it,
    // NOT erased up to 2500.
    expect(view.value).toBe(2000);
  });
});

// ── Race-taper freeze (Prompt C) ─────────────────────────────────────────
describe("resolveAdaptiveTarget — taper freeze", () => {
  const capPrev: CapState = {
    lastApplied: 2400, // pre-taper learned value
    lastAppliedAt: "2026-05-01T00:00:00.000Z",
  };

  it("frozen + capPrev: holds the pre-taper learned value, ignores window data, no cap advance", () => {
    // Even with a full window that WOULD move the estimate, freeze pins 2400.
    const { view, capChanged, capState } = resolveAdaptiveTarget({
      ...baseInput,
      ...fullWindow(),
      capPrev,
      frozen: true,
    });
    expect(view.source).toBe("learned");
    expect(view.value).toBe(2400); // frozen, not re-estimated
    expect(capChanged).toBe(false); // cap untouched → value can't be corrupted
    expect(capState).toEqual(capPrev);
  });

  it("frozen with NO prior learned value falls through (nothing to freeze)", () => {
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      capPrev: null,
      frozen: true,
    });
    // No capPrev → normal path: warmup/formula, never a fabricated learned value.
    expect(view.source).toBe("formula");
  });

  it("post-window (not frozen): adaptation resumes from the preserved pre-taper value, not formula", () => {
    // capPrev (2400) was preserved through the freeze; a full window now wants
    // higher, but the weekly cap steps at most +150 FROM 2400 → 2550 (not from
    // the 2200 formula). Proves no post-race over-correction.
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      intakeByDay: Array.from({ length: 14 }, (_, i) => ({
        dateKey: `2026-05-${String(i + 1).padStart(2, "0")}`,
        kcal: 2900,
      })),
      weighIns: [1, 3, 5, 7, 9, 11, 13, 15].map((d) => ({
        dateKey: `2026-05-${String(d).padStart(2, "0")}`,
        weightKg: 80,
      })),
      capPrev,
      frozen: false,
    });
    expect(view.source).toBe("learned");
    expect(view.value).toBe(2550); // 2400 + 150 cap step
  });
});
