/**
 * Experience auto-detection — suggests a training-level change from what the
 * lifter's own history shows, instead of trusting the onboarding answer
 * forever.
 *
 * ── Why ───────────────────────────────────────────────────────────────────
 *
 * `profile.experience` is self-reported once and never revisited. The
 * literature's definition is behavioural, not biographical: a novice is
 * someone who progresses session-to-session (Rippetoe/Baker's classic
 * operationalization; Helms frames the same boundary as "when session-to-
 * session load increases stop, move to weekly progression"). Both mislabels
 * cost the user real progress:
 *
 *   - A stored BEGINNER whose linear progress has exhausted keeps a toolset
 *     built for session-to-session gains — no undulation, load-cut deloads —
 *     after the stimulus stopped working. The intermediate tools exist for
 *     exactly this moment.
 *   - A stored INTERMEDIATE who is still adding load every session (common:
 *     people over-rate themselves at onboarding) is having the one signal a
 *     novice programme runs on — did today beat last time? — muddied by
 *     undulation that exists for a problem they don't have yet.
 *
 * ── What it reads ─────────────────────────────────────────────────────────
 *
 * MAIN lifts only (`isAccessory !== true`) — mains are the progression
 * anchor and the only slots whose history reflects the progression scheme.
 * Progress is measured as **e1RM** (`epley1RMExact`), never raw load: on
 * double progression the weight is flat while the rep target climbs, and
 * that IS progress — a weight-only comparison would misread every
 * double-progression main as permanently stalled.
 *
 * ── A stall is AMBIGUOUS evidence, and the gates exist to disambiguate ───
 *
 * A flat e1RM window can mean four different things: accumulated fatigue
 * (needs a deload), a calorie deficit (holding strength IS the win there —
 * Helms), inconsistent training (detraining between sessions), or genuine
 * phase exhaustion. Only the last one justifies a level change, and the
 * v2 gates require the other three to be ruled out before anything fires:
 *
 *   - RESET-SURVIVAL (Rippetoe, Practical Programming): the novice-stall
 *     protocol is "miss reps 2–3 workouts in a row → back off ~10% →
 *     rebuild", and only stalls that SURVIVE reset cycles end the phase.
 *     The window must contain a ≥4% load dip whose rebuild never exceeded
 *     the pre-dip e1RM high — a reset was tried and did not restart
 *     progress. No dip in evidence = a plain deload candidate = silence.
 *   - HONEST MISSES: ≥2 sessions under the rep target per lift. Both
 *     progression engines advance a compliant lifter automatically, so a
 *     flat all-hits window is the engine holding (RPE gate, deload week),
 *     never exhaustion.
 *   - DEFICIT GATE: nutritionGoal "cut" suppresses promotion outright — a
 *     stall in a deficit is expected physiology.
 *   - CONSISTENCY + MATURITY: the 6-session window must sit inside 21–84
 *     days (scattered sessions are detraining, not a ceiling), and the
 *     programme must be ≥6 weeks old (one full mesocycle incl. its
 *     calendar deload). Level is a months-scale judgement — the novice
 *     phase alone typically runs 3–9 months.
 *
 * Mechanics shared with v1, still in force:
 *   - Stall compares max-of-halves, not endpoints, so a window ENDING on a
 *     deload session can't fake a stall.
 *   - The climb streak tolerates ONE negative delta (4 of 5 positive) plus
 *     a ≥5% total-gain floor so flat-line jitter never passes.
 *   - Bodyweight / uncalibrated records (weight 0) are excluded — no load
 *     signal to classify.
 *   - ≥2 DISTINCT lifts must agree. Cold-start users get null.
 *
 * ── What it deliberately does not do ──────────────────────────────────────
 *
 *   - Never suggests ADVANCED. "Advanced" is not detectable from a 10-record
 *     window (its operational definition is monthly-scale progress), and the
 *     advanced gates only ADD tools (RPE display, advanced variations) — the
 *     cost of a self-selected mislabel is low. Self-selection stands.
 *   - Never suggests anything to a stored ADVANCED user. Post-layoff regain
 *     climbs e1RM fast for everyone; reading that as "you're a beginner" for
 *     someone who chose the advanced toolset would be wrong more often than
 *     right.
 *   - Never CHANGES the level. The suggestion surfaces evidence and links to
 *     the plan editor — the blocks' no-silent-rewrite rule, applied here.
 */
import { epley1RMExact } from "@/lib/analytics";
import { toExperience } from "./experienceModel";
import type { Experience } from "./programTypes";
import type {
  PerformanceRecord,
  ProgramExercise,
  WorkoutDay,
} from "./programTypes";

/** Sessions of evidence required per lift. */
export const MIN_RECORDS_PER_LIFT = 6;
/** The evidence window must cover at least this many days. */
export const MIN_SPAN_DAYS = 21;
/**
 * …and at most this many. Six sessions scattered across four months is
 * inconsistency (missed weeks, detraining and re-adapting), not an adaptive
 * ceiling — a stall is only evidence of phase exhaustion when the training
 * that produced it was consistent.
 */
export const MAX_SPAN_DAYS = 84;
/** Distinct main lifts that must agree before anything is suggested. */
export const MIN_AGREEING_LIFTS = 2;
/**
 * Genuine failed sessions (reps completed under target) required per lift
 * before a stall reads as phase exhaustion. Under both progression engines a
 * compliant lifter progresses AUTOMATICALLY (double climbs the target,
 * linear microloads on success), so a real weighted stall necessarily
 * contains misses — Rippetoe's trigger is "misses reps two or three
 * workouts in a row", not "the number stopped moving".
 */
export const MIN_FAILED_SESSIONS = 2;
/**
 * A load dip of at least this fraction inside the window reads as a RESET
 * (the engine's 5% backoff, a calendar deload's 15% cut, or a manual
 * back-off). Rippetoe's novice-exhaustion protocol requires the stall to
 * SURVIVE resets: back off ~10%, rebuild, and only conclude the phase is
 * over after 2–3 such cycles fail to set new highs. A stall with no reset
 * in evidence is indistinguishable from "needs a deload" — the suggestion
 * must not fire on it.
 */
export const RESET_DIP_FRACTION = 0.04;
/**
 * Programme weeks that must have elapsed before a promotion is suggested.
 * Week 6 guarantees at least one full mesocycle including its calendar
 * deload has run — level changes are a months-scale judgement, and the
 * novice phase alone typically spans 3–9 months of consistent training.
 */
export const MIN_PROGRAM_WEEKS = 6;
/** ≤0.5% gain between window halves reads as no meaningful progress. */
export const STALL_TOLERANCE = 1.005;
/** Of the 5 session-to-session deltas in the window, this many must rise. */
export const CLIMB_MIN_POSITIVE_DELTAS = 4;
/** …and the window's total e1RM gain must clear 5%. */
export const CLIMB_MIN_TOTAL_GAIN = 1.05;

export interface ExperienceEvidence {
  exerciseId: string;
  name: string;
  /** Sessions in the evidence window. */
  sessions: number;
  /** Days between the window's first and last session. */
  spanDays: number;
  /** e1RM change across the window, percent (rounded to 0.1). */
  deltaPct: number;
  /** Sessions in the window where reps came in under target. */
  failedSessions: number;
  /** A ≥RESET_DIP_FRACTION load dip occurred and the rebuild never
   *  exceeded the pre-dip e1RM high — a reset was tried and did not
   *  restart progress (the Rippetoe criterion). */
  resetSurvived: boolean;
}

export interface ExperienceSuggestion {
  /** The level the evidence points to. */
  to: "beginner" | "intermediate";
  reason: "linear_progress_exhausted" | "novice_window_active";
  evidence: ExperienceEvidence[];
}

/** Stable identity for dismissal — a dismissed signature stays dismissed. */
export function suggestionSignature(s: ExperienceSuggestion): string {
  return `${s.to}:${s.reason}`;
}

/**
 * Programme context the promotion gates read. Optional fields fail SAFE:
 * an absent weekNumber blocks promotion (maturity unprovable), an absent
 * goal does not block (no evidence of a deficit).
 */
export interface ExperienceDetectionContext {
  /** programState.weekNumber — programme tenure. */
  weekNumber?: number;
  /** programState.goal / profile nutrition goal — "cut" suppresses
   *  promotion: in a deficit, holding strength IS the win (Helms), and a
   *  stall there is expected physiology rather than phase exhaustion. */
  nutritionGoal?: string;
}

interface LiftAssessment {
  stalled: boolean;
  climbing: boolean;
  evidence: ExperienceEvidence;
}

function localDateMs(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function assessLift(ex: ProgramExercise): LiftAssessment | null {
  const valid = (ex.performanceHistory ?? []).filter(
    (r: PerformanceRecord) =>
      r.weight > 0 && r.repsCompleted > 0 && localDateMs(r.date) !== null
  );
  if (valid.length < MIN_RECORDS_PER_LIFT) return null;
  const window = valid.slice(-MIN_RECORDS_PER_LIFT);
  const first = localDateMs(window[0].date);
  const last = localDateMs(window[window.length - 1].date);
  if (first === null || last === null) return null;
  const spanDays = Math.round((last - first) / (24 * 60 * 60 * 1000));
  if (spanDays < MIN_SPAN_DAYS || spanDays > MAX_SPAN_DAYS) return null;

  const e1rms = window.map((r) => epley1RMExact(r.weight, r.repsCompleted));
  const half = MIN_RECORDS_PER_LIFT / 2;
  const earlyMax = Math.max(...e1rms.slice(0, half));
  const lateMax = Math.max(...e1rms.slice(half));
  const flat = lateMax <= earlyMax * STALL_TOLERANCE;

  // Genuine misses — reps under target. Both progression engines advance a
  // compliant lifter automatically, so a flat-but-all-hit window is the
  // engine holding (RPE gates, deload week), never phase exhaustion.
  const failedSessions = window.filter(
    (r) => r.repsCompleted < r.repsTarget
  ).length;

  // Reset-survival (Rippetoe): find a ≥RESET_DIP_FRACTION load dip and ask
  // whether the rebuild after it ever exceeded the pre-dip e1RM high. A
  // calendar deload in a PROGRESSING run is followed by new highs, so it
  // does not read as survived; a reset that rebuilt to the same ceiling
  // does. No dip at all = no reset tried = a plain deload candidate.
  let resetSurvived = false;
  let priorMaxWeight = window[0].weight;
  let priorMaxE1rm = e1rms[0];
  for (let i = 1; i < window.length; i++) {
    if (window[i].weight <= priorMaxWeight * (1 - RESET_DIP_FRACTION)) {
      const postDipMaxE1rm = Math.max(...e1rms.slice(i));
      if (postDipMaxE1rm <= priorMaxE1rm * STALL_TOLERANCE) {
        resetSurvived = true;
        break;
      }
    }
    if (window[i].weight > priorMaxWeight) priorMaxWeight = window[i].weight;
    if (e1rms[i] > priorMaxE1rm) priorMaxE1rm = e1rms[i];
  }

  // The full phase-exhaustion read: flat despite honest misses AND a reset
  // that failed to restart progress. Flat alone is a deload candidate.
  const stalled =
    flat && failedSessions >= MIN_FAILED_SESSIONS && resetSurvived;

  let positiveDeltas = 0;
  for (let i = 1; i < e1rms.length; i++) {
    if (e1rms[i] > e1rms[i - 1]) positiveDeltas += 1;
  }
  const totalGain = e1rms[e1rms.length - 1] / e1rms[0];
  const climbing =
    positiveDeltas >= CLIMB_MIN_POSITIVE_DELTAS &&
    totalGain >= CLIMB_MIN_TOTAL_GAIN;

  return {
    stalled,
    climbing,
    evidence: {
      exerciseId: ex.exerciseId,
      name: ex.name,
      sessions: window.length,
      spanDays,
      deltaPct: Math.round((lateMax / earlyMax - 1) * 1000) / 10,
      failedSessions,
      resetSurvived,
    },
  };
}

/**
 * Read the current programme's main-lift histories and return the level the
 * evidence supports, or null when the evidence is absent, insufficient, or
 * agrees with the stored level.
 */
export function detectExperienceSuggestion(
  workouts: readonly WorkoutDay[] | undefined,
  storedExperience: Experience | string | undefined,
  context: ExperienceDetectionContext = {}
): ExperienceSuggestion | null {
  const stored = toExperience(
    typeof storedExperience === "string" ? storedExperience : undefined
  );
  // Advanced users chose the full toolset; a trailing window cannot
  // distinguish a genuine novice from a post-layoff regain. Leave them be.
  if (stored === "advanced") return null;
  if (!workouts || workouts.length === 0) return null;

  // Best assessment per DISTINCT lift — the same exercise can hold two
  // weekly slots with separate histories; one qualifying slot is enough.
  const byLift = new Map<string, LiftAssessment>();
  for (const day of workouts) {
    for (const ex of day.exercises) {
      if (ex.isAccessory === true) continue;
      const assessed = assessLift(ex);
      if (!assessed) continue;
      const prior = byLift.get(ex.exerciseId);
      // Prefer the slot showing the signal we'd act on, so a lift training
      // twice a week isn't disqualified by its lighter slot.
      if (!prior || assessed.stalled || assessed.climbing) {
        byLift.set(ex.exerciseId, assessed);
      }
    }
  }

  const assessments = [...byLift.values()];
  if (stored === "beginner") {
    // Promotion gates that sit ABOVE the per-lift evidence:
    //  - programme maturity: at least one full mesocycle incl. its calendar
    //    deload must have run. Unprovable (no weekNumber) fails safe.
    //  - deficit: a stall in a cut is expected physiology, not phase
    //    exhaustion — suppressed outright rather than caveated.
    if ((context.weekNumber ?? 0) < MIN_PROGRAM_WEEKS) return null;
    if (context.nutritionGoal === "cut") return null;
    const stalledLifts = assessments.filter((a) => a.stalled);
    if (stalledLifts.length >= MIN_AGREEING_LIFTS) {
      return {
        to: "intermediate",
        reason: "linear_progress_exhausted",
        evidence: stalledLifts.map((a) => a.evidence),
      };
    }
    return null;
  }

  // stored === "intermediate"
  const climbingLifts = assessments.filter((a) => a.climbing);
  if (climbingLifts.length >= MIN_AGREEING_LIFTS) {
    return {
      to: "beginner",
      reason: "novice_window_active",
      evidence: climbingLifts.map((a) => a.evidence),
    };
  }
  return null;
}
