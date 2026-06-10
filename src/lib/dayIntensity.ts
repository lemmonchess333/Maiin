/**
 * dayIntensity — the single day-load classifier that drives the macro
 * fast-loop's fat↔carb shift.
 *
 * Replaces the coarse 4-way dayType (lift/run/both/rest) + per-phase carb
 * constant. The macro shift is now a function of how hard the PLANNED day is:
 * REST | EASY | MODERATE | HARD. Run intensity (from the scheduled run type)
 * and lift load (from Prompt A's trainingSignalsForNutrition) each produce a
 * limb tier; on a combined day the HIGHER limb wins ("fuel for the hardest
 * work required").
 *
 * Carb DIRECTION note (re-derived deliberately): the legacy model gave the
 * "strength" phase MORE carbs (400 vs 200), which is backwards — high-rep
 * hypertrophy / high-volume work depletes far more glycogen than low-rep
 * strength. Here the carb pull comes from VOLUME (liftVolumeTier) and run
 * stress, i.e. actual glycogen demand, so a high-volume hypertrophy day fuels
 * MORE carbs than a low-volume strength day, as it should.
 */
import { localDateString } from "./dateHelpers";
import { trainingSignalsForNutrition } from "./trainingSignals";
import { HARD_RUN_TYPES } from "@/features/program/programTypes";
import type { ProgramState } from "@/features/program/programTypes";
import type { ScheduleDay } from "./scheduleUtils";
import type { DayType } from "./types";
import { FAT_CALORIE_FRACTION, DAILY_FAT_FLOOR_PER_KG } from "./macroConstants";

export type DayIntensity = "REST" | "EASY" | "MODERATE" | "HARD";

const ORDER: Record<DayIntensity, number> = {
  REST: 0,
  EASY: 1,
  MODERATE: 2,
  HARD: 3,
};

/** The higher (harder) of two tiers — the combined-day "higher limb wins". */
function higher(a: DayIntensity, b: DayIntensity): DayIntensity {
  return ORDER[a] >= ORDER[b] ? a : b;
}

function hasValidSchedule(s: ScheduleDay[] | undefined): s is ScheduleDay[] {
  return Array.isArray(s) && s.length === 7;
}

/**
 * Fat→carb shift magnitude (calories of fat redirected into carbs) by tier.
 * REST holds fat at baseline (no shift); the shift grows with glycogen demand.
 * `ESSENTIAL_FAT_FLOOR_PER_KG` (phaseNutrition) still hard-caps how low fat
 * can actually go regardless of this number.
 */
export function fuelShiftCalsForTier(tier: DayIntensity): number {
  switch (tier) {
    case "HARD":
      return 450;
    case "MODERATE":
      return 250;
    case "EASY":
      return 100;
    case "REST":
    default:
      return 0;
  }
}

/**
 * Fat floor (g per kg) by tier. EASY/MODERATE hold the standing 0.8 g/kg
 * floor; HARD relaxes toward the 0.6 g/kg essential backstop so the biggest
 * carb shift is possible; REST leaves fat at its calorie-fraction baseline
 * (the floor is irrelevant there since there is no shift).
 */
export function fatFloorPerKgForTier(tier: DayIntensity): number {
  switch (tier) {
    case "HARD":
      return 0.6;
    case "MODERATE":
    case "EASY":
      return DAILY_FAT_FLOOR_PER_KG; // 0.8
    case "REST":
    default:
      // No shift on REST; baseline fat (~FAT_CALORIE_FRACTION) is used. Return
      // the calorie-fraction-equivalent floor is not meaningful here, so we
      // just return the standing floor; REST never cuts toward it.
      return DAILY_FAT_FLOOR_PER_KG;
  }
}

/** Re-export so phaseNutrition (and tests) reference one baseline constant. */
export { FAT_CALORIE_FRACTION };

/**
 * Descriptive day-load label for the Food hero. DESCRIBES the planned day —
 * it must NEVER assert a macro change ("carbs up" / "fat down"), because the
 * label is shown to FREE users for whom the macro movement is gated OFF. The
 * same labels are honest for Pro (where the move did occur). Deload / taper /
 * race labels are layered on by the caller (useEffectiveTargets).
 *
 * Wave3 G follow-up: the label is now merged INTO the hero caption as
 * "{day type} · {label}" (e.g. "Run day · Hard session"). So it drops the
 * redundant "…day" suffix that doubled up after the day type, and a plain
 * MODERATE day returns "" — there's nothing to add beyond the day type, and
 * "Run day · Training day" read as a bug. HARD/EASY keep an intensity word
 * (the Pro fuelling/conversion cue); "session" is purely descriptive (no
 * macro-change assertion, per the contract above).
 */
export function describeDayIntensity(tier: DayIntensity): string {
  switch (tier) {
    case "HARD":
      return "Hard session";
    case "MODERATE":
      return "";
    case "EASY":
      return "Easy session";
    case "REST":
    default:
      // Unused by the caption (rest days render no caption — buildCaption
      // returns null); kept descriptive for any non-caption consumer.
      return "Rest day";
  }
}

/**
 * Run-limb tier from the scheduled run type for `date`. runDays are
 * AUTHORITATIVE: a real long run counts as HARD even if weekSchedule says the
 * day is rest/lift (the clashesWithLift case). Falls back to weekSchedule only
 * to answer "is this a run day at all" when no runDay matches.
 *
 * Unknown / legacy / undefined run type → MODERATE (never silently easy/hard).
 */
function runLimb(
  key: string,
  weekday: number,
  program: ProgramState | undefined,
  weekSchedule: ScheduleDay[] | undefined
): DayIntensity | null {
  const runDay = program?.runDays?.find((rd) => rd.date === key);
  if (runDay) {
    const t = runDay.type;
    if (typeof t === "string" && HARD_RUN_TYPES.has(t)) return "HARD";
    if (t === "easy") return "EASY";
    return "MODERATE"; // unknown / legacy / undefined type
  }
  // No runDay match → weekSchedule fallback (presence only, type unknown).
  if (hasValidSchedule(weekSchedule)) {
    const sd = weekSchedule.find((s) => s.day === weekday);
    if (sd && (sd.type === "run" || sd.type === "both")) return "MODERATE";
  }
  return null;
}

/**
 * Lift-limb tier — applied on scheduled lift/both days. Uses Prompt A's
 * program-level signals as the per-day proxy: deload pulls DOWN, high volume
 * pushes UP. (Per-WorkoutDay resolution is deferred; the program's heaviest
 * planned day is a stable, conservative proxy for "how hard is lifting".)
 */
function liftLimb(
  weekday: number,
  program: ProgramState | undefined,
  weekSchedule: ScheduleDay[] | undefined
): DayIntensity | null {
  if (!hasValidSchedule(weekSchedule)) return null;
  const sd = weekSchedule.find((s) => s.day === weekday);
  const isLiftDay = !!sd && (sd.type === "lift" || sd.type === "both");
  if (!isLiftDay) return null;

  const sig = trainingSignalsForNutrition(program);
  if (sig.isDeload) return "EASY"; // deload pulls the tier down
  if (sig.liftVolumeTier === "high") return "HARD"; // high volume up
  if (sig.liftVolumeTier === "low") return "EASY";
  return "MODERATE"; // moderate, or scheduled-lift with unknown volume
}

/**
 * Classify the planned day load for `date`. Pure + total: tolerates missing
 * program / weekSchedule / runDays — a fully absent plan yields REST on every
 * day (no false "fuel up").
 */
export function classifyDayIntensity(args: {
  date: Date;
  program?: ProgramState;
  weekSchedule?: ScheduleDay[];
}): DayIntensity {
  const { date, program, weekSchedule } = args;
  const key = localDateString(date);
  const weekday = date.getDay();

  const run = runLimb(key, weekday, program, weekSchedule);
  const lift = liftLimb(weekday, program, weekSchedule);

  if (!run && !lift) return "REST";
  if (run && lift) return higher(run, lift); // combined day → higher limb wins
  return (run ?? lift)!;
}

/** Lift-limb tier purely from program signals (no schedule needed). */
function liftTierFromSignals(program: ProgramState | undefined): DayIntensity {
  const sig = trainingSignalsForNutrition(program);
  if (sig.isDeload) return "EASY";
  if (sig.liftVolumeTier === "high") return "HARD";
  if (sig.liftVolumeTier === "low") return "EASY";
  return "MODERATE";
}

/**
 * Coarse tier fallback from `dayType` alone — used when no date/runDays join
 * is available (e.g. callers/tests that don't pass a precise intensity). The
 * precise path is `classifyDayIntensity`. Run intensity is unknown here, so a
 * run day is MODERATE (never assume easy/hard); a both day takes the higher of
 * the lift limb and that MODERATE run.
 */
export function tierFromDayType(
  dayType: DayType,
  program?: ProgramState
): DayIntensity {
  switch (dayType) {
    case "rest":
      return "REST";
    case "lift":
      return liftTierFromSignals(program);
    case "run":
      return "MODERATE";
    case "both":
      return higher("MODERATE", liftTierFromSignals(program));
    default:
      return "REST";
  }
}
