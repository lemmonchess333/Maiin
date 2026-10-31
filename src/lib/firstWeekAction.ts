import type { TodaySession } from "@/lib/todaySession";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  getScheduledRunStatus,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";
import { START_ON_ARRIVAL_PARAM } from "@/features/run/startOnArrival";

export type FirstWeekTrainingTask = "workout" | "run";

export interface FirstWeekAction {
  target: string;
  mode: "resume" | "start" | "details";
  /** Run Start and Resume need voice unlocked inside the user's tap. */
  unlockRunSpeech: boolean;
}

function destination(
  target: string,
  mode: FirstWeekAction["mode"],
  unlockRunSpeech = false
): FirstWeekAction {
  return { target, mode, unlockRunSpeech };
}

/** Use the same destination and guards as Home's session cards. In
 * particular, a race-plan rest day may open its plan but cannot launch an
 * unscheduled run just to finish the first-week task. */
export function firstWeekAction(
  task: FirstWeekTrainingTask,
  session: TodaySession
): FirstWeekAction {
  const sport = task === "run" ? "run" : "lift";
  const elsewhere = session.inProgressElsewhere?.find(
    (inProgress) => inProgress.sport === sport
  );
  if (elsewhere)
    return destination(elsewhere.resumeTarget, "resume", task === "run");

  if (task === "workout") {
    const lift = session.lift;
    if (lift?.workout) {
      const details =
        typeof lift.index === "number"
          ? `/program?day=${lift.index}`
          : "/program";
      if (lift.status === "planned" && lift.isStartable) {
        if (lift.inProgress)
          return destination(lift.inProgress.resumeTarget, "resume");
        if (typeof lift.index === "number")
          return destination(`${details}&start=1`, "start");
      }
      return destination(details, "details");
    }
    if (session.rest?.kind === "first-workout") {
      const details = `/program?day=${session.rest.index}`;
      return session.rest.inProgress
        ? destination(session.rest.inProgress.resumeTarget, "resume")
        : destination(`${details}&start=1`, "start");
    }
    return destination("/program?tab=lift", "details");
  }

  const run = session.run;
  if (run) {
    const startable =
      !run.completed &&
      (!run.runDay ||
        isScheduledRunStartable(getScheduledRunStatus(run.runDay)));
    if (startable) {
      if (run.inProgress)
        return destination(run.inProgress.resumeTarget, "resume", true);
      const params: string[] = [];
      const template = run.runDay
        ? RUN_TEMPLATES.find(
            (item) =>
              item.id === (run.runDay?.userOverride || run.runDay?.templateId)
          )
        : null;
      if (template) params.push(`template=${template.id}`);
      if (run.runDay?.id)
        params.push(`scheduledRunId=${encodeURIComponent(run.runDay.id)}`);
      params.push(`${START_ON_ARRIVAL_PARAM}=1`);
      return destination(`/run?${params.join("&")}`, "start", true);
    }
  }
  if (session.rest?.kind === "free-run")
    return session.rest.inProgress
      ? destination(session.rest.inProgress.resumeTarget, "resume", true)
      : destination("/run?start=1", "start", true);
  return destination("/program?tab=run", "details");
}

/** Order an unfinished hybrid task by the session Home can act on now.
 * Resume wins; when both sports can start, keep Home's lift-then-run order. */
export function firstWeekPriorityTask(
  session: TodaySession
): FirstWeekTrainingTask | null {
  const firstResume = session.inProgressElsewhere?.[0];
  if (firstResume) return firstResume.sport === "run" ? "run" : "workout";
  const workout = firstWeekAction("workout", session).mode;
  const run = firstWeekAction("run", session).mode;
  if (workout === "resume") return "workout";
  if (run === "resume") return "run";
  if (workout === "start") return "workout";
  if (run === "start") return "run";
  return null;
}
