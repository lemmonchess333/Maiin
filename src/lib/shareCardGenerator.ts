import type {
  ShareFormat,
  ShareBackground,
} from "@/components/share/ShareCardRenderer";
import { logger } from "@/lib/logger";
import { shareFile } from "@/lib/shareFile";

const FORMAT_DIMS: Record<ShareFormat, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

/**
 * Rasterise a ShareCardRenderer node to a PNG File (SOCIAL S1).
 * Rendered at pixelRatio 2 for crispness; the node paints its own
 * background (brand gradient / dark / transparent), so we never pass a
 * fill — that keeps `transparent` genuinely transparent for the overlay
 * use case. Returns null on failure (caller surfaces a toast).
 */
export async function generateShareImage(
  node: HTMLElement,
  opts: { format: ShareFormat; background: ShareBackground }
): Promise<File | null> {
  try {
    const { toBlob } = await import("html-to-image");
    const { w, h } = FORMAT_DIMS[opts.format];
    const blob = await toBlob(node, {
      width: w,
      height: h,
      pixelRatio: 2,
      cacheBust: true,
      // No backgroundColor: the node's own inline background renders, and
      // omitting it preserves a transparent export for `transparent` mode.
    });
    if (!blob) return null;
    return new File([blob], `tropos-${opts.format}.png`, { type: "image/png" });
  } catch (e) {
    logger.error("Share image generation failed:", e);
    return null;
  }
}

/**
 * Hand a generated share card to the share sheet (Web Share API — works in
 * browsers AND the iOS WKWebView), falling back to a download on the web
 * only: the native app has no download, so there a card the sheet cannot
 * take is a failure, not a silent "downloaded". A user-cancelled share
 * reports "cancelled", not a failure, so the caller doesn't show an error
 * toast. The mechanism is shareFile's (src/lib/shareFile.ts), which the
 * data exports share.
 *
 * The card is drawn after an await, so the tap that asked for it can have
 * expired by the time the sheet is asked for ("blocked"). Here that is a
 * failure: ShareCardSheet says "Couldn't share. Try again.", and tapping
 * Share again is the fresh tap the sheet needs.
 *
 * NATIVE SEAM: when @capacitor/share is added (needs `cap sync`), swap
 * the navigator.share branch in shareFile for the plugin on native.
 */
export async function shareImageFile(
  file: File,
  text: string
): Promise<"shared" | "downloaded" | "cancelled" | "failed"> {
  const outcome = await shareFile(file, { text });
  return outcome === "blocked" ? "failed" : outcome;
}
