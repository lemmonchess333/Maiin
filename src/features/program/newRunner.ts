import {
  addLocalDays,
  localDateString,
  parseLocalDate,
  wholeWeeksBetween,
} from "@/lib/dateHelpers";
import { startDayKey } from "@/lib/startDay";
import {
  isRunWalkTemplateId,
  RUN_TEMPLATES,
  RUN_WALK_TEMPLATE_IDS,
  type RunTemplate,
} from "@/lib/workoutTemplates";
import { DELOAD_LADDERS } from "@/lib/planDeloadWeek";
import { plannedRunMinutes } from "./runTimeLimits";

/**
 * A new runner's first weeks (Run20 (5)): no tempo or intervals in them, so
 * they build the running itself, and each runs as run-walk (NHS Couch to 5K).
 * The evidence puts structured quality after a novice's first four to six
 * weeks, with strides allowed (running-evidence, Daniels); six is a Tropos
 * heuristic inside that range.
 */
export const NEW_RUNNER_WEEKS = 6;

/**
 * The profile's fields a new runner's first weeks are read from: setup's
 * answer, and the days setup finished and the account began. Written out
 * rather than picked from `UserProfile`, so the plan's generator can read
 * this module without importing auth, which reaches the generator through
 * the Run screen's modules.
 */
export interface NewRunnerProfile {
  runFrequency?: string;
  createdAt?: unknown;
  onboardingCompletedAt?: unknown;
}

/**
 * The day a new runner's first weeks end, counted from the day they began:
 * setup's "New to running" (`runFrequency: "new"`). Null for anyone else, or
 * while the day they began isn't known.
 */
export function newRunnerUntil(
  runFrequency: string | undefined,
  startKey: string | null | undefined
): string | null {
  if (runFrequency !== "new" || !startKey) return null;
  return localDateString(
    addLocalDays(parseLocalDate(startKey), NEW_RUNNER_WEEKS * 7)
  );
}

/**
 * `newRunnerUntil` for a stored profile. Setup counts from the day it
 * finishes, so a plan made later counts from that day too: the server stamps
 * it as `onboardingCompletedAt`. Someone can sign up and finish setup weeks
 * later, and they began running then. Until the stamp comes back from the
 * server, and on a profile set up before it was kept, the day the account
 * began (`createdAt`), which is setup's day for nearly everyone.
 */
export function profileNewRunnerUntil(
  profile: NewRunnerProfile | null | undefined
): string | null {
  return newRunnerUntil(
    profile?.runFrequency,
    startDayKey(profile?.onboardingCompletedAt) ??
      startDayKey(profile?.createdAt)
  );
}

/**
 * The run-walk session for a new runner's week starting `weekKey` (Run20
 * (5)): every run in a week that starts before `until` is that week's
 * session on the run-walk ladder (`RUN_WALK_TEMPLATE_IDS`). It counts back
 * from `until`, so the ladder's last session falls in the first weeks' last
 * week, and a part week at the very start repeats the first session. Null
 * from `until` on, and for anyone who isn't new to running.
 */
export function runWalkTemplateIdForWeek(
  weekKey: string,
  until: string | null | undefined
): string | null {
  if (!until || !weekKey || weekKey >= until) return null;
  // This week and each after it, to the one holding the last of the days.
  const lastDay = localDateString(addLocalDays(parseLocalDate(until), -1));
  const weeksLeft = wholeWeeksBetween(weekKey, lastDay) + 1;
  const stage = Math.max(1, RUN_WALK_TEMPLATE_IDS.length + 1 - weeksLeft);
  return RUN_WALK_TEMPLATE_IDS[stage - 1];
}

/**
 * How many minutes a new runner's runs grow by each week once the run-walk
 * weeks are over. The evidence's novice convention is about 5–10 minutes a
 * run every 1–3 weeks (running-evidence §5, easy running); five a week is a
 * Tropos heuristic inside it.
 */
export const NEW_RUNNER_BUILD_MINUTES = 5;

/** The run-walk ladder's last run, non-stop: 20 minutes. */
const FINAL_RUN_WALK_MINUTES =
  Math.max(
    0,
    ...(RUN_TEMPLATES.find((t) => t.id === RUN_WALK_TEMPLATE_IDS.at(-1))?.config
      .runWalk?.runSecs ?? [])
  ) / 60;

/**
 * The most minutes each of a new runner's runs takes in the week starting
 * `weekKey`, once the run-walk weeks are over: the ladder's last 20 minutes,
 * and `NEW_RUNNER_BUILD_MINUTES` more each week after it. Run-walk ends in
 * 20 minutes non-stop, and the race plan's own weeks go on building under
 * it, so without this a 10K ten weeks out asked for a 55-minute long run the
 * week after. Null in the run-walk weeks, and for anyone else.
 */
export function newRunnerBuildMinutes(
  weekKey: string,
  until: string | null | undefined
): number | null {
  if (!until || !weekKey || weekKey < until) return null;
  const weeksAfter = wholeWeeksBetween(until, weekKey) + 1;
  return FINAL_RUN_WALK_MINUTES + NEW_RUNNER_BUILD_MINUTES * weeksAfter;
}

/**
 * The template a new runner's run takes in the week starting `weekKey`
 * (Run20 (5)), or null when it keeps its own: that week's run-walk session
 * in the first weeks, then, while the running builds, the longest template
 * of the run's own kind that fits the week's minutes
 * (`newRunnerBuildMinutes`), or else the longest easy run that does. A
 * tempo or intervals session's own kind is a smaller dose of itself, the
 * deload's rungs (`DELOAD_LADDERS`): 6 × 1K cut to 8 × 400 is another
 * session. The race is always the race. The build stops on its own once
 * the plan's runs fit.
 */
export function newRunnerTemplate(
  templateId: string,
  weekKey: string,
  until: string | null | undefined,
  easyPaceSPerKm?: number | null
): RunTemplate | null {
  const original = RUN_TEMPLATES.find((t) => t.id === templateId);
  if (!original || original.type === "race") return null;
  const runWalkId = runWalkTemplateIdForWeek(weekKey, until);
  if (runWalkId) return RUN_TEMPLATES.find((t) => t.id === runWalkId) ?? null;
  const most = newRunnerBuildMinutes(weekKey, until);
  const minutes = (t: RunTemplate) => plannedRunMinutes(t, easyPaceSPerKm);
  if (most === null || minutes(original) <= most) return null;
  const fitting = RUN_TEMPLATES.filter(
    (t) => t.type !== "race" && !isRunWalkTemplateId(t.id) && minutes(t) <= most
  ).sort((a, b) => minutes(b) - minutes(a) || a.id.localeCompare(b.id));
  const quality = original.type === "tempo" || original.type === "intervals";
  const rungs = DELOAD_LADDERS.find((ladder) => ladder.includes(original.id));
  return (
    fitting.find((t) =>
      quality
        ? (rungs ?? []).includes(t.id)
        : t.type === original.type &&
          Boolean(t.config.strides) === Boolean(original.config.strides)
    ) ??
    fitting.find((t) => t.type === "easy" && !t.config.strides) ??
    null
  );
}
