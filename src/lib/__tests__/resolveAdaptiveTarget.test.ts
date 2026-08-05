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

describe("resolveAdaptiveTarget — NUTR-L5 minimum-calorie floor", () => {
  it("the goal offset never pushes the learned target below min(maintenance, 1200)", () => {
    // Small user: learned maintenance 1600 (flat weight), aggressive rate
    // offset −830. Unfloored raw would be 770; the floor clamps it to 1200
    // BEFORE the weekly cap, so the cap steps toward 1200, not toward 770.
    const intakeByDay = Array.from({ length: 14 }, (_, i) => ({
      dateKey: `2026-05-${String(i + 1).padStart(2, "0")}`,
      kcal: 1600,
    }));
    const weighIns = [1, 3, 5, 7, 9, 11, 13, 15].map((d) => ({
      dateKey: `2026-05-${String(d).padStart(2, "0")}`,
      weightKg: 55,
    }));
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      formulaTarget: 1200,
      goalOffset: -830,
      intakeByDay,
      weighIns,
      // >7 days before NOW and within one cap step of the floored value, so
      // the applied target settles exactly on the floor this call.
      capPrev: {
        lastApplied: 1250,
        lastAppliedAt: "2026-05-01T00:00:00.000Z",
      },
    });
    expect(view.source).toBe("learned");
    expect(view.value).toBe(1200); // floored raw (1200), NOT 1250 − 150 = 1100
  });
});

describe("resolveAdaptiveTarget — stale-hold across a logging lapse", () => {
  // Once learned, an un-ready gate stops UPDATES — it must not evaporate the
  // estimate. Measured before the fix (probe journey, 2026-08-05): a user
  // still logging every meal, six days after their last weigh-in, snapped
  // 2919 → 2500 overnight; 36 days of formula; then 2500 → 2928 back up in
  // one day. The ±150/week cap exists so this number never moves like that.
  const held: CapState = {
    lastApplied: 2919,
    lastAppliedAt: "2026-04-20T12:00:00.000Z",
  };

  it("holds the learned value when the gate un-clears, without re-persisting", () => {
    const { view, capState, capChanged } = resolveAdaptiveTarget({
      ...baseInput,
      capPrev: held, // learned once…
      // …window now empty: full lapse.
    });
    expect(view.source).toBe("learned");
    expect(view.value).toBe(2919);
    // Honest about staleness: the gate is down and the warmup/stall
    // machinery stays live — the hold is visible, never passed off as fresh.
    expect(view.ready).toBe(false);
    expect(view.showWarmup).toBe(true);
    expect(capChanged).toBe(false);
    expect(capState).toBe(held);
  });

  it("holds for the screenshot-shape user: still logging meals, scale stopped", () => {
    // The higher-friction habit dies first. Intake window is FULL; only the
    // weigh-ins slid under the gate — this user is doing 90% of the work and
    // was the one being punished with a −419 kcal overnight snap.
    const { intakeByDay } = fullWindow();
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      capPrev: held,
      intakeByDay,
      weighIns: [
        { dateKey: "2026-05-01", weightKg: 80 },
        { dateKey: "2026-05-03", weightKg: 80 },
      ], // 2 < minWeighIns
    });
    expect(view.source).toBe("learned");
    expect(view.value).toBe(2919);
  });

  it("never manufactures an estimate: cold-start (no capPrev) still gets formula", () => {
    // The Nutr2 lock's early-water-weight conservatism is about NEW
    // estimates. The hold only preserves one that already cleared the gate.
    const { view } = resolveAdaptiveTarget({ ...baseInput });
    expect(view.source).toBe("formula");
    expect(view.value).toBe(2200);
    expect(view.showWarmup).toBe(true);
  });

  it("re-engages by stepping FROM the held value, not from formula", () => {
    // Return after a lapse: fresh window says maintenance 2350, held value
    // 2919. One capped step down (2919 − 150 = 2769) — continuous with what
    // the user was actually eating to, converging at the locked rate. The
    // pre-fix path went via formula 2200 and then jumped BACK up — two
    // discontinuities the cap never sanctioned.
    const { view, capChanged } = resolveAdaptiveTarget({
      ...baseInput,
      ...fullWindow(),
      capPrev: held,
    });
    expect(view.source).toBe("learned");
    expect(view.value).toBe(2769);
    expect(capChanged).toBe(true);
  });

  it("a manual override set during a hold still wins", () => {
    // The precedence ladder is unchanged — the hold sits below explicit
    // user intent, same as the live learned value does.
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      capPrev: held,
      isManualOverride: true,
    });
    expect(view.source).toBe("formula");
    expect(view.value).toBe(2200);
    expect(view.showWarmup).toBe(false);
  });

  it("a downgraded (free) user with a leftover capPrev never sees the held value", () => {
    // "Free users never see learned" (Q4 lock A) survives the hold.
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      capPrev: held,
      isPro: false,
    });
    expect(view.source).toBe("formula");
    expect(view.showWarmup).toBe(false);
  });

  it("suppresses the warmup indicator until the first read resolves, but still holds", () => {
    // Mirrors the below-the-gate loading rule: no flash of "personalizing"
    // before data arrives — but the VALUE never regresses to formula while
    // we wait, or every cold app-open during a lapse would flash 2200.
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      capPrev: held,
      loaded: false,
    });
    expect(view.value).toBe(2919);
    expect(view.showWarmup).toBe(false);
  });

  it("the locked stall nudge still fires during a hold", () => {
    // "Keep logging meals + weigh-ins to keep personalizing" — the lapse is
    // exactly when that copy earns its place.
    const { view } = resolveAdaptiveTarget({
      ...baseInput,
      capPrev: held,
      latched: 0.9, // live fraction is 0 on an empty window
    });
    expect(view.stalled).toBe(true);
    expect(view.warmupFraction).toBe(0.9);
  });
});
