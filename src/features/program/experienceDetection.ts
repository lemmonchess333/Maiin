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
 * ── Robustness decisions, each measured or sourced ───────────────────────
 *
 *   - Stall compares max-of-halves, not endpoints: a calendar deload writes
 *     one week of deliberately lighter records (novice recipe cuts load
 *     15%), and an endpoint comparison landing on a deload session would
 *     fake a stall. The max over each 3-record half skips a 1-week dip.
 *   - The climb streak tolerates ONE negative delta (4 of 5 positive) for
 *     the same reason, but additionally requires ≥5% total e1RM gain so a
 *     jitter around a flat line can't pass.
 *   - Bodyweight / uncalibrated records (weight 0) are excluded — there is
 *     no load signal to classify. A failed set (0 reps completed) is
 *     excluded the same way; `epley1RMExact` scores both as 0.
 *   - Data floors: ≥6 valid records per lift spanning ≥21 days, and ≥2
 *     DISTINCT lifts agreeing. Cold-start users get null — the cold-start
 *     window is a state every new user lives in, and a suggestion with no
 *     evidence behind it teaches the user to dismiss the surface.
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
/** Distinct main lifts that must agree before anything is suggested. */
export const MIN_AGREEING_LIFTS = 2;
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
  if (spanDays < MIN_SPAN_DAYS) return null;

  const e1rms = window.map((r) => epley1RMExact(r.weight, r.repsCompleted));
  const half = MIN_RECORDS_PER_LIFT / 2;
  const earlyMax = Math.max(...e1rms.slice(0, half));
  const lateMax = Math.max(...e1rms.slice(half));
  const stalled = lateMax <= earlyMax * STALL_TOLERANCE;

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
  storedExperience: Experience | string | undefined
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
