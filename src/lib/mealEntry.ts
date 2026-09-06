import { collection, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { addDocGuarded } from "@/lib/firestoreWrite";
import { flushQueue, queueDurableWrite } from "@/lib/offlineQueue";
import { toast } from "@/lib/toast";

export async function createMealEntry(uid: string, data: Record<string, unknown>, id?: string) {
  if (auth.currentUser?.uid !== uid) throw new Error("Sign in again to log food.");
  return addDocGuarded(collection(db, "users", uid, "meals"), data, { uid, id });
}

export async function undoMealEntries(uid: string, ids: readonly string[]) {
  if (auth.currentUser?.uid !== uid) throw new Error("Sign in again before undoing.");
  for (const id of new Set(ids)) {
    queueDurableWrite(uid, `users/${uid}/meals`, id, { deletedAt: Timestamp.now() }, true);
  }
  void flushQueue(db, uid).catch(() => {});
}

export function notifyMealsLogged(uid: string, ids: readonly string[], message: string) {
  let undone = false;
  toast.success(navigator.onLine ? message : "Saved on this phone — syncs when you're back online", {
    duration: 5000,
    action: {
      label: "Undo",
      onClick: async () => {
        if (undone) return;
        undone = true;
        try { await undoMealEntries(uid, ids); }
        catch (error) {
          undone = false;
          toast.error(error instanceof Error ? error.message : "Couldn't undo this entry.");
        }
      },
    },
  });
}
