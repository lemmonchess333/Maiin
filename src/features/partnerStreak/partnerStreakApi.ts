import { db, auth } from "@/lib/firebase";
import {
  doc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { isFollowing } from "@/lib/socialApi";
import {
  canAddPartner,
  emptyStreakState,
  type PartnerStreakState,
} from "./streakEngine";

// ============================================
// Partner-streak bond data layer (SOCIAL S3 PR3b)
//
// Invite model (locked): MUTUAL-FOLLOW AUTO-ELIGIBLE. Any two users who
// already follow each other can start a bond directly — no separate
// pending/accept ceremony. This matches the canonical reference
// (Duolingo friend-streaks start implicitly on an existing friendship)
// and needs NO change to the shipped `partnerBonds` rules, which only
// enforce structural integrity (exactly 2 distinct members, cold start
// `streak == 0`, creator-is-member, neither member mid-deletion). Consent
// is the existing mutual-follow relationship; an unwanted bond is just a
// dismissable 0-streak card either member can `dissolveBond`.
//
// The bond doc shape is the pure `PartnerStreakState` (engine) plus the
// `members` pair and a `createdAt`. Streak-state mutation (applying
// `recordPartnerActivity` on a logged day) is a SEPARATE slice — this
// module only handles the bond lifecycle (create / dissolve / read).
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

/** Every bond the user is a member of (array-contains on `members`). */
export async function listMyBonds(uid: string): Promise<PartnerBond[]> {
  const snap = await getDocs(
    query(
      collection(db, "partnerBonds"),
      where("members", "array-contains", uid)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as PartnerBondDoc) }));
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
 * Create a partner-streak bond between the authenticated user and
 * `partner`. Enforces the product policy the rules can't (mutual-follow
 * consent, the {@link MAX_PARTNERS} cap); the rules enforce structural
 * integrity. Idempotent — if the pair already has a bond, returns its id
 * without minting a duplicate. Returns the bond id.
 */
export async function createBond(me: string, partner: string): Promise<string> {
  const authedUid = getAuthUid();
  if (me !== authedUid) throw new Error("Identity mismatch");
  if (me === partner) throw new Error("Cannot bond with yourself");

  // Mutual-follow gate — the consent model. Both directions must hold.
  const [iFollow, theyFollow] = await Promise.all([
    isFollowing(me, partner),
    isFollowing(partner, me),
  ]);
  if (!iFollow || !theyFollow) throw new Error("Mutual follow required");

  const id = bondId(me, partner);
  const mine = await listMyBonds(me);

  // Idempotent: the pair may already be bonded (either member created
  // it). Return the existing id rather than re-writing — and check this
  // BEFORE the cap so a re-create at the cap ceiling isn't wrongly
  // rejected for a bond that already counts toward `mine`.
  if (mine.some((b) => b.id === id)) return id;

  if (!canAddPartner(mine.length)) throw new Error("Partner limit reached");

  // Sorted members so the stored order matches the id derivation. Cold
  // state (streak 0) — the rules reject any forged head-start.
  const members = [me, partner].sort() as [string, string];
  await setDocGuarded(doc(db, "partnerBonds", id), {
    members,
    ...emptyStreakState(),
    createdAt: serverTimestamp(),
  });
  return id;
}

/**
 * Dissolve a bond. Either member may delete it (per the rules); the
 * surviving partner's PartnerStreak surface reverts to its invite state.
 */
export async function dissolveBond(bondDocId: string): Promise<void> {
  await deleteDoc(doc(db, "partnerBonds", bondDocId));
}
