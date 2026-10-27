/** Browser-smoke a released versioned form-art set in the production player.
 * Start Vite with HOSTING_TARGET=firebase and run with one or more exercise IDs.
 *   node scripts/art/check-redraw-release.mjs db-bench hack-squat
 */
import { chromium } from "playwright";

const ids = process.argv.slice(2);
if (!ids.length || ids.some((id) => !/^[a-z0-9-]+$/.test(id))) {
  throw new Error("Usage: check-redraw-release.mjs <exercise-id> [...]");
}
const browser = await chromium.launch({ headless: true });
try {
  for (const id of ids) {
    for (const theme of ["dark", "light"]) {
      const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto("http://127.0.0.1:4177/e2e/fixtures/form-art.html");
      await page.getByRole("combobox", { name: "Exercise" }).selectOption(id);
      if (theme === "light") await page.getByRole("button", { name: "Light theme" }).click();
      const guide = page.getByRole("region", { name: `${id} form guide` });
      await guide.getByRole("button", { name: "Pause", exact: true }).click();
      for (let frame = 1; frame <= 6; frame++) {
        const image = guide.locator('img[aria-hidden="false"]');
        await image.waitFor({ state: "visible" });
        await image.evaluate(async (node, expected) => {
          const img = /** @type {HTMLImageElement} */ (node);
          if (!img.src.endsWith(expected)) throw new Error(`Unexpected image ${img.src}`);
          await img.decode();
        }, `/form-frames/${id}/2026-10-27/${frame}.webp`);
        await guide.getByRole("button", { name: "Next frame" }).click();
      }
      await guide.locator('img[aria-hidden="false"]').evaluate(async (node, expected) => {
        const img = /** @type {HTMLImageElement} */ (node);
        if (!img.src.endsWith(expected)) throw new Error(`Loop did not return: ${img.src}`);
        await img.decode();
      }, `/form-frames/${id}/2026-10-27/1.webp`);
      const tooWide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (tooWide || errors.length) throw new Error(`${id}/${theme}: overflow=${tooWide}; errors=${errors.join(" | ")}`);
      await page.close();
    }
    console.log(`${id}: six frames and loop passed in dark and light at 393×852`);
  }
} finally {
  await browser.close();
}
