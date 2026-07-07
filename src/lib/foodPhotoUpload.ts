/**
 * Food photo persistence — commit 2 of the diary-timeline arc ("mixed
 * feed: photos big, text compact"). Uploads the AI-scan capture to
 * Storage so the diary can render it as a photo card; pre-photo-
 * persistence the camera flow discarded the image after analysis.
 *
 * Contract (deliberately different from profilePhotoUpload's
 * single-blob policy): every meal keeps its own blob for the life of
 * the meal doc. Meal deletion is SOFT (deletedAt + 24h restore), so
 * the blob is never deleted with the meal — orphans are swept by the
 * account-deletion executor's `food-photos/{uid}/` prefix cleanup,
 * the same trade-off ProgressPhotos ships with.
 *
 * Failure mode: the photo is an enhancement, never a gate. Callers
 * fire this AFTER the meal doc is saved and merge the URL in when it
 * lands; any failure (offline, rules, decode) resolves to null and
 * the meal simply stays a text row. A 20s ceiling keeps a stalled
 * mobile upload from holding the promise open forever.
 */

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";
import { logger } from "./logger";

const STORAGE_PREFIX = "food-photos";
/** Longest edge after downscale. Captures come in at native camera
 *  resolution (1280–1920+); the feed card renders ~360pt wide, so
 *  1280 keeps a 2–3× retina budget while cutting upload weight. */
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.8;
const UPLOAD_CEILING_MS = 20_000;

export interface FoodPhotoResult {
  /** Download URL for <img src> in the diary. */
  photoUrl: string;
  /** Storage path — kept on the doc for future cleanup sweeps. */
  photoPath: string;
}

/** Decode a base64 JPEG, downscale if the longest edge exceeds
 *  MAX_EDGE_PX, and re-encode. Uses <img> + canvas (not
 *  OffscreenCanvas/createImageBitmap) for WKWebView compatibility. */
async function toUploadBlob(base64Jpeg: string): Promise<Blob> {
  const dataUrl = `data:image/jpeg;base64,${base64Jpeg}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("photo decode failed"));
    img.src = dataUrl;
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

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("photo encode failed")),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

/**
 * Upload a captured meal photo. Resolves to null on ANY failure —
 * callers treat null as "no photo" and move on.
 */
export async function uploadFoodPhoto(
  uid: string,
  base64Jpeg: string
): Promise<FoodPhotoResult | null> {
  try {
    const work = (async () => {
      const blob = await toUploadBlob(base64Jpeg);
      // Unique filename per capture (same cache reasoning as
      // profilePhotoUpload: stable paths risk stale browser caches).
      const photoPath = `${STORAGE_PREFIX}/${uid}/${Date.now()}.jpg`;
      const blobRef = ref(storage, photoPath);
      await uploadBytes(blobRef, blob, {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=31536000, immutable",
      });
      const photoUrl = await getDownloadURL(blobRef);
      return { photoUrl, photoPath };
    })();

    const ceiling = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), UPLOAD_CEILING_MS)
    );
    return await Promise.race([work, ceiling]);
  } catch (err) {
    logger.warn("[foodPhoto] upload skipped:", err);
    return null;
  }
}
