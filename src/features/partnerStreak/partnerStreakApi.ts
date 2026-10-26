import { db, auth } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { deleteDocGuarded } from "@/lib/firestoreWrite";
import type { PartnerStreakState } from "./streakEngine";

// ============================================
// Partner-streak bond data layer (SOCIAL S3 PR3b)
//
// Invite model (locked): MUTUAL-FOLLOW AUTO-ELIGIBLE. Any two users who
// already follow each other can start a bond directly — no separate
// pending/accept ceremony. This matches the canonical reference
// (Duolingo friend-streaks start implicitly on an existing friendship).
// Consent is the existing mutual-follow relationship; an unwanted bond is
// just a dismissable 0-streak card either member can `dissolveBond`.
//
// The SERVER makes every bond: the startPartnerStreak callable
// (functions/lib/partnerBonds.js) checks the mutual follow, a block either
// way, both accounts' deletion state and both people's count against
// MAX_PARTNERS in one transaction, and the rules refuse a client create.
// A client reads a pair's bond, and either member ends it.
//
// The bond doc shape is the pure `PartnerStreakState` (engine) plus the
// `members` pair and a `createdAt`. Streak-state mutation (applying
// `recordPartnerActivity` on a logged day) is the server's too.
// ============================================

/** Stored shape of a `partnerBonds/{bondId}` document. */
export interface PartnerBondDoc extends PartnerStreakState {
  members: [string, string];
}

/** A bond doc paired with its Firestore id. */
export interface PartnerBond extends PartnerBondDoc {
  id: string;
}

/**
 * Deterministic id for a member pair — sorted uids joined — so a given
 * pair maps to exactly ONE bond doc regardless of which member
 * initiates. This is what makes `createBond` naturally idempotent and
 * structurally prevents two parallel bonds for the same two people.
 */
export function bondId(a: string, b: string): string {
  return [a, b].sort().join("__");
}

function getAuthUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  return uid;
}

/** Read the bond for a specific pair, or null if none exists. */
export async function getBond(
  a: string,
  b: string
): Promise<PartnerBond | null> {
  const snap = await getDoc(doc(db, "partnerBonds", bondId(a, b)));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as PartnerBondDoc) };
}

/**
 * Start a partner-streak bond between the authenticated user and
 * `partner`, through the startPartnerStreak callable, which holds the
 * mutual follow, a block either way, and the MAX_PARTNERS limit
 * (streakEngine.ts) for both people. Idempotent — if the pair already has a bond, the
 * server returns its id without minting a duplicate. Returns the bond id;
 * a refusal rejects with the callable's error, which
 * `describeStartRejection` turns into words.
 */
export async function createBond(me: string, partner: string): Promise<string> {
  const authedUid = getAuthUid();
  if (me !== authedUid) throw new Error("Identity mismatch");
  if (me === partner) throw new Error("Cannot bond with yourself");
  const res = await httpsCallable(
    getFunctions(),
    "startPartnerStreak"
  )({ partnerUid: partner });
  const data = res.data as { bondId?: unknown };
  return typeof data?.bondId === "string" ? data.bondId : bondId(me, partner);
}

/**
 * Dissolve a bond. Either member may delete it (per the rules); the
 * surviving partner's PartnerStreak surface reverts to its invite state.
 */
export async function dissolveBond(bondDocId: string): Promise<void> {
  await deleteDocGuarded(doc(db, "partnerBonds", bondDocId));
}
