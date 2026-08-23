import type { Page } from "@playwright/test";

/**
 * Wait until the document has stopped growing, before a `fullPage` shot.
 *
 * A fullPage screenshot captures the whole document, so its dimensions are
 * a claim about the page's final layout. The capture specs gate on a
 * visible element and a fixed pause — which proves that ONE element
 * arrived, and says nothing about what is still mounting below it.
 *
 * That is not hypothetical. `home-energy-default-after.png` measured, over
 * four consecutive captures with no relevant code change:
 *
 *     393x1191  ->  393x1190  ->  393x1458  ->  393x1191
 *
 * The one-pixel moves are rounding. The 267px jump is a different page:
 * Home is data-heavy (`useHomeData`, lazily-mounted cards, Firestore
 * snapshots), and its anchor — "Today's Energy" becoming visible — sits
 * near the TOP, so the shutter can fire while a card below the fold is
 * still arriving. A frame that swings 267px between runs cannot be diffed,
 * which means a real regression on Home has somewhere to hide.
 *
 * Height rather than `networkidle`: Firestore holds long-lived listeners,
 * so a page with live subscriptions may never report the network idle.
 * Document height is the thing a fullPage shot actually depends on, and it
 * settles.
 *
 * Deliberately best-effort. If the height never stabilises — a live
 * counter, an infinite skeleton — this returns at the cap and the caller
 * shoots anyway, which is exactly today's behaviour. It can make a frame
 * better and cannot make one worse.
 *
 * WHAT IT DOES NOT FIX, measured rather than assumed. It was added for
 * the `home-energy-default-after` swing above and did not close it: the
 * next capture came back 1358, a third distinct height. Reading the two
 * frames side by side showed why — both are painted to the bottom edge,
 * so neither is a half-mounted page. The difference is CONTENT: one has
 * "70.0 kg / From profile" and a real calorie total, the other "Tap to
 * log" and a partial line. Those are loading states, and Home renders
 * them as ordinary empty states rather than skeletons, so they sit
 * height-stable for longer than any settle window and this helper returns
 * on a page that is stable but not final.
 *
 * The fix for that is a content anchor in the spec — assert the data the
 * frame exists to show has arrived. This helper is kept because a
 * fullPage shot should wait for layout on its own terms, not because it
 * solved that frame.
 */
export async function settleFullPageHeight(
  page: Page,
  { timeoutMs = 6_000, stableForMs = 500, pollMs = 150 } = {}
): Promise<number> {
  const started = Date.now();
  let last = -1;
  let unchangedSince = Date.now();

  while (Date.now() - started < timeoutMs) {
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight
    );
    if (height !== last) {
      last = height;
      unchangedSince = Date.now();
    } else if (Date.now() - unchangedSince >= stableForMs) {
      return height;
    }
    await page.waitForTimeout(pollMs);
  }
  return last;
}
