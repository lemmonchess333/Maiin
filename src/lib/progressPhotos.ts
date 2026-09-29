/**
 * Progress photos — the model, and the reads and writes behind it.
 *
 * Each photo is one document in `users/{uid}/progressPhotos`, with its
 * encrypted file under `progress-photos/{uid}/` in Storage. A photo
 * carries the day it shows and a pose: front, side or back. The photos
 * of one day make a set, and Compare puts two days side by side, pose
 * against pose.
 *
 * Contract:
 *   - Owner-only. Both stores are covered by owner-only rules and swept
 *     by the account-deletion executor.
 *   - No social surface reads a photo. Sharing builds an image on the
 *     device and hands it to the phone's share sheet (see
 *     `progressPhotoShare.ts`); Tropos posts nothing.
 *   - Photos can be deleted, file first, so a failure never leaves a
 *     file behind that the app can no longer show.
 *   - Older photos have no pose of their own. Their set was a separate
 *     check-in document (`users/{uid}/progressCheckins`) that named each
 *     photo's slot. Those documents are read for the slot and never
 *     written; a photo neither names falls back to front.
 */

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { addDocGuarded, deleteDocGuarded } from "@/lib/firestoreWrite";
import { db, storage } from "@/lib/firebase";
import {
  decryptProgressPhoto,
  encryptProgressPhoto,
  type ProgressPhotoEncryption,
} from "@/lib/progressPhotoCrypto";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";

export const POSES = ["front", "side", "back"] as const;
export type Pose = (typeof POSES)[number];

export const POSE_LABELS: Record<Pose, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
};

/** A progressPhotos document as read. Older documents may lack `pose`. */
export interface StoredProgressPhoto extends ProgressPhotoEncryption {
  id: string;
  date?: unknown;
  pose?: unknown;
  createdAt?: unknown;
}

/** A photo with its day and pose settled. */
export interface ProgressPhoto extends ProgressPhotoEncryption {
  id: string;
  /** Local "YYYY-MM-DD". */
  date: string;
  pose: Pose;
  /** When it was added, in ms: orders two photos of one pose on a day. */
  addedAt: number;
}

/** One day's photos. */
export interface ProgressDay {
  /** Local "YYYY-MM-DD". */
  date: string;
  /** The photo each pose shows: the newest of that pose. */
  byPose: Partial<Record<Pose, ProgressPhoto>>;
  /** Every other photo from the day, newest first. Only older data holds
   *  two photos of one pose on a day; the second stays visible so it can
   *  be deleted. */
  extras: ProgressPhoto[];
}

export function isPose(value: unknown): value is Pose {
  return (POSES as readonly unknown[]).includes(value);
}

/** A real local calendar day in "YYYY-MM-DD" form. */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return localDateString(parseLocalDate(value)) === value;
}

function addedMillis(createdAt: unknown): number {
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return createdAt;
  }
  if (createdAt && typeof createdAt === "object") {
    const t = createdAt as { toMillis?: () => number; seconds?: unknown };
    if (typeof t.toMillis === "function") return t.toMillis();
    if (typeof t.seconds === "number") return t.seconds * 1000;
  }
  return 0;
}

/** The slot each older photo was filed under, by photo id. The first
 *  check-in to name a photo wins. */
export function checkInPoses(
  checkIns: ReadonlyArray<{ photoIds?: unknown }>
): Map<string, Pose> {
  const poses = new Map<string, Pose>();
  for (const checkIn of checkIns) {
    const ids = checkIn.photoIds;
    if (!ids || typeof ids !== "object") continue;
    for (const pose of POSES) {
      const id = (ids as Record<string, unknown>)[pose];
      if (typeof id === "string" && id && !poses.has(id)) poses.set(id, pose);
    }
  }
  return poses;
}

/**
 * Settle each stored photo's day and pose. The photo's own pose wins,
 * then its check-in slot, then front. A document without a usable day
 * takes the day it was added; one with neither is left out, since there
 * is nowhere to show it.
 */
export function resolvePhotos(
  stored: readonly StoredProgressPhoto[],
  legacyPoses: ReadonlyMap<string, Pose>
): ProgressPhoto[] {
  const photos: ProgressPhoto[] = [];
  for (const p of stored) {
    const addedAt = addedMillis(p.createdAt);
    const date = isDayKey(p.date)
      ? p.date
      : addedAt > 0
        ? localDateString(new Date(addedAt))
        : null;
    if (!date || typeof p.storagePath !== "string") continue;
    photos.push({
      id: p.id,
      storagePath: p.storagePath,
      iv: p.iv,
      ...(p.encryptionVersion !== undefined
        ? { encryptionVersion: p.encryptionVersion }
        : {}),
      ...(p.encryptionKey !== undefined
        ? { encryptionKey: p.encryptionKey }
        : {}),
      date,
      pose: isPose(p.pose) ? p.pose : (legacyPoses.get(p.id) ?? "front"),
      addedAt,
    });
  }
  return photos;
}

function newestFirst(a: ProgressPhoto, b: ProgressPhoto): number {
  if (a.addedAt !== b.addedAt) return b.addedAt - a.addedAt;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Photos grouped by day, newest day first. */
export function groupByDay(photos: readonly ProgressPhoto[]): ProgressDay[] {
  const byDate = new Map<string, ProgressPhoto[]>();
  for (const photo of photos) {
    const list = byDate.get(photo.date);
    if (list) list.push(photo);
    else byDate.set(photo.date, [photo]);
  }
  const days: ProgressDay[] = [];
  for (const [date, list] of byDate) {
    const sorted = [...list].sort(newestFirst);
    const byPose: ProgressDay["byPose"] = {};
    const extras: ProgressPhoto[] = [];
    for (const photo of sorted) {
      if (byPose[photo.pose]) extras.push(photo);
      else byPose[photo.pose] = photo;
    }
    days.push({ date, byPose, extras });
  }
  return days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Every photo of a day: its poses in order, then the extras. */
export function photosOfDay(day: ProgressDay): ProgressPhoto[] {
  const shown = POSES.flatMap((pose) => {
    const photo = day.byPose[pose];
    return photo ? [photo] : [];
  });
  return [...shown, ...day.extras];
}

/** The poses two days both have, in pose order. */
export function sharedPoses(a: ProgressDay, b: ProgressDay): Pose[] {
  return POSES.filter((pose) => a.byPose[pose] && b.byPose[pose]);
}

/** The days Compare opens on: the first and the latest. */
export function defaultComparison(
  days: readonly ProgressDay[]
): { before: string; after: string } | null {
  if (days.length < 2) return null;
  return { before: days[days.length - 1].date, after: days[0].date };
}

/** The poses that would appear twice on `to` if the photos of `from`
 *  moved there. Empty when the move is clean. */
export function moveClashes(
  days: readonly ProgressDay[],
  from: string,
  to: string
): Pose[] {
  if (from === to) return [];
  const source = days.find((d) => d.date === from);
  const target = days.find((d) => d.date === to);
  if (!source || !target) return [];
  const moving = new Set(photosOfDay(source).map((p) => p.pose));
  return POSES.filter(
    (pose) =>
      moving.has(pose) &&
      photosOfDay(target).some((photo) => photo.pose === pose)
  );
}

// ── Reads and writes ────────────────────────────────────────────────

const UPLOAD_TIMEOUT_MS = 25_000;
const LONGEST_EDGE_PX = 1920;

function photosCollection(uid: string) {
  return collection(db, "users", uid, "progressPhotos");
}

export async function loadProgressPhotos(
  uid: string
): Promise<StoredProgressPhoto[]> {
  const snap = await getDocs(
    query(photosCollection(uid), orderBy("createdAt", "desc"))
  );
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as StoredProgressPhoto
  );
}

/** Older photos' slots, from the check-in documents that grouped them. */
export async function loadCheckInPoses(
  uid: string
): Promise<Map<string, Pose>> {
  const snap = await getDocs(collection(db, "users", uid, "progressCheckins"));
  return checkInPoses(snap.docs.map((d) => d.data()));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Upload timed out")), ms)
    ),
  ]);
}

async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      LONGEST_EDGE_PX / bitmap.width,
      LONGEST_EDGE_PX / bitmap.height,
      1
    );
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Empty image"))),
        "image/webp",
        0.8
      )
    );
  } catch {
    throw new Error("Couldn't read that image. Try a different photo.");
  }
}

/**
 * Compress, encrypt (fail-closed), upload, then write the document.
 * Resolves with the photo and the unencrypted image, so the caller can
 * show it without downloading it again. Throws with a message fit to
 * show.
 */
export async function uploadProgressPhoto(
  uid: string,
  file: File,
  where: { date: string; pose: Pose }
): Promise<{ photo: ProgressPhoto; image: Blob }> {
  if (!isDayKey(where.date)) throw new Error("Choose a valid date.");
  const image = await compress(file);

  /* Fail-closed: the privacy policy says photos are stored only in
     encrypted form, so a failed encryption cancels the upload rather
     than sending the plain image. */
  const storagePath = `progress-photos/${uid}/${crypto.randomUUID()}.enc`;
  let encrypted: ArrayBuffer;
  let metadata: ProgressPhotoEncryption;
  try {
    ({ encrypted, metadata } = await encryptProgressPhoto(
      await image.arrayBuffer(),
      uid,
      storagePath
    ));
  } catch {
    throw new Error(
      "Couldn't encrypt the photo on this device. The upload was cancelled to keep it private. Try again."
    );
  }

  const fileRef = ref(storage, storagePath);
  await withTimeout(
    uploadBytes(fileRef, new Uint8Array(encrypted), {
      // Storage rules allow image types only; the body is ciphertext and
      // carries no key in Storage metadata.
      contentType: "image/webp",
    }),
    UPLOAD_TIMEOUT_MS
  );

  const addedAt = Date.now();
  let id: string;
  try {
    const docRef = await addDocGuarded(photosCollection(uid), {
      ...metadata,
      date: where.date,
      pose: where.pose,
      // Owner-only by rules in both stores. Nothing reads a public value.
      visibility: "private",
      createdAt: Timestamp.fromMillis(addedAt),
    });
    id = docRef.id;
  } catch (err) {
    // No document points at the file, so nothing could show or delete it.
    await deleteObject(fileRef).catch(() => undefined);
    throw err instanceof Error ? err : new Error("Couldn't save the photo.");
  }

  return {
    photo: { id, ...metadata, date: where.date, pose: where.pose, addedAt },
    image,
  };
}

function isMissingObject(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { code?: unknown }).code === "storage/object-not-found"
  );
}

/** Delete the file, then the document. A file already gone is not an
 *  error: the document still goes, so the photo leaves the list. */
export async function deleteProgressPhoto(
  uid: string,
  photo: Pick<ProgressPhoto, "id" | "storagePath">
): Promise<void> {
  if (!photo.storagePath.startsWith(`progress-photos/${uid}/`)) {
    throw new Error("Photo does not belong to this account");
  }
  try {
    await deleteObject(ref(storage, photo.storagePath));
  } catch (err) {
    if (!isMissingObject(err)) throw err;
  }
  await deleteDocGuarded(doc(photosCollection(uid), photo.id));
}

/** Move photos to another day in one write. Each keeps its pose, written
 *  onto the photo so it no longer depends on an older check-in. */
export async function moveProgressPhotos(
  uid: string,
  photos: readonly ProgressPhoto[],
  date: string
): Promise<void> {
  if (!isDayKey(date)) throw new Error("Choose a valid date.");
  const batch = writeBatch(db);
  for (const photo of photos) {
    batch.update(doc(photosCollection(uid), photo.id), {
      date,
      pose: photo.pose,
    });
  }
  await batch.commit();
}

/** Download and decrypt one photo. */
export async function readProgressPhoto(
  uid: string,
  photo: ProgressPhoto
): Promise<Blob> {
  const url = await getDownloadURL(ref(storage, photo.storagePath));
  const response = await fetch(url);
  const decrypted = await decryptProgressPhoto(
    await response.arrayBuffer(),
    uid,
    photo
  );
  return new Blob([decrypted], { type: "image/webp" });
}
