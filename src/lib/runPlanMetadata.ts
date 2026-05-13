/**
 * Pure helpers for the 10-field plan-adherence metadata block written
 * on every run document.
 *
 * Phase B1 of the programme → Run reconciliation loop. The metadata
 * answers, for any saved run: "what plan was active, where did the
 * prefill come from, and did the user actually do the planned thing?"
 *
 * Why pure: the same logic runs in three places — RunSetupModal's
 * context strip, Run.tsx's prefill IIFE, and RunSummary's
 * completion-rule gate. Centralising avoids drift and lets each call
 * site be tested in isolation against the same set of edge cases
 * (rest-day, completed-day, missing template, race-prep elapsed,
 * URL override, etc.).
 *
 * No React, no hooks, no Firestore imports — the inputs are plain
 * data: profile snapshot, programState (or its absence), URL params.
 */

import { RUN_TEMPLATES, type RunTemplate } from "./workoutTemplates";
import type { ScheduledRunDay, RunPlan } from "@/features/program/runScheduler";

// ─── Field types ─────────────────────────────────────────────────────

export type PlanMode = "freeform" | "structured" | "race_prep";

export type PlanSource =
  | "today_plan"
  | "url_template"
  | "manual"
  | "rest_day"
  | "completed_day";

/**
 * 10 fields written on every run doc. See the Phase B1 brief for the
 * exact semantics; the short version is in the field comments.
 *
 * Five fields are nullable:
 *   - plannedRunDayIndex (no plan day to point at)
 *   - plannedTemplateId  (no plan template to compare against)
 *   - plannedTemplateType
 *   - actualTemplateId   (user didn't start from any template)
 *   - matchedPlanExact   (no plan to match)
 *   - matchedPlanType    (no plan to match)
 *   - planWeekIndex      (no plan)
 *   - planTotalWeeks     (no plan)
 *
 * Two booleans are always set:
 *   - offPlan (computed via the offPlan rule)
 *
 * Two enums are always set:
 *   - planMode (snapshot from profile.runMode, defaulting to 'freeform')
 *   - planSource
 */
export interface RunPlanMetadata {
  planMode: PlanMode;
  planSource: PlanSource;
  plannedRunDayIndex: number | null;
  plannedTemplateId: string | null;
  plannedTemplateType: string | null;
  actualTemplateId: string | null;
  matchedPlanExact: boolean | null;
  matchedPlanType: boolean | null;
  offPlan: boolean;
  planWeekIndex: number | null;
  planTotalWeeks: number | null;
}

/**
 * Prefill payload — the activity-config fields the prefill decision
 * resolves to. Run.tsx merges these into the existing savedPreferences
 * before passing to RunSetupModal.
 *
 * `activityType` / `target` / `intervals` map to the same fields on
 * RunConfig; nothing else needs to flow. Pace prefill happens via
 * `target` when the template specifies `targetPace`.
 */
export interface RunPlanPrefill {
  activityType?: string;
  target?: { type: "none" | "distance" | "time" | "pace"; value?: number };
  intervals?: {
    reps: number;
    workDistance?: number;
    workDuration?: number;
    restDuration: number;
    warmupDuration?: number;
    cooldownDuration?: number;
  };
}

// ─── Default / freeform shape ───────────────────────────────────────

/**
 * The metadata we write for a run that has no programme context —
 * either the user is on `freeform` runMode, or they started a run
 * via the manual path with no URL override and no programme plan.
 *
 * `planMode` reflects the profile snapshot, not a hardcoded freeform.
 * A race_prep user with an elapsed plan still gets `planMode:
 * 'race_prep'` for analytics continuity (the brief is explicit
 * about this).
 */
export function freeformPlanMetadata(planMode: PlanMode): RunPlanMetadata {
  return {
    planMode,
    planSource: "manual",
    plannedRunDayIndex: null,
    plannedTemplateId: null,
    plannedTemplateType: null,
    actualTemplateId: null,
    matchedPlanExact: null,
    matchedPlanType: null,
    offPlan: false,
    planWeekIndex: null,
    planTotalWeeks: null,
  };
}

// ─── Inputs ─────────────────────────────────────────────────────────

export interface ComputePlanInputs {
  /**
   * Snapshot of `profile.runMode` at Start. Drives the planMode
   * field. When undefined, falls back to 'freeform'.
   */
  profileRunMode: PlanMode | undefined;
  /**
   * Today's dayIndex (0=Sun … 6=Sat). Caller is responsible for
   * passing `new Date().getDay()` — accepted as a parameter so
   * tests can pin "today" deterministically.
   */
  todayDayIndex: number;
  /**
   * Run-plan summary from programState. Undefined for freeform users
   * or when programme hasn't loaded.
   */
  runPlan: RunPlan | undefined;
  /**
   * Scheduled run days from programState. Undefined for freeform.
   */
  runDays: ScheduledRunDay[] | undefined;
  /**
   * `?template=` URL param value, if present.
   */
  urlTemplateId: string | null;
  /**
   * `?type=` URL param value, if present and no `?template=`.
   */
  urlType: string | null;
}

// ─── Pure decision function ─────────────────────────────────────────

/**
 * The single source of truth for the prefill decision. Returns the
 * metadata block to write AND any activity-config prefill to apply.
 *
 * Order of precedence (from the Phase B1 brief):
 *   1. ?template= wins over everything (URL is explicit)
 *   2. ?type= wins over programme (but loses to ?template=)
 *   3. Programme today_plan / completed_day / rest_day
 *   4. Default freeform (manual)
 *
 * The actualTemplateId in the returned metadata reflects what the
 * prefill resolved to AT THIS POINT. The user can later change
 * activityType via the chooser; `finalisePlanMetadata` (below) is
 * called at Start to recompute the dependent fields based on the
 * user's final config.
 */
export function computePlanMetadata(inputs: ComputePlanInputs): {
  metadata: RunPlanMetadata;
  prefill: RunPlanPrefill;
} {
  const planMode: PlanMode = inputs.profileRunMode ?? "freeform";
  const planWeekIndex = inputs.runPlan?.currentWeek ?? null;
  const planTotalWeeks = inputs.runPlan?.totalWeeks ?? null;

  // ── 1. ?template= wins absolutely ─────────────────────────────────
  if (inputs.urlTemplateId) {
    const tmpl = RUN_TEMPLATES.find((t) => t.id === inputs.urlTemplateId);
    if (!tmpl) {
      // Missing URL template — no prefill, fall through to default.
      // Logged at the call site (Run.tsx) since logging is impure.
      return {
        metadata: freeformPlanMetadata(planMode),
        prefill: {},
      };
    }
    // Even if today has a planned run, URL wins for the prefill source.
    // But we still expose the programme's planned-day metadata so the
    // doc captures "user overrode their plan with a URL template".
    const todayDay = inputs.runDays?.find(
      (d) => d.dayIndex === inputs.todayDayIndex && !d.completed,
    );
    const plannedTemplate = todayDay
      ? resolvePlannedTemplate(todayDay)
      : null;
    const matchedPlanExact = plannedTemplate
      ? tmpl.id === plannedTemplate.id
      : null;
    const matchedPlanType = plannedTemplate
      ? tmpl.type === plannedTemplate.type
      : null;
    return {
      metadata: {
        planMode,
        planSource: "url_template",
        plannedRunDayIndex: todayDay ? todayDay.dayIndex : null,
        plannedTemplateId: plannedTemplate?.id ?? null,
        plannedTemplateType: plannedTemplate?.type ?? null,
        actualTemplateId: tmpl.id,
        matchedPlanExact,
        matchedPlanType,
        offPlan: computeOffPlan({
          planMode,
          planSource: "url_template",
          matchedPlanExact,
        }),
        planWeekIndex,
        planTotalWeeks,
      },
      prefill: templateToPrefill(tmpl),
    };
  }

  // ── 2. ?type= wins over programme (but loses to ?template=) ───────
  if (inputs.urlType) {
    // ?type= doesn't pin a specific template, so actualTemplateId
    // stays null. We still surface programme context if a plan
    // applies today.
    const todayDay = inputs.runDays?.find(
      (d) => d.dayIndex === inputs.todayDayIndex && !d.completed,
    );
    const plannedTemplate = todayDay
      ? resolvePlannedTemplate(todayDay)
      : null;
    return {
      metadata: {
        planMode,
        planSource: "url_template",
        plannedRunDayIndex: todayDay ? todayDay.dayIndex : null,
        plannedTemplateId: plannedTemplate?.id ?? null,
        plannedTemplateType: plannedTemplate?.type ?? null,
        actualTemplateId: null,
        matchedPlanExact: plannedTemplate ? false : null,
        matchedPlanType: plannedTemplate
          ? inputs.urlType === plannedTemplate.type
          : null,
        offPlan: computeOffPlan({
          planMode,
          planSource: "url_template",
          matchedPlanExact: plannedTemplate ? false : null,
        }),
        planWeekIndex,
        planTotalWeeks,
      },
      prefill: { activityType: inputs.urlType },
    };
  }

  // ── 3. Programme branches ─────────────────────────────────────────
  if (planMode !== "freeform" && inputs.runDays) {
    // Race-prep elapsed? Fall back to freeform-style prefill but
    // still snapshot planMode for analytics.
    if (planMode === "race_prep" && isRacePlanElapsed(inputs.runPlan)) {
      return {
        metadata: freeformPlanMetadata(planMode),
        prefill: {},
      };
    }

    const todayDay = inputs.runDays.find(
      (d) => d.dayIndex === inputs.todayDayIndex,
    );

    // 3a. Today's planned run is already completed — extra-run state.
    if (todayDay && todayDay.completed) {
      return {
        metadata: {
          planMode,
          planSource: "completed_day",
          plannedRunDayIndex: todayDay.dayIndex,
          plannedTemplateId: null,
          plannedTemplateType: null,
          actualTemplateId: null,
          matchedPlanExact: null,
          matchedPlanType: null,
          offPlan: true,
          planWeekIndex,
          planTotalWeeks,
        },
        prefill: {},
      };
    }

    // 3b. Today has an incomplete planned run — prefill from it.
    if (todayDay && !todayDay.completed) {
      const plannedTemplate = resolvePlannedTemplate(todayDay);
      if (!plannedTemplate) {
        // Missing template ID — caller logs, no prefill.
        return {
          metadata: freeformPlanMetadata(planMode),
          prefill: {},
        };
      }
      return {
        metadata: {
          planMode,
          planSource: "today_plan",
          plannedRunDayIndex: todayDay.dayIndex,
          plannedTemplateId: plannedTemplate.id,
          plannedTemplateType: plannedTemplate.type,
          actualTemplateId: plannedTemplate.id,
          matchedPlanExact: true,
          matchedPlanType: true,
          offPlan: false,
          planWeekIndex,
          planTotalWeeks,
        },
        prefill: templateToPrefill(plannedTemplate),
      };
    }

    // 3c. Rest day — no matching runDay for today.
    return {
      metadata: {
        planMode,
        planSource: "rest_day",
        plannedRunDayIndex: null,
        plannedTemplateId: null,
        plannedTemplateType: null,
        actualTemplateId: null,
        matchedPlanExact: null,
        matchedPlanType: null,
        offPlan: true,
        planWeekIndex,
        planTotalWeeks,
      },
      prefill: {},
    };
  }

  // ── 4. Default — freeform or missing programme data ────────────────
  return {
    metadata: freeformPlanMetadata(planMode),
    prefill: {},
  };
}

// ─── Start-time finalisation ────────────────────────────────────────

/**
 * Called from Run.tsx `handleStart` with the user's final config.
 * Recomputes the four fields that depend on the user's actual choice:
 *   - actualTemplateId
 *   - matchedPlanExact
 *   - matchedPlanType
 *   - offPlan
 *
 * The five other fields (planMode, planSource, plannedRunDayIndex,
 * plannedTemplateId, plannedTemplateType, planWeekIndex,
 * planTotalWeeks) are decided at prefill time and don't move.
 *
 * Logic:
 *   - If the user kept the prefilled activityType AND no template
 *     change happened, actualTemplateId stays as the prefill.
 *   - If the user changed activityType via the chooser,
 *     actualTemplateId becomes null. matchedPlanExact / matchedPlanType
 *     recompute against `null` actualTemplateId, which means false
 *     when a plan exists, null when no plan exists.
 */
export function finalisePlanMetadata(
  metadata: RunPlanMetadata,
  actualActivityType: string,
): RunPlanMetadata {
  // Look up what the prefill's template type was. If the user's final
  // activityType differs from the prefilled plannedTemplateType (when
  // a plan exists) OR from the actualTemplateId's template type
  // (when only URL applied), they've diverged.
  const prefillType = metadata.actualTemplateId
    ? RUN_TEMPLATES.find((t) => t.id === metadata.actualTemplateId)?.type
    : null;

  const userDiverged =
    prefillType !== null && prefillType !== undefined && actualActivityType !== prefillType;

  const actualTemplateId = userDiverged ? null : metadata.actualTemplateId;

  // matchedPlanExact / matchedPlanType only apply when a plan exists.
  let matchedPlanExact: boolean | null = metadata.matchedPlanExact;
  let matchedPlanType: boolean | null = metadata.matchedPlanType;

  if (metadata.plannedTemplateId !== null) {
    matchedPlanExact = actualTemplateId === metadata.plannedTemplateId;
    if (metadata.plannedTemplateType !== null) {
      matchedPlanType = actualActivityType === metadata.plannedTemplateType;
    }
  } else {
    // No plan today (freeform / rest_day / completed_day) — both
    // match fields stay null.
    matchedPlanExact = null;
    matchedPlanType = null;
  }

  const offPlan = computeOffPlan({
    planMode: metadata.planMode,
    planSource: metadata.planSource,
    matchedPlanExact,
  });

  return {
    ...metadata,
    actualTemplateId,
    matchedPlanExact,
    matchedPlanType,
    offPlan,
  };
}

// ─── Completion gating rule ────────────────────────────────────────

/**
 * Returns true iff RunSummary should call `completeRunDay` after a
 * successful save. Pulled out as a pure predicate so the rule is
 * unit-testable independent of the component flow.
 *
 * Six gates, ALL must hold:
 *   - plannedRunDayIndex !== null
 *   - plannedTemplateId !== null
 *   - actualTemplateId !== null
 *   - matchedPlanExact === true
 *   - offPlan === false
 *   - the saved run is valid (caller passes `!isInvalid`)
 *
 * Off-plan runs do NOT complete the day. Same-type but
 * different-template runs (matchedPlanType: true, matchedPlanExact:
 * false) do NOT complete the day. Invalid saved-anyway runs do NOT
 * complete the day. The user has to actually do the planned thing.
 */
export function shouldCompleteRunDay(args: {
  metadata: RunPlanMetadata;
  isValid: boolean;
}): boolean {
  if (!args.isValid) return false;
  const m = args.metadata;
  return (
    m.plannedRunDayIndex !== null &&
    m.plannedTemplateId !== null &&
    m.actualTemplateId !== null &&
    m.matchedPlanExact === true &&
    m.offPlan === false
  );
}

// ─── offPlan rule (centralised) ─────────────────────────────────────

/**
 * The offPlan derivation, taken verbatim from the Phase B1 brief:
 *
 *   True iff:
 *     planMode !== 'freeform' AND
 *     (
 *       planSource === 'rest_day' OR
 *       planSource === 'completed_day' OR
 *       matchedPlanExact === false
 *     )
 *
 * Centralised so analytics queries can re-derive without depending
 * on the stored boolean (the stored boolean is denormalisation
 * convenience for query simplicity).
 */
function computeOffPlan(args: {
  planMode: PlanMode;
  planSource: PlanSource;
  matchedPlanExact: boolean | null;
}): boolean {
  if (args.planMode === "freeform") return false;
  return (
    args.planSource === "rest_day" ||
    args.planSource === "completed_day" ||
    args.matchedPlanExact === false
  );
}

// ─── Internal helpers ────────────────────────────────────────────────

function resolvePlannedTemplate(day: ScheduledRunDay): RunTemplate | null {
  // userOverride takes precedence over the scheduled templateId.
  // RunCTACard.tsx:21 uses the same resolution.
  const resolvedId = day.userOverride ?? day.templateId;
  return RUN_TEMPLATES.find((t) => t.id === resolvedId) ?? null;
}

function isRacePlanElapsed(runPlan: RunPlan | undefined): boolean {
  if (!runPlan) return false;
  if (runPlan.mode !== "race_prep") return false;
  if (
    typeof runPlan.currentWeek === "number" &&
    typeof runPlan.totalWeeks === "number" &&
    runPlan.currentWeek >= runPlan.totalWeeks
  ) {
    return true;
  }
  if (runPlan.raceGoal?.targetDate) {
    const target = new Date(runPlan.raceGoal.targetDate);
    if (!Number.isNaN(target.getTime()) && target.getTime() < Date.now()) {
      return true;
    }
  }
  return false;
}

function templateToPrefill(tmpl: RunTemplate): RunPlanPrefill {
  const prefill: RunPlanPrefill = { activityType: tmpl.type };
  if (tmpl.config.targetDistance) {
    prefill.target = { type: "distance", value: tmpl.config.targetDistance };
  } else if (tmpl.config.targetPace) {
    prefill.target = { type: "pace", value: tmpl.config.targetPace };
  }
  if (tmpl.config.intervals) {
    prefill.intervals = tmpl.config.intervals;
  }
  return prefill;
}
