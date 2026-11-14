/**
 * runSessionExplainer — the "why this session" line (WAVE1-EXPLAIN,
 * roadmap A5).
 *
 * One honest sentence per scheduled run, derived from facts the plan
 * already knows: the REAL engine phase (`getPhaseForWeek` — never a
 * re-derivation), the session type, and the template. The register is
 * the codebase's standing one: describe what the plan is doing and why
 * in training terms; never claim physiology measurements, readiness, or
 * safety. Pure and total — returns null rather than guessing when the
 * plan context is missing (freeform runs, extras, legacy docs).
 */
import { getPhaseForWeek } from "@/features/program/runPlanTiming";
import type { RollingSessionContext } from "@/features/program/rollingWeeksAhead";
import {
  isRunWalkTemplateId,
  isTimeTrialTemplateId,
  RUN_TEMPLATES,
} from "@/lib/workoutTemplates";
import { isInRecoveryOn } from "@/lib/runPlanResolver";
import { longRunDistanceLabel } from "@/lib/runLabels";

export interface SessionExplainerInput {
  /** Template type from RUN_TEMPLATES ("easy" | "tempo" | "intervals" |
   *  "long" | "race"). */
  type: string;
  /** Resolved template id (userOverride ?? templateId). */
  templateId: string;
  /** Stored 0-based week index; null when the plan carries no counters. */
  currentWeek: number | null | undefined;
  totalWeeks: number | null | undefined;
  distance: string | null | undefined;
  /** The plan's shorter base (`RunPlan.shortBase`, Run24 (2)), so the
   *  phase the words and the week label name is the plan's own. */
  shortBase?: boolean | null;
  /** Whether the run's week holds a tempo or intervals session
   *  (`weekHoldsQuality`). The build's easy day and long run name the
   *  quality sessions only when it does: a returning runner's weeks hold none
   *  (Run15), nor does every other build week on the gentler setting. Left
   *  out, the week isn't assumed to. */
  weekHasQuality?: boolean;
  /** The run's work at the goal race pace (`racePaceWorkFor`): a long run
   *  that finishes at it rehearses race day, and a tempo at it practises
   *  the pace, in place of the reasons for a tempo at fitness pace. */
  racePace?: "finish" | "tempo" | "blocks" | null;
  /** The run is one of the recovery's, after race day (`isRecoveryRunDay`).
   *  The plan's week counter still points at race week then, so without
   *  this its runs read as race week's. */
  inRecovery?: boolean;
  /** A plan with no race date's run (Run24 (3)): its week's place in the
   *  plan (`rollingSessionContexts`). Its reasons are the plan's terms, a
   *  climb to a long run that then holds, lighter weeks and time trials,
   *  in place of a race plan's phases, which it has none of. */
  rolling?: RollingSessionContext | null;
}

/**
 * Whether a run on `dateKey` belongs to the recovery after race day: the
 * plan is recovering on that day (`isInRecoveryOn`) and the day comes
 * after the race. A day of race week before the race is race week's still,
 * however the plan stands now.
 */
export function isRecoveryRunDay(
  runPlan:
    | {
        phase?: string | null;
        recoveryEndDate?: string | null;
        raceGoal?: { targetDate?: string } | null;
      }
    | null
    | undefined,
  dateKey: string | null | undefined
): boolean {
  if (!dateKey || !isInRecoveryOn(runPlan, dateKey)) return false;
  const raceDay = runPlan?.raceGoal?.targetDate;
  return !raceDay || dateKey > raceDay;
}

/** Why a recovery run is in the week, in the recovery banner's words
 *  ("Easy runs only until then, while your legs recover from the race."). */
export const RECOVERY_RUN_WHY =
  "Easy runs only for now, while your legs recover from the race.";

/**
 * Whether the week `weekKey` starts holds a tempo or intervals session, the
 * person's swaps (`userOverride`) included.
 */
export function weekHoldsQuality(
  runDays:
    | ReadonlyArray<{
        templateId: string;
        userOverride?: string | null;
        weekKey?: string;
      }>
    | null
    | undefined,
  weekKey: string | null | undefined
): boolean {
  if (!runDays || !weekKey) return false;
  return runDays.some((day) => {
    if (day.weekKey !== weekKey) return false;
    const id = day.userOverride || day.templateId;
    const type = RUN_TEMPLATES.find((t) => t.id === id)?.type;
    return type === "tempo" || type === "intervals";
  });
}

/** Shared by Manage, Programme and Home: the explanation and real phase agree. */
export function runSessionPresentation(input: SessionExplainerInput): {
  purpose: string | null;
  weekLabel: string | null;
} {
  const purpose = runSessionExplainer(input);
  // The recovery has no week of the race plan to name, and a plan with no
  // race date has no phase.
  if (input.inRecovery || input.rolling) return { purpose, weekLabel: null };
  if (
    !purpose ||
    input.currentWeek == null ||
    input.totalWeeks == null ||
    !input.distance
  ) {
    return { purpose: null, weekLabel: null };
  }
  const phase = getPhaseForWeek(
    input.currentWeek,
    input.totalWeeks,
    input.distance as "5k" | "10k" | "half" | "marathon",
    input.shortBase
  );
  return {
    purpose,
    weekLabel: `${phase.charAt(0).toUpperCase() + phase.slice(1)} · week ${input.currentWeek + 1} of ${input.totalWeeks}`,
  };
}

const MEDIUM_LONG_IDS = new Set(["easy_60", "easy_75", "easy_90"]);

/** Run24 (4): the plan's benchmark session, in a race plan or not. */
const TIME_TRIAL_WHY =
  "It finds your paces from what you can run now, and Tropos offers them after it.";

/** A new runner's run-walk (Run20 (5)), in any week of any plan. The last
 *  has one run, and no walks between. */
function runWalkWhy(templateId: string): string {
  const runs =
    RUN_TEMPLATES.find((t) => t.id === templateId)?.config.runWalk?.runSecs
      .length ?? 0;
  return runs === 1
    ? "The last run-walk — what the weeks before it built up to."
    : "Run-walk — the runs grow each week until you run without stopping. The walks are part of the method, not giving up.";
}

export function runSessionExplainer(
  input: SessionExplainerInput
): string | null {
  const {
    type,
    templateId,
    currentWeek,
    totalWeeks,
    distance,
    weekHasQuality,
  } = input;
  // A recovery week holds easy runs only. Any other run in it is the
  // person's own choice, with no reason of the plan's to give.
  if (input.inRecovery) return type === "easy" ? RECOVERY_RUN_WHY : null;
  if (input.rolling) return rollingSessionWhy(input, input.rolling);
  if (
    currentWeek == null ||
    totalWeeks == null ||
    !Number.isInteger(currentWeek) ||
    currentWeek < 0 ||
    !Number.isInteger(totalWeeks) ||
    totalWeeks <= 0 ||
    currentWeek >= totalWeeks ||
    (distance !== "5k" &&
      distance !== "10k" &&
      distance !== "half" &&
      distance !== "marathon")
  ) {
    return null;
  }
  const phase = getPhaseForWeek(
    currentWeek,
    totalWeeks,
    distance,
    input.shortBase
  );
  const isStrides = templateId.endsWith("_strides");
  const isMediumLong = MEDIUM_LONG_IDS.has(templateId);

  // A new runner's run-walk (Run20 (5)) is that in any week, the taper's
  // and race week's included. The last has one run, and no walks between.
  // "Why this run" says what the session is in its own line (Run21 (3)), so
  // these give the reason only.
  if (isRunWalkTemplateId(templateId)) return runWalkWhy(templateId);

  if (phase === "race") {
    if (type === "race") {
      return "The whole plan has led to race day. Trust the training you’ve done.";
    }
    return "A short, conversational shakeout for race week. There’s nothing left to gain from more.";
  }

  if (phase === "taper") {
    if (type === "tempo" && input.racePace === "tempo") {
      return "Taper — a short block at race pace keeps the rhythm sharp while the volume drops.";
    }
    // Not the easy runs' reason: a tempo is comfortably hard (Run21 (1)).
    if (type === "tempo") {
      return "Taper — a short tempo keeps the legs used to a comfortably hard effort while the volume drops.";
    }
    if (type === "intervals") {
      return "A taper sharpener, fast but small, keeps the legs quick while the volume drops.";
    }
    if (type === "long") {
      return "Taper long run — shorter on purpose, so the training you’ve banked shows up fresh.";
    }
    // Run22: the first taper weeks keep a shorter medium-long.
    if (isMediumLong) {
      return "Taper medium-long — shorter on purpose: the volume comes down in steps, so you arrive fresh without losing your rhythm.";
    }
    return "Taper — easy and short on purpose; recovery is the work now.";
  }

  // Run24 (4): the plan's benchmark session.
  if (isTimeTrialTemplateId(input.templateId)) return TIME_TRIAL_WHY;
  // Run24 (5): the session library's own reasons, where the type's would
  // say something the session isn't.
  const config = RUN_TEMPLATES.find((t) => t.id === templateId)?.config;
  if (config?.progression) {
    return "It finishes faster than it starts: the easy minutes build endurance, and the finish teaches you to run strong on tired legs.";
  }
  if (config?.uphill) {
    return phase === "base"
      ? "Short hills build strength and a quicker stride, a light start on faster running before the harder sessions."
      : "Hill repeats build strength and power for running. The jog back down is part of the session.";
  }
  if (config?.repeatsAt === "feel") {
    return "A light fartlek wakes up faster running by feel, at little cost, before the harder sessions start.";
  }
  // Run24 (5): a long run with blocks at race pace.
  if (config?.racePaceBlocks) {
    return "It rehearses race pace inside a long run, on tired legs: the rhythm, the fuelling and the focus race day asks for.";
  }
  // Run24 (8): a new runner's pick-ups, before the harder sessions.
  if (config?.pickUps) {
    return "Easy day with pick-ups: six short spells of faster running wake up your legs before the harder sessions start. Not a hard session.";
  }
  if (config?.repeatsAt === "5k" || config?.repeatsAt === "10k") {
    return "It teaches your legs what race pace feels like, so it’s familiar when it counts.";
  }
  // Base / build.
  if (type === "long") {
    if (phase === "base") {
      return "The long run anchors the week, and its volume ramps gradually through the base.";
    }
    return input.racePace === "finish"
      ? "It rehearses race day on tired legs: your pace, your fuelling and your focus."
      : weekHasQuality
        ? "The week’s anchor run — the long run keeps ramping while quality sharpens around it."
        : "The week’s anchor run — it builds the endurance the race needs.";
  }
  if (type === "tempo" && input.racePace === "tempo") {
    return "It teaches your legs and breathing what race pace feels like, so it’s familiar when it counts.";
  }
  if (type === "tempo") {
    return "A tempo builds how long you can hold a sustained, even pace. The tempo blocks get longer through the plan.";
  }
  if (type === "intervals") {
    return "Short, fast repeats raise the pace you can race at. The recovery between reps is part of the session, not a failure of it.";
  }
  // Easy family.
  if (isMediumLong) {
    return "The week’s medium-long run — extra easy volume midweek, so the long run isn’t carrying the whole week.";
  }
  if (isStrides) {
    return "Easy day with strides — relaxed 20-second accelerations keep leg speed awake at almost no cost. Not a hard session.";
  }
  if (phase === "base") {
    return "Easy running in the base phase is the foundation everything later stands on.";
  }
  return weekHasQuality
    ? "Easy day — it makes the quality sessions work. If it feels too easy, it’s right."
    : "Easy day — most of your running is easy, and it all counts towards the race. If it feels too easy, it’s right.";
}

/**
 * Why a run is in a plan with no race date's week (Run24 (3), deep dive
 * D7), in the plan's terms: a lighter week, one in four; a long run that
 * climbs a step at a time to the plan's longest and then holds there; the
 * week's one session; a time trial. Where the long run holds is read from
 * the weeks the plan builds (`rollingSessionContexts`), never from the
 * goal's horizon. No race and no phase is named: the plan has neither.
 */
function rollingSessionWhy(
  input: SessionExplainerInput,
  rolling: RollingSessionContext
): string | null {
  const { type, templateId, weekHasQuality } = input;
  if (isRunWalkTemplateId(templateId)) return runWalkWhy(templateId);
  if (isTimeTrialTemplateId(templateId)) return TIME_TRIAL_WHY;
  const isEasyFamily = type === "easy";
  if (rolling.lighter && type === "long")
    return "A lighter week, one in every four: the long run steps back, so the three weeks before it can settle in.";
  if (rolling.lighter && isEasyFamily)
    return "A lighter week, one in every four: easier runs, so the three weeks before it can settle in.";
  if (type === "long") {
    if (!rolling.longRun)
      return "The week’s anchor run. It climbs a step at a time, then holds.";
    const top = longRunDistanceLabel(rolling.longRun.topKm, rolling.unit);
    return rolling.longRun.holding
      ? `The week’s anchor run, at the plan’s longest: it holds at ${top} from here.`
      : `The week’s anchor run. It climbs a step at a time to ${top}, then holds there.`;
  }
  const config = RUN_TEMPLATES.find((t) => t.id === templateId)?.config;
  const fasterAt5k = rolling.goal === "faster_5k";
  if (type === "tempo")
    return fasterAt5k
      ? "A tempo raises the pace you can hold for longer, which a faster 5K is built on."
      : "A tempo builds how long you can hold a steady, comfortably hard pace. The plan’s sessions take turns from week to week.";
  if (type === "intervals") {
    if (config?.progression)
      return "It finishes faster than it starts: the easy minutes build endurance, and the finish teaches you to run strong on tired legs.";
    if (config?.uphill)
      return "Hill repeats build strength and power for running. The jog back down is part of the session.";
    if (config?.repeatsAt === "feel")
      return "A light fartlek: faster running by feel, at little cost.";
    const workM = config?.intervals?.workDistance;
    const short = typeof workM === "number" && workM < 1000;
    if (fasterAt5k)
      return short
        ? "Short, quick repeats sharpen your speed, which is where a faster 5K comes from. The jog between them is part of the session."
        : "Repeats at about 5K effort raise the pace you can hold over 5K. The recovery between them is part of the session.";
    return short
      ? "Short, quick repeats keep your legs fast at little cost. The jog between them is part of the session."
      : "Fast repeats raise the pace you can hold. The recovery between them is part of the session.";
  }
  if (!isEasyFamily) return null;
  if (MEDIUM_LONG_IDS.has(templateId))
    return "The week’s medium-long run: extra easy running midweek, so the long run isn’t carrying the whole week.";
  if (templateId.endsWith("_strides"))
    return "Easy day with strides: relaxed 20-second accelerations keep leg speed awake at almost no cost. Not a hard session.";
  if (rolling.opening)
    return "The plan’s first week: easy running to start from, before the weeks climb.";
  return weekHasQuality
    ? "Easy day: it makes the week’s session work. If it feels too easy, it’s right."
    : "Most of the plan is easy running, and it all counts. If it feels too easy, it’s right.";
}
