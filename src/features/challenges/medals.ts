import {
  distanceIn,
  distanceUnitLabel,
  type DistanceUnit,
} from "@/lib/distanceUnits";
import { liftUnitLabel, liftVolumeIn, type LiftUnit } from "@/lib/liftLoad";
import { parseLocalDate } from "@/lib/dateHelpers";
import {
  formatDayMonth,
  formatDayMonthLong,
  formatDayMonthYearLong,
  formatMonthYear,
  formatShortMonth,
  formatShortMonthYear,
} from "@/utils/formatters";
import { formatChallengeValue } from "./challengeFormat";
import { challengeSport, type ChallengeSport } from "./challengeSport";
import { medalArtFor } from "./medalDefinitions";

/**
 * Medals and the trophy case (Soc15). A medal is a person's highest tier
 * in one challenge edition, kept after the challenge ends. The server
 * writes them (functions/lib/medals.js, the one writer): the owner's own
 * record at users/{uid}/medals/{challengeId}, and the newest forty on the
 * public profile as `medalSummary`, which is what anyone's trophy case
 * reads.
 *
 * Both are read here into one shape. The summary sits on a document any
 * signed-in person can read and the rules bound only its writer (the
 * server), so every field is checked before it is drawn: a line that is
 * not a medal is skipped, never shown.
 *
 * Dates are the challenge's own UTC day keys, the end exclusive (the
 * next edition's first day), as the challenge documents store them. A
 * day key names the same calendar day everywhere, so it is read as a
 * local date (parseLocalDate), the way the challenge cards read theirs.
 */

export type MedalTier = "bronze" | "silver" | "gold";

export const MEDAL_TIER_RANK: Readonly<Record<MedalTier, number>> = {
  bronze: 1,
  silver: 2,
  gold: 3,
};

export const MEDAL_TIER_LABEL: Readonly<Record<MedalTier, string>> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export interface Medal {
  challengeId: string;
  name: string;
  metric: string;
  type: string | null;
  tier: MedalTier;
  /** The participant's figure, in the metric's stored unit (km, kg,
   *  seconds for a fastest effort, a count). */
  value: number;
  /** The reached tier's threshold, in the same unit. */
  goal: number;
  /** A fastest effort's distance, in metres. */
  targetDistance?: number;
  /** UTC day key of the edition's first day. */
  startDate: string;
  /** UTC day key the edition ends on: the next one's first day. */
  endDate: string;
  /** When the tier was first reached. On the owner's own record only. */
  earnedAt?: string;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const NAME_MAX = 60;

function isTier(value: unknown): value is MedalTier {
  return value === "bronze" || value === "silver" || value === "gold";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** One medal from a stored line, or null for anything that is not one. */
export function parseMedal(challengeId: string, raw: unknown): Medal | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!challengeId || !isTier(r.tier)) return null;
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  if (typeof r.metric !== "string" || !r.metric) return null;
  if (typeof r.startDate !== "string" || !DAY_KEY.test(r.startDate))
    return null;
  if (typeof r.endDate !== "string" || !DAY_KEY.test(r.endDate)) return null;
  if (r.startDate >= r.endDate) return null;
  const medal: Medal = {
    challengeId,
    name: r.name.trim().slice(0, NAME_MAX),
    metric: r.metric,
    type: typeof r.type === "string" ? r.type : null,
    tier: r.tier,
    value: finite(r.value) && r.value > 0 ? r.value : 0,
    goal: finite(r.goal) && r.goal > 0 ? r.goal : 0,
    startDate: r.startDate,
    endDate: r.endDate,
  };
  if (finite(r.targetDistance) && r.targetDistance > 0)
    medal.targetDistance = r.targetDistance;
  if (typeof r.earnedAt === "string" && Number.isFinite(Date.parse(r.earnedAt)))
    medal.earnedAt = r.earnedAt;
  return medal;
}

/** UTC day key of a challenge boundary (a Timestamp or a Date). */
function boundaryKey(value: unknown): string | null {
  const d =
    value instanceof Date
      ? value
      : value && typeof (value as { toDate?: unknown }).toDate === "function"
        ? (value as { toDate: () => Date }).toDate()
        : null;
  if (!d || !Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * The medal a finished challenge's own figures make, for the finale card
 * to open before (or without) the server's copy: the same fields the
 * server writes (functions/lib/medals.js `buildMedal`), from the
 * challenge document and the person's participant row. Null below bronze
 * and for a community goal, which awards no medal.
 */
export function medalFromChallenge(
  challenge: {
    id: string;
    name: string;
    metric: string;
    type?: string;
    tiers?: Partial<Record<MedalTier, number>>;
    targetDistance?: number;
    collectiveTarget?: number;
    startDate?: unknown;
    endDate?: unknown;
  },
  participant: { tierAchieved?: string | null; currentValue?: number }
): Medal | null {
  if ((challenge.collectiveTarget ?? 0) > 0) return null;
  const tier = participant.tierAchieved;
  if (!isTier(tier)) return null;
  return parseMedal(challenge.id, {
    name: challenge.name,
    metric: challenge.metric,
    type: challenge.type ?? null,
    tier,
    value: participant.currentValue,
    goal: challenge.tiers?.[tier],
    targetDistance: challenge.targetDistance,
    startDate: boundaryKey(challenge.startDate),
    endDate: boundaryKey(challenge.endDate),
  });
}

/** Newest edition first; within one, the higher tier, then by name. */
export function sortMedals(medals: readonly Medal[]): Medal[] {
  return [...medals].sort((a, b) => {
    if (a.endDate !== b.endDate) return a.endDate < b.endDate ? 1 : -1;
    const byTier = MEDAL_TIER_RANK[b.tier] - MEDAL_TIER_RANK[a.tier];
    if (byTier !== 0) return byTier;
    return a.name.localeCompare(b.name, "en-GB");
  });
}

/** The public profile's `medalSummary`, as medals, newest first. */
export function parseMedalSummary(raw: unknown): Medal[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const medals: Medal[] = [];
  for (const [id, line] of Object.entries(raw as Record<string, unknown>)) {
    const medal = parseMedal(id, line);
    if (medal) medals.push(medal);
  }
  return sortMedals(medals);
}

function firstDay(medal: Medal): Date {
  return parseLocalDate(medal.startDate);
}

/** The edition's last day: the day before the next one opens. */
function lastDay(medal: Medal): Date {
  const d = parseLocalDate(medal.endDate);
  d.setDate(d.getDate() - 1);
  return d;
}

/**
 * The edition, short, as the medal carries it: "Nov 2026" for a month,
 * "2–8 Nov" for a week, "Sept–Nov 2026" or "Dec–Feb 2027" for a season.
 */
export function medalEdition(medal: Medal): string {
  const start = firstDay(medal);
  const end = lastDay(medal);
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (medal.type === "weekly") {
    return sameMonth
      ? `${start.getDate()}–${formatDayMonth(end)}`
      : `${formatDayMonth(start)}–${formatDayMonth(end)}`;
  }
  if (sameMonth) return formatShortMonthYear(start);
  // A season across a year end is named by the year it ends in, as
  // "winter 2027" is: "Dec–Feb 2027" fits the medal's scroll where
  // "Dec 2026–Feb 2027" did not.
  return `${formatShortMonth(start)}–${formatShortMonthYear(end)}`;
}

/** The edition's dates in full: "1–30 November 2026",
 *  "1 September – 30 November 2026". */
export function medalEditionDates(medal: Medal): string {
  const start = firstDay(medal);
  const end = lastDay(medal);
  if (start.getFullYear() !== end.getFullYear())
    return `${formatDayMonthYearLong(start)} – ${formatDayMonthYearLong(end)}`;
  if (start.getMonth() === end.getMonth())
    return `${start.getDate()}–${end.getDate()} ${formatMonthYear(end)}`;
  return `${formatDayMonthLong(start)} – ${formatDayMonthYearLong(end)}`;
}

/** "Gold · November Mileage": two facts of equal weight, the middot
 *  the app uses for them (DESIGN_GUIDE §3g). */
export function medalTitle(medal: Medal): string {
  return `${MEDAL_TIER_LABEL[medal.tier]} · ${medal.name}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** The medal's figure in the reader's units, as a number and the word
 *  after it: "52.4" "km", "23:41" "", "7" "lifts", "8,400" "points". */
export function medalValueParts(
  medal: Pick<Medal, "metric" | "value">,
  liftUnit: LiftUnit = "kg",
  distanceUnit: DistanceUnit = "km"
): { figure: string; unit: string } {
  const n = Math.max(0, Math.round(medal.value));
  switch (medal.metric) {
    case "workout_count":
      return { figure: n.toLocaleString(), unit: plural(n, "lift", "lifts") };
    case "hybrid_score":
      return { figure: n.toLocaleString(), unit: plural(n, "point", "points") };
    case "total_km":
      return {
        figure: formatChallengeValue(
          "total_km",
          medal.value,
          liftUnit,
          distanceUnit
        ).split(" ")[0],
        unit: distanceUnitLabel(distanceUnit),
      };
    case "total_volume":
      return {
        figure: Math.round(
          liftVolumeIn(medal.value, liftUnit)
        ).toLocaleString(),
        unit: liftUnitLabel(liftUnit),
      };
    case "fastest_effort":
      return {
        figure: formatChallengeValue("fastest_effort", medal.value),
        unit: "",
      };
    case "active_days": {
      const days = Math.max(0, Math.floor(medal.value));
      return {
        figure: days.toLocaleString(),
        unit: plural(days, "day", "days"),
      };
    }
    case "training_minutes":
      return {
        figure: Math.max(0, Math.floor(medal.value)).toLocaleString(),
        unit: "min",
      };
    default:
      return { figure: n.toLocaleString(), unit: "" };
  }
}

/** The medal's figure in one string: "52.4 km", "23:41", "7 lifts". */
export function medalValueLabel(
  medal: Pick<Medal, "metric" | "value">,
  liftUnit: LiftUnit = "kg",
  distanceUnit: DistanceUnit = "km"
): string {
  const { figure, unit } = medalValueParts(medal, liftUnit, distanceUnit);
  return unit ? `${figure} ${unit}` : figure;
}

/** A number the medal's face has room for: 1500 → "1.5k", 30000 → "30k". */
function compact(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    const shown = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
    return `${shown}k`;
  }
  return String(Math.round(n));
}

/** A fastest effort's distance as a race is named: 5000 m → "5K". */
function raceDistance(metres: number | undefined): string {
  const km = (metres ?? 5000) / 1000;
  return `${Math.round(km * 10) / 10}K`;
}

/**
 * The goal the medal's tier stood for, split for the medal's face: a
 * figure and the word under it, in the reader's units. "50" over "km",
 * "25:00" over "5K", "30k" over "kg", "6" over "lifts".
 */
export function medalGoalFace(
  medal: Pick<Medal, "metric" | "goal" | "targetDistance">,
  liftUnit: LiftUnit = "kg",
  distanceUnit: DistanceUnit = "km"
): { figure: string; unit: string } {
  const goal = medal.goal;
  switch (medal.metric) {
    case "total_km": {
      const shown = Math.round(distanceIn(goal * 1000, distanceUnit) * 10) / 10;
      return { figure: String(shown), unit: distanceUnitLabel(distanceUnit) };
    }
    case "fastest_effort":
      return {
        figure: formatChallengeValue("fastest_effort", goal),
        unit: raceDistance(medal.targetDistance),
      };
    case "total_volume":
      return {
        figure: compact(liftVolumeIn(goal, liftUnit)),
        unit: liftUnitLabel(liftUnit),
      };
    case "workout_count":
      return { figure: String(goal), unit: plural(goal, "lift", "lifts") };
    case "hybrid_score":
      return { figure: compact(goal), unit: "points" };
    case "active_days":
      return { figure: String(goal), unit: plural(goal, "day", "days") };
    case "training_minutes":
      return { figure: compact(goal), unit: "min" };
    default:
      return { figure: compact(goal), unit: "" };
  }
}

/** What MedalArt draws for a medal: its metal, its sport, the goal on
 *  its face, its edition, and its definition's illustration when one has
 *  been made (medalDefinitions.ts). */
export function medalFace(
  medal: Medal,
  liftUnit: LiftUnit = "kg",
  distanceUnit: DistanceUnit = "km"
): {
  tier: MedalTier;
  sport: ChallengeSport;
  figure: string;
  unit: string;
  edition: string;
  imageSrc?: string;
} {
  const imageSrc = medalArtFor(medal);
  return {
    tier: medal.tier,
    sport: challengeSport(medal.metric),
    ...medalGoalFace(medal, liftUnit, distanceUnit),
    edition: medalEdition(medal),
    ...(imageSrc ? { imageSrc } : {}),
  };
}

/** The goal in words, for the sheet: "Gold was 50 km.",
 *  "Gold was a 5K in 25:00 or faster." */
export function medalGoalLine(
  medal: Medal,
  liftUnit: LiftUnit = "kg",
  distanceUnit: DistanceUnit = "km"
): string {
  const tier = MEDAL_TIER_LABEL[medal.tier];
  if (!(medal.goal > 0)) return "";
  if (medal.metric === "fastest_effort") {
    return `${tier} was a ${raceDistance(medal.targetDistance)} in ${formatChallengeValue("fastest_effort", medal.goal)} or faster.`;
  }
  return `${tier} was ${medalValueLabel(
    { metric: medal.metric, value: medal.goal },
    liftUnit,
    distanceUnit
  )}.`;
}

/** Whether the edition is still running for this device: until local
 *  midnight of its end day, as the challenge card counts it down. A
 *  running medal can still change. */
export function medalStillRunning(medal: Medal, now: number = Date.now()) {
  return parseLocalDate(medal.endDate).getTime() > now;
}

/** "Ends 30 Nov." for a running edition. */
export function medalEndsLine(medal: Medal): string {
  return `Ends ${formatDayMonth(lastDay(medal))}.`;
}

/* ── The reveal ─────────────────────────────────────────────────────── */

/** How long after its tier was reached a medal is still revealed. Past
 *  it the medal is simply in the trophy case: a reinstall or a second
 *  phone does not replay a month of medals. */
export const MEDAL_REVEAL_WINDOW_DAYS = 14;

/** Which tier of each challenge's medal this device has revealed. */
export type RevealedMedals = Readonly<Record<string, number>>;

/**
 * The medal to reveal, if any: one this device has not yet revealed at
 * its tier (a silver after a bronze is a new moment), reached within the
 * window; the highest tier first, then the newest. One a visit: the rest
 * wait for the next.
 */
export function medalToReveal(
  medals: readonly Medal[],
  revealed: RevealedMedals,
  now: number = Date.now()
): Medal | null {
  const windowMs = MEDAL_REVEAL_WINDOW_DAYS * 86_400_000;
  const waiting = medals.filter((medal) => {
    if (!medal.earnedAt) return false;
    const at = Date.parse(medal.earnedAt);
    if (!Number.isFinite(at) || now - at > windowMs) return false;
    return MEDAL_TIER_RANK[medal.tier] > (revealed[medal.challengeId] ?? 0);
  });
  waiting.sort((a, b) => {
    const byTier = MEDAL_TIER_RANK[b.tier] - MEDAL_TIER_RANK[a.tier];
    if (byTier !== 0) return byTier;
    return Date.parse(b.earnedAt!) - Date.parse(a.earnedAt!);
  });
  return waiting[0] ?? null;
}
