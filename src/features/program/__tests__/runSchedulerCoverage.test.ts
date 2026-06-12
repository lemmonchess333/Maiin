/**
 * RUN_TEMPLATES coverage test — first commit of Phase B1.
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
  scheduleStructuredWeek,
  generateRacePlan,
  recoveryWeeksForDistance,
  getCurrentRaceWeek,
  type ScheduledRunDay,
} from "../runScheduler";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";

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
  "long_10k", // race plan, peakLongKm < 15
  "long_15k", // race plan, peakLongKm >= 15
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

describe("RUN_TEMPLATES coverage — dynamic sweep over scheduleStructuredWeek", () => {
  it("emits only known templateIds across lift/run/week combinations", () => {
    // Parameter space sized to hit every branch:
    //   liftCount 0-5 × runCount 1-5 × weekNumber 0-7 = 240 combos.
    //   Quality alternation triggers on weekNumber % 2 + weekNumber % 4.
    const offenders: { id: string; ctx: string }[] = [];
    for (let lift = 0; lift <= 5; lift++) {
      for (let run = 1; run <= 5; run++) {
        for (let week = 0; week <= 7; week++) {
          const days = scheduleStructuredWeek(lift, run, week);
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
          for (const d of scheduleStructuredWeek(lift, run, week)) {
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

describe("RUN_TEMPLATES coverage — dynamic sweep over generateRacePlan", () => {
  // Race plans take a target date. Use a date far enough out to hit
  // every phase (base / build / taper / race) in a single plan, and
  // sample across distances to surface long_10k vs long_15k branches.
  function farFutureDate(daysAhead: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString();
  }

  const DISTANCES = ["5k", "10k", "half", "marathon"] as const;
  const DAYS_AHEAD = [30, 60, 90, 120]; // hits every phase across distances

  it("emits only known templateIds across distance/duration combinations", () => {
    const offenders: { id: string; ctx: string }[] = [];
    for (const distance of DISTANCES) {
      for (const ahead of DAYS_AHEAD) {
        for (let lift = 0; lift <= 5; lift++) {
          for (let run = 1; run <= 5; run++) {
            const plan = generateRacePlan(
              distance,
              farFutureDate(ahead),
              lift,
              run
            );
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
        const plan = generateRacePlan(distance, farFutureDate(ahead), 3, 3);
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

// ── getCurrentRaceWeek ───────────────────────
// Uses new Date() internally, so assert the clamp behaviour with dates far
// enough either side of "now" to be robust regardless of when the suite runs.
describe("getCurrentRaceWeek", () => {
  it("clamps to the final week index when the race is in the past", () => {
    // weeksLeft is very negative → totalWeeks - weeksLeft overflows → clamp to last.
    expect(getCurrentRaceWeek(12, "2000-01-01")).toBe(11);
  });

  it("clamps to week 0 when the race is far in the future", () => {
    // weeksLeft huge → totalWeeks - weeksLeft negative → clamp to 0.
    expect(getCurrentRaceWeek(12, "2099-01-01")).toBe(0);
  });

  it("returns a valid in-range index for a degenerate single-week plan", () => {
    const w = getCurrentRaceWeek(1, "2099-01-01");
    expect(w).toBe(0); // min(totalWeeks-1, …) with totalWeeks=1 → 0
  });
});
