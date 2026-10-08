/**
 * The run side of a simulated day, through the app's own code and the
 * server's, in the order they run (training-engine prompt, Phase 2):
 *
 *   the server's morning: the race sweep (`decideReconciliationActions`,
 *   daily at 04:00 UTC) and, on Mondays, the fell-behind check
 *   (`decideFellBehindFlag`) → the layoff class the rollover is given
 *   (`layoffFromRuns`, over the 20 latest runs as `fetchRecentLayoff` reads
 *   them) → Home's claim map (`claimableRuns`, `claimMapFor`) → the run
 *   Home's card starts, as the run screen sets it out (`computePlanMetadata`
 *   with Run.tsx's inputs, `finalisePlanMetadata` at Start) → the virtual
 *   runner → the saved run (`runDocument`, read back by `parseSavedRun`) →
 *   the server's recovery entry on the new run (`decideRecoveryEntry`). A
 *   benchmark the app derives from the runs (`resolveAutoDeriveBenchmark`)
 *   lands pending, as the Programme page saves it.
 *
 * Where the app does a step inline (the run screen, the server's workers),
 * it is written out here and named. The server's sweep runs in the morning
 * of each simulated local day, before the app opens: true in Europe, a
 * simplification further east and west, kept so a day happens in the same
 * order in every time zone.
 */
import { createRequire } from "node:module";
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { isHardRun } from "@/lib/hybridGuidance";
import { claimableRuns, claimMapFor } from "@/lib/runClaims";
import { runDocument, type FinishedRun } from "@/lib/runCompletion";
import {
  paceTableFromFitness,
  prescriptivePaceTableFromFitness,
  trainingBands,
  vdotFromRace,
  type PaceBand,
  type RunIntensity,
} from "@/lib/runPaces";
import {
  computePlanMetadata,
  finalisePlanMetadata,
  type RunPlanMetadata,
  type RunPlanPrefill,
} from "@/lib/runPlanMetadata";
import { parseSavedRun, type SavedRun } from "@/lib/savedRuns";
import { isPaceEligible, isVolumeEligible } from "@/lib/runStatsEligibility";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import { DEFAULT_CONFIG } from "@/components/run/runConfigDefaults";
import { resolveAutoDeriveBenchmark } from "@/hooks/useRunFitnessAutoDerive";
import {
  layoffFromRuns,
  type LayoffClass,
} from "@/features/program/layoffDetection";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import {
  BASE_RUNNER,
  VirtualRunner,
  type RunDone,
  type RunnerSetup,
  type RunnerVariant,
  type RunSegment,
} from "./runner";

/* The server's own rules, from the modules its workers call. */
const requireServer = createRequire(import.meta.url);
const raceServer = requireServer(
  "../../../functions/lib/raceReconciliation"
) as {
  decideReconciliationActions: (
    profile: unknown,
    programState: unknown,
    savedRunsForRaceDate: unknown[],
    nowMs: number
  ) => {
    payload: { runDays?: ScheduledRunDay[]; runPlan?: object } | null;
    profilePayload: Partial<UserProfile> | null;
    noShowWritten: boolean;
    recoveryCleared: boolean;
    noShowCleared: boolean;
  };
  decideRecoveryEntry: (
    profile: unknown,
    programState: unknown,
    savedRun: unknown
  ) =>
    | { write: false }
    | {
        write: true;
        payload: { runPlan: NonNullable<ProgramState["runPlan"]> };
        recoveryEndDate: string;
      };
};
const fellBehindServer = requireServer(
  "../../../functions/lib/fellBehindWeek"
) as {
  priorWeekUtcRange: (nowMs: number) => {
    weekStart: string;
    weekEnd: string;
    weekKey: string;
  };
  decideFellBehindFlag: (
    profile: unknown,
    programState: unknown,
    priorWeekRuns: unknown[],
    priorWeekKey: string
  ) => { action: "set" | "clear" | "noop"; payload?: Record<string, unknown> };
};

/** How a person runs, as the simulator puts them through the plan. */
export interface RunHabits {
  runner: RunnerSetup;
  /** Share of the planned runs Home offers that they go out for. */
  runShare: number;
  /** A race they enter in Settings before the first run. */
  benchmark?: { distanceM: number; timeS: number };
  /** A finish time they set for their race in Settings, seconds. */
  goalTimeS?: number;
  /** They accept a benchmark the app derives from their runs. */
  acceptsDerived?: boolean;
  /** Running with no plan: the weekdays (0 = Sunday) and minutes. */
  freeRuns?: readonly { day: number; minutes: number }[];
}

/** One run, as done and as the app took it. */
export interface RunRecord {
  date: string;
  /** The plan's session, or "free" for a run the plan didn't set. */
  templateId: string;
  type: string;
  done: RunDone;
  /** Home counted it on its planned day. */
  counted: boolean;
  /** The runner's longest run of the 30 days before, km (the single-run
   *  guard's yardstick). */
  longestBefore: number;
  /** The runner's true VDOT that morning. */
  trueVdot: number;
  /** The easy band the run screen prescribed, if any, and the runner's
   *  own (s/km, fast end first). */
  prescribedEasy: PaceBand | null;
  ownEasy: PaceBand;
  /** A race's finish time, seconds. */
  raceTimeS?: number;
  /** The server entered recovery on this run. */
  recovery?: string;
}

/** The race distances' lengths, metres. */
const RACE_M = { "5k": 5000, "10k": 10000, half: 21097.5, marathon: 42195 };

/** The intensity a race is run at, for the runner's bands. */
const RACE_INTENSITY: Record<keyof typeof RACE_M, RunIntensity> = {
  "5k": "interval",
  "10k": "interval",
  half: "threshold",
  marathon: "marathon",
};

const day = (date: string, n: number) =>
  localDateString(addLocalDays(parseLocalDate(date), n));

/** 04:00 UTC on `date`'s calendar day: the race sweep's hour. */
const sweepMs = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 4);
};

const templateOf = (id: string): RunTemplate | undefined =>
  RUN_TEMPLATES.find((t) => t.id === id);

/**
 * The seconds a race of `distanceM` takes at `vdot`: the app's own
 * Daniels–Gilbert equation (`vdotFromRace`), solved for time. A marathon
 * also takes Vickers & Vertosick's low-volume correction (running-evidence
 * §6.7 item 7): equivalents are optimistic for recreational marathoners,
 * the more so the fewer kilometres they run.
 */
export function raceTimeS(
  vdot: number,
  distanceM: number,
  weeklyKm: number
): number {
  let lo = distanceM / 10; // 10 m/s
  let hi = distanceM; // 1 m/s
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(distanceM, mid) > vdot) lo = mid;
    else hi = mid;
  }
  const equivalent = (lo + hi) / 2;
  if (distanceM < 40000) return equivalent;
  // Vickers Model 1 from the VDOT-equivalent half, speeds in m/s.
  const half = raceTimeS(vdot, 21097.5, weeklyKm);
  const riegel = distanceM / (half * Math.pow(distanceM / 21097.5, 1.07));
  const speed =
    0.16018617 + 0.83076202 * riegel + 0.06423826 * (weeklyKm / 1.609 / 10);
  return Math.max(equivalent, distanceM / speed);
}

/** A segment's intensity, from its type and the session's. */
function segmentIntensity(
  sessionType: string,
  segmentType: string,
  race: keyof typeof RACE_M | null
): RunIntensity {
  if (segmentType === "hard")
    return sessionType === "intervals" ? "interval" : "repetition";
  if (segmentType === "moderate") {
    if (sessionType === "long" && race) return RACE_INTENSITY[race];
    return "threshold";
  }
  return "easy";
}

/**
 * The session as the runner runs it: the run screen's segments when it sets
 * them out, else its distance or time target, else the session's nominal
 * length, all at the session's intensity. A race is run at the runner's
 * race pace for the day.
 */
export function sessionSegments(
  prefill: RunPlanPrefill,
  template: RunTemplate | undefined,
  race: keyof typeof RACE_M | null,
  racePace: number | null
): RunSegment[] {
  const type = template?.type ?? prefill.activityType ?? "easy";
  if (type === "race" && race && racePace !== null)
    return [
      {
        intensity: RACE_INTENSITY[race],
        km: RACE_M[race] / 1000,
        pace: racePace,
      },
    ];
  if (prefill.segments?.length)
    return prefill.segments.map((seg) => ({
      intensity: segmentIntensity(type, seg.type, race),
      ...(seg.target.kind === "duration"
        ? { minutes: seg.target.seconds / 60 }
        : { km: seg.target.meters / 1000 }),
      ...(seg.paceTarget ? { pace: seg.paceTarget } : {}),
    }));
  const target = prefill.target;
  if (target?.type === "distance" && target.value)
    return [{ intensity: "easy", km: target.value / 1000 }];
  if (target?.type === "time" && target.value)
    return [{ intensity: "easy", minutes: target.value / 60 }];
  const minutes = template?.estimatedDuration ?? 30;
  return [
    {
      intensity: type === "tempo" ? "threshold" : "easy",
      minutes,
      ...(target?.type === "pace" && target.value
        ? { pace: target.value }
        : {}),
    },
  ];
}

/**
 * The minutes a planned session takes this runner: a distance at their easy
 * pace, a set time, or the session's own estimate.
 */
export function plannedRunMinutes(
  templateId: string,
  easyPace: number
): number {
  const template = templateOf(templateId);
  if (!template) return 0;
  const { targetDistanceKm, targetDurationMinutes } = template.config;
  if (targetDistanceKm) return (targetDistanceKm * easyPace) / 60;
  if (targetDurationMinutes) return targetDurationMinutes;
  return template.estimatedDuration;
}

/** A session's type, from the catalogue. */
export const runTypeOf = (templateId: string) =>
  templateOf(templateId)?.type ?? "free";

/** A session's planned distance, km, when it has one. */
export const runKmOf = (templateId: string) =>
  templateOf(templateId)?.config.targetDistanceKm ?? 0;

const paceText = (s: number) =>
  `${String(Math.floor(Math.round(s) / 60))}:${String(Math.round(s) % 60).padStart(2, "0")}`;

/** The finish screen's run: no trace, the distance and time as run. */
function finishedRun(
  done: RunDone,
  prefill: RunPlanPrefill,
  planMetadata: RunPlanMetadata
): FinishedRun {
  return {
    points: [],
    distance: done.km * 1000,
    elapsed: done.minutes * 60,
    avgPaceSeconds: done.pace,
    avgPace: paceText(done.pace),
    calories: 0,
    elevationGain: 0,
    splits: [],
    runConfig: {
      ...DEFAULT_CONFIG,
      ...(prefill.activityType
        ? {
            activityType:
              prefill.activityType as typeof DEFAULT_CONFIG.activityType,
          }
        : {}),
      target: prefill.target ?? DEFAULT_CONFIG.target,
      ...(prefill.intervals ? { intervals: prefill.intervals } : {}),
      ...(prefill.segments ? { segments: prefill.segments } : {}),
      planMetadata,
    },
    intervalData: prefill.intervals,
    notes: "",
    relativeEffort: null,
    paceVerdictTone: null,
    isInvalid: false,
    invalidReason: null,
    routeQuality: null,
    shoeId: null,
    bestEfforts: [],
  };
}

type RunDoc = ReturnType<typeof runDocument>;

/** The run side of one person's season. */
export class RunSide {
  readonly runner: VirtualRunner;
  /** Saved runs, newest first, as the app reads them. */
  readonly saved: SavedRun[] = [];
  /** The same runs as stored: what the server reads. */
  private readonly docs: RunDoc[] = [];
  readonly records: RunRecord[] = [];
  readonly events: string[] = [];
  private count = 0;

  readonly name: string;
  readonly habits: RunHabits;

  constructor(
    name: string,
    habits: RunHabits,
    seed: number,
    variant: RunnerVariant = BASE_RUNNER
  ) {
    this.name = name;
    this.habits = habits;
    this.runner = new VirtualRunner(habits.runner, seed, variant);
  }

  /** What they enter in Settings before the first run, as Settings saves
   *  it: a race result (`runFitness`, manual) and a goal time for their
   *  race (`raceGoal.targetTimeS`). */
  settings(profile: UserProfile, date: string): UserProfile {
    const { benchmark, goalTimeS } = this.habits;
    if (goalTimeS && profile.raceGoal)
      profile = {
        ...profile,
        raceGoal: { ...profile.raceGoal, targetTimeS: goalTimeS },
      };
    if (!benchmark) return profile;
    const vdot = vdotFromRace(benchmark.distanceM, benchmark.timeS);
    return {
      ...profile,
      runFitness: {
        benchmark,
        vdot: Math.round(vdot * 10) / 10,
        source: "manual",
        updatedAt: `${date}T12:00:00.000Z`,
        pendingConfirmation: false,
      },
    };
  }

  /**
   * The server's morning: the race sweep on every day, and the
   * fell-behind check on a Monday. Each applies its write as Firestore
   * would: run days replaced, the run plan and the profile merged.
   */
  serverMorning(
    state: ProgramState,
    profile: UserProfile,
    date: string
  ): { state: ProgramState; profile: UserProfile } {
    const nowMs = sweepMs(date);
    const raceDate = state.runPlan?.raceGoal?.targetDate;
    const raceDay = this.docs.filter((doc) => doc.date === raceDate);
    const sweep = raceServer.decideReconciliationActions(
      profile,
      state,
      raceDay,
      nowMs
    );
    if (sweep.payload) {
      state = {
        ...state,
        ...(sweep.payload.runDays ? { runDays: sweep.payload.runDays } : {}),
        ...(sweep.payload.runPlan
          ? {
              runPlan: {
                ...state.runPlan,
                ...sweep.payload.runPlan,
              } as ProgramState["runPlan"],
            }
          : {}),
      };
    }
    if (sweep.profilePayload) profile = { ...profile, ...sweep.profilePayload };
    if (sweep.noShowWritten)
      this.events.push(`${date}: server marked the race a no-show`);
    if (sweep.recoveryCleared)
      this.events.push(`${date}: server ended recovery`);
    if (sweep.noShowCleared)
      this.events.push(
        `${date}: server returned the no-show race to ${String(profile.runMode)}`
      );

    if (parseLocalDate(date).getDay() === 1) {
      const range = fellBehindServer.priorWeekUtcRange(nowMs + 3600 * 1000);
      const prior = this.docs.filter(
        (doc) => doc.date >= range.weekStart && doc.date <= range.weekEnd
      );
      const flag = fellBehindServer.decideFellBehindFlag(
        profile,
        state,
        prior,
        range.weekKey
      );
      if (flag.action === "set") {
        state = { ...state, ...flag.payload };
        this.events.push(
          `${date}: server flagged the week of ${range.weekKey} as fallen behind`
        );
      } else if (flag.action === "clear") {
        state = { ...state, ...flag.payload };
      }
    }
    return { state, profile };
  }

  /** The layoff class the rollover is given, as `fetchRecentLayoff` reads
   *  it: the 20 latest saved runs. */
  layoff(date: string): LayoffClass {
    return layoffFromRuns(
      this.saved.slice(0, 20).map((run) => ({
        date: run.day,
        distance: run.distance,
        duration: run.duration,
        isInvalid: run.isInvalid === true,
        savedAnyway: run.savedAnyway === true,
      })),
      date
    );
  }

  /** Home's claim map. */
  claims(state: ProgramState, date: string): Map<string, ClaimState> {
    return claimMapFor(
      state.runDays ?? [],
      claimableRuns(this.saved),
      state.manualCompletions ?? {},
      date
    );
  }

  /**
   * The benchmark the Programme page derives when the person has none
   * (`useRunFitnessAutoDerive`): from the pace-eligible runs of the last 90
   * days, saved pending. A person who accepts it confirms it in Settings.
   */
  deriveBenchmark(profile: UserProfile, date: string): UserProfile {
    if (profile.runFitness) {
      if (
        profile.runFitness.pendingConfirmation &&
        this.habits.acceptsDerived
      ) {
        this.events.push(`${date}: accepted the derived benchmark`);
        return {
          ...profile,
          runFitness: { ...profile.runFitness, pendingConfirmation: false },
        };
      }
      return profile;
    }
    const since = parseLocalDate(day(date, -90)).getTime();
    const eligible = this.saved
      .filter(
        (run) => run.completedAt.getTime() >= since && isPaceEligible(run)
      )
      .map((run) => ({
        distanceM: run.distance,
        durationS: run.duration,
        id: run.id,
        completedAt: run.completedAt,
      }));
    const derived = resolveAutoDeriveBenchmark(false, eligible);
    if (!derived) return profile;
    const { sourceRunId, sourceRunAt, ...benchmark } = derived;
    const vdot = vdotFromRace(benchmark.distanceM, benchmark.timeS);
    this.events.push(
      `${date}: the app derived a benchmark, ${(benchmark.distanceM / 1000).toFixed(1)} km in ${paceText(benchmark.timeS)} (VDOT ${vdot.toFixed(1)}, true ${this.runner.trueVdot().toFixed(1)})`
    );
    return {
      ...profile,
      runFitness: {
        benchmark,
        vdot: Math.round(vdot * 10) / 10,
        source: "derived",
        updatedAt: `${date}T12:00:00.000Z`,
        pendingConfirmation: true,
        ...(sourceRunId ? { sourceRunId } : {}),
        ...(sourceRunAt ? { sourceRunAt } : {}),
      },
    };
  }

  /** Whether a long or hard run finished in the 24 hours before `startMs`
   *  (`useHardRunBefore`). */
  hardRunBefore(startMs: number): boolean {
    return this.saved.some((run) => {
      const finished = run.completedAt.getTime();
      return (
        finished <= startMs &&
        startMs - finished <= 86_400_000 &&
        isVolumeEligible(run) &&
        isHardRun(run)
      );
    });
  }

  /** The runner's mean weekly kilometres over the eight weeks before
   *  `date`. */
  weeklyKm(date: string): number {
    const from = day(date, -56);
    return (
      this.records
        .filter((r) => r.date >= from && r.date < date)
        .reduce((n, r) => n + r.done.km, 0) / 8
    );
  }

  /**
   * One run: the planned session Home's card starts, or a free run. The
   * run screen sets it out with Run.tsx's inputs, the runner runs it, and
   * the saved run goes to the server's recovery check.
   */
  run(
    state: ProgramState,
    profile: UserProfile,
    date: string,
    runDay: ScheduledRunDay | null,
    options: { afterHeavyLegs: boolean; freeMinutes?: number }
  ): { state: ProgramState; record: RunRecord } {
    const templateId = runDay ? runDay.userOverride || runDay.templateId : null;
    const raceGoal = profile.raceGoal ?? null;
    // Run.tsx's prescription, written out: it is inline there.
    const { metadata, prefill } = computePlanMetadata({
      displayUnit: "km",
      profileRunMode: profile.runMode,
      todayDayIndex: parseLocalDate(date).getDay(),
      todayDate: date,
      runPlan: state.runPlan,
      runDays: state.runDays,
      urlTemplateId: templateId,
      urlType: null,
      urlScheduledRunId: runDay?.id ?? null,
      paceTable: prescriptivePaceTableFromFitness(profile.runFitness ?? null),
      raceTarget: raceGoal?.targetTimeS
        ? {
            distance: raceGoal.distance,
            targetTimeS: raceGoal.targetTimeS,
            currentVdot:
              paceTableFromFitness(profile.runFitness ?? null)?.vdot ?? null,
          }
        : null,
    });
    const template = templateId ? templateOf(templateId) : undefined;
    const race =
      template?.type === "race" && raceGoal
        ? (raceGoal.distance as keyof typeof RACE_M)
        : null;
    this.runner.startDay();
    const vdot = this.runner.dayVdot();
    const racePace = race
      ? raceTimeS(vdot, RACE_M[race], this.weeklyKm(date)) /
        (RACE_M[race] / 1000)
      : null;
    const segments =
      runDay === null
        ? [{ intensity: "easy" as const, minutes: options.freeMinutes ?? 30 }]
        : sessionSegments(prefill, template, race, racePace);
    const trueVdot = this.runner.trueVdot();
    const longestBefore = this.runner.longestRecent();
    const done = this.runner.run(segments, {
      afterHeavyLegs: options.afterHeavyLegs,
    });
    const planMetadata = finalisePlanMetadata(
      metadata,
      (prefill.activityType ??
        DEFAULT_CONFIG.activityType) as typeof DEFAULT_CONFIG.activityType
    );
    const doc = runDocument(
      finishedRun(done, prefill, planMetadata),
      new Date()
    );
    const id = `run-${this.name}-${date}-${String(++this.count)}`;
    const saved = parseSavedRun(id, doc);
    if (!saved) throw new Error(`${id}: the saved run did not read back`);
    this.saved.unshift(saved);
    this.docs.unshift(doc);

    // The server, on the new run (`onRunCreated`): recovery entry, merged
    // into the plan as the trigger writes it.
    let recovery: string | undefined;
    const entry = raceServer.decideRecoveryEntry(profile, state, doc);
    if (entry.write) {
      const { phase, recoveryEndDate, completedRaces } = entry.payload.runPlan;
      state = {
        ...state,
        runPlan: {
          ...state.runPlan!,
          phase,
          recoveryEndDate,
          completedRaces,
        },
      };
      recovery = recoveryEndDate;
      this.events.push(
        `${date}: server entered recovery until ${recoveryEndDate}`
      );
    }

    const claim = runDay?.id
      ? this.claims(state, date).get(runDay.id)
      : undefined;
    const table = prescriptivePaceTableFromFitness(profile.runFitness ?? null);
    const record: RunRecord = {
      date,
      templateId: templateId ?? "free",
      type: template?.type ?? "free",
      done,
      counted: !!claim && claim.claimedSavedRunId === id,
      longestBefore,
      trueVdot,
      prescribedEasy: table ? table.easy : null,
      ownEasy: trainingBands(trueVdot).easy,
      ...(race ? { raceTimeS: done.minutes * 60 } : {}),
      ...(recovery ? { recovery } : {}),
    };
    this.records.push(record);
    if (done.injury)
      this.events.push(
        `${date}: ${done.injury} injury on ${record.templateId}`
      );
    return { state, record };
  }
}
