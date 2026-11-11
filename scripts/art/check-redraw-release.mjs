/** Browser-smoke a released versioned form-art set in the production player.
 * Start Vite with HOSTING_TARGET=firebase and run with one or more exercise IDs.
 *   node scripts/art/check-redraw-release.mjs db-bench hack-squat
 *   node scripts/art/check-redraw-release.mjs --date=2026-10-28 --port=4177 front-squat
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const dateOption = args.find((arg) => arg.startsWith("--date="));
const date = dateOption?.slice("--date=".length) ?? "2026-10-27";
const portOption = args.find((arg) => arg.startsWith("--port="));
const port = portOption?.slice("--port=".length) ?? "4177";
const ids = args.filter((arg) => arg !== dateOption && arg !== portOption);
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
  !/^\d{1,5}$/.test(port) ||
  Number(port) < 1 ||
  Number(port) > 65535 ||
  !ids.length ||
  ids.some((id) => !/^[a-z0-9-]+$/.test(id))
) {
  throw new Error("Usage: check-redraw-release.mjs [--date=YYYY-MM-DD] [--port=PORT] <exercise-id> [...]");
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] }
    : {}),
});
try {
  for (const id of ids) {
    for (const theme of ["dark", "light"]) {
      const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`http://127.0.0.1:${port}/e2e/fixtures/form-art.html`);
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
        }, `/form-frames/${id}/${date}/${frame}.webp`);
        await guide.getByRole("button", { name: "Next frame" }).click();
      }
      await guide.locator('img[aria-hidden="false"]').evaluate(async (node, expected) => {
        const img = /** @type {HTMLImageElement} */ (node);
        if (!img.src.endsWith(expected)) throw new Error(`Loop did not return: ${img.src}`);
        await img.decode();
      }, `/form-frames/${id}/${date}/1.webp`);
      const tooWide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (tooWide || errors.length) throw new Error(`${id}/${theme}: overflow=${tooWide}; errors=${errors.join(" | ")}`);
      await page.close();
    }
    console.log(`${id}: six frames and loop passed in dark and light at 393×852`);
  }
} finally {
  await browser.close();
}
