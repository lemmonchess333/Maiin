import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// Playwright loads this in Node ESM, unlike Vite's JSON-transforming fixture.
const batch: typeof import("../docs/exercise-art/BATCH_REVIEW_MANIFEST.json") =
  JSON.parse(readFileSync(new URL("../docs/exercise-art/BATCH_REVIEW_MANIFEST.json", import.meta.url), "utf8"));

const targets = new Set([
  "db-row", "db-shoulder-press", "incline-db-press",
  "romanian-deadlift", "lat-pulldown",
]);
const sets = batch.completeDraftSets.filter((set) => targets.has(set.exerciseId));
if (sets.length !== targets.size) throw new Error("Missing exact exercise review target");

async function localOnly(page: Page) {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ? route.continue()
      : route.abort("blockedbyclient");
  });
}

for (const set of sets) {
  for (const theme of ["dark", "light"] as const) {
    test(`${set.exerciseId}: six frames and loop in ${theme}`, async ({ page }, info) => {
      await localOnly(page);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/e2e/fixtures/form-art.html");
      await page.getByRole("combobox", { name: "Exercise" }).selectOption(`${set.exerciseId} (draft)`);
      const guide = page.getByRole("region", { name: `${set.exerciseId} form guide`, exact: true });
      await guide.getByRole("button", { name: "Pause", exact: true }).click();
      // Verify the actual surface changes, not merely the toggle's label.
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      const main = page.locator("main");
      const darkBackground = await main.evaluate((node) => getComputedStyle(node).backgroundColor);
      await page.getByRole("button", { name: "Light theme", exact: true }).click();
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
      await expect.poll(() => main.evaluate((node) => getComputedStyle(node).backgroundColor))
        .not.toBe(darkBackground);
      if (theme === "dark") {
        await page.getByRole("button", { name: "Dark theme", exact: true }).click();
        await expect(page.locator("html")).toHaveClass(/\bdark\b/);
        await expect.poll(() => main.evaluate((node) => getComputedStyle(node).backgroundColor))
          .toBe(darkBackground);
      }
      const image = guide.locator('img[aria-hidden="false"]');
      for (const [index, frame] of set.frames.entries()) {
        await expect(image).toHaveAttribute("src", `/${frame.path}`);
        await expect.poll(() => image.evaluate((node) => {
          const img = node as HTMLImageElement;
          return img.complete ? [img.naturalWidth, img.naturalHeight] : [];
        })).toEqual(frame.dimensions);
        await expect(guide.locator("p[aria-live]")).toContainText(`${index + 1}/6`);
        await expect(page.locator('button[aria-current="step"]')).toContainText(frame.cue);
        await guide.screenshot({ path: info.outputPath(`${theme}-${index + 1}.png`) });
        if (index === 0) await page.screenshot({ path: info.outputPath(`${theme}-page.png`), fullPage: true });
        if (index < 5) await guide.getByRole("button", { name: "Next frame", exact: true }).click();
      }
      // Exercise the real timer across the boundary, not a synthetic image montage.
      await guide.getByRole("button", { name: "Play", exact: true }).click();
      await expect(image).toHaveAttribute("src", `/${set.frames[0].path}`, { timeout: 5_000 });
      await guide.getByRole("button", { name: "Pause", exact: true }).click();
      await expect(guide.locator("p[aria-live]")).toContainText("1/6");
      await guide.getByRole("button", { name: "Previous frame", exact: true }).click();
      await expect(image).toHaveAttribute("src", `/${set.frames[5].path}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      for (const control of await guide.getByRole("button").all()) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      expect(errors).toEqual([]);
    });
  }

  test(`${set.exerciseId}: reduced motion stays still and permits stepping`, async ({ page }) => {
    await localOnly(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await page.goto("/e2e/fixtures/form-art.html");
    await page.getByRole("combobox", { name: "Exercise" }).selectOption(`${set.exerciseId} (draft)`);
    const guide = page.getByRole("region", { name: `${set.exerciseId} form guide`, exact: true });
    await expect(guide).toHaveAttribute("data-demo-still", "placard");
    const image = guide.locator('img[aria-hidden="false"]');
    await expect(image).toHaveAttribute("src", `/${set.frames[0].path}`);
    await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(set.frames[0].dimensions[0]);
    await page.clock.fastForward(8_000);
    await expect(image).toHaveAttribute("src", `/${set.frames[0].path}`);
    await expect(guide.getByRole("button", { name: "Play", exact: true })).toHaveCount(0);
    await expect(guide.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
    await guide.getByRole("button", { name: "Next frame", exact: true }).click();
    await expect(image).toHaveAttribute("src", `/${set.frames[1].path}`);
    await expect(page.locator('button[aria-current="step"]')).toContainText(set.frames[1].cue);
  });
}
