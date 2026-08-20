/**
 * Food photo persistence — ON DEVICE (Food9, reversing the Storage half
 * of Food8's photo persistence).
 *
 * The AI-scan capture never leaves the phone. It is written through
 * `@capacitor/filesystem` under `Directory.Library`, and the diary
 * resolves it to a displayable src at render time. Nothing of ours sits
 * on a server at any point past the analysis call that already happens.
 *
 * `Directory.Library`, explicitly NOT `Directory.Cache`: Cache hands iOS
 * the right to reclaim the directory whenever it wants space, so it may
 * delete THIS MORNING's photo with no warning and no explanation we
 * could give the user. Library plus a rule of our own means photos
 * disappear on a schedule we can state in a sentence. Library is also in
 * the iOS backup set (only `Library/Caches` is excluded), so a restore
 * generally carries the photos across — at 22-44 MB steady state that is
 * noise against a 5 GB tier, which is why this is `Library` and not
 * `LibraryNoCloud`.
 *
 * The rule is age AND a byte budget. 90 days is the user-facing half;
 * ~250 MB oldest-first is the backstop, because age alone leaves the
 * ceiling unbounded by construction (100 scans/day for 90 days is
 * 3.4 GB). For any real user the age rule binds first and the budget
 * never fires — if the budget IS firing for an ordinary user, the age
 * rule was wrong, not the budget.
 *
 * There is no manifest and no Firestore field. The filename carries the
 * capture time and the meal doc id, and `readdir` reports size, so the
 * DIRECTORY is the index: it cannot drift from what is actually on disk,
 * and a device that never held the photo simply has no entry. Age comes
 * from the filename rather than `mtime` because `FileInfo.mtime` is
 * optional (absent on older Android) while the name is always there.
 *
 * Photos are uid-scoped on disk — the standing shared-device rule that
 * uid-scoped the offline and share queues in #820. It keeps one
 * account's captures out of another's timeline, and keeps both the byte
 * budget and the eviction pass per-account rather than per-device.
 *
 * Failure mode is unchanged from the Storage era: the photo is an
 * enhancement, never a gate. Every entry point resolves to null/false
 * rather than throwing, and a meal whose photo is missing renders as a
 * compact text row with its macros intact — the shape most rows in the
 * mixed feed already have.
 */

import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { isNativePlatform } from "./platform";
import { logger } from "./logger";

const ROOT = "food-photos";

/** User-facing retention rule. */
export const RETENTION_DAYS = 90;
/** Backstop bound on the whole per-account directory. */
export const BYTE_BUDGET = 250 * 1024 * 1024;

/** Longest edge after downscale. Captures arrive at native camera
 *  resolution (1280-1920+); the feed card renders ~360pt wide, so 1280
 *  keeps a 2-3x retina budget while keeping a photo near ~250 KB. */
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.8;

const DAY_MS = 86_400_000;

export interface StoredFoodPhoto {
  /** Filename as it sits on disk. */
  name: string;
  /** Meal doc id this photo belongs to. */
  mealId: string;
  /** Capture time, parsed from the filename. */
  capturedAtMs: number;
  /** Size in bytes, as reported by readdir. */
  size: number;
}

/* ── Pure rules — no filesystem, no platform ──────────────────────── */

/** `{capturedAtMs}-{mealId}.jpg`. The meal id is a Firestore auto-id
 *  and may itself contain `-`, so only the FIRST segment is the time. */
export function photoFileName(mealId: string, capturedAtMs: number): string {
  return `${capturedAtMs}-${mealId}.jpg`;
}

export function parsePhotoFileName(
  name: string
): { mealId: string; capturedAtMs: number } | null {
  if (!name.endsWith(".jpg")) return null;
  const stem = name.slice(0, -4);
  const dash = stem.indexOf("-");
  if (dash <= 0) return null;
  const capturedAtMs = Number(stem.slice(0, dash));
  const mealId = stem.slice(dash + 1);
  if (!Number.isFinite(capturedAtMs) || capturedAtMs <= 0) return null;
  if (!mealId) return null;
  return { mealId, capturedAtMs };
}

/**
 * Which photos this pass should delete. Age first, then — of whatever
 * survived the age rule — the oldest ones that push the directory past
 * the byte budget.
 *
 * Age and recency are the same ordering, so the budget only ever bites
 * on photos the age rule spared — the eviction set is always a
 * contiguous oldest-first suffix, never a hole punched in the middle of
 * the timeline. That is the property worth holding: a user who scrolls
 * back sees photos stop at some point, never a gap where one is
 * missing between two that survived.
 */
export function selectEvictions(
  photos: StoredFoodPhoto[],
  nowMs: number,
  opts: { retentionDays?: number; byteBudget?: number } = {}
): StoredFoodPhoto[] {
  const retentionMs = (opts.retentionDays ?? RETENTION_DAYS) * DAY_MS;
  const budget = opts.byteBudget ?? BYTE_BUDGET;

  const aged: StoredFoodPhoto[] = [];
  const survivors: StoredFoodPhoto[] = [];
  for (const p of photos) {
    if (nowMs - p.capturedAtMs > retentionMs) aged.push(p);
    else survivors.push(p);
  }

  // Newest first, so the budget spends itself on the photos the user is
  // most likely to still be scrolling past.
  survivors.sort((a, b) => b.capturedAtMs - a.capturedAtMs);

  const overBudget: StoredFoodPhoto[] = [];
  let running = 0;
  for (const p of survivors) {
    running += p.size;
    if (running > budget) overBudget.push(p);
  }

  return [...aged, ...overBudget];
}

/* ── Device IO ────────────────────────────────────────────────────── */

/* ── Change notification ──────────────────────────────────────────────
   The photo is NOT a Firestore field, so nothing in the snapshot stream
   changes when one lands or is evicted. Without this the diary would
   only pick a new capture up on its next unrelated re-resolve, and the
   card would pop in minutes late (or not at all, if the meal set has
   not changed since). Saving stays fire-and-forget — the meal must
   never wait on its photo — and this is what closes the race that
   creates. */

type PhotoListener = () => void;
const listeners = new Set<PhotoListener>();

/** Subscribe to "this device's photo set changed". Returns an
 *  unsubscribe. */
export function subscribeFoodPhotos(fn: PhotoListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notifyFoodPhotosChanged(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a broken listener must not stop the others */
    }
  }
}

function dirFor(uid: string): string {
  return `${ROOT}/${uid}`;
}

/** Decode a base64 JPEG, downscale if the longest edge exceeds
 *  MAX_EDGE_PX, and re-encode to base64. Uses `<img>` + canvas (not
 *  OffscreenCanvas/createImageBitmap) for WKWebView compatibility. */
async function toStoredBase64(base64Jpeg: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("photo decode failed"));
    img.src = `data:image/jpeg;base64,${base64Jpeg}`;
  });

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (!longest) throw new Error("photo has no dimensions");
  const scale = Math.min(1, MAX_EDGE_PX / longest);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("photo encode failed");
  return dataUrl.slice(comma + 1);
}

/**
 * Persist a capture for `mealId`. Resolves false on ANY failure —
 * callers treat that as "no photo" and move on.
 */
export async function saveFoodPhoto(
  uid: string,
  mealId: string,
  base64Jpeg: string,
  capturedAtMs: number
): Promise<boolean> {
  if (!uid || !mealId) return false;
  try {
    const data = await toStoredBase64(base64Jpeg);
    await Filesystem.writeFile({
      path: `${dirFor(uid)}/${photoFileName(mealId, capturedAtMs)}`,
      data,
      directory: Directory.Library,
      // Creates `food-photos/{uid}` on the first capture; there is no
      // separate mkdir step to get out of sync with the write.
      recursive: true,
    });
    notifyFoodPhotosChanged();
    return true;
  } catch (err) {
    logger.warn("[foodPhoto] save skipped:", err);
    return false;
  }
}

/**
 * Everything this account holds on this device. An account that has
 * never captured has no directory at all, which readdir reports as a
 * throw — that is the empty case, not an error.
 */
export async function listFoodPhotos(uid: string): Promise<StoredFoodPhoto[]> {
  if (!uid) return [];
  try {
    const { files } = await Filesystem.readdir({
      path: dirFor(uid),
      directory: Directory.Library,
    });
    const out: StoredFoodPhoto[] = [];
    for (const f of files) {
      if (f.type === "directory") continue;
      const parsed = parsePhotoFileName(f.name);
      if (!parsed) continue;
      out.push({ name: f.name, size: f.size ?? 0, ...parsed });
    }
    return out;
  } catch {
    /* no directory yet — this account has never captured here */
    return [];
  }
}

/** Turn one stored photo into something an `<img src>` can load. */
async function toDisplaySrc(uid: string, name: string): Promise<string | null> {
  const path = `${dirFor(uid)}/${name}`;
  try {
    if (isNativePlatform()) {
      // WKWebView streams the file directly — far cheaper than pulling
      // a quarter-megabyte through a data URL per row.
      const { uri } = await Filesystem.getUri({
        path,
        directory: Directory.Library,
      });
      return Capacitor.convertFileSrc(uri);
    }
    const { data } = await Filesystem.readFile({
      path,
      directory: Directory.Library,
    });
    if (typeof data === "string") return `data:image/jpeg;base64,${data}`;
    // The web shim's return type admits a Blob; object URLs are revoked
    // by the caller's cleanup when the row unmounts.
    return URL.createObjectURL(data);
  } catch (err) {
    logger.warn("[foodPhoto] resolve skipped:", err);
    return null;
  }
}

/**
 * Displayable srcs for the meals currently on screen, keyed by meal id.
 * Meals with no photo on this device are simply absent from the map —
 * their rows stay compact text rows.
 */
export async function resolveFoodPhotoSrcs(
  uid: string,
  mealIds: string[]
): Promise<Record<string, string>> {
  if (!uid || mealIds.length === 0) return {};
  const wanted = new Set(mealIds);
  const photos = (await listFoodPhotos(uid)).filter((p) =>
    wanted.has(p.mealId)
  );
  const out: Record<string, string> = {};
  await Promise.all(
    photos.map(async (p) => {
      const src = await toDisplaySrc(uid, p.name);
      if (src) out[p.mealId] = src;
    })
  );
  return out;
}

async function removePhotos(
  uid: string,
  photos: StoredFoodPhoto[]
): Promise<number> {
  let removed = 0;
  for (const p of photos) {
    try {
      await Filesystem.deleteFile({
        path: `${dirFor(uid)}/${p.name}`,
        directory: Directory.Library,
      });
      removed += 1;
    } catch (err) {
      /* A file that has already gone is the outcome we wanted; anything
         else waits for the next pass rather than failing the sweep. */
      logger.warn("[foodPhoto] delete skipped:", err);
    }
  }
  return removed;
}

export interface EvictionResult {
  /** How many files this pass deleted. */
  removed: number;
  /** How many remain afterwards. */
  remaining: number;
}

/**
 * Apply the retention rule. Deliberately NOT triggered by the capture
 * that just landed — a sweep on write makes the user's own newest photo
 * pay for the pass. Callers run this on a debounced app-start pass.
 */
export async function evictFoodPhotos(
  uid: string,
  nowMs: number = Date.now()
): Promise<EvictionResult> {
  const photos = await listFoodPhotos(uid);
  if (photos.length === 0) return { removed: 0, remaining: 0 };
  const doomed = selectEvictions(photos, nowMs);
  if (doomed.length === 0) return { removed: 0, remaining: photos.length };
  const removed = await removePhotos(uid, doomed);
  if (removed > 0) notifyFoodPhotosChanged();
  return { removed, remaining: photos.length - removed };
}

/**
 * Wipe this account's photos from this device. The deletion executor
 * runs server-side and cannot reach the phone, so account deletion
 * calls this best-effort BEFORE the callable — and a failure here is
 * never allowed to block the deletion itself.
 */
export async function deleteAllFoodPhotos(uid: string): Promise<number> {
  const photos = await listFoodPhotos(uid);
  if (photos.length === 0) return 0;
  return removePhotos(uid, photos);
}
