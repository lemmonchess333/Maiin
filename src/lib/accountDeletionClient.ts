import { auth, db, functions } from "./firebase";
import { doc, getDocFromServer } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

/** Only a server-confirmed completed ledger is proof of deletion. A cached
 * profile, missing user document, timeout, or revoked token is not proof.
 * This also recovers a successful deletion whose callable response was lost.
 */
async function deletionCompleted(uid: string): Promise<boolean> {
  try {
    const snapshot = await getDocFromServer(
      doc(db, "accountDeletionRequests", uid)
    );
    return snapshot.exists() && snapshot.data().status === "completed";
  } catch {
    // A read failure must not prevent the authenticated executor from trying.
    return false;
  }
}

export async function deleteAccount(
  uid: string
): Promise<"completed" | "pending"> {
  const assertIdentity = () => {
    if (!uid || auth.currentUser?.uid !== uid)
      throw new Error("Identity mismatch");
  };
  assertIdentity();
  if (await deletionCompleted(uid)) {
    assertIdentity();
    return "completed";
  }
  assertIdentity();
  // Nine-minute backend timeout, plus time for the response to reach a phone.
  const request = httpsCallable(functions, "deleteMyAccount", {
    timeout: 600_000,
  });
  try {
    const result = await request({});
    assertIdentity();
    const response = result.data as
      | { ok?: boolean; status?: string }
      | undefined;
    if (response?.status === "pending") return "pending";
    if (
      response?.ok !== true ||
      (response.status && response.status !== "completed")
    ) {
      throw new Error("Deletion wasn't confirmed. Please try again.");
    }
  } catch (error) {
    assertIdentity();
    if (!(await deletionCompleted(uid))) throw error;
    assertIdentity();
  }
  return "completed";
}
