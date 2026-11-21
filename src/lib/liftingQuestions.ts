/**
 * The words of setup's lifting questions, which setup and Lift plan's Add
 * lifting both ask (TrainWk1 step 6): one copy, so the two never word the
 * same question differently.
 */

/** Setup's "Your setup" step: the kit and the experience. */
export const LIFT_KIT_QUESTION = {
  title: "Make the plan fit your setup",
  hint: "Equipment and experience shape the exercises in your plan.",
} as const;

/** Setup's limitations step. */
export const LIFT_LIMITS_QUESTION = {
  title: "Anything to work around?",
  hint: "Choose any relevant limitations, or select None.",
} as const;

/** The limitations a plan works around, as setup offers them. "none"
 *  stands alone; any other may go with others. */
export const LIFT_LIMIT_OPTIONS = [
  { id: "none", label: "None" },
  { id: "lower_back", label: "Lower back" },
  { id: "shoulder", label: "Shoulder" },
  { id: "knee", label: "Knee" },
  { id: "elbow", label: "Elbow" },
  { id: "wrist", label: "Wrist" },
] as const;

/** The limitations after one is tapped: "None" clears the rest, and any
 *  other comes on or off beside the others. */
export function toggledLimit(
  previous: readonly string[],
  id: string
): string[] {
  return id === "none"
    ? ["none"]
    : previous.includes(id)
      ? previous.filter((other) => other !== id)
      : [...previous.filter((other) => other !== "none"), id];
}
