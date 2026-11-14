/**
 * Readiness: a word for today and the fact behind it (whole-app grill,
 * 13 November 2026). The owner's answers it follows:
 *
 *   - Q40: sleep and heart data may offer an easier session; they never
 *     change the plan by themselves.
 *   - Q41: it works with no watch, from training and a one-tap "how do you
 *     feel"; sleep and heart data sharpen it.
 *   - Q42 (and Q74, recommended, waiting on the owner): words, not a score.
 *     A score claims a precision the evidence does not have: training by
 *     heart rate variability has small, mostly non-significant effects
 *     for running and none shown for strength.
 *   - Q46 and Q76 (recommended, waiting on the owner): what protects a
 *     person is free, so the training reasons, the question and the easier
 *     session are free; sleep and heart are Pro. That split lives in the
 *     caller, which passes `body: null` for a free account.
 *
 * And Lift4 (5 October 2026), which this keeps: the app says what it knows
 * and never guesses. So every word comes with a fact the person can check
 * ("5 h 40 min of sleep last night", "You said you’re tired"), and with
 * nothing known there is no word at all: the card asks how you feel
 * instead of calling someone "Ready" on no evidence.
 *
 * The thresholds are Tropos's own, chosen to fire on a clear change from
 * the person's usual rather than on day-to-day noise; none is a clinical
 * cut-off.
 *
 * Pure: no React, no clock, no storage. The answer to the question is kept
 * on the phone for the day (`readinessFeel.ts`), and nothing here is sent
 * anywhere.
 */
import { formatDuration } from "@/utils/formatters";

export type Feel = "good" | "tired" | "rough";
export type ReadinessWord = "Ready" | "Steady" | "Go easy";

/** Sleep and heart, from Apple Health, for a Pro account. */
export interface BodySignals {
  /** Minutes asleep last night; null when none was recorded. */
  sleepMinutes: number | null;
  /** The usual night in minutes; null until there are enough nights. */
  usualSleepMinutes: number | null;
  restingHr: number | null;
  usualRestingHr: number | null;
  /** Heart rate variability, in ms (Apple's SDNN). */
  hrv: number | null;
  usualHrv: number | null;
}

export interface ReadinessInput {
  /** This morning's answer, or null when not answered today. */
  feel: Feel | null;
  /** A hard run (intervals, tempo, a race or a long run) yesterday. */
  hardRunYesterday: boolean;
  /** A lift that loaded the legs yesterday. */
  legDayYesterday: boolean;
  /** Today's lift loads the legs. */
  todayLoadsLegs: boolean;
  /** Today's run is a hard one (intervals, tempo or a long run). */
  todayHardRun: boolean;
  /** Null for a free account, off the phone, or before Health is connected. */
  body: BodySignals | null;
}

export type ReasonKind =
  | "feel"
  | "sleep"
  | "resting_hr"
  | "hrv"
  | "hard_run_yesterday"
  | "leg_day_yesterday";

export interface ReadinessReason {
  kind: ReasonKind;
  /** "strong" alone makes the day Go easy; two "mild" do too. */
  weight: "mild" | "strong";
  /** The fact, in words the person can check. */
  text: string;
}

export interface Readiness {
  /** Null when nothing is known: ask how they feel instead. */
  word: ReadinessWord | null;
  /** The line under the word: the strongest reason, or what was in range. */
  line: string | null;
  /** Every reason that fired, strongest first. */
  reasons: ReadinessReason[];
  /** Whether to offer the easier session (Steady and Go easy). */
  offerEasier: boolean;
}

/** Under this, a night is short whatever the person's usual. */
export const SHORT_NIGHT_MINUTES = 6 * 60;
/** Under this, a night alone makes the day Go easy. */
export const VERY_SHORT_NIGHT_MINUTES = 5 * 60;
/** A night this far under the usual counts as short. */
export const SLEEP_SHORTFALL_MINUTES = 90;
/** Resting heart rate this many beats over the usual is a mild reason… */
export const RESTING_HR_RISE_MILD = 5;
/** …and this many is a strong one. */
export const RESTING_HR_RISE_STRONG = 8;
/** Heart rate variability under this share of the usual is a mild reason.
 *  Never strong: the evidence for acting on it is the weakest of the three. */
export const HRV_DROP_SHARE = 0.8;

function sleepText(minutes: number, usual: number | null): string {
  const night = `${formatDuration(minutes * 60)} of sleep last night`;
  return usual != null && usual - minutes >= SLEEP_SHORTFALL_MINUTES
    ? `${night}, against your usual ${formatDuration(usual * 60)}`
    : night;
}

function bodyReasons(body: BodySignals): ReadinessReason[] {
  const out: ReadinessReason[] = [];
  const { sleepMinutes: sleep, usualSleepMinutes: usualSleep } = body;
  if (sleep != null) {
    if (sleep < VERY_SHORT_NIGHT_MINUTES) {
      out.push({ kind: "sleep", weight: "strong", text: sleepText(sleep, usualSleep) });
    } else if (
      sleep < SHORT_NIGHT_MINUTES ||
      (usualSleep != null && usualSleep - sleep >= SLEEP_SHORTFALL_MINUTES)
    ) {
      out.push({ kind: "sleep", weight: "mild", text: sleepText(sleep, usualSleep) });
    }
  }
  const { restingHr: rhr, usualRestingHr: usualRhr } = body;
  if (rhr != null && usualRhr != null) {
    const rise = rhr - usualRhr;
    if (rise >= RESTING_HR_RISE_MILD) {
      out.push({
        kind: "resting_hr",
        weight: rise >= RESTING_HR_RISE_STRONG ? "strong" : "mild",
        text: `Resting heart rate ${Math.round(rhr)}, against your usual ${Math.round(usualRhr)}`,
      });
    }
  }
  const { hrv, usualHrv } = body;
  if (hrv != null && usualHrv != null && hrv < usualHrv * HRV_DROP_SHARE) {
    out.push({
      kind: "hrv",
      weight: "mild",
      text: `Heart rate variability ${Math.round(hrv)} ms, under your usual ${Math.round(usualHrv)} ms`,
    });
  }
  return out;
}

/** What was in range, for a Ready day: only facts that were read. */
function inRangeLine(body: BodySignals | null): string | null {
  if (!body) return null;
  const parts: string[] = [];
  if (body.sleepMinutes != null) {
    parts.push(`${formatDuration(body.sleepMinutes * 60)} of sleep`);
  }
  if (body.restingHr != null && body.usualRestingHr != null) {
    parts.push("resting heart rate as usual");
  }
  if (parts.length === 0) return null;
  const line = parts.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

const ORDER: Record<ReasonKind, number> = {
  feel: 0,
  sleep: 1,
  resting_hr: 2,
  hrv: 3,
  hard_run_yesterday: 4,
  leg_day_yesterday: 5,
};

export function readinessFor(input: ReadinessInput): Readiness {
  const reasons: ReadinessReason[] = [];
  if (input.feel === "rough") {
    reasons.push({ kind: "feel", weight: "strong", text: "You said you feel rough" });
  } else if (input.feel === "tired") {
    reasons.push({ kind: "feel", weight: "mild", text: "You said you’re tired" });
  }
  if (input.body) reasons.push(...bodyReasons(input.body));
  if (input.hardRunYesterday && input.todayLoadsLegs) {
    reasons.push({
      kind: "hard_run_yesterday",
      weight: "mild",
      text: "Hard run yesterday, and today loads the same legs",
    });
  }
  if (input.legDayYesterday && input.todayHardRun) {
    reasons.push({
      kind: "leg_day_yesterday",
      weight: "mild",
      text: "Leg day yesterday, before today’s hard run",
    });
  }
  reasons.sort(
    (a, b) =>
      (a.weight === b.weight ? 0 : a.weight === "strong" ? -1 : 1) ||
      ORDER[a.kind] - ORDER[b.kind]
  );

  const strong = reasons.some((r) => r.weight === "strong");
  if (strong || reasons.length >= 2) {
    return { word: "Go easy", line: reasons[0].text, reasons, offerEasier: true };
  }
  if (reasons.length === 1) {
    return { word: "Steady", line: reasons[0].text, reasons, offerEasier: true };
  }
  // Nothing fired. Ready only on evidence: a "good" answer, or readings
  // that came back in range.
  const inRange = inRangeLine(input.body);
  if (input.feel === "good") {
    return {
      word: "Ready",
      line: inRange ?? "You said you feel good",
      reasons,
      offerEasier: false,
    };
  }
  if (inRange) {
    return { word: "Ready", line: inRange, reasons, offerEasier: false };
  }
  return { word: null, line: null, reasons, offerEasier: false };
}
