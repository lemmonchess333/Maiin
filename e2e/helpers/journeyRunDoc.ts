/**
 * A planned run's saved document, built as the app builds it.
 *
 * The app's builder (`runDocument` in `src/lib/runCompletion.ts`) sits in a
 * module that starts the app's Firebase client, which a spec's Node process
 * can't load. So a journey's run builds its document here, from the config
 * the Run page starts a planned run with: a new account's settings, the
 * plan's prefill and its plan metadata for the run's id
 * (`computePlanMetadata`), settled at Start (`finalisePlanMetadata`).
 * `src/lib/__tests__/journeyRunDoc.test.ts` holds it to `runDocument`'s
 * output, field for field.
 */
import {
  DEFAULT_CONFIG,
  type RunConfig,
} from "../../src/components/run/runConfigDefaults";
import { localDateString } from "../../src/lib/dateHelpers";
import {
  computePlanMetadata,
  finalisePlanMetadata,
  type PlanMode,
} from "../../src/lib/runPlanMetadata";
import type {
  ProgramState,
  ScheduledRunDay,
} from "../../src/features/program/programTypes";

/** A planned run, done as planned. */
export interface JourneyRun {
  /** The planned run, as the plan holds it. */
  run: ScheduledRunDay;
  /** The plan the run is in. */
  plan: Pick<ProgramState, "runPlan" | "runDays">;
  /** `profile.runMode`. */
  runMode: PlanMode;
  /** When it finished, on the run's day. */
  finishedAt: Date;
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
}

/** The config the Run page starts `run` with from its card
 *  (`?scheduledRunId=`), its type kept. */
export function journeyRunConfig(input: JourneyRun): RunConfig {
  const { metadata, prefill } = computePlanMetadata({
    displayUnit: "km",
    profileRunMode: input.runMode,
    todayDayIndex: input.finishedAt.getDay(),
    todayDate: localDateString(input.finishedAt),
    runPlan: input.plan.runPlan,
    runDays: input.plan.runDays,
    paceTable: null,
    urlTemplateId: null,
    urlType: null,
    urlScheduledRunId: input.run.id ?? null,
    raceTarget: null,
  });
  const config = { ...DEFAULT_CONFIG, ...prefill } as RunConfig;
  return {
    ...config,
    planMetadata: finalisePlanMetadata(metadata, config.activityType),
  };
}

/** The saved run, its times as `Date`s: the caller stores them as its own
 *  SDK's timestamps. A run with no trace starts when it is saved, as the
 *  app dates one. */
export function journeyRunFields(input: JourneyRun) {
  const runConfig = journeyRunConfig(input);
  const plan = runConfig.planMetadata;
  return {
    distance: input.distance,
    duration: input.duration,
    avgPace: input.duration / (input.distance / 1000),
    calories: 0,
    elevationGain: 0,
    points: [],
    splits: [],
    bestEfforts: [],
    startedAt: input.finishedAt,
    completedAt: input.finishedAt,
    date: localDateString(input.finishedAt),
    notes: "",
    relativeEffort: null,
    paceVerdictTone: null,
    visibility: "followers" as const,
    type: "run",
    activityType: runConfig.activityType || "freerun",
    target: runConfig.target,
    intervalData: runConfig.intervals,
    runConfig,
    shoeId: null,
    isInvalid: false,
    invalidReason: null,
    savedAnyway: false,
    routeQuality: null,
    // A run done as planned with no work segments recorded (F22).
    workPortion: null,
    planMode: plan.planMode,
    planSource: plan.planSource,
    plannedRunDayIndex: plan.plannedRunDayIndex,
    plannedTemplateId: plan.plannedTemplateId,
    plannedTemplateType: plan.plannedTemplateType,
    actualTemplateId: plan.actualTemplateId,
    matchedPlanExact: plan.matchedPlanExact,
    matchedPlanType: plan.matchedPlanType,
    offPlan: plan.offPlan,
    planWeekIndex: plan.planWeekIndex,
    planTotalWeeks: plan.planTotalWeeks,
    scheduledRunId: plan.scheduledRunId,
  };
}
