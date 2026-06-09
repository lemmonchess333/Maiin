/**
 * taperNutrition — the ONE forward-looking calorie move in the system.
 *
 * Per the two-loop model, calories are otherwise flat (slow loop) and training
 * never moves them day-to-day. The race TAPER is the single sanctioned bridge:
 * as planned volume drops in the weeks before a race, the calorie target
 * contracts and the split shifts toward carbs; in the final few days it flips
 * to a carb-LOAD. This module is pure + timezone-stable (all local-date math)
 * and is a hard no-op for anyone not in an active race-prep taper.
 *
 * It also defines the dates that must be EXCLUDED from adaptive-TDEE estimation
 * (taper + race + ~1 week post-race), so glycogen/water swings and the reduced
 * taper intake don't poison the learned maintenance estimate.
 */
import { parseLocalDate, localDateString } from "./dateHelpers";
import { TAPER_WEEKS_BY_DISTANCE } from "@/features/program/runScheduler";
import type { UserProfile } from "./auth";

/** Taper calorie contraction band (fraction of base), deeper toward the race. */
export const TAPER_CUT_MIN = 0.05;
export const TAPER_CUT_MAX = 0.1;
/** Final days before the race that flip to a carb-LOAD (incl. race day). */
export const CARB_LOAD_DAYS = 2; // race day (0), -1, -2 → 3 carb-load days
/** Glycogen-loading calorie bump on carb-load days (fraction of base). */
export const CARB_LOAD_BUMP = 0.05;
/** Days AFTER the race still excluded from adaptive estimation. */
export const POST_RACE_EXCLUDE_DAYS = 7;
/** Fallback taper length when the race distance is unrecognised. */
const DEFAULT_TAPER_WEEKS = 2;

export type TaperPhase = "taper" | "carb_load" | "race";

export interface TaperOverride {
  phase: TaperPhase;
  /** Calorie target after the taper move (the ring number during taper). */
  taperedCalories: number;
  /** True on the final-days carb-load (drives carb-load copy + the bump). */
  carbLoad: boolean;
  /** One-line rationale for the Food hero. */
  annotation: string;
}

interface RaceContext {
  raceDate: Date; // local midnight
  taperWeeks: number;
}

function raceContext(
  profile: UserProfile | null | undefined
): RaceContext | null {
  // HARD gate: only an active race-prep user with a real race date qualifies.
  // Reads the canonical profile mirrors (`runMode` + `raceGoal`) — present on
  // the UserProfile, so both useEffectiveTargets and useAdaptiveTdee can resolve
  // taper without subscribing to the full programState. No-op for LIFT_ONLY /
  // freeform / no-race users.
  if (profile?.runMode !== "race_prep") return null;
  const rg = profile.raceGoal;
  if (!rg || typeof rg.targetDate !== "string" || !rg.targetDate) return null;
  const raceDate = parseLocalDate(rg.targetDate);
  if (!raceDate || Number.isNaN(raceDate.getTime())) return null;
  const taperWeeks =
    TAPER_WEEKS_BY_DISTANCE[rg.distance] ?? DEFAULT_TAPER_WEEKS;
  return { raceDate, taperWeeks };
}

/** Whole local-calendar days from `date` until the race (negative = past). */
function daysUntilRace(date: Date, raceDate: Date): number {
  const today0 = parseLocalDate(localDateString(date));
  return Math.round((raceDate.getTime() - today0.getTime()) / 86_400_000);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Resolve the taper calorie/macro override for `date`. Returns null when the
 * user isn't in an active race-prep taper window (LIFT_ONLY, no race, race
 * already passed, or still in base/build) — the caller then uses the normal
 * flat/learned target. `baseCalories` is the pre-taper target (formula base or
 * learned value); the taper move is applied on top of it.
 */
export function resolveTaper(
  date: Date,
  profile: UserProfile | null | undefined,
  baseCalories: number
): TaperOverride | null {
  const ctx = raceContext(profile);
  if (!ctx) return null;

  const days = daysUntilRace(date, ctx.raceDate);
  if (days < 0) return null; // race passed — no calorie override
  const taperWindowDays = ctx.taperWeeks * 7;
  if (days > taperWindowDays) return null; // still base/build

  // Final days → carb LOAD: restore + bump calories, fat floored (HARD split),
  // carbs maximised.
  if (days <= CARB_LOAD_DAYS) {
    return {
      phase: days === 0 ? "race" : "carb_load",
      taperedCalories: Math.round(baseCalories * (1 + CARB_LOAD_BUMP)),
      carbLoad: true,
      // Descriptive of the race-week PLAN, not an assertion the user's macros
      // changed (the move is Pro-gated — see useEffectiveTargets).
      annotation: "Race week — carb load",
    };
  }

  // Taper weeks → calories contract proportional to the volume drop (deeper as
  // the race approaches), bounded to TAPER_CUT_MIN..MAX.
  const p = clamp((taperWindowDays - days) / taperWindowDays, 0, 1);
  const cut = TAPER_CUT_MIN + (TAPER_CUT_MAX - TAPER_CUT_MIN) * p;
  return {
    phase: "taper",
    taperedCalories: Math.round(baseCalories * (1 - cut)),
    carbLoad: false,
    annotation: "Taper week",
  };
}

/**
 * True when `dateKey` (local "YYYY-MM-DD") falls in the adaptive-exclusion
 * window: taper start → race day → POST_RACE_EXCLUDE_DAYS after. These dates
 * must be skipped in the intake/weigh-in estimation filter so the taper's
 * glycogen/water swings + reduced intake never poison the learned estimate.
 */
export function isAdaptiveExcludedDate(
  dateKey: string,
  profile: UserProfile | null | undefined
): boolean {
  const ctx = raceContext(profile);
  if (!ctx) return false;
  const d = parseLocalDate(dateKey);
  if (!d || Number.isNaN(d.getTime())) return false;
  const daysToRace = Math.round(
    (ctx.raceDate.getTime() - d.getTime()) / 86_400_000
  );
  // taper start (daysToRace = taperWeeks*7) … race (0) … +POST_RACE (-7)
  return (
    daysToRace <= ctx.taperWeeks * 7 && daysToRace >= -POST_RACE_EXCLUDE_DAYS
  );
}

/**
 * True when TODAY sits inside the exclusion window — the adaptive estimate must
 * be FROZEN at the pre-taper learned value (no drift) for the duration.
 */
export function isAdaptiveFrozen(
  date: Date,
  profile: UserProfile | null | undefined
): boolean {
  return isAdaptiveExcludedDate(localDateString(date), profile);
}
