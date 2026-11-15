/**
 * Share a Space (Run27 call 11): its link, `publicSpaceUrl`, through the
 * share sheet, and a copied link where there is none.
 *
 * The share sheet is the Web Share API, which inside the Capacitor
 * WKWebView opens the real iOS share sheet (Messages, Mail, AirDrop, Copy),
 * as every other share in Tropos does (src/lib/shareFile.ts), so the app
 * needs no plugin. A browser without `navigator.share` (most desktops)
 * copies the link instead, and so does a share sheet that refuses to open.
 *
 * Outcomes, for the caller's toast:
 *  - "shared": the sheet took the link;
 *  - "cancelled": the person closed the sheet. Not an error: say nothing;
 *  - "copied": the link is on the clipboard;
 *  - "failed": neither worked.
 */
import { publicSpaceUrl } from "@/lib/publicLinks";
import { logger } from "@/lib/logger";

export type ShareSpaceOutcome = "shared" | "cancelled" | "copied" | "failed";

/** What the share sheet carries: the Space's name and its link. */
export function spaceSharePayload(space: { id: string; name: string }) {
  return {
    title: space.name,
    text: `Join me in ${space.name} on Tropos`,
    url: publicSpaceUrl(space.id),
  };
}

async function copyLink(url: string): Promise<ShareSpaceOutcome> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText)
      return "failed";
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (error) {
    logger.warn("[shareSpace] copy failed", error);
    return "failed";
  }
}

export async function shareSpace(space: {
  id: string;
  name: string;
}): Promise<ShareSpaceOutcome> {
  const payload = spaceSharePayload(space);
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share(payload);
      return "shared";
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError")
        return "cancelled";
      logger.warn("[shareSpace] share sheet refused; copying instead", error);
    }
  }
  return copyLink(payload.url);
}
