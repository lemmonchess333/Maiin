/**
 * Profile-photo client-side processing pipeline.
 *
 * ## Why this lives in lib/ as a pure function
 *
 * Profile photos are uploaded to a Firebase Storage path that's
 * authenticated-readable to every signed-in user (`profile-photos/{uid}/`)
 * and the resulting download URL embeds a permanent token — anyone
 * who obtains the URL can fetch the underlying file regardless of
 * Firestore rules. That makes plaintext metadata in the uploaded blob
 * a privacy leak: modern phone photos embed GPS coordinates, original
 * filename/path, device identifiers, and timestamps in EXIF/IPTC/XMP.
 *
 * The pipeline is pure (input: File → output: Blob) so it can be unit-
 * tested deterministically and reused on any platform that has a
 * `<canvas>`.
 *
 * ## What it does, in order
 *
 *   1. Reject HEIC/HEIF up front. iOS Safari sometimes auto-converts
 *      these to JPEG on file pick but the behavior is unreliable.
 *      A clear error is better than a silent canvas decode failure.
 *   2. Decode the file into an `<img>`, then onto an offscreen canvas.
 *      This is the metadata-stripping step: canvas reads only pixel
 *      data — EXIF, IPTC, XMP, JPEG comment markers, embedded ICC
 *      profiles, and Photoshop tags are all discarded by this round-
 *      trip. The output blob is pixels-only.
 *   3. Center-crop to a square. We do this BEFORE resizing so the
 *      face is preserved when the source is a tall portrait.
 *   4. Resize to 512×512 — large enough for retina avatars, small
 *      enough that the upload is sub-100KB at JPEG q=0.85.
 *   5. Re-encode as `image/jpeg` (NOT WebP — universal Safari support).
 *
 * ## Defense-in-depth notes
 *
 * - Canvas explicit color space is `srgb` to neutralize any embedded
 *   ICC profile that might survive the round-trip on certain
 *   browsers.
 * - We validate the decoded image dimensions before drawing, to avoid
 *   decompression-bomb scenarios where a tiny file decodes to a
 *   gigantic raster.
 * - The output Blob's MIME is checked at the end as a sanity guard.
 */

const TARGET_SIZE = 512;
const JPEG_QUALITY = 0.85;
const MAX_INPUT_DIMENSION = 8192; // hard cap to avoid decompression bombs
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1MB; rule is 5MB so plenty of headroom

export class ProfilePhotoProcessingError extends Error {
  /* `code` is a stable machine-readable variant; the message is human
     copy. Callers branch on `code` (e.g. to retry vs. show a HEIC
     conversion hint), not the message. */
  readonly code: ProfilePhotoErrorCode;
  constructor(code: ProfilePhotoErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ProfilePhotoProcessingError";
  }
}

export type ProfilePhotoErrorCode =
  | "heic_unsupported"
  | "non_image"
  | "decode_failed"
  | "too_large"
  | "encode_failed";

/**
 * Returns true when the file appears to be HEIC/HEIF based on either
 * its declared MIME type or its filename extension. Belt-and-braces
 * because some browsers report empty/wrong MIME for picked files.
 */
export function isHeic(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  const name = (file.name || "").toLowerCase();
  return /\.(heic|heif)$/.test(name);
}

/**
 * Decode → square crop → resize → re-encode. Throws
 * ProfilePhotoProcessingError with a typed code on rejection so the UI
 * can show a specific message per failure mode.
 */
export async function processProfilePhoto(file: File): Promise<Blob> {
  if (isHeic(file)) {
    throw new ProfilePhotoProcessingError(
      "heic_unsupported",
      "iPhone HEIC photos aren't supported yet. Open the photo in Photos, tap Share, then choose Save as JPEG — or take a new one.",
    );
  }

  if (!(file.type || "").startsWith("image/")) {
    throw new ProfilePhotoProcessingError("non_image", "Please choose an image file.");
  }

  const img = await loadImage(file);

  if (img.naturalWidth > MAX_INPUT_DIMENSION || img.naturalHeight > MAX_INPUT_DIMENSION) {
    throw new ProfilePhotoProcessingError(
      "too_large",
      "Image is too large to process. Use a photo under 8000 pixels per side.",
    );
  }
  if (img.naturalWidth === 0 || img.naturalHeight === 0) {
    throw new ProfilePhotoProcessingError("decode_failed", "Couldn't read the image.");
  }

  const blob = await encodeSquareJpeg(img);

  if (blob.size > MAX_OUTPUT_BYTES) {
    /* Should never happen at 512² q=0.85; defensive guard so a bizarre
       input can't sneak past the Storage rule's 5MB limit and waste an
       upload round-trip. */
    throw new ProfilePhotoProcessingError("too_large", "Encoded image is unexpectedly large.");
  }
  if (!blob.type.startsWith("image/")) {
    throw new ProfilePhotoProcessingError("encode_failed", "Couldn't encode the image.");
  }

  return blob;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ProfilePhotoProcessingError("decode_failed", "Couldn't read the image."));
    };
    img.src = url;
  });
}

function encodeSquareJpeg(img: HTMLImageElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    /* Center-crop to square BEFORE downscale. Faces are typically
       centered vertically in portrait photos, and the bottom-edge
       crop preserves more useful pixels than scaling the full
       portrait to 512×512 and squashing the aspect ratio. */
    const sx = Math.max(0, (img.naturalWidth - img.naturalHeight) / 2);
    const sy = Math.max(0, (img.naturalHeight - img.naturalWidth) / 2);
    const sSize = Math.min(img.naturalWidth, img.naturalHeight);

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    /* Explicit srgb color space neutralizes any embedded ICC profile
       that might survive canvas → JPEG round-trip on Chromium. */
    const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
    if (!ctx) {
      reject(new ProfilePhotoProcessingError("encode_failed", "Couldn't create a canvas."));
      return;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, TARGET_SIZE, TARGET_SIZE);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new ProfilePhotoProcessingError("encode_failed", "Couldn't encode the image."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
