/**
 * Hand a file to the person: the share sheet where there is one, a
 * download on the web.
 *
 * The Web Share API opens the real iOS share sheet inside the Capacitor
 * WKWebView (Save to Files, AirDrop, Mail, Open in Strava…), so the native
 * app needs no plugin. What the native app cannot do is download: WKWebView
 * drops a blob `<a download>` without a word, so a download fallback there
 * claims a file that was never saved. Exports said "exported" on iPhone
 * while nothing happened. Here the native app either shares or fails, and
 * only the web falls back to a download.
 *
 * Outcomes, for the caller's toast:
 *  - "shared": the share sheet took the file;
 *  - "downloaded": the web download ran;
 *  - "cancelled": the person closed the share sheet. Not an error, so the
 *    caller says nothing;
 *  - "blocked": the sheet refused to open (NotAllowedError) because the
 *    tap that asked for it is too long ago. A share must follow a tap
 *    closely, and work awaited in between (a Firestore read) can use that
 *    time up. Only a fresh tap can open it, so a caller that awaited
 *    something offers one. Native only: the web downloads instead;
 *  - "failed": nothing was shared or saved.
 *
 * Sharing a file with `text` as well makes some iOS targets save the text
 * as a second file, so an export passes the file alone.
 */
import { logger } from "./logger";
import { isNativePlatform } from "./platform";

export type ShareFileOutcome =
  | "shared"
  | "downloaded"
  | "cancelled"
  | "blocked"
  | "failed";

export interface ShareFileOptions {
  title?: string;
  text?: string;
}

/** Whether this device's share sheet takes this file. */
export function canShareFile(file: File): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function"
  ) {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function errorName(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? (error as { name?: string }).name
    : undefined;
}

export async function shareFile(
  file: File,
  options: ShareFileOptions = {}
): Promise<ShareFileOutcome> {
  const native = isNativePlatform();
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], ...options });
      return "shared";
    } catch (error) {
      const name = errorName(error);
      if (name === "AbortError") return "cancelled";
      if (native) {
        if (name === "NotAllowedError") return "blocked";
        logger.error("[shareFile] share failed", error);
        return "failed";
      }
      logger.warn("[shareFile] share failed; downloading instead", error);
    }
  } else if (native) {
    logger.warn("[shareFile] this device's share sheet takes no files");
    return "failed";
  }
  return downloadFile(file);
}

/** The web's way to hand over a file. Never called on native. */
function downloadFile(file: File): ShareFileOutcome {
  try {
    if (
      typeof document === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      return "failed";
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    // In the document: Firefox ignores a click on a detached link.
    document.body.append(link);
    link.click();
    link.remove();
    /* Revoked on the next turn, not at once: a browser that starts the
       download asynchronously would find the URL gone. */
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Nothing to clean up.
      }
    }, 0);
    return "downloaded";
  } catch (error) {
    logger.error("[shareFile] download failed", error);
    return "failed";
  }
}
