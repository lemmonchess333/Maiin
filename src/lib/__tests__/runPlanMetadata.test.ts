/**
 * Unit tests for the pure plan-metadata helpers. Pins every prefill
 * decision branch + the start-time finalisation rule against the
 * Phase B1 brief's 15 manual scenarios.
 *
 * No React, no Firestore, no `Date.now()` in production paths beyond
 * what the helper itself reads — tests pass `todayDayIndex` and
 * `runPlan.raceGoal.targetDate` explicitly so the day-of-week and
 * elapsed-plan checks are deterministic.
 */
import { describe, it, expect } from "vitest";
import { paceTableFromFitness } from "../runPaces";
import {
  computePlanMetadata,
  finalisePlanMetadata,
  freeformPlanMetadata,
  getAdherenceLabel,
  shouldCompleteRunDay,
  type RunPlanMetadata,
} from "../runPlanMetadata";
import type { ScheduledRunDay, RunPlan } from "@/features/program/runScheduler";

// Pin a "today" so the tests don't drift across the calendar.
const MONDAY = 1;
const TUESDAY = 2;
const WEDNESDAY = 3;

function farFutureDate(daysAhead = 90): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
}

function farPastDate(daysAgo = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const racePlan: RunPlan = {
  mode: "race_prep",
  raceGoal: { distance: "10k", targetDate: farFutureDate(60) },
  totalWeeks: 8,
  currentWeek: 2,
};

const structuredPlan: RunPlan = { mode: "structured" };

function makeRunDay(
  dayIndex: number,
  templateId: string,
  type: string,
  completed = false,
  userOverride?: string
): ScheduledRunDay {
  return {
    dayIndex,
    templateId,
    type,
    completed,
    ...(userOverride ? { userOverride } : {}),
  };
}

describe("freeformPlanMetadata", () => {
  it("returns sane defaults for every planMode", () => {
    for (const mode of ["freeform", "structured", "race_prep"] as const) {
      const m = freeformPlanMetadata(mode);
      expect(m.planMode).toBe(mode);
      expect(m.planSource).toBe("manual");
      expect(m.plannedRunDayIndex).toBeNull();
      expect(m.plannedTemplateId).toBeNull();
      expect(m.plannedTemplateType).toBeNull();
      expect(m.actualTemplateId).toBeNull();
      expect(m.matchedPlanExact).toBeNull();
      expect(m.matchedPlanType).toBeNull();
      expect(m.offPlan).toBe(false);
      expect(m.planWeekIndex).toBeNull();
      expect(m.planTotalWeeks).toBeNull();
    }
  });
});

describe("computePlanMetadata — programme today_plan", () => {
  // Scenario 4: structured user on a scheduled day with an incomplete
  // planned run → strip shows structured plan, prefill applies.
  it("race-prep scheduled day prefills from the planned template", () => {
    // Mon: long_10k.
    const days = [makeRunDay(MONDAY, "long_10k", "long")];
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: MONDAY,
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.planMode).toBe("race_prep");
    expect(metadata.planSource).toBe("today_plan");
    expect(metadata.plannedRunDayIndex).toBe(MONDAY);
    expect(metadata.plannedTemplateId).toBe("long_10k");
    expect(metadata.plannedTemplateType).toBe("long");
    expect(metadata.actualTemplateId).toBe("long_10k");
    expect(metadata.matchedPlanExact).toBe(true);
    expect(metadata.matchedPlanType).toBe(true);
    expect(metadata.offPlan).toBe(false);
    expect(metadata.planWeekIndex).toBe(2);
    expect(metadata.planTotalWeeks).toBe(8);
    expect(prefill.activityType).toBe("long");
    // PR-0a: distance prefill is metres (10km → 10000), not km.
    // The RUN_TEMPLATES author in km but the RunConfig contract
    // requires m — templateToPrefill bridges.
    expect(prefill.target).toEqual({ type: "distance", value: 10000 });
  });

  it("structured user gets prefill with a structured-mode strip", () => {
    const days = [makeRunDay(TUESDAY, "tempo_20", "tempo")];
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "structured",
      todayDayIndex: TUESDAY,
      runPlan: structuredPlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.planMode).toBe("structured");
    expect(metadata.planSource).toBe("today_plan");
    expect(metadata.plannedTemplateId).toBe("tempo_20");
    expect(prefill.activityType).toBe("tempo");
    expect(prefill.target).toEqual({ type: "pace", value: 270 });
  });

  it("userOverride wins over the scheduled templateId", () => {
    const days = [makeRunDay(MONDAY, "long_10k", "long", false, "tempo_20")];
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: MONDAY,
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.plannedTemplateId).toBe("tempo_20");
    expect(metadata.plannedTemplateType).toBe("tempo");
    expect(prefill.activityType).toBe("tempo");
  });
});

describe("computePlanMetadata — programme rest_day", () => {
  // Scenario 3: race-prep user on a rest day → rest-day strip, no
  // prefill, offPlan = true.
  it("returns rest_day metadata when today has no matching runDay", () => {
    const days = [makeRunDay(MONDAY, "long_10k", "long")];
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: WEDNESDAY, // not Monday
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.planSource).toBe("rest_day");
    expect(metadata.plannedRunDayIndex).toBeNull();
    expect(metadata.plannedTemplateId).toBeNull();
    expect(metadata.offPlan).toBe(true);
    expect(metadata.matchedPlanExact).toBeNull();
    expect(metadata.matchedPlanType).toBeNull();
    expect(prefill).toEqual({});
  });
});

describe("computePlanMetadata — programme completed_day", () => {
  // Scenario 15: extra run on a day already marked complete.
  it("returns completed_day metadata when today's planned run is done", () => {
    const days = [makeRunDay(MONDAY, "long_10k", "long", /*completed*/ true)];
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: MONDAY,
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.planSource).toBe("completed_day");
    expect(metadata.plannedRunDayIndex).toBe(MONDAY);
    expect(metadata.plannedTemplateId).toBeNull();
    expect(metadata.offPlan).toBe(true);
    expect(metadata.matchedPlanExact).toBeNull();
    expect(prefill).toEqual({});
  });
});

describe("computePlanMetadata — URL ?template= override", () => {
  // Scenario 2: race-prep user opens /run?template=easy_30, URL wins.
  it("URL template wins absolutely over programme prefill", () => {
    const days = [makeRunDay(MONDAY, "long_10k", "long")];
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: MONDAY,
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: "easy_30",
      urlType: null,
    });
    expect(metadata.planSource).toBe("url_template");
    expect(metadata.plannedRunDayIndex).toBe(MONDAY); // plan still applies
    expect(metadata.plannedTemplateId).toBe("long_10k");
    expect(metadata.plannedTemplateType).toBe("long");
    expect(metadata.actualTemplateId).toBe("easy_30");
    expect(metadata.matchedPlanExact).toBe(false);
    expect(metadata.matchedPlanType).toBe(false);
    expect(metadata.offPlan).toBe(true);
    expect(prefill.activityType).toBe("easy");
  });

  it("URL template with no planned day today → plannedTemplateId stays null", () => {
    const days = [makeRunDay(TUESDAY, "tempo_20", "tempo")];
    const { metadata } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: WEDNESDAY,
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: "easy_30",
      urlType: null,
    });
    expect(metadata.planSource).toBe("url_template");
    expect(metadata.actualTemplateId).toBe("easy_30");
    expect(metadata.plannedRunDayIndex).toBeNull();
    expect(metadata.plannedTemplateId).toBeNull();
    expect(metadata.matchedPlanExact).toBeNull();
  });

  // Scenario 13: ?template=foo&type=bar — template wins.
  it("?template= beats ?type= when both are present", () => {
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "freeform",
      todayDayIndex: MONDAY,
      runPlan: undefined,
      runDays: undefined,
      urlTemplateId: "5x1k",
      urlType: "tempo",
    });
    expect(metadata.planSource).toBe("url_template");
    expect(metadata.actualTemplateId).toBe("5x1k");
    expect(prefill.activityType).toBe("intervals");
  });

  it("missing URL template ID falls through to freeform (no fake fallback)", () => {
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "freeform",
      todayDayIndex: MONDAY,
      runPlan: undefined,
      runDays: undefined,
      urlTemplateId: "does_not_exist",
      urlType: null,
    });
    // The helper returns freeform metadata; the call site
    // (Run.tsx) is responsible for logging the missing ID.
    expect(metadata.planSource).toBe("manual");
    expect(metadata.actualTemplateId).toBeNull();
    expect(prefill).toEqual({});
  });
});

describe("computePlanMetadata — URL ?type= override", () => {
  it("?type= overrides programme but actualTemplateId stays null", () => {
    const days = [makeRunDay(MONDAY, "long_10k", "long")];
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: MONDAY,
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: null,
      urlType: "easy",
    });
    expect(metadata.planSource).toBe("url_template");
    expect(metadata.actualTemplateId).toBeNull();
    expect(metadata.plannedTemplateId).toBe("long_10k");
    expect(metadata.matchedPlanExact).toBe(false);
    expect(metadata.matchedPlanType).toBe(false); // easy !== long
    expect(prefill.activityType).toBe("easy");
  });
});

describe("computePlanMetadata — freeform", () => {
  // Scenario 10: freeform user, no plan strip, existing behaviour.
  it("returns freeform metadata for a freeform user with no URL", () => {
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "freeform",
      todayDayIndex: MONDAY,
      runPlan: undefined,
      runDays: undefined,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.planMode).toBe("freeform");
    expect(metadata.planSource).toBe("manual");
    expect(metadata.offPlan).toBe(false);
    expect(prefill).toEqual({});
  });

  it("undefined profileRunMode defaults to freeform", () => {
    const { metadata } = computePlanMetadata({
      profileRunMode: undefined,
      todayDayIndex: MONDAY,
      runPlan: undefined,
      runDays: undefined,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.planMode).toBe("freeform");
  });
});

describe("computePlanMetadata — race-prep elapsed", () => {
  // Scenario 14: race plan elapsed → fall back to freeform prefill
  // but snapshot planMode = race_prep.
  it("plan with currentWeek >= totalWeeks falls back to freeform prefill", () => {
    const elapsedPlan: RunPlan = {
      mode: "race_prep",
      raceGoal: { distance: "10k", targetDate: farFutureDate(60) },
      totalWeeks: 8,
      currentWeek: 8, // elapsed
    };
    const days = [makeRunDay(MONDAY, "long_10k", "long")];
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: MONDAY,
      runPlan: elapsedPlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.planMode).toBe("race_prep"); // snapshot continuity
    expect(metadata.planSource).toBe("manual");
    expect(metadata.plannedTemplateId).toBeNull();
    expect(prefill).toEqual({});
  });

  it("plan with targetDate in the past falls back to freeform prefill", () => {
    const elapsedPlan: RunPlan = {
      mode: "race_prep",
      raceGoal: { distance: "10k", targetDate: farPastDate(7) },
      totalWeeks: 8,
      currentWeek: 4,
    };
    const days = [makeRunDay(MONDAY, "long_10k", "long")];
    const { metadata } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: MONDAY,
      runPlan: elapsedPlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.planMode).toBe("race_prep");
    expect(metadata.planSource).toBe("manual");
  });
});

describe("computePlanMetadata — missing template in registry", () => {
  // Scenario 8: scheduled templateId missing → no fake fallback.
  it("missing programme templateId returns freeform metadata, no prefill", () => {
    const days = [makeRunDay(MONDAY, "does_not_exist", "long")];
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: MONDAY,
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.planSource).toBe("manual");
    expect(metadata.plannedTemplateId).toBeNull();
    expect(prefill).toEqual({});
  });
});

describe("finalisePlanMetadata — user diverges via chooser", () => {
  // Scenario 5: user changes type before Start → offPlan: true,
  // matchedPlanExact: false; planned day stays open.
  it("user changes type away from prefilled template → actualTemplateId clears", () => {
    const start: RunPlanMetadata = {
      planMode: "race_prep",
      planSource: "today_plan",
      plannedRunDayIndex: MONDAY,
      plannedTemplateId: "5x1k",
      plannedTemplateType: "intervals",
      actualTemplateId: "5x1k",
      matchedPlanExact: true,
      matchedPlanType: true,
      offPlan: false,
      planWeekIndex: 2,
      planTotalWeeks: 8,
      scheduledRunId: null,
    };
    // User chose Easy via the chooser instead of Intervals.
    const final = finalisePlanMetadata(start, "easy");
    expect(final.actualTemplateId).toBeNull();
    expect(final.matchedPlanExact).toBe(false);
    expect(final.matchedPlanType).toBe(false);
    expect(final.offPlan).toBe(true);
    // Snapshot fields unchanged
    expect(final.planMode).toBe("race_prep");
    expect(final.plannedTemplateId).toBe("5x1k");
    expect(final.planSource).toBe("today_plan");
  });

  it("user keeps prefilled type → metadata unchanged", () => {
    const start: RunPlanMetadata = {
      planMode: "race_prep",
      planSource: "today_plan",
      plannedRunDayIndex: MONDAY,
      plannedTemplateId: "tempo_20",
      plannedTemplateType: "tempo",
      actualTemplateId: "tempo_20",
      matchedPlanExact: true,
      matchedPlanType: true,
      offPlan: false,
      planWeekIndex: 2,
      planTotalWeeks: 8,
      scheduledRunId: null,
    };
    const final = finalisePlanMetadata(start, "tempo");
    expect(final).toEqual(start);
  });

  it("freeform user finalisation is a no-op (no plan to compare)", () => {
    const start = freeformPlanMetadata("freeform");
    const final = finalisePlanMetadata(start, "easy");
    expect(final).toEqual(start);
  });

  it("URL-template + planned day, user diverges → matchedPlanExact stays false", () => {
    const start: RunPlanMetadata = {
      planMode: "race_prep",
      planSource: "url_template",
      plannedRunDayIndex: MONDAY,
      plannedTemplateId: "long_10k",
      plannedTemplateType: "long",
      actualTemplateId: "easy_30",
      matchedPlanExact: false,
      matchedPlanType: false,
      offPlan: true,
      planWeekIndex: 2,
      planTotalWeeks: 8,
      scheduledRunId: null,
    };
    // User leaves the URL prefill alone — actualTemplateId stays
    // 'easy_30', match fields stay false.
    const final = finalisePlanMetadata(start, "easy");
    expect(final.actualTemplateId).toBe("easy_30");
    expect(final.matchedPlanExact).toBe(false);
    expect(final.offPlan).toBe(true);
  });

  it("URL-template, user changes type → actualTemplateId clears", () => {
    const start: RunPlanMetadata = {
      planMode: "freeform",
      planSource: "url_template",
      plannedRunDayIndex: null,
      plannedTemplateId: null,
      plannedTemplateType: null,
      actualTemplateId: "5x1k",
      matchedPlanExact: null,
      matchedPlanType: null,
      offPlan: false,
      planWeekIndex: null,
      planTotalWeeks: null,
      scheduledRunId: null,
    };
    // User picked Easy from the chooser, abandoning the 5x1k prefill.
    const final = finalisePlanMetadata(start, "easy");
    expect(final.actualTemplateId).toBeNull();
    // No plan → match fields stay null
    expect(final.matchedPlanExact).toBeNull();
    expect(final.matchedPlanType).toBeNull();
    expect(final.offPlan).toBe(false); // freeform never goes offPlan
  });
});

describe("shouldCompleteRunDay — programme reconciliation gating", () => {
  // The six-condition AND. Each test isolates one negative branch
  // so a future refactor that drops a gate fails loudly here.

  const onPlanMatch: RunPlanMetadata = {
    planMode: "race_prep",
    planSource: "today_plan",
    plannedRunDayIndex: MONDAY,
    plannedTemplateId: "tempo_20",
    plannedTemplateType: "tempo",
    actualTemplateId: "tempo_20",
    matchedPlanExact: true,
    matchedPlanType: true,
    offPlan: false,
    planWeekIndex: 2,
    planTotalWeeks: 8,
    scheduledRunId: null,
  };

  // Scenario 6: exact planned-template match completes the day.
  it("completes when all six gates pass", () => {
    expect(shouldCompleteRunDay({ metadata: onPlanMatch, isValid: true })).toBe(
      true
    );
  });

  // Scenario 5: user switched type → matchedPlanExact false.
  it("does NOT complete when matchedPlanExact is false", () => {
    const off = {
      ...onPlanMatch,
      actualTemplateId: null,
      matchedPlanExact: false,
      matchedPlanType: false,
      offPlan: true,
    };
    expect(shouldCompleteRunDay({ metadata: off, isValid: true })).toBe(false);
  });

  it("does NOT complete when matchedPlanType is true but matchedPlanExact is false", () => {
    // Same broad type (tempo run on a planned tempo day) but
    // different template — fails the exact-match gate. This is the
    // case Clay explicitly flagged: a user doing 'easy run' on a
    // planned 5x1k must NOT mark the 5x1k complete.
    const sameType = {
      ...onPlanMatch,
      actualTemplateId: "easy_30",
      matchedPlanExact: false,
      matchedPlanType: true,
      offPlan: true,
    };
    expect(shouldCompleteRunDay({ metadata: sameType, isValid: true })).toBe(
      false
    );
  });

  it("does NOT complete when offPlan is true", () => {
    const off = { ...onPlanMatch, offPlan: true };
    expect(shouldCompleteRunDay({ metadata: off, isValid: true })).toBe(false);
  });

  it("does NOT complete when plannedRunDayIndex is null (rest day)", () => {
    const restDay = freeformPlanMetadata("race_prep");
    expect(shouldCompleteRunDay({ metadata: restDay, isValid: true })).toBe(
      false
    );
  });

  it("does NOT complete when plannedTemplateId is null (completed-day extra run)", () => {
    const completed = {
      ...onPlanMatch,
      planSource: "completed_day" as const,
      plannedTemplateId: null,
      plannedTemplateType: null,
      actualTemplateId: null,
      matchedPlanExact: null,
      matchedPlanType: null,
      offPlan: true,
    };
    expect(shouldCompleteRunDay({ metadata: completed, isValid: true })).toBe(
      false
    );
  });

  it("does NOT complete when actualTemplateId is null", () => {
    const noActual = {
      ...onPlanMatch,
      actualTemplateId: null,
      matchedPlanExact: false,
      offPlan: true,
    };
    expect(shouldCompleteRunDay({ metadata: noActual, isValid: true })).toBe(
      false
    );
  });

  // Scenario 7: invalid saved-anyway run never completes.
  it("does NOT complete when the run is invalid (saved anyway)", () => {
    expect(
      shouldCompleteRunDay({ metadata: onPlanMatch, isValid: false })
    ).toBe(false);
  });

  it("freeform runs never complete a programme day", () => {
    const freeform = freeformPlanMetadata("freeform");
    expect(shouldCompleteRunDay({ metadata: freeform, isValid: true })).toBe(
      false
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// P0-6: ?scheduledRunId= URL pin
// ────────────────────────────────────────────────────────────────────

/** v2-shape runDay constructor — adds the id + status fields. */
function makeRunDayV2(args: {
  id: string;
  dayIndex: number;
  templateId: string;
  type: string;
  completed?: boolean;
  status?: ScheduledRunDay["status"];
  userOverride?: string;
}): ScheduledRunDay {
  return {
    id: args.id,
    dayIndex: args.dayIndex,
    templateId: args.templateId,
    type: args.type,
    completed: args.completed ?? false,
    status: args.status ?? "planned",
    ...(args.userOverride ? { userOverride: args.userOverride } : {}),
  };
}

describe("computePlanMetadata — ?scheduledRunId=<id> URL pin", () => {
  it("freeform metadata exposes scheduledRunId: null", () => {
    // Establishes the additive contract — every returned metadata
    // shape now carries the scheduledRunId field, defaulting to null
    // on freeform / rest-day / completed-day / mismatch paths.
    const m = freeformPlanMetadata("freeform");
    expect(m.scheduledRunId).toBeNull();
  });

  it("today_plan branch captures the resolved runDay's id when v2", () => {
    // Even without a URL pin, the prefill from today's runDay
    // should surface that day's id so RunSummary can complete by ID.
    const days = [
      makeRunDayV2({
        id: "runday_2026-05-10_1_tempo_20",
        dayIndex: MONDAY,
        templateId: "tempo_20",
        type: "tempo",
      }),
    ];
    const { metadata } = computePlanMetadata({
      profileRunMode: "structured",
      todayDayIndex: MONDAY,
      runPlan: structuredPlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
    });
    expect(metadata.scheduledRunId).toBe("runday_2026-05-10_1_tempo_20");
    expect(metadata.planSource).toBe("today_plan");
  });

  it("URL pin overrides today's day — resolves the pinned id even when not today", () => {
    // Missed-day pickup: today is Wednesday, user opens a missed
    // Monday run via ?scheduledRunId=. The pinned day becomes the
    // planned context for the entire metadata.
    const days = [
      makeRunDayV2({
        id: "runday_2026-05-10_1_long_10k",
        dayIndex: MONDAY,
        templateId: "long_10k",
        type: "long",
      }),
      makeRunDayV2({
        id: "runday_2026-05-10_3_tempo_20",
        dayIndex: WEDNESDAY,
        templateId: "tempo_20",
        type: "tempo",
      }),
    ];
    const { metadata, prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: WEDNESDAY,
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
      urlScheduledRunId: "runday_2026-05-10_1_long_10k",
    });
    expect(metadata.planSource).toBe("today_plan");
    expect(metadata.plannedRunDayIndex).toBe(MONDAY);
    expect(metadata.plannedTemplateId).toBe("long_10k");
    expect(metadata.scheduledRunId).toBe("runday_2026-05-10_1_long_10k");
    expect(prefill.activityType).toBe("long");
  });

  it("URL pin that doesn't resolve falls back to today's day", () => {
    // Defensive: a stale URL with an unknown id shouldn't strand
    // the user. Falls through to the existing today-resolution path.
    const days = [
      makeRunDayV2({
        id: "runday_2026-05-10_1_tempo_20",
        dayIndex: MONDAY,
        templateId: "tempo_20",
        type: "tempo",
      }),
    ];
    const { metadata } = computePlanMetadata({
      profileRunMode: "structured",
      todayDayIndex: MONDAY,
      runPlan: structuredPlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
      urlScheduledRunId: "runday_does_not_exist",
    });
    expect(metadata.planSource).toBe("today_plan");
    expect(metadata.scheduledRunId).toBe("runday_2026-05-10_1_tempo_20");
  });

  it("URL pin is preserved through the ?template= override branch", () => {
    // Stacking: user pinned a scheduled run AND overrode the template
    // (e.g. wanted to swap a tempo for an easy run that day). The
    // metadata should carry both the runDay id AND the actual
    // template id, with matchedPlanExact reflecting the mismatch.
    const days = [
      makeRunDayV2({
        id: "runday_2026-05-10_1_tempo_20",
        dayIndex: MONDAY,
        templateId: "tempo_20",
        type: "tempo",
      }),
    ];
    const { metadata } = computePlanMetadata({
      profileRunMode: "structured",
      todayDayIndex: MONDAY,
      runPlan: structuredPlan,
      runDays: days,
      urlTemplateId: "easy_30",
      urlType: null,
      urlScheduledRunId: "runday_2026-05-10_1_tempo_20",
    });
    expect(metadata.planSource).toBe("url_template");
    expect(metadata.plannedTemplateId).toBe("tempo_20");
    expect(metadata.actualTemplateId).toBe("easy_30");
    expect(metadata.matchedPlanExact).toBe(false);
    expect(metadata.scheduledRunId).toBe("runday_2026-05-10_1_tempo_20");
  });

  it("URL pin onto a completed runDay surfaces completed_day with the pinned id", () => {
    // User taps a tile for a day they've already finished — should
    // route into the completed_day branch (extra-run state) with
    // the scheduledRunId preserved so analytics can attribute the
    // extra activity to that slot.
    const days = [
      makeRunDayV2({
        id: "runday_2026-05-10_1_tempo_20",
        dayIndex: MONDAY,
        templateId: "tempo_20",
        type: "tempo",
        completed: true,
        status: "completed_exact",
      }),
    ];
    const { metadata } = computePlanMetadata({
      profileRunMode: "structured",
      todayDayIndex: WEDNESDAY,
      runPlan: structuredPlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
      urlScheduledRunId: "runday_2026-05-10_1_tempo_20",
    });
    expect(metadata.planSource).toBe("completed_day");
    expect(metadata.offPlan).toBe(true);
    expect(metadata.scheduledRunId).toBe("runday_2026-05-10_1_tempo_20");
  });
});

// ────────────────────────────────────────────────────────────────────
// Spec v7 required tests #8 + #9 — full-chain completion semantics
// ────────────────────────────────────────────────────────────────────
//
// These mirror the high-level RunSummary save flow:
//   1. compute metadata from URL + plan context
//   2. finalise against the user's actual activityType
//   3. shouldCompleteRunDay verdict drives completion
//
// Pinned end-to-end so a future refactor on any one step (URL
// parsing, finalisation rule, completion gate) can't silently
// regress the contract that drives scheduled-slot completion.

describe("spec v7 #8 — scheduledRunId completes only that scheduled run", () => {
  it("user launches Monday's tempo via ?scheduledRunId= + does the planned tempo → completes Monday's slot", () => {
    // Setup: today is Wednesday. Monday's tempo run is still
    // open in the plan. User opens it via the explicit URL pin
    // from RunCTACard / Week tab / Today tab.
    const days = [
      makeRunDayV2({
        id: "runday_2026-05-10_1_tempo_20",
        dayIndex: MONDAY,
        templateId: "tempo_20",
        type: "tempo",
      }),
    ];
    const { metadata } = computePlanMetadata({
      profileRunMode: "structured",
      todayDayIndex: WEDNESDAY,
      runPlan: structuredPlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
      urlScheduledRunId: "runday_2026-05-10_1_tempo_20",
    });
    // User does a tempo (same type as planned).
    const final = finalisePlanMetadata(metadata, "tempo");

    // Pin: this is the scheduled run we're fulfilling, not "today".
    expect(final.scheduledRunId).toBe("runday_2026-05-10_1_tempo_20");
    expect(final.plannedRunDayIndex).toBe(MONDAY);
    expect(final.planSource).toBe("today_plan");
    // Pin: match is exact (user did the planned template).
    expect(final.matchedPlanExact).toBe(true);
    expect(final.offPlan).toBe(false);
    // Pin: completion gate fires → useProgram.completeRunDay(id)
    // will be dispatched against THIS scheduled slot, not today's.
    expect(shouldCompleteRunDay({ metadata: final, isValid: true })).toBe(true);
  });

  it("scheduledRunId without ?template=, user picks a DIFFERENT template → completion fires for THAT slot only when match remains exact", () => {
    // Edge case: URL pins the slot but user changes the template
    // from the chooser. finalisePlanMetadata clears
    // actualTemplateId once the user diverges, so completion gate
    // refuses → the scheduled slot stays open + the off-plan
    // metadata persists on the saved run.
    const days = [
      makeRunDayV2({
        id: "runday_2026-05-10_1_tempo_20",
        dayIndex: MONDAY,
        templateId: "tempo_20",
        type: "tempo",
      }),
    ];
    const { metadata } = computePlanMetadata({
      profileRunMode: "structured",
      todayDayIndex: MONDAY,
      runPlan: structuredPlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
      urlScheduledRunId: "runday_2026-05-10_1_tempo_20",
    });
    // User picked easy from the chooser, abandoning the prefill.
    const final = finalisePlanMetadata(metadata, "easy");
    expect(final.scheduledRunId).toBe("runday_2026-05-10_1_tempo_20");
    expect(final.matchedPlanExact).toBe(false);
    expect(final.offPlan).toBe(true);
    // Slot does NOT auto-complete. The P3-1 reconciliation card
    // will fire on save instead.
    expect(shouldCompleteRunDay({ metadata: final, isValid: true })).toBe(
      false
    );
  });
});

describe("spec v7 #9 — ?template= fallback never completes the WRONG scheduled run", () => {
  it("user opens ?template=easy_30 on a Tuesday with a planned tempo → today_plan with mismatch, no completion", () => {
    // Setup: today is Tuesday, planned tempo. User opens Run via
    // ?template=easy_30 (a different template) without any
    // scheduledRunId pin.
    const days = [
      makeRunDayV2({
        id: "runday_2026-05-10_2_tempo_20",
        dayIndex: TUESDAY,
        templateId: "tempo_20",
        type: "tempo",
      }),
    ];
    const { metadata } = computePlanMetadata({
      profileRunMode: "structured",
      todayDayIndex: TUESDAY,
      runPlan: structuredPlan,
      runDays: days,
      urlTemplateId: "easy_30",
      urlType: null,
    });
    // User runs the easy_30 they explicitly picked.
    const final = finalisePlanMetadata(metadata, "easy");

    // Pin: planned context still reflects Tuesday's tempo slot.
    expect(final.planSource).toBe("url_template");
    expect(final.plannedTemplateId).toBe("tempo_20");
    expect(final.scheduledRunId).toBe("runday_2026-05-10_2_tempo_20");
    // Pin: actual differs from planned.
    expect(final.actualTemplateId).toBe("easy_30");
    expect(final.matchedPlanExact).toBe(false);
    expect(final.offPlan).toBe(true);
    // CRITICAL: shouldCompleteRunDay returns false. RunSummary
    // will NOT call completeRunDay against Tuesday's scheduled
    // slot. The slot stays open; the saved run carries off-plan
    // metadata for analytics; the P3-1 prompt fires.
    expect(shouldCompleteRunDay({ metadata: final, isValid: true })).toBe(
      false
    );
  });

  it("user opens ?template=tempo_20 on a Tuesday with a planned long_10k → both same-type & exact mismatch, no completion", () => {
    // Same shape, harder edge: the URL template matches NEITHER
    // exact ID nor type of the planned slot. Both match fields
    // come back false and the gate stays shut.
    const days = [
      makeRunDayV2({
        id: "runday_2026-05-10_2_long_10k",
        dayIndex: TUESDAY,
        templateId: "long_10k",
        type: "long",
      }),
    ];
    const { metadata } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: TUESDAY,
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: "tempo_20",
      urlType: null,
    });
    const final = finalisePlanMetadata(metadata, "tempo");
    expect(final.matchedPlanExact).toBe(false);
    expect(final.matchedPlanType).toBe(false);
    expect(final.offPlan).toBe(true);
    expect(shouldCompleteRunDay({ metadata: final, isValid: true })).toBe(
      false
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// PR-0a — Prefill distance unit (metres)
// ────────────────────────────────────────────────────────────────────
//
// Pins the km→m conversion in templateToPrefill against the user
// path. Pre-PR-0a long_10k.config.targetDistance (10) flowed
// through unchanged, hitting RunSetupModal's value/1000 display
// as 0.01km. After the fix, every distance template emits metres
// via the prefill so the RunConfig contract is honoured end-to-end.
//
// We test through computePlanMetadata (public surface) rather than
// importing templateToPrefill directly — it's private to
// runPlanMetadata.ts and the public path is what the user actually
// hits.

describe("PR-0a — prefill distance unit (metres)", () => {
  function prefillForTemplate(templateId: string) {
    const type = templateId.startsWith("long_") ? "long" : "race";
    const days = [makeRunDay(MONDAY, templateId, type)];
    const { prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: MONDAY,
      runPlan: racePlan,
      runDays: days,
      urlTemplateId: null,
      urlType: null,
    });
    return prefill;
  }

  it("long_10k prefill emits 10000 metres", () => {
    expect(prefillForTemplate("long_10k").target).toEqual({
      type: "distance",
      value: 10000,
    });
  });

  it("long_15k prefill emits 15000 metres", () => {
    expect(prefillForTemplate("long_15k").target).toEqual({
      type: "distance",
      value: 15000,
    });
  });

  it("5k_race prefill emits 5000 metres", () => {
    expect(prefillForTemplate("5k_race").target).toEqual({
      type: "distance",
      value: 5000,
    });
  });

  it("10k_race prefill emits 10000 metres", () => {
    expect(prefillForTemplate("10k_race").target).toEqual({
      type: "distance",
      value: 10000,
    });
  });

  it("half_race prefill emits 21100 metres (half-marathon rounded)", () => {
    expect(prefillForTemplate("half_race").target).toEqual({
      type: "distance",
      value: 21100,
    });
  });

  it("marathon_race prefill emits 42200 metres (marathon rounded)", () => {
    expect(prefillForTemplate("marathon_race").target).toEqual({
      type: "distance",
      value: 42200,
    });
  });
});

// ─── Run8-Vocab adherence label ─────────────────────────────────────
//
// Locked vocab: Planned / Custom / Extra (see plan file row
// `Run8-Vocab`). Pin every branch so a vocab drift renaming any
// of the three strings — or flipping the mapping from
// matchedPlanExact / offPlan inputs — fails CI loudly.

describe("getAdherenceLabel", () => {
  function basePlanMetadata(
    overrides: Partial<RunPlanMetadata> = {}
  ): RunPlanMetadata {
    return {
      planMode: "structured",
      planSource: "today_plan",
      plannedRunDayIndex: 2,
      plannedTemplateId: "easy_30",
      plannedTemplateType: "easy",
      actualTemplateId: "easy_30",
      matchedPlanExact: true,
      matchedPlanType: true,
      offPlan: false,
      planWeekIndex: 0,
      planTotalWeeks: 8,
      scheduledRunId: "runday-tue-easy",
      ...overrides,
    };
  }

  it("returns 'Planned' when matchedPlanExact is true (and not off-plan)", () => {
    expect(getAdherenceLabel(basePlanMetadata())).toBe("Planned");
  });

  it("returns 'Custom' when matchedPlanExact is false but planned slot existed (not off-plan)", () => {
    // User did the Tuesday tempo template but tweaked the interval count.
    expect(
      getAdherenceLabel(
        basePlanMetadata({ matchedPlanExact: false, offPlan: false })
      )
    ).toBe("Custom");
  });

  it("returns 'Extra' when offPlan is true (regardless of matchedPlanExact)", () => {
    // No planned slot for this day — user did a bonus run.
    expect(
      getAdherenceLabel(
        basePlanMetadata({
          offPlan: true,
          plannedRunDayIndex: null,
          plannedTemplateId: null,
          matchedPlanExact: null,
        })
      )
    ).toBe("Extra");
  });

  it("returns 'Extra' even when matchedPlanExact is false (offPlan overrides)", () => {
    // Belt-and-braces: the offPlan branch takes precedence in the
    // (theoretically impossible but defensively handled) case where
    // both flags coexist.
    expect(
      getAdherenceLabel(
        basePlanMetadata({ offPlan: true, matchedPlanExact: false })
      )
    ).toBe("Extra");
  });

  it("returns null when matchedPlanExact is null (freeform — no plan to grade against)", () => {
    expect(getAdherenceLabel(freeformPlanMetadata("freeform"))).toBeNull();
  });

  it("returns null when matchedPlanExact is null even if planMode is race_prep (elapsed plan)", () => {
    // Race-prep user post-elapsed-plan with a manual run carries
    // planMode='race_prep' for analytics continuity but no
    // matchedPlanExact comparison is possible.
    expect(getAdherenceLabel(freeformPlanMetadata("race_prep"))).toBeNull();
  });

  it("returns null for null / undefined planMetadata (legacy or missing field)", () => {
    expect(getAdherenceLabel(null)).toBeNull();
    expect(getAdherenceLabel(undefined)).toBeNull();
  });
});

describe("Adaptive Paces — prescribed pace personalization", () => {
  const fastTable = paceTableFromFitness({
    benchmark: { distanceM: 5000, timeS: 20 * 60 }, // VDOT ~49.8
    vdot: null,
  });

  it("personalizes a tempo target pace from the user's pace table", () => {
    const { prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: 1,
      runPlan: undefined,
      runDays: undefined,
      urlTemplateId: "tempo_20",
      urlType: null,
      paceTable: fastTable,
    });
    expect(prefill.target?.type).toBe("pace");
    // tempo_20's hardcoded fallback is 270; a 20:00-5K runner's threshold is
    // faster (smaller sec/km), so the personalized value must differ from 270.
    expect(prefill.target?.value).toBeLessThan(270);
    expect(prefill.target?.value).toBeGreaterThan(230);
  });

  it("falls back to the template's hardcoded pace with no pace table", () => {
    const { prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: 1,
      runPlan: undefined,
      runDays: undefined,
      urlTemplateId: "tempo_20",
      urlType: null,
      // no paceTable
    });
    expect(prefill.target).toEqual({ type: "pace", value: 270 });
  });

  it("leaves distance-based templates (long/race) untouched by personalization", () => {
    const { prefill } = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: 1,
      runPlan: undefined,
      runDays: undefined,
      urlTemplateId: "long_10k",
      urlType: null,
      paceTable: fastTable,
    });
    expect(prefill.target).toEqual({ type: "distance", value: 10000 });
  });
});
