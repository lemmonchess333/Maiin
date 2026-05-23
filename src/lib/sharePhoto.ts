import { logger } from "./logger";
import { stripDataUrlPrefix } from "./base64Helpers";

/**
 * Module-level cached support check. Computed once per session.
 * The answer never changes within a single app run, so recomputing
 * on every component mount is wasted work.
 */
const PHOTO_SHARE_SUPPORTED: boolean = (() => {
  if (typeof navigator === "undefined") return false;
  if (!navigator.canShare) return false;
  try {
    const testFile = new File(["test"], "test.jpg", { type: "image/jpeg" });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
})();

/**
 * Check whether the Web Share API with file support is available.
 * Returns a cached boolean — safe to call on every render.
 */
export function isPhotoShareSupported(): boolean {
  return PHOTO_SHARE_SUPPORTED;
}

/**
 * Open the iOS share sheet with a captured photo.
 * User can pick "Save Image" to save to their Photos library.
 * Returns true on successful share, false on cancel/unsupported/error.
 */
export async function sharePhotoToLibrary(
  base64: string,
  filename = `tropos-meal-${Date.now()}.jpg`,
): Promise<boolean> {
  // Guard against empty/missing input
  if (!base64 || typeof base64 !== "string") {
    logger.warn("[sharePhoto] No base64 provided");
    return false;
  }

  try {
    // Strip data URL prefix if present (defensive — handles both formats)
    const payload = stripDataUrlPrefix(base64);

    // Convert base64 → Blob → File
    const byteString = atob(payload);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: "image/jpeg" });
    const file = new File([blob], filename, { type: "image/jpeg" });

    // Defensive — isPhotoShareSupported should have been called first,
    // but guard anyway
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
      logger.warn("[sharePhoto] Web Share API with files not supported");
      return false;
    }

    await navigator.share({
      files: [file],
      title: "Tropos meal",
    });
    return true;
  } catch (err) {
    // User cancelled — not an error, return false silently
    if (err instanceof Error && err.name === "AbortError") return false;
    // Malformed base64 (atob throws InvalidCharacterError) or any other failure
    logger.error("[sharePhoto] Share failed:", err);
    return false;
  }
}
