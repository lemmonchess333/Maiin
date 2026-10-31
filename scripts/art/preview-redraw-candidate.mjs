/** Capture a versioned six-frame redraw in the actual phone-size review player.
 * Start Vite with HOSTING_TARGET=firebase, then run:
 *   node scripts/art/preview-redraw-candidate.mjs <id> [date] [port] [scale] [x] [y]
 * Screenshots are review evidence in /tmp; this never changes source artwork.
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const [id, date = "2026-10-27", port = "4177", scale, x, y] =
  process.argv.slice(2);
if (!id || !/^[a-z0-9-]+$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  throw new Error(
    "Usage: preview-redraw-candidate.mjs <exercise-id> [YYYY-MM-DD] [port]"
  );
}
const out = join("/tmp", "redraw-player", id);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] }
    : {}),
});
try {
  for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({
      viewport: { width: 393, height: 852 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const url = new URL(`http://127.0.0.1:${port}/e2e/fixtures/form-art.html`);
    url.searchParams.set("candidate", id);
    url.searchParams.set("date", date);
    if (scale !== undefined) {
      url.searchParams.set("scale", scale);
      url.searchParams.set("x", x ?? "0");
      url.searchParams.set("y", y ?? "0");
    }
    await page.goto(url.href);
    await page.evaluate(() => document.fonts.ready);
    const guide = page.getByRole("region", { name: `${id} form guide` });
    await guide.getByRole("button", { name: "Pause", exact: true }).click();
    if (theme === "light") {
      await page.getByRole("button", { name: "Light theme" }).click();
    }
    const stage = guide.locator(".aspect-square");
    const tiles = [];
    for (let frame = 1; frame <= 6; frame++) {
      const image = guide.locator('img[aria-hidden="false"]');
      const expected = `/form-frames/${id}/${date}/${frame}.webp`;
      await image.waitFor({ state: "visible" });
      await image.evaluate(async (node, src) => {
        const img = /** @type {HTMLImageElement} */ (node);
        if (!img.src.endsWith(src))
          throw new Error(`Unexpected frame: ${img.src}`);
        await img.decode();
      }, expected);
      const buffer = await stage.screenshot({
        path: join(out, `${theme}-${frame}.png`),
      });
      const { width, height } = await sharp(buffer).metadata();
      tiles.push({
        input: buffer,
        left: ((frame - 1) % 3) * width,
        top: Math.floor((frame - 1) / 3) * height,
      });
      if (frame < 6) {
        await guide.getByRole("button", { name: "Next frame" }).click();
      }
    }
    await guide.getByRole("button", { name: "Next frame" }).click();
    await guide
      .locator('img[aria-hidden="false"]')
      .evaluate(async (node, src) => {
        const img = /** @type {HTMLImageElement} */ (node);
        if (!img.src.endsWith(src))
          throw new Error(`Loop did not return to frame 1: ${img.src}`);
        await img.decode();
      }, `/form-frames/${id}/${date}/1.webp`);
    const tooWide = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    );
    if (tooWide || errors.length)
      throw new Error(
        `${id} ${theme}: horizontal overflow=${tooWide}; page errors: ${errors.join(" | ")}`
      );
    const { width, height } = await sharp(tiles[0].input).metadata();
    await sharp({
      create: {
        width: width * 3,
        height: height * 2,
        channels: 4,
        background: "#0e0e11",
      },
    })
      .composite(tiles)
      .png()
      .toFile(join(out, `${theme}-sheet.png`));
    await page.close();
  }
  console.log(out);
} finally {
  await browser.close();
}
