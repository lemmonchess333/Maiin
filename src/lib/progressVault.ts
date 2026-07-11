/**
 * Private Progress Vault (BODY-VAULT-01) — pure model + persistence.
 *
 * Adds a date-based CHECK-IN layer over the existing owner-only progress
 * photos: one check-in groups an optional front/side/back photo set for a
 * date with an optional neutral note. Photos themselves stay exactly where
 * they are (`users/{uid}/progressPhotos` metadata + encrypted blobs under
 * `progress-photos/{uid}/` in Storage) — a check-in only REFERENCES photo
 * ids, so no migration of sensitive data ever runs.
 *
 * Contract (extends BODY-VAULT-00):
 *   - Everything here is owner-only: `users/{uid}/progressCheckins` is
 *     covered by the same isOwner/isOwnerAndNotDeleting rules block as the
 *     photos, enumerated in the account-deletion executor, and never
 *     readable by another account.
 *   - Fully private in v1 — NO social surface reads a check-in and no
 *     Circle event is emitted from the vault. Any future milestone share
 *     is a separate, explicit consent flow that carries no image, date,
 *     note, weight or photo reference.
 *   - Photos logged before check-ins existed (or uploaded without one)
 *     render lazily as single-photo LEGACY entries via `groupVaultEntries`
 *     — a read adapter, not a backfill.
 */

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { addDocGuarded, setDocGuarded } from "@/lib/firestoreWrite";
import { db } from "@/lib/firebase";

export const CHECKIN_NOTE_MAX = 200;

export const CHECKIN_SLOTS = ["front", "side", "back"] as const;
export type CheckInSlot = (typeof CHECKIN_SLOTS)[number];

export const SLOT_LABELS: Record<CheckInSlot, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
};

/** The existing progressPhotos doc shape the vault references. */
export interface VaultPhoto {
  id: string;
  date: string; // YYYY-MM-DD
  storagePath: string;
  iv: number[];
}

/** Stored check-in doc (users/{uid}/progressCheckins/{id}). */
export interface ProgressCheckIn {
  id: string;
  date: string; // YYYY-MM-DD
  note?: string;
  photoIds: Partial<Record<CheckInSlot, string>>;
  createdAt?: Timestamp;
}

export interface CheckInInput {
  date: string;
  note?: string;
  photoIds: Partial<Record<CheckInSlot, string>>;
}

/** A renderable vault row: a stored check-in, or a synthetic single-photo
 *  entry for a legacy photo no check-in references. */
export interface VaultEntry {
  /** Stable render key — the check-in id or `legacy:<photoId>`. */
  key: string;
  /** Present only for stored check-ins (edit path). */
  checkInId?: string;
  date: string;
  note?: string;
  /** Slots in front→side→back order, only those with a RESOLVABLE photo. */
  slots: Array<{ slot: CheckInSlot; photoId: string }>;
  legacy: boolean;
}

/**
 * Clamp free text and drop empty/unknown slots so a write can never carry
 * more than the model allows. Returns null when the input has no photos at
 * all — an empty check-in is not a thing.
 */
export function sanitizeCheckInInput(input: CheckInInput): CheckInInput | null {
  const photoIds: Partial<Record<CheckInSlot, string>> = {};
  for (const slot of CHECKIN_SLOTS) {
    const id = input.photoIds[slot];
    if (typeof id === "string" && id.trim()) photoIds[slot] = id.trim();
  }
  if (Object.keys(photoIds).length === 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return null;
  const note = (input.note || "").trim().slice(0, CHECKIN_NOTE_MAX);
  return { date: input.date, ...(note ? { note } : {}), photoIds };
}

/**
 * Merge stored check-ins with the photo library into renderable entries:
 *   - each check-in becomes one entry; slots whose photo no longer exists
 *     are dropped (a check-in whose every photo is gone is dropped whole);
 *   - every photo NOT referenced by any check-in becomes a single-photo
 *     legacy entry dated from the photo doc;
 *   - sorted newest date first; stored check-ins before legacy entries on
 *     the same date.
 */
export function groupVaultEntries(
  checkIns: ProgressCheckIn[],
  photos: VaultPhoto[]
): VaultEntry[] {
  const photoById = new Map(photos.map((p) => [p.id, p]));
  const claimed = new Set<string>();

  const entries: VaultEntry[] = [];
  for (const c of checkIns) {
    const slots: VaultEntry["slots"] = [];
    for (const slot of CHECKIN_SLOTS) {
      const photoId = c.photoIds?.[slot];
      if (photoId && photoById.has(photoId)) {
        slots.push({ slot, photoId });
        claimed.add(photoId);
      }
    }
    if (slots.length === 0) continue;
    entries.push({
      key: c.id,
      checkInId: c.id,
      date: c.date,
      ...(c.note ? { note: c.note } : {}),
      slots,
      legacy: false,
    });
  }

  for (const p of photos) {
    if (claimed.has(p.id)) continue;
    entries.push({
      key: `legacy:${p.id}`,
      date: p.date,
      slots: [{ slot: "front", photoId: p.id }],
      legacy: true,
    });
  }

  return entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.legacy !== b.legacy) return a.legacy ? 1 : -1;
    return a.key < b.key ? 1 : -1;
  });
}

// ── Persistence (guarded writes; owner-only collection) ─────────────────

export async function loadProgressCheckIns(
  uid: string
): Promise<ProgressCheckIn[]> {
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "progressCheckins"),
      orderBy("date", "desc")
    )
  );
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ProgressCheckIn, "id">),
  }));
}

export async function createProgressCheckIn(
  uid: string,
  input: CheckInInput
): Promise<string | null> {
  const clean = sanitizeCheckInInput(input);
  if (!clean) return null;
  const ref = await addDocGuarded(
    collection(db, "users", uid, "progressCheckins"),
    { ...clean, createdAt: serverTimestamp() }
  );
  return ref.id;
}

export async function updateProgressCheckIn(
  uid: string,
  checkInId: string,
  input: CheckInInput
): Promise<boolean> {
  const clean = sanitizeCheckInInput(input);
  if (!clean) return false;
  await setDocGuarded(
    doc(db, "users", uid, "progressCheckins", checkInId),
    clean,
    { merge: true }
  );
  return true;
}
