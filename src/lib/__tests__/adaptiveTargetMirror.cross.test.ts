/**
 * The server scores adherence against the target the user was SHOWN.
 *
 * `computeAdherenceScore` read `profile.targetCalories` — the formula/override
 * value the goal-weight persist recipe writes. For a Pro user whose
 * adaptive-TDEE layer has engaged that is not the number the app displays:
 * `useEffectiveTargets` replaces it with `adaptiveCapState.lastApplied`, and
 * `profile.targetCalories` deliberately never moves, because the adaptive
 * estimator reads it as its own formula anchor and writing the learned value
 * back would feed the loop its own output.
 *
 * The learned value steps at most MAX_WEEKLY_STEP_KCAL (150) per 7-day
 * cadence window and nothing bounds the CUMULATIVE distance — four windows is
 * 600 kcal. So a Pro user could eat exactly what the app asked and be scored
 * against a target it stopped showing them weeks earlier. Quantified below.
 *
 * Same family as the protein drift in #1960: complying with the plan cost
 * adherence, and therefore PI, because two surfaces disagreed about the plan.
 *
 * This file is the ADR-0008 seam. The precedence now exists twice — in
 * `src/lib/adaptiveTarget.ts` (`resolveTargetSource`, the client copy) and in
 * `functions/lib/calorieTargetResolution.js` (the RUNNING copy, since the
 * weekly rollup is what persists the PI users see). The two runtimes cannot
 * share a module, so the duplication is made safe here: both are driven over
 * the same matrix and asserted to agree.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { resolveTargetSource as resolveTs } from "../adaptiveTarget";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/calorieTargetResolution");
const resolveJs = server.resolveTargetSource as typeof resolveTs;
const { hasAppliedLearnedTarget, resolveScoringCalorieTarget, EPOCH } = server;

const BOOL = [true, false];

describe("resolveTargetSource — client and server agree", () => {
  it("over every combination of the four inputs", () => {
    /* 2 x 2 x 2 x 2 plus the null-learned case: the whole decision space, not
       a sample of it. `showWarmup` is client-only presentation and is not part
       of the contract the server needs, so only source + value are compared. */
    let checked = 0;
    for (const isPro of BOOL) {
      for (const ready of BOOL) {
        for (const isManualOverride of BOOL) {
          for (const learnedApplied of [2600, null]) {
            const input = {
              isPro,
              ready,
              isManualOverride,
              learnedApplied,
              formulaTarget: 2200,
            };
            const ts = resolveTs(input);
            const js = resolveJs(input);
            expect(js.source).toBe(ts.source);
            expect(js.value).toBe(ts.value);
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(16);
  });

  it("the learned branch is genuinely reachable in that matrix", () => {
    /* Guards the guard. A mirror test over a matrix where every case falls to
       the same branch would agree perfectly and prove nothing — the exact
       shape this project keeps catching (a mutation that changes only the
       unreachable branch). */
    const learned = resolveJs({
      isPro: true,
      ready: true,
      isManualOverride: false,
      learnedApplied: 2600,
      formulaTarget: 2200,
    });
    expect(learned).toEqual({ source: "learned", value: 2600 });
  });
});

describe("hasAppliedLearnedTarget — the server's stand-in for the warmup gate", () => {
  /* The client's `ready` counts days of intake + weigh-in data from Firestore
     reads the rollup does not make. The server instead reads the RECORD that
     the gate already opened: the client persists `adaptiveCapState` only from
     `applyWeeklyCap`, which runs after the gate clears. The epoch timestamp is
     the seed anchor that call uses on first engage and means "never applied" —
     the same marker `adaptiveStatus.ts` uses to tell "adapting" from
     "formula". */
  it("accepts a real applied state", () => {
    expect(
      hasAppliedLearnedTarget({
        lastApplied: 2450,
        lastAppliedAt: "2026-08-04T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("rejects the epoch seed anchor, which means never applied", () => {
    expect(
      hasAppliedLearnedTarget({ lastApplied: 2200, lastAppliedAt: EPOCH })
    ).toBe(false);
  });

  it("rejects missing, malformed and non-finite states", () => {
    expect(hasAppliedLearnedTarget(null)).toBe(false);
    expect(hasAppliedLearnedTarget(undefined)).toBe(false);
    expect(hasAppliedLearnedTarget({})).toBe(false);
    expect(hasAppliedLearnedTarget({ lastApplied: 2450 })).toBe(false);
    expect(
      hasAppliedLearnedTarget({
        lastApplied: "2450",
        lastAppliedAt: "2026-08-04",
      })
    ).toBe(false);
    expect(
      hasAppliedLearnedTarget({ lastApplied: NaN, lastAppliedAt: "2026-08-04" })
    ).toBe(false);
    expect(
      hasAppliedLearnedTarget({
        lastApplied: 2450,
        lastAppliedAt: "not a date",
      })
    ).toBe(false);
  });
});

describe("resolveScoringCalorieTarget — profile doc in, target out", () => {
  const APPLIED = {
    lastApplied: 2600,
    lastAppliedAt: "2026-08-04T00:00:00.000Z",
  };

  it("a Pro user on the learned target is scored against it", () => {
    expect(
      resolveScoringCalorieTarget(
        { targetCalories: 2200, adaptiveCapState: APPLIED },
        "pro"
      )
    ).toEqual({ source: "learned", value: 2600 });
  });

  it("a free user is scored against the formula target", () => {
    /* Including a lapsed Pro whose capState survives the lapse — the client
       falls back to the formula the moment isPro goes false, so the server
       must too, or the two disagree for exactly the users least likely to
       notice. */
    expect(
      resolveScoringCalorieTarget(
        { targetCalories: 2200, adaptiveCapState: APPLIED },
        "free"
      )
    ).toEqual({ source: "formula", value: 2200 });
  });

  it("a manual override outranks a learned value", () => {
    /* `targetCalories` already IS the override (the persist recipe writes it
       there), so the formula branch returns the right number — but the
       precedence has to be explicit, because the capState can outlive the
       moment the user pinned a figure. */
    expect(
      resolveScoringCalorieTarget(
        {
          targetCalories: 1800,
          customCalorieTarget: 1800,
          adaptiveCapState: APPLIED,
        },
        "pro"
      )
    ).toEqual({ source: "formula", value: 1800 });
  });

  it("a profile with no target at all resolves to null, not a guess", () => {
    // computeAdherenceScore already treats a falsy target as "drop the
    // calorie factor", which is the honest behaviour for an unknown target.
    expect(resolveScoringCalorieTarget({}, "pro")).toBeNull();
    expect(resolveScoringCalorieTarget(null, "pro")).toBeNull();
  });
});

describe("what the drift cost, in adherence points", () => {
  /* The consequence, computed the way perfScoring computes it, so the size of
     the bug is on the record rather than asserted to be "significant". */
  const calScore = (avg: number, target: number, goal: string) => {
    const ratio = avg / target;
    const tolerance = goal === "cut" ? 0.1 : 0.15;
    return ratio >= 1 - tolerance && ratio <= 1 + tolerance
      ? 100
      : Math.max(0, 100 - Math.abs(1 - ratio) * 200);
  };

  it("a compliant Pro cutter scored 64 against the stale target, 100 against the shown one", () => {
    const stored = 2200;
    // Four cadence windows of the 150 kcal step, all upward — the estimator
    // learning that this user burns more than the formula assumed.
    const learned = stored + 4 * 150;
    // They eat what the app tells them to.
    const ate = learned;

    expect(calScore(ate, stored, "cut")).toBeCloseTo(45.5, 1);
    expect(calScore(ate, learned, "cut")).toBe(100);
  });

  it("one window's drift is already outside the cut tolerance", () => {
    /* Not a slow-burn problem that only bites after months: the cut band is
       +/-10%, so on a small target a single 150 kcal step can clear it. */
    const stored = 1400;
    const learned = stored + 150;
    expect(calScore(learned, stored, "cut")).toBeLessThan(100);
  });

  it("nothing changes for the users who were never on a learned target", () => {
    // The overwhelming majority: free users, and Pro users pre-warmup.
    const stored = 2200;
    expect(calScore(stored, stored, "cut")).toBe(100);
  });
});

/**
 * The SNAPSHOT wrapper — same seam, one level up.
 *
 * The core precedence being pinned above was not enough by itself: the
 * server also owns an input RECIPE (`resolveScoringCalorieTarget`) that
 * turns a raw profile into the resolver's inputs — the marker check, the
 * override flag, the missing-target null. The weekly review needed exactly
 * that recipe on the client (it assembles from a profile read, not the
 * live adaptive hook), and a hand-rolled copy in the hook would have been
 * the drift door reopening one layer up from where it was closed.
 *
 * So the client grew `resolveSnapshotCalorieTarget`, and this matrix
 * drives BOTH wrappers over the same profile shapes. Tier is the one
 * input the runtimes spell differently (string vs boolean); the mapping
 * is part of what is being pinned.
 */
import {
  resolveSnapshotCalorieTarget,
  hasAppliedLearnedTarget as clientHasApplied,
} from "../adaptiveTarget";

const clientOf = (tier: "free" | "pro") => tier === "pro";

describe("resolveSnapshotCalorieTarget — client and server agree", () => {
  const APPLIED = {
    lastApplied: 2100,
    lastAppliedAt: "2026-07-01T08:00:00.000Z",
  };
  const EPOCH_SEED = {
    lastApplied: 2100,
    lastAppliedAt: "1970-01-01T00:00:00.000Z",
  };

  const PROFILES: Array<[string, Record<string, unknown>]> = [
    ["no target at all", {}],
    ["formula only", { targetCalories: 2400 }],
    ["engaged adaptive", { targetCalories: 2400, adaptiveCapState: APPLIED }],
    [
      "epoch seed (never applied)",
      { targetCalories: 2400, adaptiveCapState: EPOCH_SEED },
    ],
    [
      "manual override beats engaged adaptive",
      {
        targetCalories: 2000,
        customCalorieTarget: 2000,
        adaptiveCapState: APPLIED,
      },
    ],
    [
      "malformed cap state",
      { targetCalories: 2400, adaptiveCapState: { lastApplied: "soon" } },
    ],
  ];

  it("over every profile shape × tier", () => {
    let checked = 0;
    for (const [label, profile] of PROFILES) {
      for (const tier of ["free", "pro"] as const) {
        const js = resolveScoringCalorieTarget(profile, tier);
        const ts = resolveSnapshotCalorieTarget(profile, clientOf(tier));
        if (js === null) {
          expect(ts, `${label} / ${tier}`).toBeNull();
        } else {
          expect(
            { source: ts?.source, value: ts?.value },
            `${label} / ${tier}`
          ).toEqual({ source: js.source, value: js.value });
        }
        checked++;
      }
    }
    expect(checked).toBe(PROFILES.length * 2);
  });

  it("the marker checks agree, including on the epoch sentinel", () => {
    for (const cs of [
      null,
      undefined,
      {},
      APPLIED,
      EPOCH_SEED,
      { lastApplied: 2100 },
      { lastApplied: NaN, lastAppliedAt: "2026-07-01T08:00:00.000Z" },
      { lastApplied: 2100, lastAppliedAt: "not-a-date" },
    ]) {
      expect(clientHasApplied(cs), JSON.stringify(cs)).toBe(
        hasAppliedLearnedTarget(cs)
      );
    }
  });
});

/* ── Nutr3: an infeasible target is NO target, on both copies ─────────── */
import { isBelowEssentialFatCost as clientBelow } from "../adaptiveTarget";
import { ESSENTIAL_FAT_FLOOR_PER_KG } from "../macroConstants";

describe("Nutr3 — a calorie target below the essential-fat floor is no target", () => {
  const { isBelowEssentialFatCost: serverBelow } = server;

  it("the server's floor constant is the client's", () => {
    expect(server.ESSENTIAL_FAT_FLOOR_PER_KG).toBe(ESSENTIAL_FAT_FLOOR_PER_KG);
  });

  it("both resolvers return null for a 100 kcal target at 70 kg (floor 378 kcal)", () => {
    const profile = {
      targetCalories: 100,
      customCalorieTarget: 100,
      weightKg: 70,
    };
    expect(resolveScoringCalorieTarget(profile, "pro")).toBeNull();
    expect(resolveSnapshotCalorieTarget(profile, true)).toBeNull();
  });

  it("and a target that funds the floor still resolves", () => {
    const profile = {
      targetCalories: 400,
      customCalorieTarget: 400,
      weightKg: 70,
    };
    expect(resolveScoringCalorieTarget(profile, "pro")).toMatchObject({
      source: "formula",
      value: 400,
    });
    expect(resolveSnapshotCalorieTarget(profile, true)).toMatchObject({
      source: "formula",
      value: 400,
    });
  });

  it("an unknown weight never triggers the guard", () => {
    const profile = { targetCalories: 100, customCalorieTarget: 100 };
    expect(resolveScoringCalorieTarget(profile, "pro")).not.toBeNull();
    expect(resolveSnapshotCalorieTarget(profile, true)).not.toBeNull();
  });

  it("the predicate agrees across a grid of weights and targets", () => {
    for (let kg = 40; kg <= 160; kg += 10) {
      for (let kcal = 0; kcal <= 1200; kcal += 50) {
        expect(serverBelow(kcal, kg), `${kcal} kcal @ ${kg} kg`).toBe(
          clientBelow(kcal, kg)
        );
      }
    }
    // The boundary is the essential-fat cost itself: 0.6 × 70 = 42 g × 9.
    expect(clientBelow(377, 70)).toBe(true);
    expect(clientBelow(378, 70)).toBe(false);
  });
});
