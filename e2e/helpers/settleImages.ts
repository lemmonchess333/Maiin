import type { Page } from "@playwright/test";

/**
 * Wait for every image on the page to finish decoding, before the shutter.
 *
 * D25's residue. After the theme-transition fix (D22) and the
 * animation-freeze sweep (D23), a handful of frames kept churning
 * run-to-run with no code change, and one got WORSE. Located by reading
 * the diff mask rather than guessing: `races-directory-light`'s changed
 * pixels sat in one band covering the challenge card's PHOTOGRAPH, not the
 * countdown beside it — a countdown would diff as a thin strip.
 *
 * The probe shipped on `races.screens.capture.spec.ts` alone, deliberately,
 * to be judged on the next diff rather than swept on a hypothesis. It was
 * judged, and it worked:
 *
 *     races-directory-light   10.88%  ->  unchanged  ->  0.56%
 *
 * `decode()` rather than polling `.complete`, because `complete` is true
 * for a failed load too and says nothing about whether the pixels are
 * ready to paint. Both the outer call and each decode swallow their
 * errors: a broken image must not fail a capture run, and a frame with one
 * missing asset is still worth having.
 *
 * Note what this does NOT fix. Image dimensions are known before decode,
 * so the document height is already stable — `settleFullPageHeight` and
 * this helper address different halves of "is the page ready", and a frame
 * with both remote imagery and late-mounting cards wants both.
 */
export async function settleImages(page: Page): Promise<void> {
  await page
    .evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
    })
    .catch(() => undefined);
}
