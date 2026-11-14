/**
 * Whether Train offers a lighter week, and the words for why (whole-app
 * grill Q11, 13 November 2026): "one lighter-week decision for both
 * sports, its words matching the trigger that fired".
 *
 * The engine decides (`deloadRecommended`, from `shouldRecommendDeload`
 * on the server), and it already asks the question of the sport a week
 * was trained in (`deloadLoadScore`, LIFT-EV-10). Two things stood
 * between that answer and the person:
 *
 *   - the offer counted only when running carried the week
 *     (`loadFromRunning`, Lift4 (9): "no early offer" for lifting, "its
 *     running half waits for the running grill"), so a lifting-only week
 *     the engine flagged was never offered one;
 *   - the banner said "Your running load has been high, with signs of
 *     reduced recovery" whichever of the engine's three reasons fired,
 *     and whichever sport carried the week.
 *
 * So this is the one decision for lifting, running and both: the engine's
 * recommendation, while a lighter week can be taken (`lighterWeekAllowed`:
 * one at a time, never two in a row, not in a first week back) and never
 * on top of a race's taper or race week (P1d pin 2). With it come the
 * words for the reason that fired, in the sport that carried the week.
 * A lighter week halves the sets and shortens each run left (the server's
 * `applyDeloadWeek`), so one offer covers both sports.
 *
 * The three reasons are the engine's own branches, found by asking
 * `shouldRecommendDeload` (the client's pinned copy of the server's) one
 * branch at a time with the other two held off, in the engine's order:
 *
 *   recovery   the week's reading 80 or more with recovery under 45
 *   sustained  85 or more two weeks running, not three
 *   slipping   70 or more while the plan's targets (sessions, food) are
 *              missed
 *
 * The thresholds are never copied here. The reading is `deloadIndex`, the
 * figure the engine asks in, falling back to the score on a document from
 * before it was stored, as the engine's own `priorDeloadIndex` does. The
 * weeks before come from the weekly series, which picks the newest
 * document of each seven-day slot where the engine reads the document
 * exactly 7 and 14 days back, so the sustained branch can read a
 * neighbouring day: for the words only, never for whether to offer.
 * When no branch can be reproduced from what the phone holds (an older
 * document without its sub-scores), the words fall back to the week
 * itself against the usual week.
 *
 * Pure: no React, no clock, no storage.
 */
import { isCurrentWeekInRaceWindDown } from "@/features/program/runPlanTiming";
import { shouldRecommendDeload } from "./performanceEngine";
import { resolveDeloadRecommended } from "./performanceDocFields";

export type LighterWeekTrigger = "recovery" | "sustained" | "slipping";

/** The parts of a performance document the decision reads. Structural,
 *  so a normalised `PerformanceWeekDoc` passes as it comes. */
export interface LighterWeekDoc {
  performanceIndex?: number;
  deloadIndex?: number;
  deloadRecommended?: boolean;
  flags?: { deloadRecommended?: boolean };
  signals?: { deloadFlag?: boolean };
  breakdown?: {
    liftLoadScore?: number;
    runLoadScore?: number;
    recoveryScore?: number;
    adherenceScore?: number;
  };
  aggregates?: {
    liftSessions?: number;
    liftTonnage?: number;
    runSessions?: number;
    runKm?: number;
  };
  baseline?: { liftTonnage?: number; runKm?: number; weeksUsed?: number };
}

export interface LighterWeekOffer {
  /** The engine's reason, or null when the phone cannot tell which. */
  trigger: LighterWeekTrigger | null;
  /** Why, on its own: the weekly review says what a lighter week does in
   *  its own words (`reviewWeekOffers`). */
  why: string;
  /** The banner's sentences: why, then what a lighter week does. */
  reason: string;
}

/** A score the engine holds on its 0 to 100 scale, or "no reason" when
 *  absent, so a missing sub-score never reproduces a branch. */
const CLEAR = 100;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** The figure the deload question is asked in (`priorDeloadIndex`). */
function reading(doc: LighterWeekDoc | null | undefined): number | undefined {
  return num(doc?.deloadIndex) ?? num(doc?.performanceIndex);
}

/**
 * Which of the engine's three reasons fired for this week, or null when
 * none can be reproduced from the documents the phone holds.
 */
export function lighterWeekTrigger(
  week: LighterWeekDoc,
  previous: LighterWeekDoc | null,
  before: LighterWeekDoc | null
): LighterWeekTrigger | null {
  const now = reading(week);
  if (now === undefined) return null;
  const recovery = num(week.breakdown?.recoveryScore) ?? CLEAR;
  const adherence = num(week.breakdown?.adherenceScore) ?? CLEAR;
  if (shouldRecommendDeload(now, recovery, CLEAR)) return "recovery";
  if (
    shouldRecommendDeload(now, CLEAR, CLEAR, reading(previous), reading(before))
  ) {
    return "sustained";
  }
  if (shouldRecommendDeload(now, CLEAR, adherence)) return "slipping";
  return null;
}

type Sport = "lifting" | "running";

/** The sport furthest over its usual week, with its per cent; or, with no
 *  usual week to compare with, the sport the week was trained in. */
function furthestOver(week: LighterWeekDoc): {
  sport: Sport | "both";
  pct: number | null;
} {
  const agg = week.aggregates ?? {};
  const base = week.baseline ?? {};
  const lifted = (num(agg.liftSessions) ?? 0) > 0;
  const ran = (num(agg.runSessions) ?? 0) > 0;
  const comparable = (num(base.weeksUsed) ?? 0) >= 2;
  const over: { sport: Sport; pct: number }[] = [];
  const usualKg = num(base.liftTonnage) ?? 0;
  const usualKm = num(base.runKm) ?? 0;
  if (comparable && lifted && usualKg > 0) {
    over.push({
      sport: "lifting",
      pct: Math.round(((num(agg.liftTonnage) ?? 0) / usualKg - 1) * 100),
    });
  }
  if (comparable && ran && usualKm > 0) {
    over.push({
      sport: "running",
      pct: Math.round(((num(agg.runKm) ?? 0) / usualKm - 1) * 100),
    });
  }
  const top = over.filter((o) => o.pct > 0).sort((a, b) => b.pct - a.pct)[0];
  if (top) return top;
  return {
    sport:
      lifted && ran ? "both" : lifted ? "lifting" : ran ? "running" : "both",
    pct: null,
  };
}

const DID: Record<Sport | "both", string> = {
  lifting: "lifted",
  running: "ran",
  both: "trained",
};
const HAVE_DONE: Record<Sport | "both", string> = {
  lifting: "lifted",
  running: "run",
  both: "trained",
};

/** Why, in the sport that carried the week, with its number and what it
 *  is compared with (CODING_STANDARDS' measured words rules: the person
 *  does the training, never "load"). */
function whyLine(
  trigger: LighterWeekTrigger | null,
  week: LighterWeekDoc
): string {
  const { sport, pct } = furthestOver(week);
  const more =
    pct !== null ? `You ${DID[sport]} ${pct}% more than your usual week` : null;
  switch (trigger) {
    case "recovery":
      return more
        ? `${more}, and your recovery score is low.`
        : "Your recovery score is low after a hard week.";
    case "sustained":
      return `You’ve ${HAVE_DONE[sport]} well above your usual week two weeks in a row.`;
    case "slipping":
      return more
        ? `${more} while missing your plan’s targets.`
        : `You ${DID[sport]} hard while missing your plan’s targets.`;
    default:
      return more ? `${more}.` : "Your last 7 days point to a lighter week.";
  }
}

/** What taking one does, for the plan the person has. */
function whatItDoes(plan: { lifts: boolean; runs: boolean }): string {
  if (plan.lifts && plan.runs) {
    return "A lighter week halves your sets and shortens your runs.";
  }
  if (plan.lifts)
    return "A lighter week halves your sets, at the same weights.";
  if (plan.runs) return "A lighter week makes each run left a step shorter.";
  return "";
}

/**
 * The one lighter-week decision: an offer with its words, or null.
 */
export function lighterWeekOffer(input: {
  /** The newest performance document. */
  week: LighterWeekDoc | null | undefined;
  /** The one 7 days before it, and 14 (the weekly series' picks). */
  previous?: LighterWeekDoc | null;
  before?: LighterWeekDoc | null;
  /** What the plan holds this week, for what a lighter week does. */
  plan: { lifts: boolean; runs: boolean };
  /** `lighterWeekAllowed(programState)`: Train's menu offers one now. */
  lighterWeekAllowed: boolean;
  /** `programState.runPlan.currentWeek`; absent without a race plan. */
  currentWeek: number | undefined;
  /** `programState.runPlan.totalWeeks`; absent without a race plan. */
  totalWeeks: number | undefined;
  /** The race's distance; absent without a race plan. */
  distance: "5k" | "10k" | "half" | "marathon" | undefined;
}): LighterWeekOffer | null {
  const { week } = input;
  if (!week || !resolveDeloadRecommended(week)) return null;
  // Only a lighter week that can be taken: the banner's button sends the
  // menu's command, which the server refuses otherwise (Lift4 (9)).
  if (!input.lighterWeekAllowed) return null;
  // "Taper IS the deload; no double-deload" (P1d pin 2).
  if (
    isCurrentWeekInRaceWindDown(
      input.currentWeek,
      input.totalWeeks,
      input.distance
    )
  ) {
    return null;
  }
  const trigger = lighterWeekTrigger(
    week,
    input.previous ?? null,
    input.before ?? null
  );
  const why = whyLine(trigger, week);
  const reason = [why, whatItDoes(input.plan)].filter(Boolean).join(" ");
  return { trigger, why, reason };
}
