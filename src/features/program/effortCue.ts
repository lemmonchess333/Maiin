/**
 * Effort cues (training-book backlog #4 — RPE as prescription, B2/N3/H2).
 *
 * Four of the seven reviewed sources prescribe intensity as reps-in-reserve
 * rather than load; Tropos already captures RPE on Helms's exact scale but
 * used it for nothing except the ≥9.5 hold. This module turns capture into
 * guidance — as WORDS, per the presentation policy and the operator-approved
 * copy set (2026-07-27):
 *
 *   - Main lifts and free-weight compounds: "Finish with 2 reps to spare"
 *   - Isolations, and other compounds on a machine, final set:
 *                                          "Last set — OK to go to your limit."
 *   - Step-back (deload) week:              overrides everything
 *
 * Copy rules honoured (docs/voice-and-tone.md): no decode-metaphors ("in
 * the tank" failed rule 5), no banned vocabulary ("grind"), "Step-back
 * week" reuses the sanctioned deload term, guidance is permission-framed
 * and never a post-set verdict.
 *
 * The push cue follows the exercise's role (`exerciseRole`, Lift4): every
 * isolation, and a compound in a supporting slot when it runs on a machine
 * or a cable, where a rep that fails is set down safely. Main lifts and
 * free-weight compounds keep their reps to spare: pushing a hinge or a
 * barbell press to the limit is what every source warns against. Core is
 * skipped entirely: its prescriptions include timed holds where
 * rep-reserve language is nonsense.
 */

import type { MovementCategory } from "@/lib/exerciseMovementCategory";
import { getExerciseById } from "@/lib/exercises";
import { exerciseRole } from "./exerciseRole";

/** Equipment where a failed rep is set down by the machine, not caught. */
const MACHINE_EQUIPMENT = new Set(["Machine", "Cable Machine"]);

export interface EffortCue {
  kind: "reserve" | "push" | "deload";
  /** One plain line, shown under the set counter. */
  text: string;
  /** Longer expansion behind a tap (reserve cue only). */
  tooltip?: string;
}

export function effortCueFor(
  exercise: {
    movementCategory: MovementCategory;
    exerciseId: string;
    isAccessory?: boolean;
  },
  opts: { isLastSet: boolean; deloadWeek: boolean }
): EffortCue | null {
  if (opts.deloadWeek) {
    return {
      kind: "deload",
      text: "Step-back week — keep everything comfortably easy.",
    };
  }
  if (exercise.movementCategory === "core") return null;
  const role = exerciseRole(exercise);
  const push: EffortCue = {
    kind: "push",
    text: "Last set — OK to go to your limit.",
  };
  if (role === "isolation") return opts.isLastSet ? push : null;
  const onMachine = MACHINE_EQUIPMENT.has(
    getExerciseById(exercise.exerciseId)?.equipment ?? ""
  );
  if (role === "compound" && onMachine && opts.isLastSet) return push;
  return {
    kind: "reserve",
    text: "Finish with 2 reps to spare",
    tooltip:
      "Stop each set while you could still do about 2 more clean reps. " +
      "Sets that slow to a standstill cost more recovery than they build.",
  };
}

/**
 * The numeric RPE scale translated into the same reserve currency, so the
 * words and the chips (behind the showRPE toggle) never diverge. Mapping
 * follows Helms's repetitions-in-reserve scale.
 */
export function rpeReserveWords(rpe: number): string {
  if (rpe >= 10) return "nothing left";
  if (rpe >= 9.5) return "no full rep left";
  if (rpe >= 9) return "1 to spare";
  if (rpe >= 8.5) return "1–2 to spare";
  if (rpe >= 8) return "2 to spare";
  if (rpe >= 7.5) return "2–3 to spare";
  if (rpe >= 7) return "3 to spare";
  if (rpe >= 6.5) return "3–4 to spare";
  return "4+ to spare";
}
