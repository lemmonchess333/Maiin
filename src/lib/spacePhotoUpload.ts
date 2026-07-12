/**
 * Space post photo upload (Spc1 PR4 — the operator's Runna-parity
 * amendment: "post in these spaces with photos of yourself").
 *
 * Mirrors foodPhotoUpload's pipeline (decode → downscale to 1280px
 * longest edge via <img> + canvas for WKWebView compatibility →
 * JPEG re-encode → uploadBytes) but takes a picker File instead of a
 * base64 capture, and — unlike the diary — the photo here is CORE
 * post content, so failures REJECT (the composer keeps the sheet
 * open and tells the user) rather than resolving null.
 *
 * Storage contract: space-photos/{uid}/{ts}.jpg — owner-write /
 * authenticated-read (posts are visible to every signed-in user),
 * 10MB rule cap (client re-encode lands far under), swept by the
 * account-deletion executor's prefix cleanup (inventory:
 * spacePhotosStorage).
 */
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

const STORAGE_PREFIX = "space-photos";
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.8;
const UPLOAD_CEILING_MS = 30_000;

async function fileToUploadBlob(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("photo decode failed"));
      img.src = objectUrl;
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

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("photo encode failed")),
        "image/jpeg",
        JPEG_QUALITY
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Upload a post photo; resolves to the download URL. THROWS on
 * failure — the composer surfaces the error and keeps the draft.
 */
export async function uploadSpacePostPhoto(
  uid: string,
  file: File
): Promise<string> {
  const work = (async () => {
    const blob = await fileToUploadBlob(file);
    const photoPath = `${STORAGE_PREFIX}/${uid}/${Date.now()}.jpg`;
    const blobRef = ref(storage, photoPath);
    await uploadBytes(blobRef, blob, {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    });
    return getDownloadURL(blobRef);
  })();
  const ceiling = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("photo upload timed out")),
      UPLOAD_CEILING_MS
    )
  );
  return Promise.race([work, ceiling]);
}
