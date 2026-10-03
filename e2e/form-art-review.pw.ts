import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

// Playwright loads this in Node ESM, unlike Vite's JSON-transforming fixture.
const batch: typeof import("../docs/exercise-art/BATCH_REVIEW_MANIFEST.json") =
  JSON.parse(
    readFileSync(
      new URL(
        "../docs/exercise-art/BATCH_REVIEW_MANIFEST.json",
        import.meta.url
      ),
      "utf8"
    )
  );
const continuation: typeof import("../docs/exercise-art/pilots/continuation-20261002/MANIFEST.json") =
  JSON.parse(
    readFileSync(
      new URL(
        "../docs/exercise-art/pilots/continuation-20261002/MANIFEST.json",
        import.meta.url
      ),
      "utf8"
    )
  );

const octoberThird: typeof import("../docs/exercise-art/pilots/continuation-20261003/MANIFEST.json") =
  JSON.parse(
    readFileSync(
      new URL(
        "../docs/exercise-art/pilots/continuation-20261003/MANIFEST.json",
        import.meta.url
      ),
      "utf8"
    )
  );

const newConversions: typeof import("../docs/exercise-art/pilots/new-conversions-20261003/MANIFEST.json") =
  JSON.parse(
    readFileSync(
      new URL(
        "../docs/exercise-art/pilots/new-conversions-20261003/MANIFEST.json",
        import.meta.url
      ),
      "utf8"
    )
  );
const newConversions02: typeof import("../docs/exercise-art/pilots/new-conversions-02-20261003/MANIFEST.json") =
  JSON.parse(
    readFileSync(
      new URL(
        "../docs/exercise-art/pilots/new-conversions-02-20261003/MANIFEST.json",
        import.meta.url
      ),
      "utf8"
    )
  );
const newConversions03: typeof import("../docs/exercise-art/pilots/new-conversions-03-20261003/MANIFEST.json") =
  JSON.parse(
    readFileSync(
      new URL(
        "../docs/exercise-art/pilots/new-conversions-03-20261003/MANIFEST.json",
        import.meta.url
      ),
      "utf8"
    )
  );
const newConversions04: typeof import("../docs/exercise-art/pilots/new-conversions-04-20261003/MANIFEST.json") =
  JSON.parse(
    readFileSync(
      new URL(
        "../docs/exercise-art/pilots/new-conversions-04-20261003/MANIFEST.json",
        import.meta.url
      ),
      "utf8"
    )
  );
const newConversions05: typeof import("../docs/exercise-art/pilots/new-conversions-05-20261003/MANIFEST.json") =
  JSON.parse(
    readFileSync(
      new URL(
        "../docs/exercise-art/pilots/new-conversions-05-20261003/MANIFEST.json",
        import.meta.url
      ),
      "utf8"
    )
  );
const targets = new Set([
  "ab-wheel",
  "kettlebell-swing",
  "seated-calf-raise",
  "farmers-carry",
  "glute-ham-raise",
  "donkey-calf-raise",
  "pistol-squat",

  "sissy-squat",
  "nordic-hamstring-curl",
  "hip-adduction-machine",
  "cuban-press",
  "hip-abduction-machine",
  "crunches",
  "db-row",
  "db-shoulder-press",
  "incline-db-press",
  "romanian-deadlift",
  "lat-pulldown",
  "leg-raise",
]);
const sets = [
  ...batch.completeDraftSets,
  ...continuation.completeDraftSets,
  ...octoberThird.completeDraftSets,
  ...newConversions.completeDraftSets,
  ...newConversions02.completeDraftSets,
  ...newConversions03.completeDraftSets,
  ...newConversions04.completeDraftSets,
  ...newConversions05.completeDraftSets,
].filter((set) => targets.has(set.exerciseId));
if (sets.length !== targets.size)
  throw new Error("Missing exact exercise review target");
// Independent source pins: the same incorrect pose at both ends must fail.
const endpointHashes: Record<string, string> = {
  "ab-wheel":
    "b4b97befc2ca2642e20de0525aeefdfd24e0193b2c19759e625abc4fe59b2509",
  "kettlebell-swing":
    "8123b1a9c554e5fae3bf63258f4cec79d942531ca9017cf9b6f0d2977f3c78ad",

  "seated-calf-raise":
    "c3f4549e51e7a6574b0cdbf1e3deaaa01192de487865a7a8bf676b264a770bc9",
  "farmers-carry":
    "db4621c1276b460e7bb36d57ce19fb987e6376aa894d97df5a8cbd01214c05ca",

  "glute-ham-raise":
    "a8016da54c0bfef98f418e858e9062986288d0ed9e760975677b242189ac0fc4",
  "donkey-calf-raise":
    "4d071361a634e25bd10bc518b8aae2a46fd117179d7604d510da72961c4a747c",
  "pistol-squat":
    "00cc035e8c1eacaf8e950343c91c287ee3a060da62325d2dc305020a8c28810c",

  "sissy-squat":
    "5aa2d54d5a09c7ca7f01bf333904942cb29323d459cd279ad782bbf28b7c28bc",
  "nordic-hamstring-curl":
    "995b93515a4644f321ce93b21949aa4aecf4a4afe04ab8e5613f6441c0f754c6",
  "hip-adduction-machine":
    "467ed14e4f4ad3182772b516531a6ec8a4b4090af563938bec4a05cf0d531f57",

  "cuban-press":
    "e031e4017960a145f150374ecb4b03ae09e32eb1aedd419af62dbe378ac7236d",
  "hip-abduction-machine":
    "ae2f82204ae6fc95feebc8b73a0adc23d82a38bef76799316349f80e853589d4",

  crunches: "11a9cd61cc3d9cd028eb213af0cada295465b0a62108b4110edd05968879758f",
  "leg-raise":
    "da1d8e73b06d96aad0028cf229ac36a79867e09bedca74ea422a73ad7e233a01",
  "db-row": "d39a9faaa0f6a9de3ec516f1b42f594fd64d555aa8aa36994d17a782344d4aec",
  "db-shoulder-press":
    "99b3565ba45ba0b0ec02cf3354451871c87425e19f9771c3f2e1e1b9b09ba8aa",
  "incline-db-press":
    "767371f8698295af102eb45c1e3bc8dbff6509ab99dc6ca89f7034db2251e059",
  "romanian-deadlift":
    "4c8cf219385b9c11d0916c3f38891cae6438a5c116584eb9564551ecfb304f60",
  "lat-pulldown":
    "7b4e90ae31ef44458ca26a31b49898a5bcee2a5f2783bd47dd396687621f4242",
};

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
    test(`${set.exerciseId}: six frames and loop in ${theme}`, async ({
      page,
    }, info) => {
      await localOnly(page);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/e2e/fixtures/form-art.html");
      await page.evaluate(() => document.fonts.ready);
      await page
        .getByRole("combobox", { name: "Exercise" })
        .selectOption(`${set.exerciseId} (draft)`);
      const guide = page.getByRole("region", {
        name: `${set.exerciseId} form guide`,
        exact: true,
      });
      await guide.getByRole("button", { name: "Pause", exact: true }).click();
      // Verify the actual surface changes, not merely the toggle's label.
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      const main = page.locator("main");
      const darkBackground = await main.evaluate(
        (node) => getComputedStyle(node).backgroundColor
      );
      await page
        .getByRole("button", { name: "Light theme", exact: true })
        .click();
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
      await expect
        .poll(() =>
          main.evaluate((node) => getComputedStyle(node).backgroundColor)
        )
        .not.toBe(darkBackground);
      if (theme === "dark") {
        await page
          .getByRole("button", { name: "Dark theme", exact: true })
          .click();
        await expect(page.locator("html")).toHaveClass(/\bdark\b/);
        await expect
          .poll(() =>
            main.evaluate((node) => getComputedStyle(node).backgroundColor)
          )
          .toBe(darkBackground);
      }
      const image = guide.locator('img[aria-hidden="false"]');
      let startPixels: Buffer | undefined;
      let rowHoldPixels: Buffer | undefined;
      for (const [index, frame] of set.frames.entries()) {
        await expect(image).toHaveAttribute("src", `/${frame.path}`);
        await expect
          .poll(() =>
            image.evaluate((node) => {
              const img = node as HTMLImageElement;
              return img.complete ? [img.naturalWidth, img.naturalHeight] : [];
            })
          )
          .toEqual(frame.dimensions);
        await expect(guide.locator("p[aria-live]")).toContainText(
          `${index + 1}/6`
        );
        await expect(page.locator('button[aria-current="step"]')).toContainText(
          frame.cue
        );
        await image.evaluate((node) => (node as HTMLImageElement).decode());
        // Compare displayed pixels, not a label claiming to reach the endpoint.
        if (index === 0) {
          expect(frame.sha256).toBe(endpointHashes[set.exerciseId]);
          startPixels = await image.screenshot({
            path: info.outputPath(`${theme}-endpoint-first.png`),
          });
        }
        if (index === 5 && set.exerciseId === "cuban-press") {
          // Cuban Press reverses rotation in frame6; lowering finishes on 6→1.
          expect(frame.sha256).toBe(
            "2c8ce43fa1394d964859b24b147598cd35ef25cc97c15daab423a59c599bbffb"
          );
          expect(frame.progress).toBe(0.33);
        }
        if (index === 5 && set.exerciseId !== "cuban-press") {
          expect(frame.sha256).toBe(endpointHashes[set.exerciseId]);
          expect(frame.progress).toBe(0);
          expect(startPixels).toBeDefined();
          const finishPixels = await image.screenshot({
            path: info.outputPath(`${theme}-endpoint-last.png`),
          });
          const first = PNG.sync.read(startPixels!);
          const last = PNG.sync.read(finishPixels);
          expect([last.width, last.height]).toEqual([
            first.width,
            first.height,
          ]);
          // Saved endpoint captures differed in 144 channels by at most 4/255.
          // Match the production test: exact source hashes above, zero
          // perceptual pixel differences including antialiased edges below.
          expect(
            pixelmatch(
              first.data,
              last.data,
              undefined,
              first.width,
              first.height,
              { threshold: 0.02, includeAA: true }
            )
          ).toBe(0);
        }
        if (set.exerciseId === "db-row" && index === 2)
          rowHoldPixels = await image.screenshot();
        if (set.exerciseId === "db-row" && index === 3) {
          expect(frame.sha256).toBe(
            "69cdbe337e0458c373d9c819f2ceaeb6536329eec1df24bdaf342a83973e7d96"
          );
          expect(rowHoldPixels).toBeDefined();
          expect((await image.screenshot()).equals(rowHoldPixels!)).toBe(true);
        }
        await guide.screenshot({
          path: info.outputPath(`${theme}-${index + 1}.png`),
        });
        if (index === 0)
          await page.screenshot({
            path: info.outputPath(`${theme}-page.png`),
            fullPage: true,
          });
        if (index < 5)
          await guide
            .getByRole("button", { name: "Next frame", exact: true })
            .click();
      }
      // Exercise the real timer across the boundary, not a synthetic image montage.
      await guide.getByRole("button", { name: "Play", exact: true }).click();
      await expect(image).toHaveAttribute("src", `/${set.frames[0].path}`, {
        timeout: 5_000,
      });
      await guide.getByRole("button", { name: "Pause", exact: true }).click();
      await expect(guide.locator("p[aria-live]")).toContainText("1/6");
      await guide
        .getByRole("button", { name: "Previous frame", exact: true })
        .click();
      await expect(image).toHaveAttribute("src", `/${set.frames[5].path}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
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

  test(`${set.exerciseId}: reduced motion stays still and permits stepping`, async ({
    page,
  }) => {
    await localOnly(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await page.goto("/e2e/fixtures/form-art.html");
    await page
      .getByRole("combobox", { name: "Exercise" })
      .selectOption(`${set.exerciseId} (draft)`);
    const guide = page.getByRole("region", {
      name: `${set.exerciseId} form guide`,
      exact: true,
    });
    await expect(guide).toHaveAttribute("data-demo-still", "placard");
    const image = guide.locator('img[aria-hidden="false"]');
    await expect(image).toHaveAttribute("src", `/${set.frames[0].path}`);
    await expect
      .poll(() =>
        image.evaluate((node) => (node as HTMLImageElement).naturalWidth)
      )
      .toBe(set.frames[0].dimensions[0]);
    await page.clock.fastForward(8_000);
    await expect(image).toHaveAttribute("src", `/${set.frames[0].path}`);
    await expect(
      guide.getByRole("button", { name: "Play", exact: true })
    ).toHaveCount(0);
    await expect(
      guide.getByRole("button", { name: "Pause", exact: true })
    ).toHaveCount(0);
    await guide
      .getByRole("button", { name: "Next frame", exact: true })
      .click();
    await expect(image).toHaveAttribute("src", `/${set.frames[1].path}`);
    await expect(page.locator('button[aria-current="step"]')).toContainText(
      set.frames[1].cue
    );
  });
}
