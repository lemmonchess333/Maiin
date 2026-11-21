/* ─────────────────────────────────────────────
   Performance card verb + supporting line

   Two client-side utilities consumed by the consolidated PI hero:
   - getVerb(loadBand, deloadRecommended) → 5-state verb taxonomy
   - getLine(state, signals) → tone-aligned data-aware supporting line

   Locked in plan rows PI1 (verb taxonomy + Option U) and PI5 (signals
   contract). See .claude/plans/programme-run-followups.md.

   Why the engine emits `signals` rather than the line text:
   - Copy is hot-deployable (TS file change → Vite deploy, no CF redeploy)
   - i18n-ready (state enum translates; line strings localise client-side)
   - A/B-testable via the standard client-side flag flow
   - Engine still makes the data-aware decisions; client only renders

   Verb-state ↔ verb-string ↔ glow mapping (PI3 lock):
     Recovering (deload band, PI < 25)         → no glow, brand purple
     Building   (low band,    PI 25-44)        → no glow, brand purple
     Cruising   (moderate,    PI 45-69)        → glow 0..0.44, brand
     Sharpening (high,        PI 70-84)        → glow 0.45..0.71, brand
     Backing off (overreach OR deloadRecommended) → no glow, amber
   ───────────────────────────────────────────── */

import type { LoadBand, PerformanceSignals } from "./performanceTypes";
import type { WindowSessions } from "./performanceWeekBreakdown";
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { formatDayMonth, formatDayMonthYear } from "@/utils/formatters";
import {
  MAX_LIFETIME_WEEKS,
  SETTLED_LIFETIME_WEEKS,
} from "./performanceDocFields";

/** Verb-state — categorical state the card communicates. */
export type VerbState =
  "recovering" | "building" | "cruising" | "sharpening" | "backing-off";

/** Human-facing verb strings (English; i18n later). */
export const VERB_LABEL: Record<VerbState, string> = {
  recovering: "Recovering",
  building: "Building",
  cruising: "Steady",
  sharpening: "Sharpening",
  "backing-off": "Backing off",
};

/**
 * Derive verb-state from loadBand + deloadRecommended.
 * Deload override always wins so the verb aligns with InsightStrip's
 * recommendation (no "Sharpening + consider a deload" contradiction).
 */
export function getVerbState(
  loadBand: LoadBand,
  deloadRecommended: boolean
): VerbState {
  if (deloadRecommended || loadBand === "overreach") return "backing-off";
  switch (loadBand) {
    case "deload":
      return "recovering";
    case "low":
      return "building";
    case "moderate":
      return "cruising";
    case "high":
      return "sharpening";
  }
}

/** Convenience: state + label in one call. */
export function getVerb(
  loadBand: LoadBand,
  deloadRecommended: boolean
): { state: VerbState; label: string } {
  const state = getVerbState(loadBand, deloadRecommended);
  return { state, label: VERB_LABEL[state] };
}

/**
 * Tone-aligned data-aware supporting line for the hero card.
 *
 * Data signals (from engine) layer onto the verb-state to produce a
 * specific line. Within each verb-state we cascade from most-specific
 * (data-rich) to least-specific (generic) so the most informative
 * variant fires when its signal is present.
 */
/* The engine's baseline is the average of the weeks trained in the four
   before this one: lifting by kilograms lifted, running by distance. The
   line names both halves, so "18%" is never a figure against nothing. */
const liftingAbove = (s: PerformanceSignals) =>
  `Lifting volume ${Math.round(s.liftAheadOfBaseline * 100)}% above your usual week`;
const runningAbove = (s: PerformanceSignals) =>
  `Running distance ${Math.round(s.runAheadOfBaseline * 100)}% above your usual week`;

const TRAINED_MORE = "You trained more than your usual week";
const STRONG_7_DAYS = "A strong 7 days";

/** Sharpening's sport line: both sports strong, or one well above its
 *  usual week. Null when neither is. */
function sportLine(s: PerformanceSignals): string | null {
  if (s.bothLoadsStrong) return "Lifting and running both strong";
  if (s.liftAheadOfBaseline > 0.15) return liftingAbove(s);
  if (s.runAheadOfBaseline > 0.2) return runningAbove(s);
  return null;
}

/** "You did 3 of 5 planned sessions in these 7 days", "You did 6 sessions
 *  against 5 planned in these 7 days". A count of sessions, as adherence
 *  counts them, named for its window: Home's week runs Monday to Sunday,
 *  and the two counts can differ. */
function sessionCount({ done, planned }: WindowSessions): string {
  const count =
    done > planned
      ? `You did ${done} sessions against ${planned} planned`
      : `You did ${done} of ${planned} planned ${planned === 1 ? "session" : "sessions"}`;
  return `${count} in these 7 days`;
}

/**
 * What was off the plan when adherence is weak (`adherenceWeak`, under 50).
 *
 * Adherence is the sessions against the plan and the food against its
 * targets (calories and protein, once food is logged on 3 days), averaged
 * (`computeAdherenceScore`). The usual week is in neither. The signals
 * carry only the average, so the sessions are counted here and the food
 * is read from what is left:
 *
 *   - half the plan or more done, and food counted: the sessions score 50
 *     or more, so an average under 50 needs the food under 50 too. Say
 *     both.
 *   - under half: the sessions alone can make it weak, and nothing here
 *     tells whether the food was off as well. Say the count only.
 *   - food not counted (under 3 days): the score had no food in it, so
 *     say nothing of it, whatever the count. Only a plan changed since
 *     the score reaches this with half done.
 *   - no plan to count against: say both, as one or the other.
 */
function offPlanLine(sessions: WindowSessions | null): string {
  if (!sessions) return "Your sessions or food were well off your plan";
  const count = sessionCount(sessions);
  return sessions.foodCounted && sessions.done * 2 >= sessions.planned
    ? `${count}, with food well off your targets`
    : count;
}

/** What the lead's line is told beside the signals. */
export interface LineEvidence {
  /** The 7 days' own figures held more training than the usual week
   *  (`trainedMoreThanUsual`). The band is the whole score, so it is no
   *  proof: 100% of the usual week scores high. Absent reads as not. */
  trainedMore?: boolean;
  /** The 7 days' sessions against the plan (`sessionsAgainstPlan`).
   *  Absent or null when the plan's count is not known or not the plan's
   *  this week (`plannedForWindow`). */
  sessions?: WindowSessions | null;
}

/**
 * The supporting line while the baseline is still forming
 * (`isEstablishingBaseline`): PI1's low-confidence state, "full ring + PI +
 * verb, but supporting line uses sparse-data variants". Every data-aware
 * line in `getLine` compares the week with "your usual week", the average
 * of the weeks before it, and a new account has none, so "Fewer sessions
 * than usual" on day three and "97% above your usual week" on day seven
 * compared a first week with nothing. The card says "Early read" in the
 * verb's place here (`PerformanceSection`), as the Performance page's
 * gauge did before Trim1 call 5 made the card the one place the score
 * is shown.
 */
export function getEstablishingLine(signals: PerformanceSignals): string {
  if (signals.daysSinceLastTraining > 7)
    return "Re-engaging. Log a session to refresh";
  return (signals.lifetimeWeeks ?? 0) <= 1
    ? "Establishing your week"
    : "Settling in";
}

/* A line describes the score's window, seven days ending on its compute
   date, which the card names above it ("Last 7 days", `scoreWindowLabel`);
   so no line calls that window a week, and "this week" means Monday to
   Sunday (App1 Q13). Whether to ease off is the line under the bars
   (`takeMoreLine`), not these. The person does the training: a line is
   about you, never about "load" (CODING_STANDARDS, the measured rules). */
export function getLine(
  state: VerbState,
  signals: PerformanceSignals,
  { trainedMore = false, sessions = null }: LineEvidence = {}
): string {
  switch (state) {
    /* The engine backs off for four reasons (`shouldRecommendDeload` and
       the overreach band): recovery under 45 at 80 or more, adherence
       under 50 at 70 or more, 85 or more two weeks running, or 85 or
       more this week. "More than your usual week" is none of them, so it
       is said only on the week's own figures; otherwise the line says
       the reason the signals show. */
    case "backing-off":
      // The recovery factor is built from food logged, the weight trend
      // and the number of sessions (`computeRecoveryScore`).
      if (signals.recoveryWeak)
        return "Your recovery reads low from food, weight and sessions";
      if (trainedMore) return TRAINED_MORE;
      if (signals.adherenceWeak) return offPlanLine(sessions);
      return sportLine(signals) ?? STRONG_7_DAYS;

    case "sharpening":
      return sportLine(signals) ?? (trainedMore ? TRAINED_MORE : STRONG_7_DAYS);

    case "cruising":
      if (signals.adherenceWeak) return offPlanLine(sessions);
      /* LIFT-EV-10, copy half. A week containing only ONE discipline caps the
         composite load score at 68 (recomp) — `computeLiftLoadScore` returns 0
         for zero sessions and the halves are weighted 0.5/0.5 — so a marathon
         peak-block week lands HERE rather than in "sharpening", whatever was
         actually run. Measured: 70 km and 110 km of running with no lifting
         both score 68 (`singleDisciplineWeek.test.ts`).

         The engine already computes `runAheadOfBaseline` and
         `liftAheadOfBaseline`; the lines that say them just lived in a band
         these weeks cannot reach, so a 110 km week was described as "holding a
         steady rhythm". Consulting the same signals here is what stops the
         card being silent about the biggest thing in the week.

         The SCORE is deliberately untouched — see the note at the bottom of
         this file. This makes the words honest, not the number different. */
      if (signals.runAheadOfBaseline > 0.2) return runningAbove(signals);
      if (signals.liftAheadOfBaseline > 0.15) return liftingAbove(signals);
      /* Sessions missed with food on target keep adherence over 50 (the
         food's two factors hold it up), and Steady said "Holding a steady
         rhythm" over 3 of 5 planned sessions. The count is the true line,
         when the count is the plan's (`plannedForWindow`). */
      if (sessions && sessions.done < sessions.planned)
        return sessionCount(sessions);
      return "Holding a steady rhythm";

    case "building":
      // Returning user (has lifetime data) vs new user (no baseline yet)
      if (signals.lifetimeWeeks >= 4) return "Building back up";
      return "Establishing your week";

    case "recovering":
      // Recently active recovery vs lapsed/sick gap
      if (signals.daysSinceLastTraining > 7)
        return "Nothing logged in these 7 days. Log when you’re back";
      return "A light 7 days, under your usual week";
  }
}

/** The line under the bars until the usual week has formed: when it will,
 *  in `isEstablishingBaseline`'s own numbers. */
export const USUAL_WEEK_FORMING = `Your usual week forms once you’ve trained in ${SETTLED_LIFETIME_WEEKS} of ${MAX_LIFETIME_WEEKS} weeks. Until then, follow your plan`;

/**
 * Whether you can take more (App1 Q10), said on the card under the bars.
 *
 * The engine's rule and nothing beyond it. It says ease off in one way,
 * "Backing off" (the overreach band, or its deload flag); every other
 * verdict carries no such sign, which is a reason to carry on with the
 * plan and not one to add to it, because nothing in the engine weighs
 * extra sessions. `null` is the verdict while the baseline forms ("Early
 * read"), when there is no usual week to judge against yet.
 */
export function takeMoreLine(state: VerbState | null): string {
  if (state === null) return USUAL_WEEK_FORMING;
  if (state === "backing-off") return "Ease off this week rather than add more";
  return "No sign to ease off. Carry on with your plan";
}

/**
 * What the score's window is called (App1 Q13: "This week" means Monday to
 * Sunday everywhere; the score's window is labelled "last 7 days"). The
 * window is the seven days ending on its document's compute date, not a
 * Monday. One that ended today or yesterday is the last 7 days; an older
 * one, which someone back after a break keeps until they train, is named
 * by its last day, with its year when that is not this year's.
 */
export function scoreWindowLabel(computeKey: string, today: Date): string {
  const yesterday = localDateString(addLocalDays(today, -1));
  if (computeKey >= yesterday) return "Last 7 days";
  const end = parseLocalDate(computeKey);
  return `7 days to ${
    end.getFullYear() === today.getFullYear()
      ? formatDayMonth(end)
      : formatDayMonthYear(end)
  }`;
}

/** Empty-state line (no perf doc yet, before the first log). It names what
 *  the lead shows, the 7 days against the usual week, not the 0–100 score,
 *  which is one of its details (App1 Q10). */
export const EMPTY_STATE_LINE =
  "Your last 7 days against your usual week appear after your first session";

/** The same slot, once a session EXISTS but no index has been written. */
export const PENDING_STATE_HEADLINE = "Performance is still catching up";
export const PENDING_STATE_LINE =
  "Your last 7 days appear here shortly after a session is saved";

export interface PerformanceEmptyCopy {
  headline: string;
  sub: string;
  /** "Start a workout" is the right nudge only when nothing is logged. */
  showAction: boolean;
}

/**
 * Which empty state the Performance slot should show.
 *
 * Both surfaces that render it — Home's hero card and Analytics' section —
 * key off `!currentWeek`, i.e. NO performance doc. That condition has two
 * causes and they need different sentences:
 *
 *   - nothing logged at all. "No sessions logged yet" is true, and
 *     "Start a workout" is the thing to do.
 *   - a session IS logged and the doc has not been written yet. The doc
 *     comes from the server (`onWorkoutCreated` / `onRunCreated` recompute
 *     performance), so between saving a first session and that trigger
 *     landing, the old copy told a user who had just finished their first
 *     workout that they had logged nothing. There is also nothing for them
 *     to do, so the action is dropped rather than repeated.
 *
 * Narrow window, but every user passes through it, at the moment they are
 * most invested — they just trained and came to look. Same latency class as
 * the badge award.
 *
 * Note this is NOT the lapsed-user case: `currentWeek` is the newest doc
 * with no date filter, so someone who trained months ago keeps theirs and
 * never reaches either branch.
 */
export function performanceEmptyCopy(
  hasLoggedSession: boolean
): PerformanceEmptyCopy {
  return hasLoggedSession
    ? {
        headline: PENDING_STATE_HEADLINE,
        sub: PENDING_STATE_LINE,
        showAction: false,
      }
    : {
        headline: "No sessions logged yet",
        sub: EMPTY_STATE_LINE,
        showAction: true,
      };
}

/* ─────────────────────────────────────────────
   LIFT-EV-10 — what this file does NOT fix

   The ledger row names a second option: renormalise the load weighting onto
   the trained discipline when the other has zero sessions. That is left
   undone, deliberately, and the reasoning belongs next to the code rather
   than only in a PR.

   The scoring behaviour is defensible on its own terms. `bl.liftTonnage` is a
   mean over the athlete's own active weeks, so a week that drops lifting
   genuinely carries less composite load than their normal week, and the PI is
   a load score. Renormalising would make it answer a different question —
   "how hard was the training you DID do" — for every user, and would raise the
   score of every athlete who skips a discipline. That is a product decision
   with no user signal behind it, and the row records it as an owner decision
   for exactly that reason.

   What was NOT defensible was the copy. "Holding a steady rhythm" is not a
   description of a 110 km week by any reading, and the app already had the
   number that says otherwise.

   Still open, and unaddressed here: with the ceiling at 68 (recomp) / 58
   (lean bulk) and both live deload triggers gating on PI >= 80, a
   single-discipline week can never be offered a deload. Fixing that needs the
   trigger to read discipline-specific load rather than the composite, which is
   a design decision, not a copy one.
   ───────────────────────────────────────────── */
