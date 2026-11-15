/**
 * The one lighter-week decision (whole-app grill Q11): the engine's
 * recommendation, for lifting, running and both, with words for the
 * reason that fired in the sport that carried the week.
 *
 * What the old banner got wrong, each held here: a lifting-only week the
 * engine flagged was never offered one (`loadFromRunning`, Lift4 (9)),
 * and every offer said "Your running load has been high, with signs of
 * reduced recovery", whichever reason fired.
 *
 * The guards it keeps are P1d pin 2's ("taper IS the deload; no
 * double-deload") and Lift4 (9)'s "only a lighter week that can be
 * taken". The fixtures use a 16-week marathon because its phase
 * boundaries are pinned by `taperCap.test.ts`: race=15, taper=12/13/14,
 * build/base below.
 */
import { describe, it, expect } from "vitest";
import {
  lighterWeekOffer,
  lighterWeekTrigger,
  type LighterWeekDoc,
} from "../lighterWeekOffer";
import { shouldRecommendDeload } from "../performanceEngine";

const MARATHON = { totalWeeks: 16, distance: "marathon" as const };
const NO_RACE = {
  currentWeek: undefined,
  totalWeeks: undefined,
  distance: undefined,
};
const HYBRID_PLAN = { lifts: true, runs: true };

/** A writer-shaped document: the usual week is 10,000 kg and 20 km. */
function doc(
  overrides: {
    deloadIndex?: number;
    deload?: boolean;
    recovery?: number;
    adherence?: number;
    lift?: [sessions: number, kg: number];
    run?: [sessions: number, km: number];
  } = {}
): LighterWeekDoc {
  const [liftSessions, liftTonnage] = overrides.lift ?? [3, 10000];
  const [runSessions, runKm] = overrides.run ?? [3, 20];
  return {
    performanceIndex: overrides.deloadIndex ?? 82,
    deloadIndex: overrides.deloadIndex ?? 82,
    deloadRecommended: overrides.deload ?? true,
    breakdown: {
      liftLoadScore: 80,
      runLoadScore: 80,
      recoveryScore: overrides.recovery ?? 60,
      adherenceScore: overrides.adherence ?? 80,
    },
    aggregates: { liftSessions, liftTonnage, runSessions, runKm },
    baseline: { liftTonnage: 10000, runKm: 20, weeksUsed: 4 },
  };
}

function offer(
  week: LighterWeekDoc | null,
  extra: Partial<Parameters<typeof lighterWeekOffer>[0]> = {}
) {
  return lighterWeekOffer({
    week,
    plan: HYBRID_PLAN,
    lighterWeekAllowed: true,
    ...NO_RACE,
    ...extra,
  });
}

describe("one decision for both sports (Q11)", () => {
  it("offers a lifting-only week one, which Lift4 (9) never did", () => {
    const lifted = doc({ recovery: 40, lift: [4, 13000], run: [0, 0] });
    const answer = offer(lifted, { plan: { lifts: true, runs: false } });
    expect(answer).not.toBeNull();
    expect(answer!.reason).toBe(
      "You lifted 30% more than your usual week, and your recovery score is low. A lighter week halves your sets, at the same weights."
    );
  });

  it("offers a running-only week one, in running's words", () => {
    const ran = doc({ recovery: 40, lift: [0, 0], run: [4, 26] });
    const answer = offer(ran, { plan: { lifts: false, runs: true } });
    expect(answer!.reason).toBe(
      "You ran 30% more than your usual week, and your recovery score is low. A lighter week makes each run left a step shorter."
    );
  });

  it("names the sport furthest over its usual week in a week of both", () => {
    const both = doc({ recovery: 40, lift: [3, 11000], run: [3, 25] });
    expect(offer(both)!.reason).toBe(
      "You ran 25% more than your usual week, and your recovery score is low. A lighter week halves your sets and shortens your runs."
    );
  });

  it("never says running for a week with no runs", () => {
    for (const recovery of [40, 60]) {
      const lifted = doc({
        recovery,
        deloadIndex: recovery === 40 ? 82 : 72,
        adherence: recovery === 40 ? 80 : 40,
        lift: [4, 13000],
        run: [0, 0],
      });
      const answer = offer(lifted, { plan: { lifts: true, runs: false } });
      expect(answer!.reason).toMatch(/^You lifted/);
      expect(answer!.reason).not.toMatch(/\bran\b|\bruns?\b|running/);
    }
  });

  it("never invents an offer the engine did not make", () => {
    expect(offer(doc({ deload: false, recovery: 40 }))).toBeNull();
    expect(offer(null)).toBeNull();
  });
});

describe("its words match the reason that fired", () => {
  it("recovery: a high week with a low recovery score", () => {
    const week = doc({ deloadIndex: 82, recovery: 40 });
    expect(lighterWeekTrigger(week, null, null)).toBe("recovery");
  });

  it("sustained: high two weeks running, once", () => {
    const week = doc({ deloadIndex: 88, run: [4, 26] });
    const previous = doc({ deloadIndex: 86 });
    expect(lighterWeekTrigger(week, previous, null)).toBe("sustained");
    expect(offer(week, { previous })!.reason).toBe(
      "You’ve run well above your usual week two weeks in a row. A lighter week halves your sets and shortens your runs."
    );
  });

  it("slipping: a high week while the plan's targets are missed", () => {
    const week = doc({ deloadIndex: 74, adherence: 40, lift: [3, 12000] });
    expect(lighterWeekTrigger(week, null, null)).toBe("slipping");
    expect(offer(week)!.reason).toBe(
      "You lifted 20% more than your usual week while missing your plan’s targets. A lighter week halves your sets and shortens your runs."
    );
  });

  it("follows the engine's order when more than one reason holds", () => {
    // Recovery is the engine's first branch, so it names the week.
    const week = doc({ deloadIndex: 88, recovery: 40, adherence: 40 });
    expect(lighterWeekTrigger(week, doc({ deloadIndex: 86 }), null)).toBe(
      "recovery"
    );
  });

  it("agrees with the engine on every reading it finds a reason for", () => {
    /* The branches are found by asking the engine's own function with
       the other two held off, so a reason this names is one the engine
       recommends on. Swept over its scales. */
    for (const idx of [60, 70, 75, 80, 84, 85, 90, 99]) {
      for (const recovery of [30, 44, 45, 60]) {
        for (const adherence of [30, 49, 50, 80]) {
          for (const prev of [undefined, 80, 86]) {
            const week = doc({ deloadIndex: idx, recovery, adherence });
            const previous =
              prev === undefined ? null : doc({ deloadIndex: prev });
            const trigger = lighterWeekTrigger(week, previous, null);
            const engine = shouldRecommendDeload(
              idx,
              recovery,
              adherence,
              prev,
              undefined
            );
            expect(
              trigger !== null,
              `${idx}/${recovery}/${adherence}/${prev}`
            ).toBe(engine);
          }
        }
      }
    }
  });

  it("reads the figure the engine asks in, the score where it is absent", () => {
    // A document from before `deloadIndex` was stored.
    const legacy = { ...doc({ recovery: 40 }), deloadIndex: undefined };
    expect(lighterWeekTrigger(legacy, null, null)).toBe("recovery");
  });

  it("says the week, not a reason, when the phone cannot tell which fired", () => {
    // An older document with no sub-scores and no week before it.
    const bare: LighterWeekDoc = {
      ...doc({ deloadIndex: 74, lift: [3, 12000] }),
      breakdown: undefined,
    };
    const answer = offer(bare);
    expect(answer!.trigger).toBeNull();
    expect(answer!.reason).toBe(
      "You lifted 20% more than your usual week. A lighter week halves your sets and shortens your runs."
    );
  });

  it("speaks of what the person did, never of load (CODING_STANDARDS)", () => {
    const reasons = [
      offer(doc({ recovery: 40 })),
      offer(doc({ deloadIndex: 88 }), { previous: doc({ deloadIndex: 86 }) }),
      offer(doc({ deloadIndex: 74, adherence: 40 })),
    ].map((o) => o!.reason);
    for (const reason of reasons) {
      expect(reason, reason).not.toMatch(/\b(load|volume|baseline|index)\b/i);
      for (const sentence of reason.split(/(?<=\.) /)) {
        expect(sentence.split(" ").length, sentence).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe("only a lighter week that can be taken", () => {
  it("is not offered when Train's menu could not take one (Lift4 (9))", () => {
    // Its button sends the menu's command (`applyDeloadWeek`), which the
    // server refuses on a lighter week, the week straight after one and a
    // first week back.
    expect(
      offer(doc({ recovery: 40 }), { lighterWeekAllowed: false })
    ).toBeNull();
  });

  it("is not offered through a race's taper or race week (P1d pin 2)", () => {
    for (const currentWeek of [12, 13, 14, 15]) {
      expect(
        offer(doc({ recovery: 40 }), { currentWeek, ...MARATHON }),
        `week ${currentWeek}`
      ).toBeNull();
    }
  });

  it("STILL offers one during base and build: the over-guard direction", () => {
    for (const currentWeek of [0, 5, 11]) {
      expect(
        offer(doc({ recovery: 40 }), { currentWeek, ...MARATHON }),
        `week ${currentWeek}`
      ).not.toBeNull();
    }
  });

  it("tolerates a partial race plan without suppressing", () => {
    // Mid-regeneration a plan can carry some fields and not others; a
    // half-written plan is not evidence of a taper.
    expect(
      offer(doc({ recovery: 40 }), {
        currentWeek: 13,
        totalWeeks: undefined,
        distance: "marathon",
      })
    ).not.toBeNull();
  });
});
