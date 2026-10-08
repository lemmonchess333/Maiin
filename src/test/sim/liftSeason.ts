/**
 * A season of lifting through the app's own code, one simulated day at a
 * time, in the order the app runs it (training-engine prompt, Phase 2):
 *
 *   setup builds the plan (`buildOnboardingPlan`) → the loader reads it
 *   back (`normalizeProgramState`, `migrateProgramState`) → each morning
 *   the weekly rollover (`rollRunWeeks`, then `rollLiftWeeks`, again on what
 *   was saved, until neither moves) → Home's card (`todaySession`) → the
 *   session Train opens (`sessionPrescription`, with Train's baseline and
 *   completion context) → the rows the workout screen starts from
 *   (`buildInitialSetLogs`, `startingSetRows` from the last saved sets) →
 *   the virtual lifter → Finish (`toCompletionSetLogs`,
 *   `toSessionProgression`, the save's check, `applySessionProgression`,
 *   `markDayDone`) → the saved workout (`liftWorkoutExercises`), which the
 *   next session's starting rows read.
 *
 * Only the person is simulated. Everything the plan does is the app's code,
 * called as the app calls it; where the app does something inline in a
 * component, the step is written out here and named as such.
 *
 * Along the way it checks what the app's own rules promise (`Rule`): every
 * loaded lift on its equipment's weights, above nothing and no lighter than
 * the bar; Home's card naming Train's next session (ADR-0002); each session
 * inside the length the person chose; each week starting from the plan's
 * own sets (a lighter week's half, the first week back's one fewer,
 * otherwise all of them); the week number moving only after a week that
 * was trained; and every change to a lift's numbers one the rules sheet
 * allows (`unexplainedChange`).
 *
 * Deterministic: the clock is pinned at local noon on each simulated day,
 * days are counted with the app's local date helpers, exercise ids come from
 * a sequential source, and the person draws from one seeded PRNG.
 *
 * A suite that imports this must stub Firebase, as `liftCompletion.test.ts`
 * does (`vi.mock("firebase/firestore")` and `vi.mock("@/lib/firebase", …)`):
 * `liftWorkoutExercises` lives in a module that opens Firebase at import.
 */
import { vi } from "vitest";
import { epley1RMExact } from "@/lib/analytics";
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { getExerciseById, isBodyweightExerciseId } from "@/lib/exercises";
import { liftWorkoutExercises, liftWorkoutId } from "@/lib/liftCompletion";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import { todaySession } from "@/lib/todaySession";
import {
  markDayDone,
  workoutCompletionDayIdentity,
} from "@/lib/workoutCompletion";
import type { WorkoutExercise } from "@/lib/savedWorkouts";
import { estimateSessionMinutes } from "@/features/program/expressSession";
import { lastSetsByExercise } from "@/features/program/lastSets";
import { assessLiftReturn } from "@/features/program/liftLayoff";
import {
  automaticStepUp,
  loadGridFor,
  loweredLoad,
  MISSES_BEFORE_LOWERING,
  type LoadGrid,
} from "@/features/program/loadSteps";
import { migrateProgramState } from "@/features/program/migrations";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import { easeBackIn } from "@/features/program/programEngine";
import {
  normalizeProgramState,
  setInstanceIdSource,
  type Goal,
  type ProgramExercise,
  type ProgramState,
} from "@/features/program/programTypes";
import {
  applySessionProgression,
  sessionPrescription,
  toSessionProgression,
} from "@/features/program/sessionCompletion";
import { sessionMinutesFor } from "@/features/program/sessionFit";
import { followedWeight } from "@/features/program/sessionSets";
import { startingSetRows } from "@/features/program/setStartValues";
import {
  BAR_KG,
  buildInitialSetLogs,
  toCompletionSetLogs,
} from "@/features/program/warmupRamp";
import { EASING_BACK_WEEKS } from "@/features/program/weekPrescription";
import { rollLiftWeeks, rollRunWeeks } from "@/features/program/weekRollover";
import { sequentialInstanceIds } from "@/test/instanceIds";
import {
  BASE_VARIANT,
  VirtualLifter,
  type LifterSetup,
  type LifterVariant,
} from "./lifter";

/** A person, as the simulator puts them through the plan. */
export interface LiftPersona {
  name: string;
  /** Their answers at setup, over a default 25–34-year-old's. */
  answers: Partial<OnboardingDraft>;
  nutrition: Goal;
  lifter: LifterSetup;
  /** Share of the sessions Home offers that they start. */
  sessionShare: number;
  /** They load their known working weight (2 in reserve) the first time
   *  each of the plan's slots shows a lift, where it is heavier than the
   *  plan's number. */
  calibrates: boolean;
  /** They pick up the next weight when the plan's rep target has
   *  stretched past its range waiting for them to (Lift4 (6)). */
  picksUpHeavier?: boolean;
  /** Simulated weeks (1-based) with no training at all. */
  breaks?: readonly number[];
  /** They don't open the app in a break week, so the rollover catches the
   *  plan up when they come back. */
  awayFromApp?: boolean;
  /** Home's welcome back after a break: "Ease back in" when true, "Keep
   *  my old weights" when false. */
  easesBackIn?: boolean;
  /** The season's first day, a Monday. */
  start?: string;
  /** Exercise ids the weekly record follows. */
  tracked: readonly string[];
}

export interface SeasonOptions {
  weeks: number;
  seed: number;
  variant?: LifterVariant;
  /** Overrides the persona's start. */
  start?: string;
}

/** What a session did to a lift's numbers, read off the plan before and
 *  after it. */
export type LiftOutcome =
  | "own weight"
  | "step"
  | "reps"
  | "hold"
  | "miss"
  | "lowered";

/** One lift in one session, as done. */
export interface LiftDone {
  exerciseId: string;
  /** The plan's slot (`instanceId`): the same exercise can fill two. */
  slot: string;
  movementCategory?: string;
  /** The plan's weight, and the weight the app follows from the session:
   *  the one most working sets were done at (`followedWeight`). */
  planned: number;
  weight: number;
  targetReps: number;
  /** Each working set's weight and reps. */
  weights: number[];
  reps: number[];
  /** True reps in reserve at the end of each working set. */
  rir: number[];
  /** Working sets finished. */
  setsDone: number;
  /** The person's true 1RM that day, before noise and fatigue. */
  trueMax: number | null;
  /** The app's estimate from the best set logged (Epley). */
  loggedMax: number;
  outcome: LiftOutcome;
}

export interface SessionDone {
  date: string;
  dayIndex: number;
  dayName: string;
  weekNumber: number;
  phase: string;
  /** The app's estimate of the session's length. */
  minutes: number;
  lifts: LiftDone[];
}

/** The plan's numbers for a lift: its heaviest prescription that week. */
export interface Prescription {
  weight: number;
  reps: number;
  sets: number;
}

export interface WeekDone {
  /** 1-based simulated week. */
  week: number;
  weekStart: string;
  weekNumber: number;
  phase: string;
  offered: number;
  done: number;
  trueMax: Record<string, number | null>;
  plan: Record<string, Prescription | null>;
}

/** The rules of the app's own code a season is checked against. */
export type Rule =
  /** A plan number that is not a number: weight, sets or reps. */
  | "bad-number"
  /** A loaded lift at 0 kg. */
  | "no-load"
  /** A weight the lift's equipment doesn't come in (`loadSteps.ts`). */
  | "off-grid"
  /** A barbell lift lighter than the bar (`BAR_KG`). */
  | "below-bar"
  /** Normalising the plan a second time changes it. */
  | "normalise"
  /** Home's card and Train's next session differ (ADR-0002). */
  | "home-train"
  /** A session estimated past the length the person chose (Lift4 (5)). */
  | "over-time"
  /** A week that doesn't start from the plan's own sets (`advanceWeek`). */
  | "week-sets"
  /** A lighter week's stash left after it. */
  | "stash"
  /** The week number moved after an untrained week, or held after a
   *  trained one. */
  | "week-number"
  /** A session finished the day it started that the save refused. */
  | "not-landed"
  /** A lift's numbers changed in a way the rules sheet doesn't allow
   *  (`liftRules.ts`). */
  | "unexplained";

export interface RuleFailure {
  rule: Rule;
  /** The date or week it happened. */
  at: string;
  detail: string;
}

export interface Season {
  persona: string;
  seed: number;
  variant: string;
  /** The session length the plan was fitted to. */
  sessionMinutes: number;
  sessions: SessionDone[];
  weeks: WeekDone[];
  events: string[];
  /** Every break of a rule of the app's own code. */
  failures: RuleFailure[];
}

/** A failure as a line a test prints: who, which seed and model, when. */
export const describeFailure = (season: Season, f: RuleFailure) =>
  `${season.persona} seed ${String(season.seed)} ${season.variant}: ${f.rule} ${f.at}: ${f.detail}`;

export const DEFAULT_ANSWERS: OnboardingDraft = {
  step: 7,
  primaryGoal: "general",
  daysPerWeek: 3,
  equipment: "full_gym",
  runFrequency: "none",
  runMode: "freeform",
  weeklyRunDays: 0,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "male",
  ageRange: "25-34",
  heightCm: 178,
  weightKg: 80,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "beginner",
};

/** A Monday. A 26-week season from it crosses Auckland's change of clocks
 *  on 5 April 2026. */
export const DEFAULT_START = "2026-03-09";

/** A lift's place in the plan: the same exercise can fill two slots, heavy
 *  on one day and for reps on another. */
const slotOf = (ex: ProgramExercise) => ex.instanceId ?? ex.exerciseId;

const day = (date: string, n: number) =>
  localDateString(addLocalDays(parseLocalDate(date), n));
const weekOf = (date: string) => localWeekKey(parseLocalDate(date));

/** The clock at local noon on `date`. */
function atNoon(date: string): void {
  vi.setSystemTime(parseLocalDate(date).getTime() + 12 * 3600 * 1000);
}

const isLoaded = (ex: ProgramExercise) =>
  !isBodyweightExerciseId(ex.exerciseId) && ex.repUnit !== "seconds";
const isBarbell = (exerciseId: string) =>
  getExerciseById(exerciseId)?.equipment === "Barbell";

/** The week number after `weeks` rolled weeks, the first of them trained
 *  or not: an untrained week holds it, and it goes round after 52. */
function expectedWeekNumber(
  from: number,
  trained: boolean,
  weeks: number
): number {
  if (weeks === 0 || !trained) return from;
  return from >= 52 ? 1 : from + 1;
}

/** The rollover as the app runs it each time it opens: the run-side effect,
 *  then the lift-side one, each again on what was saved, until neither
 *  moves. Each save stamps `updatedAt` (`commitProgramTransition`). */
function rollOver(
  state: ProgramState,
  profile: UserProfile,
  todayKey: string,
  failures: RuleFailure[]
): ProgramState {
  for (let pass = 0; pass < 20; pass++) {
    const run = rollRunWeeks(state, profile, todayKey, "none");
    if (run.weeks > 0) {
      state = { ...run.state, updatedAt: Date.now() };
      continue;
    }
    const lift = rollLiftWeeks(state, profile, todayKey);
    if (lift.weeks > 0) {
      const trained = state.workouts.some((d) => d.completed);
      const expected = expectedWeekNumber(
        state.weekNumber,
        trained,
        lift.weeks
      );
      if (!state.runPlan && lift.state.weekNumber !== expected)
        failures.push({
          rule: "week-number",
          at: todayKey,
          detail: `week ${String(state.weekNumber)}, ${trained ? "trained" : "untrained"}, rolled ${String(lift.weeks)} to ${String(lift.state.weekNumber)}, not ${String(expected)}`,
        });
      state = { ...lift.state, updatedAt: Date.now() };
      continue;
    }
    return state;
  }
  throw new Error("the rollover kept moving after 20 passes");
}

/** The plan's heaviest prescription for an exercise id: a lift can appear
 *  on two days, heavy on one and for reps on the other. */
function prescriptionOf(
  state: ProgramState,
  exerciseId: string
): Prescription | null {
  let top: Prescription | null = null;
  for (const d of state.workouts)
    for (const ex of d.exercises)
      if (ex.exerciseId === exerciseId && (!top || ex.weight > top.weight))
        top = { weight: ex.weight, reps: ex.reps, sets: ex.sets };
  return top;
}

/** Plan invariants, checked at the end of every week. */
function planFailures(state: ProgramState, at: string): RuleFailure[] {
  const out: RuleFailure[] = [];
  const add = (rule: Rule, detail: string) => out.push({ rule, at, detail });
  const smallPlates = state.settings?.smallPlates ?? false;
  for (const d of state.workouts) {
    for (const ex of d.exercises) {
      const where = `${d.dayName} ${ex.exerciseId}`;
      if (!Number.isFinite(ex.weight) || ex.weight < 0)
        add("bad-number", `${where}: weight ${String(ex.weight)}`);
      if (!Number.isInteger(ex.sets) || ex.sets < 1)
        add("bad-number", `${where}: sets ${String(ex.sets)}`);
      if (!Number.isInteger(ex.reps) || ex.reps < 1)
        add("bad-number", `${where}: reps ${String(ex.reps)}`);
      if (isLoaded(ex) && ex.weight === 0) add("no-load", `${where}: 0 kg`);
      if (ex.weight > 0 && !isBodyweightExerciseId(ex.exerciseId)) {
        const grid = loadGridFor(ex.exerciseId, smallPlates);
        if (Math.abs(grid.nearest(ex.weight) - ex.weight) > 1e-6)
          add("off-grid", `${where}: ${String(ex.weight)} kg`);
        if (isBarbell(ex.exerciseId) && ex.weight < BAR_KG)
          add("below-bar", `${where}: ${String(ex.weight)} kg`);
      }
    }
  }
  if (
    JSON.stringify(normalizeProgramState(state)) !==
    JSON.stringify(normalizeProgramState(normalizeProgramState(state)))
  )
    add("normalise", "normalising the plan twice changes it");
  return out;
}

/** A week starts from the plan's own sets (`advanceWeek`): half of them in
 *  a lighter week, one fewer in the first week back, otherwise all. */
function weekStartFailures(state: ProgramState, date: string): RuleFailure[] {
  const out: RuleFailure[] = [];
  if (state.raceWeek) return out;
  const firstWeekBack = (state.easingBack?.weeksLeft ?? 0) >= EASING_BACK_WEEKS;
  for (const d of state.workouts) {
    for (const ex of d.exercises) {
      const base = ex.baseSets ?? ex.sets;
      const expected =
        state.currentPhase === "deload"
          ? Math.max(1, Math.ceil(base / 2))
          : firstWeekBack
            ? Math.max(1, base - 1)
            : base;
      if (ex.sets !== expected)
        out.push({
          rule: "week-sets",
          at: date,
          detail: `${d.dayName} ${ex.exerciseId}: ${String(ex.sets)} sets, not ${String(expected)} (${state.currentPhase}, the plan's ${String(base)})`,
        });
      if (
        state.currentPhase !== "deload" &&
        (ex.preDeloadWeight !== undefined || ex.preDeloadReps !== undefined)
      )
        out.push({
          rule: "stash",
          at: date,
          detail: `${d.dayName} ${ex.exerciseId} keeps a lighter week's stash`,
        });
    }
  }
  return out;
}

/** What the session did to a slot, from the plan before and after it. */
function outcomeOf(
  before: ProgramExercise,
  after: ProgramExercise | undefined,
  lifted: number
): LiftOutcome {
  if (!after) return "hold";
  if (isLoaded(before) && lifted !== before.weight) return "own weight";
  if (after.weight > before.weight) return "step";
  if (after.weight < before.weight) return "lowered";
  if (!isLoaded(before) && after.reps < before.reps) return "lowered";
  if (after.reps > before.reps) return "reps";
  if ((after.consecutiveFailures ?? 0) > (before.consecutiveFailures ?? 0))
    return "miss";
  return "hold";
}

/**
 * Why a change to a loaded lift's numbers after a session is not one the
 * rules sheet allows (`liftRules.ts`, Lift4 (6)-(8)), or null when it is.
 * Written from the sheet, not from the engine, so the two can disagree:
 *
 * - the weight goes up only when every set hit its target (a step: the next
 *   weight, or the reps stretched when the step is too big), when the
 *   person lifted more (the plan follows, and can step from there), or on
 *   a lowered lift's way back, a step a session that is not a miss;
 * - it comes down only when the person lifted less, or on the second miss
 *   in a row at the plan's weight, to 10% lighter by at least one step;
 * - in a lighter week it never comes down;
 * - the reps climb only when every set hit its target.
 */
export function unexplainedChange(
  before: ProgramExercise,
  after: ProgramExercise,
  lifted: number,
  reps: readonly number[],
  lighterWeek: boolean,
  grid: LoadGrid
): string | null {
  const e = 1e-6;
  const w0 = before.weight;
  const w1 = after.weight;
  const done = reps.filter((r) => r > 0);
  const target = before.reps;
  const bottom = Math.min(target, before.baseReps ?? target);
  const everySet =
    done.length >= Math.min(2, Math.max(1, before.sets)) &&
    done.every((r) => r >= target);
  const atPlan = Math.abs(lifted - w0) < 0.01;
  const missed =
    atPlan && done.reduce((n, r) => n + r, 0) < bottom * done.length;
  const from = before.lowered?.unit === "kg" ? before.lowered.from : null;
  const what = `${String(w0)} kg × ${String(target)} → ${String(w1)} kg × ${String(after.reps)}, lifted ${String(lifted)} kg × [${done.join(",")}]`;

  if (lighterWeek) {
    if (w1 < w0 - e) return `came down in a lighter week: ${what}`;
    if (w1 > w0 + e && Math.abs(w1 - lifted) > e)
      return `rose in a lighter week past the weight lifted: ${what}`;
    return null;
  }
  if (!atPlan) {
    if (w1 < lifted - e || w1 > grid.above(lifted) + e)
      return `didn't follow the weight lifted: ${what}`;
    return null;
  }
  if (w1 > w0 + e) {
    const step = everySet && w1 <= grid.above(w0) + e;
    const back =
      from !== null && !missed && w1 <= Math.min(from, grid.above(w0)) + e;
    if (!step && !back) return `rose without every set at its target: ${what}`;
    return null;
  }
  if (w1 < w0 - e) {
    const second =
      missed &&
      (before.consecutiveFailures ?? 0) + 1 >= MISSES_BEFORE_LOWERING &&
      Math.abs(w1 - loweredLoad(grid, w0)) < e;
    if (!second) return `came down without a second miss in a row: ${what}`;
    return null;
  }
  if (after.reps > target && !everySet)
    return `reps climbed without every set at its target: ${what}`;
  return null;
}

export function simulateLiftSeason(
  persona: LiftPersona,
  options: SeasonOptions
): Season {
  const variant = options.variant ?? BASE_VARIANT;
  const start = options.start ?? persona.start ?? DEFAULT_START;
  const restoreIds = setInstanceIdSource(
    sequentialInstanceIds(`${persona.name}-${String(options.seed)}`)
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    atNoon(start);
    const answers = { ...DEFAULT_ANSWERS, ...persona.answers };
    const plan = buildOnboardingPlan(answers, persona.nutrition, start);
    let state = migrateProgramState(
      normalizeProgramState(plan.programState),
      weekOf(start)
    );
    const profile = {
      uid: `sim-${persona.name}`,
      onboardingComplete: true,
      ...plan.profileUpdates,
      experience: answers.experience,
      weightKg: answers.weightKg,
      gender: answers.gender,
    } as unknown as UserProfile;
    const createdAtMs = Date.now();

    const lifter = new VirtualLifter(persona.lifter, options.seed, variant);
    const saved: { id: string; date: string; exercises: WorkoutExercise[] }[] =
      [];
    const met = new Set<string>();
    const handledReturns = new Set<string>();
    const season: Season = {
      persona: persona.name,
      seed: options.seed,
      variant: variant.name,
      sessionMinutes: sessionMinutesFor(state.sessionMinutes),
      sessions: [],
      weeks: [],
      events: [],
      failures: [],
    };
    const fail = (rule: Rule, at: string, detail: string) =>
      season.failures.push({ rule, at, detail });
    let offered = 0;
    let done = 0;
    let opened: string | null = null;

    for (let d = 0; d < options.weeks * 7; d++) {
      const date = day(start, d);
      const week = Math.floor(d / 7) + 1;
      const resting = persona.breaks?.includes(week) ?? false;
      atNoon(date);

      if (!(resting && persona.awayFromApp)) {
        // Opening the app: the rollover, and a new week's first look.
        state = rollOver(state, profile, weekOf(date), season.failures);
        if (opened === null || weekOf(opened) !== weekOf(date))
          season.failures.push(...weekStartFailures(state, date));
        opened = date;

        // Home's welcome back after a break: answered the day the person
        // comes back to train, once per break.
        const back = assessLiftReturn(saved, date);
        if (
          !resting &&
          back.welcomeBack &&
          back.dismissKey &&
          !handledReturns.has(back.dismissKey)
        ) {
          handledReturns.add(back.dismissKey);
          if (persona.easesBackIn && state.workouts.length > 0) {
            state = {
              ...easeBackIn(state, back.easeBackShare),
              updatedAt: Date.now(),
            };
            season.events.push(
              `${date}: eased back in at ${String(back.easeBackShare)} after ${String(back.daysAway)} days`
            );
          } else {
            season.events.push(
              `${date}: kept the old weights after ${String(back.daysAway)} days`
            );
          }
        }

        // Home's card, and the session it starts.
        const card = todaySession({
          today: date,
          profile,
          programState: state,
          claimMap: new Map(),
          workouts: saved,
          createdAtMs,
          nowMs: Date.now(),
          lifetimeRuns: 0,
          lifetimeMeals: 0,
        });
        const lift = card.lift;
        if (lift && lift.status === "planned" && lift.index !== null) {
          offered++;
          const train = nextUpIndex(state);
          if (lift.index !== train)
            fail(
              "home-train",
              date,
              `Home offers workout ${String(lift.index)}, Train's next is ${String(train)}`
            );
          if (!resting && lifter.chance(persona.sessionShare)) {
            const result = runSession(
              state,
              lift.index,
              date,
              card.restContext
            );
            state = result.state;
            if (result.session) {
              season.sessions.push(result.session);
              done++;
            }
          }
        }
      }

      lifter.endDay();
      if (d % 7 === 6) {
        lifter.endWeek();
        season.failures.push(...planFailures(state, `week ${String(week)}`));
        season.weeks.push({
          week,
          weekStart: day(start, d - 6),
          weekNumber: state.weekNumber,
          phase: state.currentPhase,
          offered,
          done,
          trueMax: Object.fromEntries(
            persona.tracked.map((id) => [id, lifter.trueMax(id)])
          ),
          plan: Object.fromEntries(
            persona.tracked.map((id) => [id, prescriptionOf(state, id)])
          ),
        });
        offered = 0;
        done = 0;
      }
    }
    return season;

    /** One session, from Train's start to the saved workout. */
    function runSession(
      before: ProgramState,
      dayIndex: number,
      date: string,
      rest: Parameters<typeof estimateSessionMinutes>[1]
    ): { state: ProgramState; session: SessionDone | null } {
      const stored = before.workouts[dayIndex];
      const completionId = `${persona.name}-${String(options.seed)}-${date}`;
      const workoutId = liftWorkoutId("programme", completionId);
      // Train: the baseline is the stored day, and the completion context
      // its week, day and block (Program.tsx's props to WorkoutSession).
      const prescription = sessionPrescription(
        stored,
        completionId,
        stored.exercises
      );
      const context = {
        weekNumber: before.weekNumber,
        dayIndex,
        dayIdentity: workoutCompletionDayIdentity(stored) ?? "",
        trainingBlockId: before.trainingBlock?.id,
      };
      const minutes = estimateSessionMinutes(prescription.exercises, rest);
      if (minutes > season.sessionMinutes)
        fail(
          "over-time",
          date,
          `${stored.dayName}: ${String(minutes)} minutes of ${String(season.sessionMinutes)}`
        );
      // The workout screen's rows: the plan's, then where each set started
      // last time (WorkoutSession, written out: it is inline there).
      const last = lastSetsByExercise(saved);
      const rows = buildInitialSetLogs(prescription.exercises).map(
        (exRows, i) => {
          const ex = prescription.exercises[i];
          const prior = last
            .get(ex.exerciseId)
            ?.map((s) => ({ weight: s.weightKg, reps: s.reps }));
          return startingSetRows(exRows, ex, prior);
        }
      );

      lifter.startDay();
      const lifts: Omit<LiftDone, "outcome">[] = [];
      const setLogs = rows.map((exRows, i) => {
        const ex: ProgramExercise = prescription.exercises[i];
        const bodyweight = isBodyweightExerciseId(ex.exerciseId);
        const timed = ex.repUnit === "seconds";
        lifter.meet({
          exerciseId: ex.exerciseId,
          movementCategory: ex.movementCategory,
          weight: ex.weight,
          reps: ex.reps,
          bodyweight: bodyweight || timed,
        });
        let working = exRows.filter((r) => r.type === "working");
        const grid = loadGridFor(
          ex.exerciseId,
          before.settings?.smallPlates ?? false
        );
        if (
          persona.calibrates &&
          isLoaded(ex) &&
          ex.weight > 0 &&
          !met.has(slotOf(ex)) &&
          working.length > 0
        ) {
          const known = lifter.knownWorkingWeight(
            ex.exerciseId,
            working[0].reps,
            2
          );
          const load = known === null ? null : grid.nearest(known);
          if (load !== null && load > working[0].weight) {
            working = working.map((r) => ({ ...r, weight: load }));
            season.events.push(
              `${date}: loaded ${ex.exerciseId} at ${String(load)} kg (plan ${String(ex.weight)})`
            );
          }
        }
        met.add(slotOf(ex));
        // The plan waiting for a heavier weight (its next step too big to
        // take on its own, so the rep target has stretched): someone who
        // picks it up loads the next weight on the grid.
        if (
          persona.picksUpHeavier &&
          isLoaded(ex) &&
          ex.weight > 0 &&
          working.length > 0
        ) {
          const stretched =
            automaticStepUp(grid, ex.weight) === null &&
            ex.reps > (ex.repRangeMax ?? ex.reps);
          if (stretched && working[0].weight === ex.weight) {
            const heavier = grid.above(ex.weight);
            working = working.map((r) => ({ ...r, weight: heavier }));
            season.events.push(
              `${date}: picked up ${String(heavier)} kg for ${ex.exerciseId} (plan ${String(ex.weight)} × ${String(ex.reps)})`
            );
          }
        }
        // Taking weight off goes down the equipment's own weights, and never
        // below an empty bar.
        const lighter = (w: number) => {
          const down = grid.below(w);
          return isBarbell(ex.exerciseId) && down < BAR_KG ? w : down;
        };
        const sets = lifter.performLift(
          {
            exerciseId: ex.exerciseId,
            movementCategory: ex.movementCategory,
            bodyweight,
            timed,
          },
          working,
          completionId,
          lighter
        );
        const firstLighter = sets.find(
          (set, k) => set.weight < working[k].weight
        );
        if (firstLighter)
          season.events.push(
            `${date}: took ${ex.exerciseId} down to ${String(firstLighter.weight)} kg (plan ${String(ex.weight)} × ${String(ex.reps)})`
          );
        const done = sets.filter((set) => set.completed);
        lifts.push({
          exerciseId: ex.exerciseId,
          slot: slotOf(ex),
          movementCategory: ex.movementCategory,
          planned: ex.weight,
          weight: followedWeight(done) ?? working[0]?.weight ?? ex.weight,
          targetReps: working[0]?.reps ?? ex.reps,
          weights: sets.map((set) => set.weight),
          reps: sets.map((set) => set.reps),
          rir: sets.map((set) => set.rir),
          setsDone: done.length,
          trueMax: lifter.trueMax(ex.exerciseId),
          loggedMax: Math.max(
            0,
            ...done.map((set) => epley1RMExact(set.weight, set.reps))
          ),
        });
        let k = 0;
        return exRows.map((row) => {
          if (row.type !== "working") return { ...row, completed: true };
          const set = sets[k++];
          return {
            ...row,
            weight: set.weight,
            reps: set.reps,
            completed: set.completed,
          };
        });
      });

      // Finish.
      const completionLogs = toCompletionSetLogs(setLogs);
      const progression = toSessionProgression({
        completionId,
        date,
        prescription,
        setLogs: completionLogs,
      });
      const current = before.workouts[dayIndex];
      const lands =
        before.weekNumber === context.weekNumber &&
        before.trainingBlock?.id === context.trainingBlockId &&
        workoutCompletionDayIdentity(current) === context.dayIdentity &&
        !(current.completed && current.completedWorkoutId !== workoutId);
      if (!lands) {
        fail("not-landed", date, stored.dayName);
        return { state: before, session: null };
      }
      const after: ProgramState = {
        ...markDayDone(
          progression
            ? applySessionProgression(before, dayIndex, progression)
            : before,
          dayIndex,
          workoutId
        ),
        updatedAt: Date.now(),
      };
      saved.unshift({
        id: workoutId,
        date,
        exercises: liftWorkoutExercises(prescription.exercises, completionLogs),
      });
      const was = new Map(stored.exercises.map((ex) => [slotOf(ex), ex]));
      const next = new Map(
        after.workouts[dayIndex].exercises.map((ex) => [slotOf(ex), ex])
      );
      for (const l of lifts) {
        const plan = was.get(l.slot);
        const now = next.get(l.slot);
        if (!plan || !now || !isLoaded(plan) || !(plan.weight > 0)) continue;
        const why = unexplainedChange(
          plan,
          now,
          l.weight,
          l.reps.filter((_, k) => Math.abs(l.weights[k] - l.weight) < 0.01),
          before.currentPhase === "deload",
          loadGridFor(plan.exerciseId, before.settings?.smallPlates ?? false)
        );
        if (why)
          fail(
            "unexplained",
            date,
            `${stored.dayName} ${plan.exerciseId}: ${why}`
          );
      }
      return {
        state: after,
        session: {
          date,
          dayIndex,
          dayName: stored.dayName,
          weekNumber: before.weekNumber,
          phase: before.currentPhase,
          minutes,
          lifts: lifts.map((l) => {
            const plan = was.get(l.slot);
            return {
              ...l,
              outcome: plan
                ? outcomeOf(plan, next.get(l.slot), l.weight)
                : "hold",
            };
          }),
        },
      };
    }
  } finally {
    vi.useRealTimers();
    restoreIds();
  }
}
