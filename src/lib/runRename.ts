/**
 * Renaming a saved run, from its page.
 *
 * The run keeps the new name in `name`, the field its finish screen saved
 * it under. A shared run's post takes the name from the server
 * (`functions/lib/runRename.js`, run by onRunUpdated): the rules let a
 * post's author change only who sees it, and the new name passes the same
 * word filter the post's first name did.
 */
import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { updateDocGuarded } from "@/lib/firestoreWrite";
import {
  flushQueue,
  pendingDocumentWrites,
  queueDurableWrite,
} from "@/lib/offlineQueue";
import { RUN_NAME_MAX } from "@/lib/runName";

/** A typed name as a run is saved under it: trimmed and cut at
 *  `RUN_NAME_MAX`, or null when nothing is left. */
export function runRenameValue(typed: string): string | null {
  const name = typed.trim().slice(0, RUN_NAME_MAX).trim();
  return name || null;
}

/**
 * Saves a run's new name, returning the name saved. A run still waiting in
 * the offline queue has no document yet, so its name joins the queue
 * behind the save, as a post's link does (`sessionDelete.ts`).
 */
export async function renameRun(
  uid: string,
  runId: string,
  typed: string
): Promise<string> {
  const name = runRenameValue(typed);
  if (!name) throw new Error("A run needs a name");
  const path = `users/${uid}/runs`;
  if (pendingDocumentWrites(uid, path).some((entry) => entry.id === runId)) {
    queueDurableWrite(uid, path, runId, { name }, true);
    if (navigator.onLine) void flushQueue(db, uid).catch(() => {});
    return name;
  }
  await updateDocGuarded(doc(db, "users", uid, "runs", runId), { name });
  return name;
}
