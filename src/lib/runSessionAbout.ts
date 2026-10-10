/**
 * "Why this run", in four lines (Run21 (3)): what the session is, how it
 * should feel, why it's in your week, and what to do if it feels wrong. This
 * module owns the first, second and fourth. The third is the plan's reason
 * (`runSessionExplainer`), which needs a plan, so a run without one still
 * says what it is, how it should feel and what to do.
 *
 * The feel line leads with the run's effort word, from Run21's one language
 * for runs: easy, comfortably hard, hard, quick and relaxed. A race's effort
 * depends on its distance. The register is the explainer's: what the session
 * is and how to run it, never a physiology measurement, readiness or safety.
 * A session's physiology name, where coaches use one, is its own last line
 * (`alsoCalled`, Run21 (2)), so the other lines never need it.
 */
import type { RacePaceWork } from "./racePace";
import {
  isRunWalkTemplateId,
  RUN_WALK_TEMPLATE_IDS,
  type RunTemplate,
} from "./workoutTemplates";

export interface RunSessionAbout {
  /** What the session is, in a sentence, with its shape where it has one. */
  what: string;
  /** How it should feel: the effort word, then how much you can say. The
   *  session's one feel line on Home's day details, Train's card, the day
   *  sheet and the launch card (Run21 (2)). */
  feel: string;
  /** What to do when it doesn't feel like that. */
  ifWrong: string;
  /** "Coaches also call this…": the session's physiology name, the one
   *  place one appears (Run21 (2)). Absent when coaches have none. */
  alsoCalled?: string;
}

/** A span as a noun ("90 seconds", "1 minute", "2½ minutes") and as the
 *  word before a noun ("90-second", "2½-minute"). */
function spanOf(sec: number): { noun: string; adj: string } {
  if (sec < 120 && sec % 60 !== 0) {
    return { noun: `${sec} seconds`, adj: `${sec}-second` };
  }
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  if (seconds !== 0 && seconds !== 30) {
    return {
      noun: `${minutes} minutes ${seconds} seconds`,
      adj: `${minutes}-minute ${seconds}-second`,
    };
  }
  const n = seconds === 30 ? `${minutes}½` : `${minutes}`;
  return { noun: `${n} minute${n === "1" ? "" : "s"}`, adj: `${n}-minute` };
}

const NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six"];

/** "90 seconds, 3 minutes and 90 seconds". */
function listOf(items: string[]): string {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** A tempo's shape: its warm-up, its blocks run `how`, its cool-down. */
function tempoShape(
  tempo: NonNullable<RunTemplate["config"]["tempo"]>,
  how: string
): string {
  const { workSecs } = tempo;
  const warmUp = `A ${spanOf(tempo.warmupSec).adj} warm-up`;
  const coolDown = `then a ${spanOf(tempo.cooldownSec).adj} cool-down`;
  if (workSecs.length === 1) {
    return `${warmUp}, ${spanOf(workSecs[0]).noun} ${how}, ${coolDown}.`;
  }
  const blocks = workSecs.every((s) => s === workSecs[0])
    ? `${NUMBER_WORDS[workSecs.length] ?? workSecs.length} ${spanOf(workSecs[0]).adj} blocks ${how}`
    : `blocks of ${listOf(workSecs.map((s) => spanOf(s).noun))} ${how}`;
  const between = tempo.floatSec
    ? ` with ${spanOf(tempo.floatSec).noun} easy between`
    : "";
  return `${warmUp}, ${blocks}${between}, ${coolDown}.`;
}

/** Intervals' shape: the warm-up, the repeats run `how`, the rest, the
 *  cool-down. A rep's distance is named as the session's name and the
 *  launch card name it ("4×1K", "4 × 1K"), the same for every reader: a
 *  track distance, like a race's "5K". */
function intervalShape(
  iv: NonNullable<RunTemplate["config"]["intervals"]>,
  how: string
): string {
  const warmUp = iv.warmupDuration
    ? `A ${spanOf(iv.warmupDuration).adj} warm-up`
    : "A warm-up";
  const coolDown = iv.cooldownDuration
    ? `a ${spanOf(iv.cooldownDuration).adj} cool-down`
    : "a cool-down";
  const rep = iv.workDistance
    ? iv.workDistance >= 1000
      ? `${iv.workDistance / 1000}K`
      : `${iv.workDistance} m`
    : iv.workDuration
      ? spanOf(iv.workDuration).noun
      : null;
  const repeats = rep ? `${iv.reps} repeats of ${rep}` : `${iv.reps} repeats`;
  return `${warmUp}, then ${repeats}, ${how}, with ${spanOf(iv.restDuration).noun} of easy jogging or walking between, then ${coolDown}.`;
}

/** A run-walk session's shape: the walk, the runs and the walks between. */
function runWalkShape(
  rw: NonNullable<RunTemplate["config"]["runWalk"]>
): string {
  const walk = `A ${spanOf(rw.warmupWalkSec).adj} walk`;
  const { runSecs, walkSecs } = rw;
  if (runSecs.length === 1) {
    return `${walk}, then ${spanOf(runSecs[0]).noun} of easy running without a break, then a walk to finish.`;
  }
  const walksAlike = walkSecs.every((s) => s === walkSecs[0]);
  const walks = walksAlike
    ? walkSecs.length === 1
      ? `a ${spanOf(walkSecs[0]).adj} walk`
      : `${spanOf(walkSecs[0]).adj} walks`
    : "walks";
  const runs = runSecs.every((s) => s === runSecs[0])
    ? `${runSecs.length} easy runs of ${spanOf(runSecs[0]).noun}`
    : `easy runs of ${listOf(runSecs.map((s) => spanOf(s).noun))}`;
  return `${walk}, then ${runs} with ${walks} between, then a walk to finish.`;
}

/** The physiology names coaches use, for "Coaches also call this…". */
const ZONE_2 = "Zone 2, or aerobic running.";

/** Medium-long and longer easy runs: an hour or more (RUN-EV-11's rungs). */
const LONGER_EASY_MINUTES = 60;

/**
 * A planned run's name (Run21 (2)): the template's, and a run with work at
 * the goal race pace says so. A long run that finishes at it is "Long 18K
 * with race pace", running-evidence Appendix B's "Long run with race pace";
 * a tempo run at it is "20 Min Tempo at race pace". The race pace is
 * `racePaceWorkFor`'s, the launch's own gate.
 */
export function runSessionName(
  template: Pick<RunTemplate, "name"> | null | undefined,
  racePace?: RacePaceWork | null,
  fallback = "Run"
): string {
  if (!template) return fallback;
  if (racePace?.kind === "finish") return `${template.name} with race pace`;
  if (racePace?.kind === "tempo") return `${template.name} at race pace`;
  return template.name;
}

export function runSessionAbout(
  template: Pick<RunTemplate, "id" | "type" | "estimatedDuration" | "config">,
  /** The run's work at the goal race pace (`racePaceWorkFor`): it changes
   *  what the run is, how it feels and what to do when it won't come. */
  { racePace }: { racePace?: RacePaceWork | null } = {}
): RunSessionAbout {
  const { config } = template;
  if (template.type === "race") {
    const short = (config.targetDistanceKm ?? 0) <= 10;
    return {
      what: "Your race, over its full distance.",
      feel: short
        ? "Even through the middle, then all you have left at the end."
        : "Start steady and finish strong. Hold back early, however good you feel.",
      ifWrong:
        "Gone out too fast? Ease back for a minute and settle into a rhythm you can hold.",
    };
  }
  if (isRunWalkTemplateId(template.id)) {
    // The first week's has no week before it to swap in.
    const swapBack =
      template.id === RUN_WALK_TEMPLATE_IDS[0]
        ? ""
        : " Too much this week? You can swap in last week's session for this day.";
    // The last is one run, between the two walks (Run20 (5)).
    if (config.runWalk?.runSecs.length === 1) {
      return {
        what: runWalkShape(config.runWalk),
        feel: "Easy on the run: you can talk in full sentences. Brisk on the walks.",
        ifWrong: `Can't talk? Slow down, or walk for a minute, then run again.${swapBack}`,
      };
    }
    return {
      what: config.runWalk
        ? runWalkShape(config.runWalk)
        : "Easy runs with walks between them, after a walk to warm up.",
      feel: "Easy on the runs: you can talk in full sentences. Brisk on the walks.",
      ifWrong: `Can't talk on a run? Slow down, or start the walk early.${swapBack}`,
    };
  }
  if (template.type === "intervals") {
    const shortReps = (config.intervals?.workDistance ?? 1000) < 1000;
    return shortReps
      ? {
          what: config.intervals
            ? intervalShape(config.intervals, "quick and relaxed")
            : "Short, quick repeats, with a walk or jog between each.",
          feel: "Quick and relaxed: fast but smooth, not a sprint.",
          ifWrong:
            "Straining to hold the speed? Ease off a little. Smooth matters more than fast.",
        }
      : {
          what: config.intervals
            ? intervalShape(config.intervals, "hard")
            : "Hard repeats, with an easy jog or walk between each.",
          feel: "Hard, and even: the last rep as quick as the first. No chatting.",
          ifWrong:
            "Can't match your first rep? Take a longer rest, or stop a rep early. One fewer rep is still the session.",
          alsoCalled: "VO2 max intervals.",
        };
  }
  if (template.type === "tempo" && racePace?.kind === "tempo") {
    // A2: the goal pace, not the comfortably hard pace fitness would set.
    const blocks = config.tempo?.workSecs.length ?? 1;
    return {
      what: config.tempo
        ? tempoShape(config.tempo, "at your goal race pace")
        : blocks > 1
          ? "A warm-up, then your goal race pace in two blocks with easy running between, then a cool-down."
          : "A warm-up, then a block at your goal race pace, then a cool-down.",
      feel: "Race pace: even and controlled, the rhythm you'll hold on race day.",
      ifWrong:
        "Race pace won't come today? Ease off to a pace you can hold and finish the time. If it keeps feeling out of reach, you can change your goal time in your run plan.",
    };
  }
  if (template.type === "tempo") {
    const blocks = config.tempo?.workSecs.length ?? 1;
    return {
      what: config.tempo
        ? tempoShape(config.tempo, "comfortably hard")
        : blocks > 1
          ? "A warm-up, then comfortably hard running in two blocks with easy running between, then a cool-down."
          : "A warm-up, then a block of comfortably hard running, then a cool-down.",
      feel: "Comfortably hard: a few words at a time. Even from start to finish.",
      ifWrong:
        "Gasping, or slowing every minute? Ease off until you can say a few words. Flat all over? Run easy today and keep the tempo for another day.",
      alsoCalled: "A threshold run.",
    };
  }
  if (template.type === "long" && racePace?.kind === "finish") {
    return {
      what: "Your longest run of the week, finishing at your goal race pace.",
      feel: "Easy until the final stretch, then strong and even at race pace.",
      ifWrong:
        "Race pace won't come today? Run the rest easy. Finishing the distance matters more than the pace.",
    };
  }
  if (template.type === "long") {
    return {
      what: "Your longest run of the week.",
      feel: "Easy, like your easy days. Walk breaks are fine.",
      ifWrong:
        "Struggling to talk? Slow down, or walk for a minute. Finishing comfortably matters more than the pace.",
      alsoCalled: ZONE_2,
    };
  }
  if (config.strides) {
    const { reps, workSeconds } = config.strides;
    return {
      what: `An easy run that ends with ${reps} strides: ${workSeconds} seconds of quick, smooth running, with a walk back between.`,
      feel: "Easy, then quick and relaxed on the strides: fast but smooth, never a sprint.",
      ifWrong:
        "Legs tight or heavy? Leave the strides out. The easy run is the session.",
    };
  }
  if (template.estimatedDuration >= LONGER_EASY_MINUTES) {
    return {
      what: "A longer-than-usual easy run.",
      feel: "Easy: you can talk in full sentences, just for longer than usual.",
      ifWrong:
        "Legs heavy before the end? Cut it short. The week's long run matters more.",
      alsoCalled: ZONE_2,
    };
  }
  return {
    what: "Relaxed running at a chatty pace.",
    feel: "Easy: you can talk in full sentences. Slower is fine.",
    ifWrong:
      "Can't talk? Slow down, or walk for a minute. That's still the run.",
    alsoCalled: ZONE_2,
  };
}
