/**
 * Movement class — how big a load step a lift can absorb.
 *
 * Backlog #7 keyed its proportional load step on `isAccessory`, reading it
 * as Helms's compound/isolation discriminator. It isn't one. `isAccessory`
 * is a VOLUME ROLE ("supporting work, adjustable"), and `pickAccessory`
 * fills those slots from the non-primary pool of each movement category —
 * which for the compound categories means Romanian Deadlift, Hack Squat,
 * Leg Press, Incline Bench. A real 4-day programme on main tagged a 50 kg
 * hack squat and a 40 kg RDL as accessories and handed them 1.25 kg steps.
 *
 * `movementCategory` doesn't settle it either: the taxonomy puts Lateral
 * Raise and Overhead Press both in `vertical_push` (see
 * exerciseMovementCategory's keyword table), so no category test can tell
 * an 8 kg isolation from a 50 kg press. `effortCue` hit the same wall and
 * limited itself to the two provably single-joint categories.
 *
 * So the discriminator is a UNION, and the second half is the load itself —
 * which is what Helms's argument was actually about ("2.5 kg is ~1.5% of a
 * squat and ~10% of a curl"). Percentage IS the rule; category is only ever
 * a proxy for it.
 *
 *   single-joint movement  → microplate, always (a curl is a curl at any load)
 *   working load below the heavy threshold → microplate (catches the lateral
 *     raise the taxonomy can't name, and a novice's 30 kg bench, where a
 *     2.5 kg jump is 8% and reliably triggers the failure backoff)
 *   otherwise → a full plate pair
 *
 * Note this deliberately reaches MAIN lifts too, which #7 promised not to
 * touch. That promise was scoped to a discriminator that turned out to be
 * the wrong one: proportionality is a property of the lift, not of the slot
 * it occupies, so exempting mains would just preserve the same error under
 * a different name.
 */

import type { MovementCategory } from "@/lib/exerciseMovementCategory";

/**
 * The only categories in this taxonomy that are unambiguously single-joint.
 * `vertical_push` is NOT here — it holds both Overhead Press and Lateral
 * Raise. `core` is excluded as its own case (timed holds, bodyweight).
 */
export const SINGLE_JOINT_CATEGORIES: ReadonlySet<MovementCategory> = new Set([
  "arms_biceps",
  "arms_triceps",
] as MovementCategory[]);

export function isSingleJoint(category: MovementCategory): boolean {
  return SINGLE_JOINT_CATEGORIES.has(category);
}

/** Working load at or above which a lift can absorb a full plate pair. */
export const HEAVY_LOAD_KG = 40;

export const MICROPLATE_STEP = 1.25;
export const PLATE_PAIR_STEP = 2.5;

export function usesMicroplateStep(
  category: MovementCategory,
  weight: number
): boolean {
  return isSingleJoint(category) || weight < HEAVY_LOAD_KG;
}
