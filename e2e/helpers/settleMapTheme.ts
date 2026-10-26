import { expect, type Page } from "@playwright/test";

/**
 * After a capture flips the theme, waits for each map on the page to draw
 * the basemap of that theme. A map draws the theme on screen and builds
 * itself again when it changes (RunMap.tsx), so the frame taken straight
 * after the flip caught the old basemap, or none. Each map says which one
 * it draws in `data-map-theme`. A page with no map returns at once.
 */
export async function settleMapTheme(page: Page): Promise<void> {
  const maps = page.locator("[data-map-theme]");
  if ((await maps.count()) === 0) return;
  const theme = await page.evaluate(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );
  for (const map of await maps.all())
    await expect(map).toHaveAttribute("data-map-theme", theme, {
      timeout: 10_000,
    });
  // The new style's first tiles. Nothing in the DOM says they have landed,
  // and a rig without tiles shows the map's unavailable note instead.
  await page.waitForTimeout(1500);
}
