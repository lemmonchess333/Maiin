/**
 * The training simulator's running half: one runner walked through a
 * season a day at a time, by the app's own code.
 *
 * Every rule the runner meets is the running copy, imported here, never
 * re-derived:
 *
 *   the plan       `buildPlan` (onboarding); `raceWeekNeedsBuilding` and
 *                  `regenerateRacePlan` (the rebuild on opening the app);
 *                  `weekRolloverAnchor` and `nextRunWeek` (the Monday
 *                  rollover); `layoffFromRuns` over the newest 20 runs, as
 *                  `fetchRecentLayoff` reads them
 *   a launch       `computePlanMetadata` → `buildLaunchConfig` →
 *                  `finalisePlanMetadata`, as Run.tsx and RunLaunchCard do
 *   a save         `runDocument` (the document RunSummary writes), then
 *                  `parseSavedRun` (the one saved-run reader)
 *   what counts    `claimableRuns` and `claimMapFor` (Home's and Train's
 *                  ticks), and `trainingWeek` ("This week")
 *   the server     `decideRecoveryEntry` (`onRunCreated`) and
 *                  `decideReconciliationActions` (the 04:00 UTC sweep),
 *                  from functions/lib/raceReconciliation.js, applied as
 *                  their transports write them: `set` with `merge`
 *
 * What the driver adds is the runner, and only the runner: the paces they
 * really hold (Daniels' bands for their VDOT, the app's own `trainingBands`)
 * and what they do with each planned run. They run the session the Run
 * screen prefilled, segment by segment, at the pace each segment asks for
 * when they can hold it, and at their own pace when the app named none.
 * Warm-ups, cool-downs and floats are easy running; an interval recovery
 * is a jog at the slow end of easy; a stride's walk back is a walk.
 *
 * Each day runs in the order a real one does: the server's sweep, the app
 * opening (a stale week rebuilt, a passed week rolled over), the runner's
 * runs with the server's run trigger after each, then the evening's ticks.
 * The sweep is placed at the start of the runner's day, which is where
 * 04:00 UTC falls for a runner on UTC.
 *
 * Needs the importing suite to mock `firebase/firestore` bare (the one
 * fake, ADR-0009) and `@/lib/firebase`, because the save builds a
 * Firestore Timestamp, and to pin the clock through `setClock`: one of the
 * app's rules reads today from it (`isRacePlanElapsed`).
 */
import { createRequire } from "node:module";
import type { UserProfile } from "@/lib/auth";
import {
  buildLaunchConfig,
  type RunConfig,
} from "@/components/run/runConfigDefaults";
import { buildPlan } from "@/features/program/planBuilder";
import {
  nextRunWeek,
  regenerateRacePlan,
} from "@/features/program/runPlanRegen";
import {
  raceWeekNeedsBuilding,
  weekRolloverAnchor,
} from "@/features/program/programMaintenance";
import {
  layoffFromRuns,
  type LayoffClass,
} from "@/features/program/layoffDetection";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { runDocument, type FinishedRun } from "@/lib/runCompletion";
import { claimableRuns, claimMapFor } from "@/lib/runClaims";
import {
  predictedRaceTimesFromFitness,
  prescriptivePaceTableFromFitness,
  raceDistanceKeyFromKm,
  trainingBands,
  type PaceBand,
  type RaceDistanceKey,
  type RunFitnessInput,
} from "@/lib/runPaces";
import {
  computePlanMetadata,
  finalisePlanMetadata,
  type RunPlanPrefill,
} from "@/lib/runPlanMetadata";
import type { SessionSegment } from "@/lib/runSegments";
import { parseSavedRun, type SavedRun } from "@/lib/savedRuns";
import { getCompletionKind } from "@/lib/scheduledRunCompletion";
import { getWeeklyRunTarget, type ScheduleDay } from "@/lib/scheduleUtils";
import { trainingWeek } from "@/lib/trainingWeek";
import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";

/* ── the server ─────────────────────────────────────────────────── */

interface Patch {
  runPlan?: Record<string, unknown>;
  runDays?: ScheduledRunDay[];
}

const server = createRequire(import.meta.url)(
  "../../../../../functions/lib/raceReconciliation"
) as {
  needsRaceNoShowEvaluation: (
    profile: unknown,
    programState: unknown,
    nowMs: number
  ) => boolean;
  decideReconciliationActions: (
    profile: unknown,
    programState: unknown,
    savedRunsForRaceDate: unknown[],
    nowMs: number
  ) => {
    payload: Patch | null;
    profilePayload: Record<string, unknown> | null;
    noShowWritten: boolean;
    recoveryCleared: boolean;
    noShowCleared: boolean;
    orphanedGoalCleared: boolean;
  };
  decideRecoveryEntry: (
    profile: unknown,
    programState: unknown,
    savedRun: unknown
  ) => {
    write: boolean;
    payload?: { runPlan: Record<string, unknown> };
    recoveryEndDate?: string;
  };
};

/** Firestore's `set(…, { merge: true })`: maps merge field by field, all
 *  the way down; anything else, arrays included, replaces. */
function mergeSet<T>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    const prior = out[key];
    const bothMaps =
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      prior !== null &&
      typeof prior === "object" &&
      !Array.isArray(prior) &&
      !(prior instanceof Date);
    out[key] = bothMaps
      ? mergeSet(prior, value as Record<string, unknown>)
      : value;
  }
  return out as T;
}

/* ── the runner ─────────────────────────────────────────────────── */

export type RaceDistance = "5k" | "10k" | "half" | "marathon";

/** A planned run as the runner meets it, on its day. */
export interface PlannedRun {
  id: string;
  date: string;
  /** What the day is: the swap when there is one. */
  templateId: string;
  type: ScheduledRunDay["type"];
}

/**
 * What the runner does with a planned run.
 *
 *   run    run the session. `daysLate` runs it that many days after its
 *          date (through the planned run's own link, as the missed-day
 *          pickup does). `launch: "start"` keeps the effort but saves it
 *          untemplated: the runner picks another type at the chooser,
 *          the way someone taps Start on a race morning. `distanceScale`
 *          shortens or lengthens the whole run (a run cut short, a watch
 *          reading short).
 *   skip   leave it.
 *   mark   mark it done by hand, with no run.
 */
export type RunnerAction = RunAction | { kind: "skip" } | { kind: "mark" };

export interface RunAction {
  kind: "run";
  daysLate?: number;
  launch?: "plan" | "start";
  distanceScale?: number;
}

export interface Runner {
  /** The VDOT they really run at. Every pace they hold comes from it. */
  vdot: number;
  /** The app knows it: `runFitness` carries the same VDOT, so the Run
   *  screen prescribes their own paces. Without it, it prescribes the
   *  templates' defaults, and they run what they can. */
  benchmarked: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  weekSchedule: ScheduleDay[];
  raceGoal?: { distance: RaceDistance; targetDate: string };
  /** By default: every planned run, on its day, from the plan, as
   *  prescribed. */
  onPlannedRun?: (run: PlannedRun) => RunnerAction;
}

/** The paces a runner holds, seconds per km. */
interface RunnerPaces {
  easy: number;
  /** The slow end of easy: an interval recovery jog. */
  jog: number;
  threshold: number;
  interval: number;
  repetition: number;
  race: Record<RaceDistanceKey, number>;
}

const WALK_PACE = 600;
const RACE_KM: Record<RaceDistanceKey, number> = {
  "5k": 5,
  "10k": 10,
  half: 21.0975,
  marathon: 42.195,
};

const mid = ([fast, slow]: PaceBand) => (fast + slow) / 2;

function pacesFor(vdot: number): RunnerPaces {
  const bands = trainingBands(vdot);
  const times = predictedRaceTimesFromFitness({ benchmark: null, vdot });
  if (!times) throw new Error(`no race times for VDOT ${vdot}`);
  const race = {} as Record<RaceDistanceKey, number>;
  for (const key of Object.keys(RACE_KM) as RaceDistanceKey[]) {
    race[key] = times[key] / RACE_KM[key];
  }
  return {
    easy: mid(bands.easy),
    jog: bands.easy[1],
    threshold: mid(bands.threshold),
    interval: mid(bands.interval),
    repetition: mid(bands.repetition),
    race,
  };
}

/** The pace asked for, unless it is faster than the runner can hold, when
 *  they hold what they can: the slower of the two, which in seconds per km
 *  is the larger number. */
const asked = (target: number | undefined, own: number) =>
  target === undefined ? own : Math.max(target, own);

function segmentPace(
  segment: SessionSegment,
  template: RunTemplate,
  paces: RunnerPaces
): number {
  switch (segment.type) {
    case "moderate":
      return asked(segment.paceTarget, paces.threshold);
    case "hard":
      return template.type === "intervals"
        ? asked(segment.paceTarget, paces.interval)
        : paces.repetition;
    case "recovery":
      if (segment.label === "Walk back") return WALK_PACE;
      if (segment.label === "Float") return paces.easy;
      return paces.jog;
    default:
      return paces.easy;
  }
}

/** The run the runner does for a session: metres and seconds. */
function perform(
  template: RunTemplate,
  prefill: RunPlanPrefill,
  paces: RunnerPaces
): { distance: number; elapsed: number } {
  if (prefill.segments?.length) {
    let distance = 0;
    let elapsed = 0;
    for (const segment of prefill.segments) {
      const pace = segmentPace(segment, template, paces);
      if (segment.target.kind === "distance") {
        distance += segment.target.meters;
        elapsed += (segment.target.meters / 1000) * pace;
      } else {
        elapsed += segment.target.seconds;
        distance += (segment.target.seconds / pace) * 1000;
      }
    }
    return { distance, elapsed };
  }
  const pace =
    template.type === "race"
      ? paces.race[
          raceDistanceKeyFromKm(template.config.targetDistanceKm) ?? "5k"
        ]
      : template.type === "tempo"
        ? asked(
            prefill.target?.type === "pace" ? prefill.target.value : undefined,
            paces.threshold
          )
        : paces.easy;
  if (prefill.target?.type === "distance" && prefill.target.value) {
    const distance = prefill.target.value;
    return { distance, elapsed: (distance / 1000) * pace };
  }
  const elapsed =
    prefill.target?.type === "time" && prefill.target.value
      ? prefill.target.value
      : template.estimatedDuration * 60;
  return { distance: (elapsed / pace) * 1000, elapsed };
}

/* ── the season ─────────────────────────────────────────────────── */

export interface SeasonOptions {
  runner: Runner;
  /** The day the account is made and the plan built. */
  start: string;
  /** The last day walked, inclusive. */
  end: string;
  /** Pins the clock to each moment walked. */
  setClock: (at: Date) => void;
}

/** A planned run, the last night it was on the plan. */
export interface PlannedRunRecord extends PlannedRun {
  action: RunnerAction["kind"];
  /** The run saved for it, as the reader returns it. */
  run?: SavedRun;
  /** Its tick that night: a run claimed it, it was marked, or nothing. */
  completion: "real" | "manual" | null;
}

/** A week, on its last night. */
export interface WeekRecord {
  weekKey: string;
  /** "This week" (`trainingWeek`). */
  runs: { done: number; planned: number | null; km: number };
  /** The week's planned runs the strip ticks. */
  ticked: number;
  runMode?: string;
  phase?: string | null;
}

export interface SeasonEvent {
  date: string;
  what: string;
}

export interface Season {
  planned: PlannedRunRecord[];
  weeks: WeekRecord[];
  events: SeasonEvent[];
  /** The runs as the app reads them. */
  runs: SavedRun[];
  /** The same runs as stored, which is what the server reads. */
  documents: Record<string, unknown>[];
  profile: UserProfile;
  programState: ProgramState;
}

interface Walk {
  runner: Runner;
  paces: RunnerPaces;
  setClock: (at: Date) => void;
  profile: UserProfile;
  programState: ProgramState;
  /** The documents as stored: the server reads these. */
  docs: Record<string, unknown>[];
  /** The same runs as the reader returns them: the app reads these. */
  runs: SavedRun[];
  planned: Map<string, PlannedRunRecord>;
  /** Runs put off to a later day, by that day. */
  later: Map<string, { run: PlannedRun; action: RunAction }[]>;
  weeks: WeekRecord[];
  events: SeasonEvent[];
}

const TEMPLATES = new Map(RUN_TEMPLATES.map((t) => [t.id, t]));

function at(day: string, hour: number, minute = 0): Date {
  const d = parseLocalDate(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; ) {
    out.push(d);
    d = localDateString(addLocalDays(parseLocalDate(d), 1));
  }
  return out;
}

function plannedRun(day: ScheduledRunDay): PlannedRun {
  return {
    id: day.id ?? `${day.date}`,
    date: day.date ?? "",
    templateId: day.userOverride || day.templateId,
    type: day.type,
  };
}

function fitnessFor(runner: Runner): RunFitnessInput | null {
  return runner.benchmarked ? { benchmark: null, vdot: runner.vdot } : null;
}

/** The runner's layoff as `fetchRecentLayoff` reads it: the newest 20
 *  saved runs, by completion. */
function recentLayoff(w: Walk, today: string): LayoffClass {
  const newest = [...w.runs]
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, 20);
  return layoffFromRuns(
    newest.map((run) => ({
      date: run.day,
      distance: run.distance,
      duration: run.duration,
      isInvalid: run.isInvalid === true,
      savedAnyway: run.savedAnyway === true,
    })),
    today
  );
}

function begin({ runner, start, setClock }: SeasonOptions): Walk {
  setClock(at(start, 8));
  const runDaysCount = runner.weekSchedule.filter(
    (d) => d.type === "run" || d.type === "both"
  ).length;
  const liftDays = runner.weekSchedule.filter(
    (d) => d.type === "lift" || d.type === "both"
  ).length;
  const runFitness = fitnessFor(runner);
  const built = buildPlan({
    primaryGoal: "general",
    nutritionPhase: "recomp",
    experience: "intermediate",
    liftDays,
    preferredSplit: "auto",
    runMode: runner.raceGoal ? "race_prep" : "freeform",
    weeklyRunDays: runDaysCount,
    weekSchedule: runner.weekSchedule,
    raceGoal: runner.raceGoal,
    runFitness,
    recentLayoff: "none",
    equipment: "full_gym",
    injuries: [],
    currentDate: start,
  });
  const createdMs = at(start, 8).getTime();
  const profile = {
    ...built.profileUpdates,
    runFitness,
    createdAt: { toMillis: () => createdMs },
  } as unknown as UserProfile;
  return {
    runner,
    paces: pacesFor(runner.vdot),
    setClock,
    profile,
    programState: built.programState,
    docs: [],
    runs: [],
    planned: new Map(),
    later: new Map(),
    weeks: [],
    events: [],
  };
}

/** 04:00 UTC: the race no-show, the end of recovery, and the returns to
 *  free running after a no-show and once the plan is gone. */
function sweep(w: Walk, today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const nowMs = Date.UTC(y, m - 1, d, 4);
  let forRaceDate: unknown[] = [];
  if (server.needsRaceNoShowEvaluation(w.profile, w.programState, nowMs)) {
    const raceDate = (
      w.programState.runPlan?.raceGoal as { targetDate: string } | undefined
    )?.targetDate;
    forRaceDate = w.docs.filter((doc) => doc.date === raceDate);
  }
  const decision = server.decideReconciliationActions(
    w.profile,
    w.programState,
    forRaceDate,
    nowMs
  );
  if (decision.payload) {
    w.programState = mergeSet(
      w.programState,
      decision.payload as Record<string, unknown>
    );
  }
  if (decision.profilePayload) {
    w.profile = mergeSet(w.profile, decision.profilePayload);
  }
  if (decision.noShowWritten) w.events.push({ date: today, what: "no-show" });
  if (decision.recoveryCleared)
    w.events.push({
      date: today,
      what: `recovery ended → ${w.profile.runMode}`,
    });
  if (decision.noShowCleared)
    w.events.push({
      date: today,
      what: `no-show cleared → ${w.profile.runMode}`,
    });
  if (decision.orphanedGoalCleared)
    w.events.push({
      date: today,
      what: `race goal cleared → ${w.profile.runMode}`,
    });
}

/** Opening the app: this week's race runs built when they are missing or
 *  stale, then any passed week rolled over, as `useProgram` does. */
function openApp(w: Walk, today: string) {
  w.setClock(at(today, 6, 30));
  const profile = w.profile;
  const thisWeek = localWeekKey(parseLocalDate(today));
  if (
    profile.raceGoal &&
    raceWeekNeedsBuilding(w.programState, profile, today)
  ) {
    const next = w.programState;
    const runs = regenerateRacePlan({
      recentLayoff: recentLayoff(w, today),
      profile,
      raceGoal: profile.raceGoal,
      weekSchedule: profile.weekSchedule ?? [],
      weeklyRunDays: getWeeklyRunTarget(profile) || 3,
      currentDate: today,
      weekStart: thisWeek,
      carry: next.runPlan
        ? {
            currentWeek: next.runPlan.currentWeek,
            totalWeeks: next.runPlan.totalWeeks,
            completedRaces: next.runPlan.completedRaces,
          }
        : undefined,
      prior: next.runDays
        ? { runDays: next.runDays, manualCompletions: next.manualCompletions }
        : undefined,
    });
    w.programState = {
      ...next,
      runDays: runs.runDays,
      runPlan: runs.runPlan,
      ...(runs.manualCompletions
        ? { manualCompletions: runs.manualCompletions }
        : {}),
    };
    w.events.push({ date: today, what: "week rebuilt on opening" });
  }

  if (!profile.runMode || profile.runMode === "freeform") return;
  const anchor = weekRolloverAnchor(w.programState, profile);
  if (anchor?.side !== "run" || anchor.weekKey >= thisWeek) return;
  const layoff = recentLayoff(w, today);
  let rolling = w.programState;
  for (let i = 0; i < 12; i++) {
    const current = rolling.runDays?.[0]?.weekKey;
    if (!current || current >= thisWeek) break;
    const nextDate = addLocalDays(parseLocalDate(current), 7);
    const runs = nextRunWeek(
      rolling,
      { weekStart: localWeekKey(nextDate), date: localDateString(nextDate) },
      profile,
      layoff
    );
    rolling = { ...rolling, runDays: runs.runDays, runPlan: runs.runPlan };
  }
  w.programState = rolling;
}

/** Launch a planned run from the Run screen and run it. */
function launchAndRun(
  w: Walk,
  run: PlannedRun,
  today: string,
  action: RunAction
) {
  const startAt = at(today, 7);
  w.setClock(startAt);
  const profile = w.profile;
  const plan = computePlanMetadata({
    displayUnit: "km",
    profileRunMode: profile.runMode,
    todayDayIndex: startAt.getDay(),
    todayDate: today,
    runPlan: w.programState.runPlan,
    runDays: w.programState.runDays,
    urlTemplateId: null,
    urlType: null,
    urlScheduledRunId: run.id,
    paceTable: prescriptivePaceTableFromFitness(profile.runFitness ?? null),
  });
  const config: RunConfig = buildLaunchConfig(
    {
      prefill: plan.prefill as Partial<RunConfig>,
      metadata: plan.metadata,
    },
    true
  );
  const template = TEMPLATES.get(run.templateId);
  if (!template) throw new Error(`unknown template ${run.templateId}`);
  const performed = perform(template, plan.prefill, w.paces);
  const scale = action.distanceScale ?? 1;
  const distance = performed.distance * scale;
  const elapsed = performed.elapsed * scale;

  const untemplated = action.launch === "start";
  const activityType = untemplated ? "freerun" : config.activityType;
  const finalConfig: RunConfig = {
    ...config,
    activityType,
    planMetadata: finalisePlanMetadata(config.planMetadata, activityType),
  };
  const finished: FinishedRun = {
    points: [
      {
        lat: 51.5,
        lon: -0.12,
        altitude: null,
        accuracy: 5,
        speed: null,
        timestamp: startAt.getTime(),
        rawLat: 51.5,
        rawLon: -0.12,
      },
    ],
    distance,
    elapsed,
    avgPaceSeconds: (elapsed / distance) * 1000,
    avgPace: "",
    calories: 0,
    elevationGain: 0,
    splits: [],
    runConfig: finalConfig,
    intervalData: finalConfig.intervals,
    notes: "",
    relativeEffort: null,
    paceVerdictTone: null,
    isInvalid: false,
    invalidReason: null,
    routeQuality: null,
    shoeId: null,
    bestEfforts: [],
  };
  const savedAt = new Date(startAt.getTime() + elapsed * 1000);
  w.setClock(savedAt);
  const doc = runDocument(finished, savedAt) as Record<string, unknown>;
  const id = `run-${String(w.runs.length + 1).padStart(3, "0")}`;
  const saved = parseSavedRun(id, doc);
  if (!saved) throw new Error("a saved run the reader cannot read");
  w.docs.push(doc);
  w.runs.push(saved);
  const record = w.planned.get(run.date);
  if (record) record.run = saved;

  // onRunCreated
  const entry = server.decideRecoveryEntry(w.profile, w.programState, doc);
  if (entry.write && entry.payload) {
    const { phase, recoveryEndDate, completedRaces } = entry.payload.runPlan;
    w.programState = mergeSet(w.programState, {
      runPlan: { phase, recoveryEndDate, completedRaces },
    });
    w.events.push({
      date: today,
      what: `recovery entered, to ${entry.recoveryEndDate}`,
    });
  }
}

function runnersDay(w: Walk, today: string) {
  for (const { run, action } of w.later.get(today) ?? []) {
    launchAndRun(w, run, today, action);
  }
  w.later.delete(today);

  const todays = (w.programState.runDays ?? []).find((d) => d.date === today);
  if (!todays) return;
  const run = plannedRun(todays);
  const action = w.runner.onPlannedRun?.(run) ?? { kind: "run" };
  w.planned.set(run.date, { ...run, action: action.kind, completion: null });
  if (action.kind === "skip") return;
  if (action.kind === "mark") {
    w.programState = {
      ...w.programState,
      manualCompletions: {
        ...w.programState.manualCompletions,
        [run.id]: { completedAt: at(today, 20) },
      },
    };
    return;
  }
  const daysLate = action.daysLate ?? 0;
  if (daysLate > 0) {
    const due = localDateString(addLocalDays(parseLocalDate(today), daysLate));
    w.later.set(due, [...(w.later.get(due) ?? []), { run, action }]);
    return;
  }
  launchAndRun(w, run, today, action);
}

/** The evening: each planned run's tick, and on Sunday the week. */
function evening(w: Walk, today: string) {
  w.setClock(at(today, 21));
  const runDays = w.programState.runDays ?? [];
  const claims = claimMapFor(
    runDays,
    claimableRuns(w.runs),
    w.programState.manualCompletions ?? {},
    today
  );
  for (const day of runDays) {
    const record = day.date ? w.planned.get(day.date) : undefined;
    if (record && day.id) record.completion = getCompletionKind(day.id, claims);
  }
  if (parseLocalDate(today).getDay() !== 0) return;
  const weekKey = localWeekKey(parseLocalDate(today));
  const week = trainingWeek({
    weekKey,
    profile: w.profile,
    programState: w.programState,
    workouts: [],
    runs: w.runs,
    now: at(today, 21),
  });
  w.weeks.push({
    weekKey,
    runs: week.runs,
    ticked: runDays.filter(
      (d) =>
        d.weekKey === weekKey &&
        d.id &&
        getCompletionKind(d.id, claims) !== null
    ).length,
    runMode: w.profile.runMode,
    phase: w.programState.runPlan?.phase,
  });
}

/** Walk a runner through a season, from the day they sign up. */
export function walkSeason(options: SeasonOptions): Season {
  const w = begin(options);
  for (const today of eachDay(options.start, options.end)) {
    sweep(w, today);
    openApp(w, today);
    runnersDay(w, today);
    evening(w, today);
  }
  return {
    planned: [...w.planned.values()],
    weeks: w.weeks,
    events: w.events,
    runs: w.runs,
    documents: w.docs,
    profile: w.profile,
    programState: w.programState,
  };
}
