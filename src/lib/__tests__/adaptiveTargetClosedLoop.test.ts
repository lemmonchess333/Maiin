/**
 * The adaptive calorie target as a CONTROL LOOP, not a pure function.
 *
 * Every existing test of this engine is a single call with fixed inputs —
 * `adaptiveTarget.test.ts` tables the precedence ladder, `adaptiveTdee.test.ts`
 * tables the estimator, `adaptiveTdeeRobustness.test.ts` measures outlier
 * leverage. All correct, and all blind to the thing that actually determines
 * what a user experiences: the loop closes. Today's target sets today's intake,
 * intake moves the user's weight, and tomorrow's estimate is fitted to both. A
 * controller can be right at every single step and still never settle.
 *
 * So this file runs it as a loop. The user eats EXACTLY today's target, their
 * weight responds to the real energy balance ((intake − maintenance) / 7700 kg
 * per day), they weigh in daily, and the whole `resolveAdaptiveTarget` pipeline
 * — estimator, ±150/7d cap, precedence — re-runs each morning off a trailing
 * 21-day window. Then it asks the questions a table test cannot:
 *
 *   does it converge, how fast, does it overshoot, and does it track a
 *   metabolism that MOVES?
 *
 * Measured 2026-08-11. It converges in every scenario, and the timeline is the
 * answer to "how long until the app knows my metabolism":
 *
 *   formula error   learned first shown   within 25 kcal of truth
 *   ±0                       day 15                day 15
 *   ±400                     day 15                day 29
 *   +800                     day 15                day 50
 *
 * Day 15 is the estimator's warmup gate (14-day span + 10 trusted intake days
 * + 8 weigh-ins); everything after it is the ±150 kcal/7-day cap walking the
 * applied value across the gap. Final values land within 29 kcal of the truth
 * and the loop never overshoots by more than 38 — no ringing, no runaway.
 *
 * The estimator getting the answer right IMMEDIATELY at the gate is not luck,
 * and it is worth understanding before touching the cap: because the estimate
 * reconciles intake against the observed weight change, a wrong formula target
 * does not bias it. Eating 400 kcal under maintenance produces exactly the
 * weight loss that identifies maintenance. So the entire post-gate delay is the
 * cap being deliberately slow, not the estimate being wrong — and that is the
 * right trade (a jumpy calorie target is worse than a slow one), but it should
 * be a known cost rather than a surprise.
 *
 * The moving-metabolism case is the one the feature exists for — adaptive
 * thermogenesis on a long cut, or a user who starts training. With maintenance
 * drifting ±300 kcal over twelve weeks the target trails by at most ~57 kcal
 * mid-drift and closes to within 5 once it stabilises.
 *
 * ── A harness note, because it produced a false alarm ──
 *
 * The trailing window must be filtered by DATE, exactly as `useAdaptiveTdee`
 * does (`l.date >= today − 21d`) — NOT by taking the last N entries. A
 * count-based slice keeps stale weigh-ins alive forever, which made the
 * stale-hold scenario below look like it drifted +121 kcal through a logging
 * gap. It does not; the gate closes and the value holds. A simulation is only
 * as honest as its windowing, and this one was briefly not.
 */
import { describe, it, expect } from "vitest";
import { resolveAdaptiveTarget, type CapState } from "@/lib/adaptiveTarget";
import { ADAPTIVE_TDEE_DEFAULTS } from "@/lib/adaptiveTdee";

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1);
const key = (d: number) => new Date(START + d * DAY).toISOString().slice(0, 10);
/* Read from the constant, never hardcoded: `useAdaptiveTdee` sizes its
   Firestore read as `ADAPTIVE_TDEE_DEFAULTS.windowDays`, so a harness with its
   own literal would keep feeding a 21-day window after someone shortened the
   real one — and every measurement below would silently describe a window the
   app no longer uses. */
const WINDOW_DAYS = ADAPTIVE_TDEE_DEFAULTS.windowDays;

interface LoopOptions {
  /** The user's real maintenance expenditure on a given day. */
  maintenanceAt: (day: number) => number;
  /** What Mifflin-St Jeor said, before the goal offset. */
  formulaTdee: number;
  goalOffset: number;
  days: number;
  /** Days on which the user does NOT step on the scale. */
  skipWeighIn?: (day: number) => boolean;
  /** Scale resolution. Defaults to 0.1 kg — a normal bathroom scale. */
  roundWeight?: (kg: number) => number;
}

interface DayObservation {
  day: number;
  target: number;
  source: "formula" | "learned";
  ready: boolean;
  /** The target that would be correct today. */
  truth: number;
}

/** Run the closed loop and return one observation per simulated day. */
function loop(o: LoopOptions): DayObservation[] {
  const formulaTarget = o.formulaTdee + o.goalOffset;
  let weight = 80;
  let capPrev: CapState | null = null;
  const intakeByDay: { dateKey: string; kcal: number }[] = [];
  const weighIns: { dateKey: string; weightKg: number }[] = [];
  const out: DayObservation[] = [];

  for (let d = 0; d < o.days; d++) {
    // Date-based trailing window — the hook's own filter. See the header.
    const cut = key(d - WINDOW_DAYS);
    const res = resolveAdaptiveTarget({
      hasUser: true,
      isPro: true,
      isManualOverride: false,
      formulaTarget,
      goalOffset: o.goalOffset,
      intakeByDay: intakeByDay.filter((r) => r.dateKey >= cut),
      weighIns: weighIns.filter((r) => r.dateKey >= cut),
      loaded: true,
      capPrev,
      now: new Date(START + d * DAY),
      latched: 0,
    });
    if (res.capChanged && res.capState) capPrev = res.capState;

    out.push({
      day: d,
      target: res.view.value,
      source: res.view.source,
      ready: res.view.ready,
      truth: Math.round(o.maintenanceAt(d) + o.goalOffset),
    });

    // The user eats exactly the target; the scale reflects real balance.
    intakeByDay.push({ dateKey: key(d), kcal: res.view.value });
    weight += (res.view.value - o.maintenanceAt(d)) / 7700;
    if (!o.skipWeighIn?.(d)) {
      const round = o.roundWeight ?? ((kg: number) => Math.round(kg * 10) / 10);
      weighIns.push({ dateKey: key(d), weightKg: round(weight) });
    }
  }
  return out;
}

const steady = (kcal: number) => () => kcal;
const firstDay = (rows: DayObservation[], p: (r: DayObservation) => boolean) =>
  rows.find(p)?.day ?? -1;

describe("adaptive target — the loop closes on the truth", () => {
  const CASES: {
    label: string;
    maintenance: number;
    formulaTdee: number;
    goalOffset: number;
    days: number;
  }[] = [
    { label: "formula exact, maintaining", maintenance: 2500, formulaTdee: 2500, goalOffset: 0, days: 180 },
    { label: "formula 400 low, maintaining", maintenance: 2900, formulaTdee: 2500, goalOffset: 0, days: 180 },
    { label: "formula 400 high, maintaining", maintenance: 2100, formulaTdee: 2500, goalOffset: 0, days: 180 },
    { label: "formula 400 low, cutting", maintenance: 2900, formulaTdee: 2500, goalOffset: -550, days: 180 },
    { label: "formula 400 high, cutting", maintenance: 2100, formulaTdee: 2500, goalOffset: -550, days: 180 },
    { label: "formula 800 low, lean bulk", maintenance: 3300, formulaTdee: 2500, goalOffset: 330, days: 240 },
  ];

  it.each(CASES)(
    "converges and does not overshoot — $label",
    ({ maintenance, formulaTdee, goalOffset, days }) => {
      const rows = loop({
        maintenanceAt: steady(maintenance),
        formulaTdee,
        goalOffset,
        days,
      });
      const goal = maintenance + goalOffset;
      const settled = rows.slice(-30);

      // Lands on the truth and stays there. The residual band is scale
      // quantization, measured and explained in its own test below — not
      // controller error.
      for (const r of settled) {
        expect(Math.abs(r.target - goal), `day ${r.day} target ${r.target}`).toBeLessThanOrEqual(40);
      }
      // And gets there without ringing: once learned takes over, the target
      // never swings past the goal by more than one small correction.
      const afterLearned = rows.filter((r) => r.source === "learned");
      const worstOvershoot = Math.max(
        ...afterLearned.map((r) => Math.abs(r.target - goal) - Math.abs(rows[0].target - goal))
      );
      expect(worstOvershoot).toBeLessThanOrEqual(40);
    }
  );

  it("takes ~2 weeks to show a learned number and ~4 to trust it", () => {
    /* The user-facing timeline, and the reason the cap is the whole story
       after day 15: the ESTIMATE is already right at the gate (it reconciles
       intake against observed weight change, so a wrong formula cannot bias
       it) — the remaining wait is the ±150/7d cap walking there deliberately. */
    const at400 = loop({
      maintenanceAt: steady(2900),
      formulaTdee: 2500,
      goalOffset: -550,
      days: 90,
    });
    const goal400 = 2350;
    expect(firstDay(at400, (r) => r.ready)).toBe(15);
    expect(firstDay(at400, (r) => r.source === "learned")).toBe(15);
    expect(firstDay(at400, (r) => Math.abs(r.target - goal400) <= 25)).toBe(29);

    // Twice the error takes roughly twice as long — the cap is the rate limit,
    // so the relationship is the pin, not just the two numbers.
    const at800 = loop({
      maintenanceAt: steady(3300),
      formulaTdee: 2500,
      goalOffset: 330,
      days: 120,
    });
    expect(firstDay(at800, (r) => r.ready)).toBe(15);
    expect(firstDay(at800, (r) => Math.abs(r.target - 3630) <= 25)).toBe(50);
  });

  it("shows the formula, not a guess, before the gate clears", () => {
    /* The locked "no under-data regression" behaviour, seen from inside the
       loop: for a full fortnight the number is the formula target exactly,
       even though the estimator would already fit a slope to fewer points. */
    const rows = loop({
      maintenanceAt: steady(2900),
      formulaTdee: 2500,
      goalOffset: -550,
      days: 20,
    });
    for (const r of rows.slice(0, 15)) {
      expect(r.source).toBe("formula");
      expect(r.target).toBe(1950);
    }
  });
});

describe("adaptive target — a metabolism that moves", () => {
  /** Adaptive thermogenesis (or a new training block): ±300 kcal over 12 weeks. */
  const drifting = (drift: number) => (d: number) =>
    2700 + drift * Math.min(1, Math.max(0, (d - 60) / 84));

  it.each([-300, 300])("tracks a %i kcal drift and re-settles", (drift) => {
    const rows = loop({
      maintenanceAt: drifting(drift),
      formulaTdee: 2700,
      goalOffset: -550,
      days: 240,
    });
    // Locked on before the drift starts.
    expect(Math.abs(rows[59].target - rows[59].truth)).toBeLessThanOrEqual(10);
    // Trails during it — the cap cannot move faster than 150/week — but never
    // by more than a single window's worth of movement.
    const during = rows.slice(60, 144);
    const worst = Math.max(...during.map((r) => Math.abs(r.target - r.truth)));
    expect(worst).toBeLessThan(80);
    // And closes once the metabolism stops moving.
    expect(Math.abs(rows[239].target - rows[239].truth)).toBeLessThanOrEqual(10);
  });
});

describe("adaptive target — a logging gap holds, it does not drift", () => {
  it("freezes the learned value for the whole gap and resumes after", () => {
    /* The stale-hold amendment (2026-08-05), exercised end-to-end rather than
       as a single un-ready call. The user stops weighing on day 45 and resumes
       on day 100 — long past the point where the 21-day window empties, so the
       gate is genuinely down for ~60 days.

       Three things must hold, and the middle one is the whole amendment: the
       value must not move, and it must NOT revert to formula (the pre-fix bug
       snapped the target 419 kcal overnight and back again weeks later),
       and the correction must resume at the capped rate afterwards. */
    const rows = loop({
      maintenanceAt: steady(2900),
      formulaTdee: 2500,
      goalOffset: -550,
      days: 150,
      skipWeighIn: (d) => d >= 45 && d < 100,
    });

    /* The GAP specifically — `!ready` alone also matches the pre-gate warmup
       on days 0-14, where the target is legitimately the formula. Filtering on
       readiness alone made this assertion fail for the right reason at the
       wrong place. */
    const gate = rows.filter((r) => !r.ready && r.day >= 45);
    expect(gate.length).toBeGreaterThan(50); // the gate really did go down

    const held = new Set(gate.map((r) => r.target));
    expect(held.size, `target moved during the gap: ${[...held].join(", ")}`).toBe(1);
    for (const r of gate) expect(r.source).toBe("learned"); // never reverts

    // Resumes and re-converges once the scale comes back.
    expect(Math.abs(rows[149].target - 2350)).toBeLessThanOrEqual(10);
  });
});

describe("adaptive target — the residual wobble is the SCALE, not the controller", () => {
  /* Steady-state bands over the last 60 days, by scale resolution and goal.
     Measured, and worth knowing before anyone reads the ±38 above as drift:

       scale      maintaining      cutting       lean bulk
       0.1 kg     [−29, +38]       [−3, +9]      [−8, +8]
       0.01 kg    [−4, +4]         [−1, +1]      [−1, +1]
       exact      [0, 0]           [0, 0]        [0, 0]

     The asymmetry is the point. A 0.1 kg bathroom scale is the normal case,
     and it costs a MAINTAINING user roughly ±35 kcal of target wobble while
     costing a cutter almost nothing — because a real deficit produces a slope
     that dwarfs the quantization, and a flat trend is fitted almost entirely
     to it. The engine is noisiest for exactly the users with the least signal.

     Not a defect: it is an order of magnitude inside the ±150 cap, and it is
     a property of weighing yourself, not of this code. Pinned because it is
     the floor on how precise this number can be, and anything that changes
     the window length or adds recency weighting will move it. */
  const band = (o: { maintenance: number; goalOffset: number; roundWeight?: (kg: number) => number }) => {
    const rows = loop({
      maintenanceAt: steady(o.maintenance),
      formulaTdee: 2500,
      goalOffset: o.goalOffset,
      days: 180,
      roundWeight: o.roundWeight,
    });
    const goal = o.maintenance + o.goalOffset;
    const tail = rows.slice(-60).map((r) => r.target - goal);
    return [Math.min(...tail), Math.max(...tail)];
  };

  it("a 0.1 kg scale wobbles a maintainer far more than a cutter", () => {
    expect(band({ maintenance: 2900, goalOffset: 0 })).toEqual([-29, 38]);
    expect(band({ maintenance: 2900, goalOffset: -550 })).toEqual([-3, 9]);
    expect(band({ maintenance: 3300, goalOffset: 330 })).toEqual([-8, 8]);
  });

  it("a finer scale removes it, which is what identifies the cause", () => {
    const fine = (kg: number) => Math.round(kg * 100) / 100;
    expect(band({ maintenance: 2900, goalOffset: 0, roundWeight: fine })).toEqual([-4, 4]);
    // Exact weights settle dead on — no residual error anywhere in the loop.
    expect(band({ maintenance: 2900, goalOffset: 0, roundWeight: (kg) => kg })).toEqual([0, 0]);
    expect(band({ maintenance: 2900, goalOffset: -550, roundWeight: (kg) => kg })).toEqual([0, 0]);
  });
});
