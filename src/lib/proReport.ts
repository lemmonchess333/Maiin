/**
 * What Pro did for a person (whole-app grill Q56, owner 13 November 2026:
 * "Pro shows what it did: monthly in the review, and a 'your year' recap
 * before a yearly renewal"). Q45 says what Pro is: the app using your
 * body's data to adjust things for you.
 *
 * Every line counts something the app keeps, and a line with nothing kept
 * behind it is left out rather than guessed:
 *
 *   - The calorie target's moves and the paces a run moved. Neither was kept
 *     before Q56 (the target kept only its last value, `adaptiveCapState`;
 *     the paces only the current VDOT, `runFitness`), so both are now
 *     written beside the change (`proChanges`, `appendProChange`) and count
 *     from then on.
 *   - Meals the AI scan worked out, read off each meal: a photo scan is
 *     saved with the model's confidence ("high", "medium" or "low"), a typed
 *     meal Gemini read as "ai-parse" (Food.tsx, FoodAnalyzer.tsx).
 *   - A half or full marathon plan past its free first week (Q85): where it
 *     stands now, which is all the plan keeps.
 *
 * Left out, with the reason: readiness from sleep and heart is read on the
 * phone each day and nothing of it is stored or sent (`useBodySignals`,
 * `readinessFeel`), so its offers cannot be counted; macros that follow the
 * day are worked out live and never stored per day; the history, charts and
 * score details older than 3 months are things to look at, not changes.
 *
 * Pure: no React, no Firestore. The month card is `ProMonthCard`, the year
 * recap `YearRecap`.
 */
import type { UserProfile } from "./auth";
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { racePlanLocked } from "./racePlanAccess";
import { formatMonth } from "@/utils/formatters";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

/* ── What Pro changed ──────────────────────────────────────────── */

export type ProChangeKind = "calories" | "paces";

export interface ProChange {
  kind: ProChangeKind;
  /** When the change was made, an ISO instant. */
  at: string;
  /** Calories in kcal, paces as VDOT. Null for a runner's first paces. */
  from: number | null;
  to: number;
}

/** How many changes the account keeps: the target moves at most once a
 *  week (`CAP_CADENCE_DAYS`), so this holds well over a year of both. */
export const PRO_CHANGES_KEPT = 120;

function isProChange(value: unknown): value is ProChange {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<ProChange>;
  return (
    (c.kind === "calories" || c.kind === "paces") &&
    typeof c.at === "string" &&
    Number.isFinite(Date.parse(c.at)) &&
    typeof c.to === "number" &&
    Number.isFinite(c.to) &&
    (c.from === null || (typeof c.from === "number" && Number.isFinite(c.from)))
  );
}

/** The kept list with `change` added, oldest dropped past the cap. */
export function appendProChange(
  list: readonly unknown[] | null | undefined,
  change: ProChange
): ProChange[] {
  const kept = Array.isArray(list) ? list.filter(isProChange) : [];
  return [...kept, change].slice(-PRO_CHANGES_KEPT);
}

/* ── The month the review reports ──────────────────────────────── */

export interface ProPeriod {
  /** Local "YYYY-MM-DD", both ends included. */
  start: string;
  end: string;
}

export interface ProMonth extends ProPeriod {
  /** "October". */
  name: string;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The month a weekly review reports for Pro, or null when this review is
 * not the month's first. The first review of a month is the one read on
 * the month's first Monday (the reviewed week's Monday plus seven days, on
 * the 1st to the 7th), and it reports the month before, which has ended by
 * then. The last review of a month would land up to six days before the
 * month ends and report a month still going.
 */
export function proMonthFor(reviewedWeekKey: string): ProMonth | null {
  if (!DATE_KEY.test(reviewedWeekKey)) return null;
  const reviewDay = addLocalDays(parseLocalDate(reviewedWeekKey), 7);
  if (Number.isNaN(reviewDay.getTime()) || reviewDay.getDate() > 7) return null;
  const first = new Date(reviewDay.getFullYear(), reviewDay.getMonth() - 1, 1);
  const last = new Date(reviewDay.getFullYear(), reviewDay.getMonth(), 0);
  return {
    start: localDateString(first),
    end: localDateString(last),
    name: formatMonth(first),
  };
}

/* ── The lines ─────────────────────────────────────────────────── */

/** How a photo scan's meal is saved: the model's own confidence. */
const PHOTO_SCAN_CONFIDENCES: ReadonlySet<string> = new Set([
  "high",
  "medium",
  "low",
]);
/** How a typed meal Gemini read is saved (Food.tsx's `handleNLParse`). */
const TYPED_SCAN_CONFIDENCE = "ai-parse";

export interface ProRacePlan {
  distance: "half" | "marathon";
  /** The plan's week, counted from 1. */
  week: number;
  totalWeeks: number;
}

export interface ProReportInput extends ProPeriod {
  changes: readonly unknown[] | null | undefined;
  /** The period's active meals: their day and how each was logged. */
  meals: readonly { date: string; confidence: string }[];
  racePlan: ProRacePlan | null;
}

export type ProLine =
  | { kind: "calories"; count: number; from: number; to: number }
  | { kind: "photo_scans"; count: number }
  | { kind: "typed_scans"; count: number }
  | { kind: "paces"; from: number | null; to: number }
  | ({ kind: "race_plan" } & ProRacePlan);

function inPeriod(at: string, period: ProPeriod): boolean {
  const day = localDateString(new Date(at));
  return day >= period.start && day <= period.end;
}

/** What Pro did in the period, in the order the card shows it. Empty when
 *  it did nothing; the card then says so. */
export function proReportLines(input: ProReportInput): ProLine[] {
  const lines: ProLine[] = [];
  const changes = (Array.isArray(input.changes) ? input.changes : [])
    .filter(isProChange)
    .filter((c) => inPeriod(c.at, input))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const calories = changes.filter((c) => c.kind === "calories");
  if (calories.length > 0) {
    const first = calories[0];
    lines.push({
      kind: "calories",
      count: calories.length,
      from: Math.round(first.from ?? first.to),
      to: Math.round(calories[calories.length - 1].to),
    });
  }

  let photo = 0;
  let typed = 0;
  for (const meal of input.meals) {
    if (meal.date < input.start || meal.date > input.end) continue;
    const how = meal.confidence.toLowerCase();
    if (PHOTO_SCAN_CONFIDENCES.has(how)) photo += 1;
    else if (how === TYPED_SCAN_CONFIDENCE) typed += 1;
  }
  if (photo > 0) lines.push({ kind: "photo_scans", count: photo });
  if (typed > 0) lines.push({ kind: "typed_scans", count: typed });

  const paces = changes.filter((c) => c.kind === "paces");
  if (paces.length > 0) {
    lines.push({
      kind: "paces",
      from: paces[0].from,
      to: paces[paces.length - 1].to,
    });
  }

  if (input.racePlan) lines.push({ kind: "race_plan", ...input.racePlan });
  return lines;
}

/**
 * The plan Pro is building, when it is a half or full marathon plan past
 * the week a free account may use (`racePlanLocked` asked as for a free
 * account): its week now and its length. Null for anything else.
 */
export function proRacePlan(
  runPlan:
    | {
        mode?: string;
        currentWeek?: number;
        totalWeeks?: number;
        phase?: string;
        raceGoal?: { distance?: string } | null;
      }
    | null
    | undefined,
  raceDistance: string | null | undefined
): ProRacePlan | null {
  if (!runPlan || !racePlanLocked({ isPro: false, runPlan, raceDistance })) {
    return null;
  }
  const distance = raceDistance ?? runPlan.raceGoal?.distance;
  const total = runPlan.totalWeeks;
  if (distance !== "half" && distance !== "marathon") return null;
  if (typeof total !== "number" || !(total > 0)) return null;
  const week = Math.min(total, (runPlan.currentWeek ?? 0) + 1);
  return { distance, week, totalWeeks: total };
}

/* ── The words ─────────────────────────────────────────────────── */

export interface ProLineWords {
  /** The figure, drawn large. */
  value: string;
  /** What it counts, under it. */
  caption: string;
}

/** Grouped as the viewer's locale groups, as the review's calories are. */
const KCAL = (n: number) => `${n.toLocaleString()} ${CALORIE_UNIT}`;

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** The figure and the words for one line. */
export function proLineWords(line: ProLine): ProLineWords {
  switch (line.kind) {
    case "calories":
      return {
        value: String(line.count),
        caption:
          line.from === line.to
            ? `${plural(line.count, "change", "changes")} to your calorie target, back to ${KCAL(line.to)}`
            : `${plural(line.count, "change", "changes")} to your calorie target, ${KCAL(line.from)} to ${KCAL(line.to)}`,
      };
    case "photo_scans":
      return {
        value: String(line.count),
        caption: `${plural(line.count, "meal", "meals")} scanned from a photo`,
      };
    case "typed_scans":
      return {
        value: String(line.count),
        caption: `typed ${plural(line.count, "meal", "meals")} read for you`,
      };
    case "paces":
      return {
        value: String(line.to),
        caption:
          line.from === null || line.from <= 0
            ? "VDOT your training paces were set from"
            : `VDOT for your training paces, up from ${line.from}`,
      };
    case "race_plan":
      return {
        value: `${line.week} of ${line.totalWeeks}`,
        caption: `weeks of your ${line.distance === "half" ? "half marathon" : "marathon"} plan`,
      };
  }
}

/** The one line a period with nothing to show says. `when` is "in
 *  October" or "this year". */
export function proNothingLine(when: string): string {
  return `Pro made no changes for you ${when}.`;
}

/* ── "Your year", before a yearly renewal ─────────────────────── */

/** How long before a yearly renewal the recap is offered. */
export const YEAR_RECAP_LEAD_DAYS = 7;

const DAY_MS = 86_400_000;

export interface YearRecapDue extends ProPeriod {
  /** When the yearly plan renews. */
  renewsAt: Date;
  /** The renewal's local day, which `yearRecapShownFor` records. */
  key: string;
  /** The store that bills it ("app_store", "rc_billing", "paddle"…). */
  store: string | null;
}

/**
 * Whether this account's "your year" recap is due: a yearly Pro plan that
 * renews within the next 7 days, out of its trial, with renewal on, and no
 * recap shown for this renewal yet. The renewal date is the server's copy
 * of RevenueCat's (`revenueCat`, `subscriptionExpiresAt`), the same for a
 * plan bought in the App Store or on the website; a plan the server cannot
 * read as yearly and renewing (the old Stripe checkout, a lifetime, a
 * record synced before Q56) gets no recap. Its year runs from a year
 * before the renewal to today.
 */
export function yearRecapDue(
  profile: Pick<
    UserProfile,
    | "revenueCat"
    | "subscriptionTier"
    | "subscriptionExpiresAt"
    | "subscriptionTrial"
    | "yearRecapShownFor"
  > | null,
  now: Date
): YearRecapDue | null {
  const rc = profile?.revenueCat;
  if (!profile || !rc || profile.subscriptionTier !== "pro") return null;
  if (rc.entitlementActive !== true || rc.period !== "year") return null;
  if (rc.willRenew !== true || rc.periodType === "trial") return null;
  // A trial's end is its first payment, not a renewal.
  const trialEnds = Date.parse(profile.subscriptionTrial?.endsAt ?? "");
  if (Number.isFinite(trialEnds) && trialEnds > now.getTime()) return null;
  const renewsMs = Date.parse(
    profile.subscriptionExpiresAt ?? rc.expiresAt ?? ""
  );
  if (!Number.isFinite(renewsMs)) return null;
  const lead = renewsMs - now.getTime();
  if (lead <= 0 || lead > YEAR_RECAP_LEAD_DAYS * DAY_MS) return null;
  const renewsAt = new Date(renewsMs);
  const key = localDateString(renewsAt);
  if (profile.yearRecapShownFor === key) return null;
  const since = new Date(renewsAt);
  since.setFullYear(since.getFullYear() - 1);
  return {
    renewsAt,
    key,
    start: localDateString(since),
    end: localDateString(now),
    store: typeof rc.store === "string" ? rc.store : null,
  };
}
