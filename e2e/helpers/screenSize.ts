/**
 * Sizes the page to a screen, as a touch screen when it is one. The wide
 * layouts (src/lib/wideScreen.ts: the iPhone Duo's inner display) answer
 * only a coarse pointer, so a desktop window keeps the phone layout every
 * other spec measures; a capture of the Duo has to be a touch screen to
 * see them, as the phone is. Touch is switched on for the page's own
 * session, so a test can change size without a new context.
 */
import type { CDPSession, Page } from "@playwright/test";

export type ScreenSize = {
  width: number;
  height: number;
  /** A touch screen: `(pointer: coarse)` matches. */
  touch?: boolean;
};

/** The page's own session, and whether touch is on in it. */
const sessions = new WeakMap<Page, { cdp: CDPSession; touch: boolean }>();

export async function sizeTo(page: Page, size: ScreenSize): Promise<void> {
  await page.setViewportSize({ width: size.width, height: size.height });
  const touch = !!size.touch;
  const known = sessions.get(page);
  // Nothing to switch: touch is off until a size turns it on.
  if (!known && !touch) return;
  if (known?.touch === touch) return;
  const cdp = known?.cdp ?? (await page.context().newCDPSession(page));
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: touch,
    maxTouchPoints: touch ? 5 : 0,
  });
  sessions.set(page, { cdp, touch });
}
