/**
 * RUN_TEMPLATES coverage test — first commit of Phase B1.
 *
 * RETARGETED 2026-07-25. The sweeps below drove `scheduleStructuredWeek`
 * and `generateRacePlan` — the V1 schedulers, which by then had ZERO
 * production callers. Every plan the app builds goes through
 * `scheduleStructuredWeekV2` / `generateRacePlanV2` via `planBuilder`.
 * So this suite swept 240 parameter combinations of code nobody runs,
 * and a templateId typo in the V2 generators would have sailed through
 * it: the exact ADR-0008 failure (the tested copy is not the running
 * copy), one level down — inside a live module, where the module-level
 * reachability gate cannot see it. The V1 pair is deleted; the sweeps
 * now run against the generators that actually build plans.
 *
 * Programme run prefill (the feature shipping in this PR) trusts that
 * every templateId the runScheduler emits exists in RUN_TEMPLATES with
 * a stable `.type` field. If a templateId is missing OR if
 * `templateByType(...)` silently falls back to `easy_30` for a type
 * that doesn't exist in the registry, the runDay's `type` field lies
 * to the prefill code — the context strip says "Long run" but the
 * selected run becomes "Easy 30" without anyone noticing.
 *
 * This suite pins:
 *   - every static templateId emitted by scheduleStructuredWeek +
 *     generateRacePlan exists in RUN_TEMPLATES
 *   - `templateByType(type)` for every type the scheduler requests
 *     returns a template whose `.type` actually matches (no silent
 *     `easy_30` fallback masking a missing entry)
 *   - dynamic coverage: running both schedulers across reasonable
 *     parameter sweeps emits only known IDs with matching types
 *
 * Lives separately from the (much larger) Phase B1 implementation so
 * the coverage result is reviewable on its own. If this fails on a
 * future RUN_TEMPLATES edit, the failure points directly at the
 * silent-fallback risk.
 */
import { describe, it, expect } from "vitest";
import {
  scheduleStructuredWeekV2,
  generateRacePlanV2,
  recoveryWeeksForDistance,
  type ScheduledRunDay,
} from "../runScheduler";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ScheduleDay } from "@/lib/scheduleUtils";

/** V2 drives from a weekSchedule rather than (liftCount, runCount). */
function weekSchedule(liftDays: number, runDays: number): ScheduleDay[] {
  const days: ScheduleDay[] = Array.from({ length: 7 }, (_, day) => ({
    day,
    type: "rest" as const,
  }));
  for (let i = 0; i < runDays && i < 7; i++) days[i].type = "run";
  for (let i = 6; i >= 7 - liftDays && i >= 0; i--) {
    days[i].type = days[i].type === "run" ? "both" : "lift";
  }
  return days;
}

/** Sunday of an arbitrary fixed week — V2 needs a real week anchor. */
const WEEK_START = "2026-07-05";

const KNOWN_TEMPLATE_IDS = new Set(RUN_TEMPLATES.map((t) => t.id));
const TEMPLATE_BY_ID = new Map(RUN_TEMPLATES.map((t) => [t.id, t]));

/**
 * Static enumeration of every templateId the scheduler can possibly
 * emit, inspected from runScheduler.ts source. If a new branch is
 * added that emits a new ID, the dynamic sweep below should catch it
 * — but pinning the static set lets a reviewer see at a glance what
 * the feature depends on.
 */
const SCHEDULER_EMITS = [
  "easy_30", // both schedulers, multiple branches
  "tempo_20", // structured week (quality slot, even weeks) + race plan build phase
  "5x1k", // structured week (intervals, odd weeks, w%4<2) + race plan build phase
  "8x400", // structured week (intervals, odd weeks, w%4>=2) + race plan taper phase
  // Race-plan long runs, chosen per WEEK by the ramp (longRunKmForWeek →
  // longTierForKm), not once per plan. Which tiers a given plan reaches
  // depends on its distance and volume knob; `longRunProgression.test.ts`
  // pins the ladder set-equal to the long-typed templates.
  "long_10k",
  "long_15k",
  "long_20k",
  "long_25k",
  "long_30k",
  "5k_race", // race plan, race week
] as const;

describe("RUN_TEMPLATES coverage — static set", () => {
  it("every scheduler-emitted templateId exists in RUN_TEMPLATES", () => {
    // Bedrock: if any of these IDs disappears from RUN_TEMPLATES the
    // scheduler emits a `templateId` the prefill code can't resolve,
    // and the silent-fallback path lights up.
    for (const id of SCHEDULER_EMITS) {
      expect(KNOWN_TEMPLATE_IDS.has(id)).toBe(true);
    }
  });

  it("RUN_TEMPLATES contains a 'long' typed entry (no silent easy_30 fallback)", () => {
    // runScheduler.templateByType('long') falls back to 'easy_30' if
    // no 'long'-typed entry exists — the resulting ScheduledRunDay
    // claims `type: "long"` but points at the easy template. Pin
    // that a real long-typed template exists.
    const longTemplate = RUN_TEMPLATES.find((t) => t.type === "long");
    expect(longTemplate).toBeDefined();
    expect(longTemplate?.type).toBe("long");
  });

  it("every emitted templateId resolves to a template whose .type is non-falsy", () => {
    // Defensive: if a template has its `.type` deleted in a refactor
    // the prefill code's `plannedTemplateType` write would be undefined.
    for (const id of SCHEDULER_EMITS) {
      const tmpl = TEMPLATE_BY_ID.get(id);
      expect(tmpl).toBeDefined();
      expect(tmpl?.type).toBeTruthy();
    }
  });
});

describe("RUN_TEMPLATES coverage — dynamic sweep over scheduleStructuredWeekV2", () => {
  it("emits only known templateIds across lift/run/week combinations", () => {
    // Parameter space sized to hit every branch:
    //   liftCount 0-5 × runCount 1-5 × weekNumber 0-7 = 240 combos.
    //   Quality alternation triggers on weekNumber % 2 + weekNumber % 4.
    const offenders: { id: string; ctx: string }[] = [];
    for (let lift = 0; lift <= 5; lift++) {
      for (let run = 1; run <= 5; run++) {
        for (let week = 0; week <= 7; week++) {
          const days = scheduleStructuredWeekV2({
            weekSchedule: weekSchedule(lift, run),
            weekNumber: week,
            weekStart: WEEK_START,
          });
          for (const d of days) {
            if (!KNOWN_TEMPLATE_IDS.has(d.templateId)) {
              offenders.push({
                id: d.templateId,
                ctx: `lift=${lift} run=${run} week=${week}`,
              });
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every emitted day's .type matches the registry .type for its templateId", () => {
    // If the scheduler emits `{ templateId: 'easy_30', type: 'long' }`
    // the prefill writes plannedTemplateType: 'long' onto the run doc
    // while the actual template is easy. This catches the silent
    // type-fallback path.
    const mismatches: ScheduledRunDay[] = [];
    for (let lift = 0; lift <= 5; lift++) {
      for (let run = 1; run <= 5; run++) {
        for (let week = 0; week <= 7; week++) {
          const days = scheduleStructuredWeekV2({
            weekSchedule: weekSchedule(lift, run),
            weekNumber: week,
            weekStart: WEEK_START,
          });
          for (const d of days) {
            const tmpl = TEMPLATE_BY_ID.get(d.templateId);
            if (!tmpl) continue; // covered by the previous test
            if (tmpl.type !== d.type) mismatches.push(d);
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("RUN_TEMPLATES coverage — dynamic sweep over generateRacePlanV2", () => {
  // Race plans take a target date. Use a date far enough out to hit
  // every phase (base / build / taper / race) in a single plan, and
  // sample across distances so the long-run ramp reaches its upper tiers.
  const TODAY = "2026-07-05";
  /** V2 takes local "YYYY-MM-DD", not an ISO instant. */
  function futureDate(daysAhead: number): string {
    const d = new Date(2026, 6, 5);
    d.setDate(d.getDate() + daysAhead);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  const DISTANCES = ["5k", "10k", "half", "marathon"] as const;
  const DAYS_AHEAD = [30, 60, 90, 120]; // hits every phase across distances

  it("emits only known templateIds across distance/duration combinations", () => {
    const offenders: { id: string; ctx: string }[] = [];
    for (const distance of DISTANCES) {
      for (const ahead of DAYS_AHEAD) {
        for (let lift = 0; lift <= 5; lift++) {
          for (let run = 1; run <= 5; run++) {
            const plan = generateRacePlanV2({
              weekSchedule: weekSchedule(lift, run),
              raceGoal: { distance, targetDate: futureDate(ahead) },
              weeklyRunDays: run,
              currentDate: TODAY,
              weekStart: WEEK_START,
            });
            for (const week of plan.weeks) {
              for (const d of week) {
                if (!KNOWN_TEMPLATE_IDS.has(d.templateId)) {
                  offenders.push({
                    id: d.templateId,
                    ctx: `distance=${distance} ahead=${ahead} lift=${lift} run=${run}`,
                  });
                }
              }
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every emitted day's .type matches the registry .type for its templateId", () => {
    const mismatches: { day: ScheduledRunDay; ctx: string }[] = [];
    for (const distance of DISTANCES) {
      for (const ahead of DAYS_AHEAD) {
        const plan = generateRacePlanV2({
          weekSchedule: weekSchedule(3, 3),
          raceGoal: { distance, targetDate: futureDate(ahead) },
          weeklyRunDays: 3,
          currentDate: TODAY,
          weekStart: WEEK_START,
        });
        for (const week of plan.weeks) {
          for (const d of week) {
            const tmpl = TEMPLATE_BY_ID.get(d.templateId);
            if (!tmpl) continue;
            if (tmpl.type !== d.type) {
              mismatches.push({
                day: d,
                ctx: `distance=${distance} ahead=${ahead}`,
              });
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

// ── recoveryWeeksForDistance ─────────────────
describe("recoveryWeeksForDistance", () => {
  it("scales recovery with race distance (5k=1 … marathon=4)", () => {
    expect(recoveryWeeksForDistance("5k")).toBe(1);
    expect(recoveryWeeksForDistance("10k")).toBe(2);
    expect(recoveryWeeksForDistance("half")).toBe(3);
    expect(recoveryWeeksForDistance("marathon")).toBe(4);
  });
});
