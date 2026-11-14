/**
 * A post's moment in words (Soc15), as the feed card draws it: a bold
 * line, and for a moment with figures a quieter one under it. Every word
 * comes from the moment's kind and every figure from its numbers, in the
 * READER's units, as the rest of the card is: a post stores kg and metres.
 *
 * Gold is a new best and nothing else (DESIGN_GUIDE §14b), so the bests
 * (a PR, the longest run, a first distance, a fastest effort) take it; the
 * streak keeps its flame's brand purple, as does the plan. A first session
 * takes its sport's colour, as the finish screen draws it: running's coral
 * on a run, the lifting purple on a lift (DS4, owner 7 November 2026).
 */
import type { PostMoment } from "@/lib/postMoments";
import type { DistanceUnit } from "@/lib/distanceUnits";
import type { LiftUnit } from "@/lib/liftLoad";
import { formatKitLoad } from "@/features/program/loadSteps";
import { distanceLabel } from "@/lib/runLabels";
import { formatClock, keepTogether } from "@/utils/formatters";

export interface PostMomentLines {
  headline: string;
  /** The quieter second line: a name as written, then the figures. */
  detail?: { text?: string; figure?: string };
  /** "best" draws in gold; "milestone" in the brand purple; "sport" in
   *  the post's sport's colour. */
  tone: "best" | "milestone" | "sport";
  icon: "trophy" | "medal" | "flame" | "flag";
}

/** A race distance by its name: a 5K is a 5K in miles too. */
const DISTANCE_NAMES: Readonly<Record<number, string>> = {
  1000: "1K",
  5000: "5K",
  10000: "10K",
  21097: "half marathon",
  42195: "marathon",
};

export function postMomentLines(
  moment: PostMoment,
  units: {
    distanceUnit: DistanceUnit;
    liftUnit: LiftUnit;
    /** The exercise's id, for a kettlebell's load in lb. */
    exerciseIdOf?: (name: string) => string | undefined;
  }
): PostMomentLines {
  switch (moment.kind) {
    case "pr":
      return {
        headline: "New best",
        detail: {
          text: moment.exercise,
          figure: keepTogether(
            `${formatKitLoad(
              moment.weightKg,
              units.liftUnit,
              units.exerciseIdOf?.(moment.exercise)
            )} × ${moment.reps}`
          ),
        },
        tone: "best",
        icon: "trophy",
      };
    case "longestRun":
      return {
        headline: "Longest run yet",
        detail: {
          figure: keepTogether(
            distanceLabel(moment.meters, units.distanceUnit)
          ),
        },
        tone: "best",
        icon: "medal",
      };
    case "firstDistance":
      return {
        headline: `First ${DISTANCE_NAMES[moment.meters]}`,
        tone: "best",
        icon: "medal",
      };
    case "fastestEffort":
      return {
        headline: `Fastest ${DISTANCE_NAMES[moment.meters] ?? ""}`.trim(),
        detail: { figure: formatClock(moment.seconds) },
        tone: "best",
        icon: "trophy",
      };
    case "streak":
      return {
        headline: `${moment.days}-day streak`,
        tone: "milestone",
        icon: "flame",
      };
    case "planWeek":
      return {
        headline: `Week ${moment.week} of ${moment.weeks} done`,
        tone: "milestone",
        icon: "flag",
      };
    case "planComplete":
      return {
        headline: "Programme complete",
        tone: "milestone",
        icon: "medal",
      };
    case "firstSession":
      return {
        headline: "First session on Tropos",
        tone: "sport",
        icon: "flag",
      };
  }
}
