/**
 * Which lifts have a board (Run30 call 3): every barbell exercise in the
 * catalogue, since a barbell's weight means the same lift in every gym, as
 * a machine's stack or a pair of dumbbells does not. Apart from the rest of
 * `liftBoard.ts` so an exercise's page knows whether to offer its
 * Leaderboard without loading the board's code. The server's copy is
 * `BOARD_LIFTS` in functions/lib/liftBoards.js (liftBoard.cross.test.ts).
 */
import { EXERCISES } from "./exercises";

export const LIFT_BOARD_EXERCISE_IDS: readonly string[] = Object.freeze(
  EXERCISES.filter((e) => e.equipment === "Barbell").map((e) => e.id)
);
const BOARD_IDS = new Set(LIFT_BOARD_EXERCISE_IDS);

/** Whether a lift has a board. */
export function hasLiftBoard(exerciseId: string | null | undefined): boolean {
  return typeof exerciseId === "string" && BOARD_IDS.has(exerciseId);
}
