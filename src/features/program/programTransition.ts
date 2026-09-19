import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { stripUndefined } from "@/lib/firestoreGuards";
import type { UserProfile } from "@/lib/auth";
import {
  CURRENT_PROGRAM_SCHEMA_VERSION,
  type ProgramState,
} from "./programTypes";
import { mergeChangedFields, ProgrammeConflictError } from "./stateTransition";

/**
 * A proposal computed against the LIVE document, inside the transaction.
 * Returns the next state, or `null` to decline: nothing is written and the
 * caller learns what the store holds. Firestore re-runs a transaction's
 * callback on contention, so an updater must be a pure function of
 * `current` — no side effects, and no reads of a rendered closure for a
 * value `current` carries.
 */
export type ProgramUpdater = (current: ProgramState) => ProgramState | null;

type ProfileChange = {
  base: Partial<UserProfile>;
  patch: Partial<UserProfile>;
};

type Proposal =
  | { base: ProgramState | null; proposed: ProgramState }
  | { update: ProgramUpdater };

/** The week engine remains on the client; its commit preserves newer facts. */
export async function commitProgramTransition(
  db: Firestore,
  uid: string,
  base: ProgramState | null,
  proposed: ProgramState,
  profileChange?: ProfileChange
): Promise<ProgramState> {
  const { state } = await commit(db, uid, { base, proposed }, profileChange);
  return state;
}

/**
 * Commit a proposal computed from the live document.
 *
 * The plain form above takes a proposal built from a `base` the caller
 * rendered and refuses when the store has moved on a key the proposal
 * changes. That is right for the rollover, whose effect recomputes on the
 * refreshed state and fires again, and for the loader, which commits what
 * it read. A user action is a closure over the state it was rendered
 * with, and between the tap and the commit that state can fall a write
 * behind the store: the rollover's own transaction, a server trigger, a
 * second device. Committed plain, the action was refused with "Your
 * programme changed while you were editing" for an edit the user never
 * made. Computed here, inside the transaction and from what the store
 * holds now, it lands on top of the change instead.
 *
 * A declined update writes nothing, the profile patch included, and
 * reports the store's current state so the caller can repaint from it.
 */
export async function commitProgramUpdate(
  db: Firestore,
  uid: string,
  update: ProgramUpdater,
  profileChange?: ProfileChange
): Promise<{ state: ProgramState; written: boolean }> {
  return commit(db, uid, { update }, profileChange);
}

async function commit(
  db: Firestore,
  uid: string,
  proposal: Proposal,
  profileChange?: ProfileChange
): Promise<{ state: ProgramState; written: boolean }> {
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
    let next: ProgramState;
    if ("update" in proposal) {
      // An update needs a document to update, at the current schema. None
      // means the loader has not created it yet, or it went away
      // underneath; an old schema means the loader has not migrated it yet
      // and the updater would write the old vocabulary back on top of the
      // migration. Either way the action was computed for a document that
      // is not there, and refusing lets the loader's commit land first.
      if (
        !current ||
        current.programSchemaVersion !== CURRENT_PROGRAM_SCHEMA_VERSION
      )
        throw new ProgrammeConflictError();
      const updated = proposal.update(current);
      if (updated === null) return { state: current, written: false };
      next = updated;
    } else {
      const { base, proposed } = proposal;
      if (!!base !== !!current) throw new ProgrammeConflictError();
      next =
        base && current
          ? mergeChangedFields(base, proposed, current)
          : proposed;
    }
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
    return { state: saved, written: true };
  });
}
