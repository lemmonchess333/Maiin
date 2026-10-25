/**
 * Food photo persistence — ON THE DEVICE, never on a server.
 *
 * Supersedes `foodPhotoUpload.ts`, which put every AI-scan capture in
 * Firebase Storage under `food-photos/{uid}/`. See the Food9 lock row
 * in `.claude/plans/programme-run-followups.md`: that upload silently
 * reversed F3d's locked "no server-side photo retention" invariant, and
 * left the app telling users "no photos are stored from the scanner"
 * while it stored them. This module restores the invariant.
 *
 * WHY DEVICE-LOCAL — the reasoning, so it is not re-derived:
 *   - Cost was never the argument. Measured, the server path ran about
 *     0.3p per paying user per month. It is a privacy and obligation
 *     argument: holding a user's meal photos indefinitely, with nothing
 *     that deleted them when the meal was deleted, is a liability that
 *     bought one diary thumbnail.
 *   - The photo still LEAVES the device to be analysed — Gemini does the
 *     recognition, there is no on-device model. "Device-local" is about
 *     RETENTION, not transmission. Say it that way in user-facing copy.
 *   - Meal photos are ephemeral by nature. Nobody revisits a picture of
 *     last March's lunch; the macros are the record, the photo is a
 *     glanceable aid while the day is still recent. Losing them to a new
 *     phone or a restore is acceptable and expected — that is exactly
 *     what `Directory.LibraryNoCloud` gives us.
 *
 * ONE API, BOTH PLATFORMS. `@capacitor/filesystem`'s web implementation
 * is itself IndexedDB-backed (DB `Disc`, object store `FileStorage` —
 * read `node_modules/@capacitor/filesystem/dist/esm/web.js`), so the web
 * build gets durable blob storage from the same calls the native build
 * uses. There is deliberately no hand-rolled IndexedDB layer here and no
 * `isNativePlatform()` branch: a platform split we do not need is a
 * second code path that can drift.
 *
 * `Directory.LibraryNoCloud` ("The Library directory without cloud
 * backup. Used in iOS.") is the right home on iOS: app-private, invisible
 * in Photos and Files, excluded from iCloud backup, and removed when the
 * app is uninstalled.
 *
 * RENDERING reads the file back as a data URL rather than converting the
 * native URI with `Capacitor.convertFileSrc`. That call has ZERO
 * precedent in this repo and cannot be exercised in the agent sandbox or
 * in headless Chromium, so choosing it would have shipped the render path
 * unverified on the platform that matters. A data URL costs a ~340 KB
 * string per 250 KB photo and needs no object-URL lifecycle at all —
 * which also means no revoke bug, and it stays compatible with the
 * `loading="lazy"` the diary row already uses.
 *
 * Keys are `food-photos/{uid}/{mealId}.jpg`. The uid segment is the
 * isolation mechanism — same posture as `offlineQueue.ts`: signing out
 * does NOT wipe, because another account's photos are simply under
 * another prefix and unreachable.
 *
 * THE THUMBNAIL. The diary row draws a photo as a 52 px square, and a
 * 1280 px JPEG read back as a data URL is a few hundred KB of string per
 * row for it. So each save also writes `{mealId}.thumb.jpg` beside the
 * photo, about 160 px, and the row reads that. It is the same photo kept
 * the same way: on the device only, listed with its photo as one meal,
 * deleted with it and swept with it at the same age. A photo saved before
 * thumbnails were has none, and the row reads the photo itself.
 */

import { Directory, Filesystem } from "@capacitor/filesystem";
import { logger } from "./logger";

const ROOT = "food-photos";

/** Longest edge after downscale. Captures arrive at native camera
 *  resolution (1280–1920+); the diary card renders ~360pt wide, so 1280
 *  keeps a 2–3× retina budget. Carried over unchanged from the Storage
 *  implementation this module replaces. */
export const MAX_EDGE_PX = 1280;
export const JPEG_QUALITY = 0.8;

/** The thumbnail's SHORT edge: the diary row crops the photo to a 52 pt
 *  square, so this is what that square needs at 3x. */
export const THUMB_EDGE_PX = 160;
const THUMB_SUFFIX = ".thumb.jpg";

/**
 * Age cap. NOT a guess about what users care about: `Food.tsx`'s
 * `FOOD_TAP_BACK_DAYS = 90` means the diary cannot navigate further back
 * than 90 days, and the diary row is the only surface that renders a meal
 * photo. A photo older than this is unreachable in the only UI that could
 * show it — keeping it would be storing bytes nobody can look at.
 *
 * If the tap-back limit ever moves, this must move with it. Pinned by
 * `foodPhotoStore.test.ts` ("retention window tracks the diary window").
 */
export const MAX_AGE_DAYS = 90;

/**
 * Byte backstop. The age cap alone does not bound the reachable ceiling:
 * image AI allows 100 scans/day for Pro, and re-scanning a plate to fix a
 * bad estimate is ordinary behaviour, so 90 days × 100/day × ~250 KB is
 * ~2 GB. At a realistic 2 saved photos/day the age cap binds first (about
 * 44 MB held) and this never fires.
 */
export const MAX_TOTAL_BYTES = 250 * 1024 * 1024;

const DAY_MS = 24 * 60 * 60 * 1000;

function dirFor(uid: string): string {
  return `${ROOT}/${uid}`;
}

function pathFor(uid: string, mealId: string): string {
  return `${dirFor(uid)}/${mealId}.jpg`;
}

function thumbPathFor(uid: string, mealId: string): string {
  return `${dirFor(uid)}/${mealId}${THUMB_SUFFIX}`;
}

/** `mealId.jpg` → `mealId`, and its thumbnail `mealId.thumb.jpg` → the
 *  same `mealId`; anything else → null. */
export function mealIdFromFileName(name: string): string | null {
  const m = /^(.+?)(?:\.thumb)?\.jpg$/.exec(name);
  return m ? m[1] : null;
}

/**
 * How far to scale a `width` x `height` image: to fit `edge` on its long
 * side (the stored photo) or to bring its short side down to `edge` (the
 * thumbnail, which the row crops to a square). Never up.
 */
export function downscaleFactor(
  width: number,
  height: number,
  edge: number,
  side: "long" | "short"
): number {
  const measured =
    side === "long" ? Math.max(width, height) : Math.min(width, height);
  return measured > 0 ? Math.min(1, edge / measured) : 1;
}

/**
 * Decode a base64 JPEG once; `encodeJpeg` then downscales it (the photo to
 * MAX_EDGE_PX, the thumbnail to THUMB_EDGE_PX) and hands back bare base64
 * (no data: prefix) — the shape `Filesystem.writeFile` wants when no
 * `encoding` is given.
 *
 * Uses `<img>` + canvas rather than OffscreenCanvas/createImageBitmap
 * for WKWebView compatibility. Carried over from `foodPhotoUpload.ts`;
 * the only change is emitting base64 via `toDataURL` instead of a Blob,
 * because the Filesystem plugin takes base64 uniformly on both platforms
 * while Blob support differs.
 */
async function decodeJpeg(base64Jpeg: string): Promise<HTMLImageElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("photo decode failed"));
    img.src = `data:image/jpeg;base64,${base64Jpeg}`;
  });
  if (!img.naturalWidth || !img.naturalHeight)
    throw new Error("photo has no dimensions");
  return img;
}

/** `img` scaled by `scale`, as bare base64 JPEG. */
function encodeJpeg(img: HTMLImageElement, scale: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("photo encode failed");
  return dataUrl.slice(comma + 1);
}

/**
 * Persist a capture for `mealId`. Resolves true on success, false on ANY
 * failure — the photo is an enhancement, never a gate, so callers treat
 * false as "this meal stays a text row" and move on.
 *
 * Fire this AFTER the meal doc write. The meal id is minted client-side
 * (`doc(collection(...))` in FoodAnalyzer), so the key is known before
 * the write lands and needs no reconciliation.
 *
 * The thumbnail is written after the photo, from the same decode. It is
 * an optimisation of the row, not part of the photo: if it fails, the
 * save still counts and the row reads the photo.
 */
export async function saveFoodPhoto(
  uid: string,
  mealId: string,
  base64Jpeg: string
): Promise<boolean> {
  let img: HTMLImageElement;
  try {
    img = await decodeJpeg(base64Jpeg);
    await Filesystem.writeFile({
      path: pathFor(uid, mealId),
      data: encodeJpeg(
        img,
        downscaleFactor(
          img.naturalWidth,
          img.naturalHeight,
          MAX_EDGE_PX,
          "long"
        )
      ),
      directory: Directory.LibraryNoCloud,
      recursive: true,
    });
  } catch (err) {
    logger.warn("[foodPhoto] local save skipped:", err);
    return false;
  }
  try {
    await Filesystem.writeFile({
      path: thumbPathFor(uid, mealId),
      data: encodeJpeg(
        img,
        downscaleFactor(
          img.naturalWidth,
          img.naturalHeight,
          THUMB_EDGE_PX,
          "short"
        )
      ),
      directory: Directory.LibraryNoCloud,
      recursive: true,
    });
  } catch (err) {
    logger.warn("[foodPhoto] thumbnail skipped:", err);
  }
  return true;
}

/**
 * What the diary row draws for a meal, as a `data:image/jpeg;base64,…`
 * URL: its thumbnail, or for a photo saved before thumbnails were, the
 * photo itself. Null when there is neither (the common case — most logs
 * have no photo at all) or the read fails.
 */
export async function readFoodPhotoSrc(
  uid: string,
  mealId: string
): Promise<string | null> {
  return (
    (await readJpegSrc(thumbPathFor(uid, mealId))) ??
    (await readJpegSrc(pathFor(uid, mealId)))
  );
}

async function readJpegSrc(path: string): Promise<string | null> {
  try {
    const { data } = await Filesystem.readFile({
      path,
      directory: Directory.LibraryNoCloud,
    });
    /* `data` is typed `string | Blob` because readFile CAN yield a Blob
       on web — but only when the caller wrote one. `saveFoodPhoto` always
       writes bare base64, and the web backend stores that string verbatim
       and returns it unchanged (`web.js` readFile → `entry.content`), so
       the string branch is the only reachable one on either platform. The
       guard is a boundary assertion, not a live branch: if that ever
       stops holding we want a text row, not a broken <img>. */
    if (typeof data !== "string" || !data) return null;
    return `data:image/jpeg;base64,${data}`;
  } catch {
    // Missing file is the ordinary case, not an error worth logging.
    return null;
  }
}

/** One stored photo, as the sweep sees it: the photo and its thumbnail
 *  together, or whichever of the two is there. */
export interface StoredPhoto {
  mealId: string;
  /** Last-modified epoch ms — capture time, since blobs are written once
   *  and never rewritten. If that ever stops being true, eviction
   *  ordering silently becomes wrong. With both files, the older. */
  mtime: number;
  /** Both files' bytes, so the budget counts the thumbnail too. */
  bytes: number;
}

/** Every photo held for `uid`. Empty array when the directory does not
 *  exist yet, which is the state for every user who has never scanned. */
export async function listFoodPhotos(uid: string): Promise<StoredPhoto[]> {
  try {
    const { files } = await Filesystem.readdir({
      path: dirFor(uid),
      directory: Directory.LibraryNoCloud,
    });
    const byMeal = new Map<string, StoredPhoto>();
    for (const f of files) {
      if (f.type === "directory") continue;
      const mealId = mealIdFromFileName(f.name);
      if (!mealId) continue;
      /* NOTE `bytes` is not the same unit on both platforms: native
         reports real file size, the web backend reports the stored
         base64 string's LENGTH (`web.js` writeFile: `size: data.length`),
         which runs ~37% high. That makes the byte budget merely stricter
         on web, never looser, so it is left uncorrected — a conversion
         factor here would be a second thing to keep true. */
      const held = byMeal.get(mealId);
      if (held) {
        held.mtime = Math.min(held.mtime, f.mtime);
        held.bytes += f.size;
      } else {
        byMeal.set(mealId, { mealId, mtime: f.mtime, bytes: f.size });
      }
    }
    return [...byMeal.values()];
  } catch {
    return [];
  }
}

/** Delete a meal's photo and its thumbnail. */
export async function deleteFoodPhoto(
  uid: string,
  mealId: string
): Promise<void> {
  for (const path of [pathFor(uid, mealId), thumbPathFor(uid, mealId)]) {
    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.LibraryNoCloud,
      });
    } catch {
      // Already gone is success.
    }
  }
}

/** Remove every photo for one uid. Used on account deletion and from the
 *  Settings "delete meal photos on this device" action. */
export async function purgeFoodPhotos(uid: string): Promise<void> {
  try {
    await Filesystem.rmdir({
      path: dirFor(uid),
      directory: Directory.LibraryNoCloud,
      recursive: true,
    });
  } catch (err) {
    logger.warn("[foodPhoto] purge skipped:", err);
  }
}

export interface EvictionPolicy {
  now: number;
  maxAgeDays?: number;
  maxTotalBytes?: number;
  /** Meal ids known to be hard-deleted or otherwise photo-less.
   *
   *  POSITIVE EVIDENCE ONLY. It is NOT "the meals currently loaded" —
   *  `useMeals` paginates, so an absence means "not in this page", never
   *  "does not exist". Phrasing the rule the other way round is the way
   *  this ships silent data loss to exactly the heavy users the feature
   *  is for. */
  orphanedMealIds?: ReadonlySet<string>;
}

/**
 * Decide which photos to drop. PURE — no Capacitor, no clock, no I/O —
 * so the whole retention policy is testable without a device.
 *
 * Order: known orphans first, then anything past the age cap, then
 * oldest-first until the total fits the byte budget.
 */
export function planEviction(
  photos: readonly StoredPhoto[],
  policy: EvictionPolicy
): string[] {
  const {
    now,
    maxAgeDays = MAX_AGE_DAYS,
    maxTotalBytes = MAX_TOTAL_BYTES,
    orphanedMealIds,
  } = policy;

  const doomed = new Set<string>();

  if (orphanedMealIds) {
    for (const p of photos) {
      if (orphanedMealIds.has(p.mealId)) doomed.add(p.mealId);
    }
  }

  const cutoff = now - maxAgeDays * DAY_MS;
  for (const p of photos) {
    if (p.mtime < cutoff) doomed.add(p.mealId);
  }

  const survivors = photos
    .filter((p) => !doomed.has(p.mealId))
    .sort((a, b) => a.mtime - b.mtime); // oldest first

  /* Oldest-first until the total fits — but never the LAST survivor.
     A user who has just scanned must see that scan; evicting the newest
     photo to satisfy a byte budget is a worse outcome than being over
     it, and it is reachable, because the web backend reports a photo's
     size as its base64 LENGTH (~37% high) so the budget bites sooner
     there than the numbers suggest. The age cap may still empty the
     store — an expired photo is genuinely unreachable — but the budget
     may not. */
  let total = survivors.reduce((sum, p) => sum + p.bytes, 0);
  for (const p of survivors.slice(0, -1)) {
    if (total <= maxTotalBytes) break;
    doomed.add(p.mealId);
    total -= p.bytes;
  }

  return [...doomed];
}

/**
 * Apply the retention policy. Returns how many photos were dropped.
 * Safe to call on every session; cheap when there is nothing to do
 * (one `readdir`, no reads).
 */
export async function sweepFoodPhotos(
  uid: string,
  policy?: Partial<EvictionPolicy>
): Promise<number> {
  const photos = await listFoodPhotos(uid);
  if (!photos.length) return 0;
  const doomed = planEviction(photos, { now: Date.now(), ...policy });
  for (const mealId of doomed) {
    await deleteFoodPhoto(uid, mealId);
  }
  if (doomed.length) {
    logger.log(`[foodPhoto] swept ${doomed.length} expired photo(s)`);
  }
  return doomed.length;
}

/** uids already swept in this session — the policy is cheap but not free
 *  (one readdir), and running it on every Food-page mount would be. */
const sweptThisSession = new Set<string>();

/**
 * Run the retention sweep at most once per uid per session. Safe to call
 * from a mount effect; resolves immediately on repeat calls.
 *
 * Deliberately NOT given an `orphanedMealIds` set built from the loaded
 * meals: `useMeals` paginates, so "not in the loaded page" does not mean
 * "deleted", and an eviction rule phrased that way would delete live
 * photos for exactly the heavy users this feature exists for. Photos
 * belonging to soft-deleted meals are collected by the age cap instead.
 */
export async function sweepFoodPhotosOnce(uid: string): Promise<void> {
  if (!uid || sweptThisSession.has(uid)) return;
  sweptThisSession.add(uid);
  try {
    await sweepFoodPhotos(uid);
  } catch (err) {
    logger.warn("[foodPhoto] sweep failed:", err);
  }
}

/* Deliberately NO reset seam. `symbolReachability` refuses an export
   nothing outside the module calls, and it is right to: the guard is
   keyed by uid, so a test proves both halves by using a fresh uid per
   case rather than by reaching in and clearing state production never
   clears. */
