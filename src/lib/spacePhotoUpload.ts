/**
 * Space post photo upload (Spc1 PR4 — the operator's Runna-parity
 * amendment: "post in these spaces with photos of yourself").
 *
 * Mirrors foodPhotoStore's pipeline (decode → downscale to 1280px
 * longest edge via <img> + canvas for WKWebView compatibility →
 * JPEG re-encode → uploadBytes; the shared `encodeJpeg`, which also
 * leaves the photo's EXIF, its location included, behind) but takes a
 * picker File instead of a base64 capture, and — unlike the diary — the
 * photo here is CORE post content, so failures REJECT (the composer
 * keeps the sheet open and tells the user) rather than resolving null.
 *
 * Storage contract: space-photos/{uid}/{ts}.jpg — owner-write /
 * authenticated-read (posts are visible to every signed-in user),
 * 10MB rule cap (client re-encode lands far under), swept by the
 * account-deletion executor's prefix cleanup (inventory:
 * spacePhotosStorage).
 */
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";
import { encodeJpeg } from "./imageEncode";
import { screenUploadedPhoto } from "./photoScreen";

const STORAGE_PREFIX = "space-photos";
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.8;
const UPLOAD_CEILING_MS = 30_000;

/**
 * Upload a post photo; resolves to the download URL. THROWS on
 * failure — the composer surfaces the error and keeps the draft.
 */
export async function uploadSpacePostPhoto(
  uid: string,
  file: File
): Promise<string> {
  const work = (async () => {
    const { blob } = await encodeJpeg(file, {
      maxEdge: MAX_EDGE_PX,
      quality: JPEG_QUALITY,
    });
    const photoPath = `${STORAGE_PREFIX}/${uid}/${Date.now()}.jpg`;
    const blobRef = ref(storage, photoPath);
    await uploadBytes(blobRef, blob, {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    });
    // Ship1: screened for nudity before the post can name it.
    await screenUploadedPhoto(photoPath);
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
