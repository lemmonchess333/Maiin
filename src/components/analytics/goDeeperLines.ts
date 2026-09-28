/**
 * The overview's "Go deeper" tiles, each with one live line: the thing on
 * that page most worth opening it for. A tile that said "Volume, sessions,
 * muscles" described the page to someone who has not seen it; this says
 * what it holds for this user this range. Pure, so every line and its
 * fallback are tested without mounting History. A page with nothing true
 * to say keeps its plain description.
 */
import type { AnalyticsPage } from "./AnalyticsGoDeeper";
import type { LiftProgressRow } from "@/lib/liftProgress";
import type { PaceByKindRow } from "@/lib/runInsights";
import { paceIn, paceUnitLabel, type DistanceUnit } from "@/lib/distanceUnits";
import { distanceLabel } from "@/lib/runLabels";
import { kgToLb } from "@/lib/weightUnits";
import { keepTogether } from "@/utils/formatters";
import { STEADY_RATE_KG } from "@/utils/weightTrend";

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function liftingLine(rows: readonly LiftProgressRow[]): string | null {
  const newBests = rows.filter((r) => r.newBest).length;
  if (newBests > 0)
    return `${plural(newBests, "new best", "new bests")} this week`;
  const up = rows.filter((r) => !r.holding && r.direction === "up").length;
  const holding = rows.filter((r) => r.holding).length;
  const parts = [
    up > 0 ? `${plural(up, "lift", "lifts")} up` : null,
    holding > 0 ? `${holding} holding` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function runningLine({
  pace,
  longest,
  unit,
}: {
  pace: readonly PaceByKindRow[];
  longest: { distanceM: number } | null;
  unit: DistanceUnit;
}): string | null {
  const easy = pace.find((r) => r.kind === "easy");
  if (easy && easy.previousPaceSecPerKm !== null) {
    const diff = Math.round(
      paceIn(easy.paceSecPerKm, unit) - paceIn(easy.previousPaceSecPerKm, unit)
    );
    if (diff !== 0) {
      return `Easy pace ${keepTogether(
        `${Math.abs(diff)} s${paceUnitLabel(unit)}`
      )} ${diff < 0 ? "faster" : "slower"}`;
    }
  }
  return longest
    ? `Longest run ${keepTogether(distanceLabel(longest.distanceM, unit))}`
    : null;
}

export function bodyLine({
  kgPerWeek,
  unit,
  hideNumber,
}: {
  kgPerWeek: number | null;
  unit: "kg" | "lbs";
  hideNumber: boolean;
}): string | null {
  if (kgPerWeek === null) return null;
  if (Math.abs(kgPerWeek) < STEADY_RATE_KG) return "Holding steady";
  const direction = kgPerWeek < 0 ? "Down" : "Up";
  if (hideNumber) return `Trending ${direction.toLowerCase()}`;
  const v = Math.abs(unit === "lbs" ? kgToLb(kgPerWeek) : kgPerWeek);
  return `${direction} ${keepTogether(`${v.toFixed(2)} ${unit}`)} a week`;
}

export function foodLine({
  daysLogged,
  rangeDays,
}: {
  daysLogged: number;
  rangeDays: number;
}): string | null {
  if (daysLogged === 0) return null;
  return `Logged ${daysLogged} of ${rangeDays} days`;
}

/** Only the lines there are; a missing page keeps its description. */
export function goDeeperLines(
  lines: Record<AnalyticsPage, string | null>
): Partial<Record<AnalyticsPage, string>> {
  const out: Partial<Record<AnalyticsPage, string>> = {};
  for (const [page, line] of Object.entries(lines) as [
    AnalyticsPage,
    string | null,
  ][]) {
    if (line) out[page] = line;
  }
  return out;
}
