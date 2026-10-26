import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

/**
 * "Show my week" on friends' boards (Polish2 call 5): the person's yes or
 * no, through the setBoardSharing callable, which stores the answer and
 * this week's tally together (or deletes the tally). The answer is not a
 * profile field the app writes, so the two cannot disagree.
 */
export async function setBoardSharing(share: boolean): Promise<void> {
  await httpsCallable(functions, "setBoardSharing")({ share });
}
