import type { RaceTiming } from "./runPlanTiming";

/**
 * What a programme writer did with a change, so the screen that asked can
 * say so honestly. A refusal is never announced as a success: a screen
 * shows its success message only when `changeStands`.
 *
 * - `applied`: the change landed, or there was nothing to change.
 * - `queued`: this phone is offline. The change stands on screen and is
 *   sent when the connection returns; the server dedupes on its id.
 * - `declined`: the change is not happening, with the reason when there is
 *   one fit to show. The writer has already said it, once.
 * - `failed`: the change could not be tried (nothing loaded, signed out)
 *   or the save broke. Whatever saw the error has already said so.
 *
 * The answer runs from the command seam through the writer to the screen.
 * A writer that returns nothing leaves its screen to guess, and a screen
 * that guesses announces a refusal as a success.
 */
export type ProgramOutcome =
  | { status: "applied" }
  | { status: "queued" }
  | { status: "declined"; reason: string | null }
  | { status: "failed" };

export const APPLIED: ProgramOutcome = { status: "applied" };
export const QUEUED: ProgramOutcome = { status: "queued" };
export const FAILED: ProgramOutcome = { status: "failed" };

export function declined(reason: string | null): ProgramOutcome {
  return { status: "declined", reason };
}

/** Whether the person's change stands: it landed, or it will once synced. */
export function changeStands(outcome: ProgramOutcome): boolean {
  return outcome.status === "applied" || outcome.status === "queued";
}

/**
 * What a realign did. When it landed, the plan it built, so the screen can
 * say which ("compressed to 4 weeks", or the finish-safely line). A realign
 * is a direct save, not a command, so it is never queued: offline, the save
 * fails and says so itself.
 */
export type RealignOutcome =
  | { status: "applied"; timing: RaceTiming; totalWeeks: number }
  | { status: "declined"; reason: string | null }
  | { status: "failed" };
