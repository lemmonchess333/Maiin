import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { setDocGuarded } from "./firestoreWrite";
import { REMINDERS_SETTINGS_DOC, type ReminderKind } from "./reminderChoices";
import { reminderAttentionFields } from "./reminderAttention";

/**
 * Writes Q62's marks on `users/{uid}/settings/reminders`
 * (`reminderAttention.ts`): flat fields beside the switches, merged, so
 * nothing else on the document moves.
 */
export async function writeReminderAttention(
  uid: string,
  patch: Record<string, unknown>
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await setDocGuarded(
    doc(db, "users", uid, "settings", REMINDERS_SETTINGS_DOC),
    patch,
    { merge: true }
  );
}

/**
 * The person answered a reminder the server sent: opened the app from its
 * push, or did what it asked (read the review). The server's next push of
 * that kind counts the last one as answered (App1 Q62).
 */
export async function markReminderAnswered(
  uid: string,
  kind: ReminderKind
): Promise<void> {
  await writeReminderAttention(uid, {
    [reminderAttentionFields(kind).answeredAt]: serverTimestamp(),
  });
}
