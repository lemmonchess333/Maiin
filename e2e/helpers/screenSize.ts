/**
 * Sizes the page to a screen, as a touch screen when it is one. The wide
 * layouts (src/lib/wideScreen.ts: the iPhone Duo's inner display) answer
 * only a coarse pointer, so a desktop window keeps the phone layout every
 * other spec measures; a capture of the Duo has to be a touch screen to
 * see them, as the phone is. Touch is switched on for the page's own
 * session, so a test can change size without a new context.
 */
import type { Page } from "@playwright/test";

export type ScreenSize = {
  width: number;
  height: number;
  /** A touch screen: `(pointer: coarse)` matches. */
  touch?: boolean;
};

export async function sizeTo(page: Page, size: ScreenSize): Promise<void> {
  await page.setViewportSize({ width: size.width, height: size.height });
  if (size.touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
  }
}
