import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { stripUndefined } from "@/lib/firestoreGuards";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "./programTypes";
import { mergeChangedFields, ProgrammeConflictError } from "./stateTransition";

/** The week engine remains on the client; its commit preserves newer facts. */
export async function commitProgramTransition(
  db: Firestore,
  uid: string,
  base: ProgramState | null,
  proposed: ProgramState,
  profileChange?: { base: Partial<UserProfile>; patch: Partial<UserProfile> }
): Promise<ProgramState> {
  const { auth } = await import("@/lib/firebase");
  const assertOwner = () => {
    if (auth.currentUser?.uid !== uid)
      throw new Error("Sign in again to save your programme.");
  };
  assertOwner();
  const programRef = doc(db, "users", uid, "programState", "current");
  const profileRef = doc(db, "users", uid);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(programRef);
    const profileSnapshot = profileChange
      ? await transaction.get(profileRef)
      : null;
    assertOwner();
    const current = snapshot.exists()
      ? (snapshot.data() as ProgramState)
      : null;
    if (!!base !== !!current) throw new ProgrammeConflictError();
    const next =
      base && current ? mergeChangedFields(base, proposed, current) : proposed;
    if (profileChange && profileSnapshot) {
      const before = Object.fromEntries(
        Object.keys(profileChange.patch).map((key) => [
          key,
          (profileChange.base as Record<string, unknown>)[key],
        ])
      );
      const merged = mergeChangedFields(
        before,
        profileChange.patch,
        profileSnapshot.data() ?? {}
      );
      // Only the explicitly requested profile fields are written, in this same commit.
      const patch = Object.fromEntries(
        Object.keys(profileChange.patch).map((key) => [
          key,
          (merged as Record<string, unknown>)[key],
        ])
      );
      transaction.set(profileRef, stripUndefined(patch), { merge: true });
    }
    const saved = { ...next, updatedAt: Date.now() };
    transaction.set(programRef, stripUndefined(saved));
    return saved;
  });
}
