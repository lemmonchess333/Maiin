import type { ExperienceSuggestion } from "./experienceDetection";
import type { PrimaryGoal } from "./programTypes";
import { roleReps } from "./roleTable";

/**
 * What the card says a level change does (Lift4 (12)): it keeps the
 * exercises and sets how the main lifts progress (`represcribeMainLifts`),
 * and the level also reaches the plan through whether lighter weeks come
 * and what a plan built later picks. Where the person's goal gives an
 * intermediate's main lifts a range of reps and a beginner's one target
 * (the role table, Lift4 (5)), it says so. Progression runs per session at
 * every level, so nothing here may promise another cadence.
 */
export function levelSuggestionCopy(
  suggestion: Pick<ExperienceSuggestion, "to">,
  goal: PrimaryGoal | undefined
): {
  title: string;
  body: string;
  basis: string;
} {
  const ranged =
    roleReps(goal, "main", "intermediate", false).top !== undefined;
  if (suggestion.to === "intermediate") {
    return {
      title: "Ready for intermediate programming?",
      body:
        "These lifts have stalled through real missed reps AND a load " +
        "reset — the classic end of session-to-session progress, not just " +
        "a week that needed to be easy. Your exercises stay as they are. " +
        `Intermediate gives your main lifts ${ranged ? "a range of reps, and heavier and lighter days" : "heavier and lighter days"}, ` +
        "brings a lighter week every fourth week when you lift three or " +
        "more days, and changes what a plan built later can include.",
      basis:
        "Based only on your logged sessions: a reset and honest misses are " +
        "already in this window, and you're not in a cut. Advanced is " +
        "never suggested automatically — that's a years-of-training " +
        "judgement, and it stays yours.",
    };
  }
  return {
    title: "You could progress faster",
    body:
      "You're still adding weight nearly every session. Your exercises " +
      `stay as they are. Beginner ${ranged ? "gives your main lifts one target each, without heavier and lighter days" : "takes the heavier and lighter days off your main lifts"}, ` +
      "has no lighter weeks on the calendar, and keeps a plan built later " +
      "to simpler lifts. Switch back the moment progress slows.",
    basis:
      "Based only on your logged sessions: steady session-to-session e1RM " +
      "gains are the definition of the beginner window, whatever the " +
      "calendar says.",
  };
}
