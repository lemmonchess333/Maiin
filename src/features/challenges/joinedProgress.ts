import type { LiftUnit } from "@/lib/liftLoad";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { formatChallengeValue } from "./challengeFormat";
import { isTierAchieved, type ChallengeTier } from "./challengeTiers";

const TIER_ORDER: readonly ChallengeTier[] = ["bronze", "silver", "gold"];
const TIER_NAME: Record<ChallengeTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export interface JoinedProgress {
  /** "3 of 8 days", "Bronze · 9 of 12 days", "Gold · 22 days". */
  line: string;
  /** How far towards the next tier, 0 to 1, for the row's bar. */
  fraction: number;
}

/** "3 days" → ["3", "day"]; a figure with no unit → [figure, ""]. */
function splitUnit(text: string): [string, string] {
  const space = text.indexOf(" ");
  if (space < 0) return [text, ""];
  return [text.slice(0, space), text.slice(space + 1).replace(/s$/, "")];
}

/** "3 of 8 days" where both figures share a unit, else both in full. */
function ofTarget(
  metric: string,
  value: number,
  target: number,
  liftUnit: LiftUnit,
  distanceUnit: DistanceUnit
): string {
  if (metric === "workout_count") {
    const v = Math.round(value).toLocaleString();
    const t = Math.round(target).toLocaleString();
    return `${v} of ${t} ${target === 1 ? "session" : "sessions"}`;
  }
  const v = formatChallengeValue(metric, value, liftUnit, distanceUnit);
  const t = formatChallengeValue(metric, target, liftUnit, distanceUnit);
  if (metric === "hybrid_score") return `${v} of ${t} points`;
  const [vFigure, vUnit] = splitUnit(v);
  const [, tUnit] = splitUnit(t);
  return vUnit && vUnit === tUnit ? `${vFigure} of ${t}` : `${v} of ${t}`;
}

/**
 * A joined challenge's progress as one line and a bar, aimed at the next
 * tier the person has not reached: bronze first, then silver, then gold.
 * The tier already held leads the line once there is one. A fastest-effort
 * challenge counts down, so its line is the best time and the next tier's
 * time, and an empty board reads as the first tier to aim for.
 */
export function joinedProgress(
  challenge: {
    metric: string;
    tiers: { bronze: number; silver: number; gold: number };
  },
  value: number,
  liftUnit: LiftUnit = "kg",
  distanceUnit: DistanceUnit = "km"
): JoinedProgress {
  const { metric, tiers } = challenge;
  const fmt = (n: number) =>
    formatChallengeValue(metric, n, liftUnit, distanceUnit);
  const next = TIER_ORDER.find((t) => !isTierAchieved(value, tiers[t], metric));
  const held = [...TIER_ORDER]
    .reverse()
    .find((t) => isTierAchieved(value, tiers[t], metric));
  const lead = held ? `${TIER_NAME[held]} · ` : "";
  const fastest = metric === "fastest_effort";

  if (!next) {
    return {
      line: `${lead}${fastest ? `Best ${fmt(value)}` : fmt(value)}`,
      fraction: 1,
    };
  }
  const target = tiers[next];
  if (fastest) {
    const aim = `${TIER_NAME[next]} at ${fmt(target)}`;
    return value > 0
      ? {
          line: `${lead}Best ${fmt(value)} · ${aim}`,
          fraction: Math.min(target / value, 1),
        }
      : { line: aim, fraction: 0 };
  }
  return {
    line: `${lead}${ofTarget(metric, value, target, liftUnit, distanceUnit)}`,
    fraction: target > 0 ? Math.min(Math.max(value, 0) / target, 1) : 0,
  };
}
