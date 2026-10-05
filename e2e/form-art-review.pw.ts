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
const octoberFifth: typeof import("../docs/exercise-art/pilots/continuation-20261005/MANIFEST.json") =
  JSON.parse(
    readFileSync(
      new URL(
        "../docs/exercise-art/pilots/continuation-20261005/MANIFEST.json",
        import.meta.url
      ),
      "utf8"
    )
  );
const targets = new Set([
  "bulgarian-split",
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
  ...octoberFifth.completeDraftSets,
].filter((set) => targets.has(set.exerciseId));
if (sets.length !== targets.size)
  throw new Error("Missing exact exercise review target");
// Independent source pins: the same incorrect pose at both ends must fail.
const bulgarianSourcePins = {
  setup: "f93fc4136da95f40799f4da0fb1386fc8cb3e943a8467fdcd46d904038d87057",
  shallow: "4646fb08e1d96df0d3d03d2642c63d78861f1d707edd5a33f07b38662a1194b3",
  deep: "d3551326c4964abacea0978e604d2cf7d856aaa1bd25bdd5b99d95a20233002b",
  bottom: "9a3da727c7801234407a1d97811e5603edfbf9ca43b96d6b6534d37ea5b7c954",
};
const endpointHashes: Record<string, string> = {
  "bulgarian-split": bulgarianSourcePins.setup,
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
        if (set.exerciseId === "bulgarian-split") {
          if (index === 0) expect(frame.progress).toBe(0);
          if (index === 1 || index === 5) {
            // The last third of the ascent finishes on the real 6→1 loop.
            expect(frame.sha256).toBe(bulgarianSourcePins.shallow);
            expect(frame.progress).toBe(0.33);
          }
          if (index === 2 || index === 4) {
            expect(frame.sha256).toBe(bulgarianSourcePins.deep);
            expect(frame.progress).toBe(0.67);
          }
          if (index === 3) {
            expect(frame.sha256).toBe(bulgarianSourcePins.bottom);
            expect(frame.progress).toBe(1);
          }
        }
        if (
          index === 5 &&
          set.exerciseId !== "cuban-press" &&
          set.exerciseId !== "bulgarian-split"
        ) {
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
      if (set.exerciseId === "bulgarian-split") {
        await image.evaluate((node) => (node as HTMLImageElement).decode());
        await guide.screenshot({
          path: info.outputPath(`${theme}-live-loop-6-to-1.png`),
        });
      }
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
  }, info) => {
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
    if (set.exerciseId === "bulgarian-split") {
      await image.evaluate((node) => (node as HTMLImageElement).decode());
      await guide.screenshot({
        path: info.outputPath("reduced-motion-still-after-8s.png"),
      });
    }
    await guide
      .getByRole("button", { name: "Next frame", exact: true })
      .click();
    await expect(image).toHaveAttribute("src", `/${set.frames[1].path}`);
    await expect(page.locator('button[aria-current="step"]')).toContainText(
      set.frames[1].cue
    );
    if (set.exerciseId === "bulgarian-split") {
      await image.evaluate((node) => (node as HTMLImageElement).decode());
      await guide.screenshot({
        path: info.outputPath("reduced-motion-manual-frame-2.png"),
      });
    }
  });
}

type PlaybackTransition = {
  src: string;
  elapsedMs: number;
  readyAtMs: number | null;
  activeImageCount: number;
  dimensions: number[];
  visibility: string;
  documentVisibility: DocumentVisibilityState;
};
type PlaybackRecording = {
  startedAtEpochMs: number;
  transitions: PlaybackTransition[];
  finished: boolean;
  stop: () => void;
};
declare global {
  interface Window {
    __bulgarianPlayback?: PlaybackRecording;
  }
}

test.describe("bulgarian-split: continuous playback evidence", () => {
  // `video` is worker-scoped in Playwright. This public context option keeps
  // recording scoped to these tests while retaining all configured options.
  test.use({
    contextOptions: async ({ contextOptions }, use, info) => {
      await use({
        ...contextOptions,
        recordVideo: {
          dir: info.outputPath("recording"),
          size: { width: 393, height: 852 },
        },
      });
    },
  });
  test.afterEach(async ({ context, page }, info) => {
    const video = page.video();
    await context.close();
    expect(video).not.toBeNull();
    await info.attach("continuous-playback-video", {
      path: await video!.path(),
      contentType: "video/webm",
    });
  });
  const set = sets.find(
    (candidate) => candidate.exerciseId === "bulgarian-split"
  );
  if (!set) throw new Error("Missing Bulgarian continuous playback target");

  for (const theme of ["dark", "light"] as const) {
    test(`real timer 1→2→3→4→5→6→1 in ${theme}`, async ({ page }, info) => {
      await localOnly(page);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      expect(page.viewportSize()).toEqual({ width: 393, height: 852 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/e2e/fixtures/form-art.html");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      const main = page.locator("main");
      const darkBackground = await main.evaluate(
        (node) => getComputedStyle(node).backgroundColor
      );
      if (theme === "light") {
        await page
          .getByRole("button", { name: "Light theme", exact: true })
          .click();
        await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
        await expect
          .poll(() =>
            main.evaluate((node) => getComputedStyle(node).backgroundColor)
          )
          .not.toBe(darkBackground);
      }
      const expectedSources = [...set.frames, set.frames[0]].map(
        (frame) => `/${frame.path}`
      );
      expect(set.frames.map((frame) => frame.sha256)).toEqual([
        bulgarianSourcePins.setup,
        bulgarianSourcePins.shallow,
        bulgarianSourcePins.deep,
        bulgarianSourcePins.bottom,
        bulgarianSourcePins.deep,
        bulgarianSourcePins.shallow,
      ]);

      // Install before selection so the first frame is observed on mount.
      // Activation changes aria-hidden on a preloaded img, not necessarily src.
      await page.evaluate(() => {
        const startedAt = performance.now();
        const recording: PlaybackRecording = {
          startedAtEpochMs: Date.now(),
          transitions: [],
          finished: false,
          stop: () => {},
        };
        const sample = () => {
          const guide = document.querySelector(
            'section[aria-label="bulgarian-split form guide"]'
          );
          if (!guide) return;
          const active = guide.querySelectorAll<HTMLImageElement>(
            'img[aria-hidden="false"]'
          );
          const image = active[0];
          const src =
            active.length === 1
              ? (image.getAttribute("src") ?? "missing-src")
              : `invalid-active-image-count:${active.length}`;
          const elapsedMs = performance.now() - startedAt;
          let entry = recording.transitions.at(-1);
          if (!entry || entry.src !== src) {
            entry = {
              src,
              elapsedMs,
              readyAtMs: null,
              activeImageCount: active.length,
              dimensions: [],
              visibility: image
                ? getComputedStyle(image).visibility
                : "missing",
              documentVisibility: document.visibilityState,
            };
            recording.transitions.push(entry);
          }
          // A newly mounted first img can precede its load event. Retain its
          // activation timestamp and separately record when pixels are ready.
          if (image?.complete && image.naturalWidth > 0) {
            entry.readyAtMs ??= elapsedMs;
            entry.dimensions = [image.naturalWidth, image.naturalHeight];
          }
          if (recording.transitions.length >= 7 && entry.readyAtMs !== null) {
            recording.finished = true;
            recording.stop();
          }
        };
        const observer = new MutationObserver(sample);
        recording.stop = () => {
          observer.disconnect();
          document.removeEventListener("load", sample, true);
        };
        window.__bulgarianPlayback = recording;
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["src", "aria-hidden", "style"],
        });
        document.addEventListener("load", sample, true);
      });

      const guide = page.getByRole("region", {
        name: "bulgarian-split form guide",
        exact: true,
      });
      let observed = {
        startedAtEpochMs: 0,
        transitions: [] as PlaybackTransition[],
      };
      try {
        await page
          .getByRole("combobox", { name: "Exercise" })
          .selectOption("bulgarian-split (draft)");
        await expect(
          guide.getByRole("button", { name: "Slower playback", exact: true })
        ).toHaveAttribute("aria-pressed", "false");
        // No fake clock, Next clicks or screenshots during the recorded cycle.
        await page.waitForFunction(
          () => {
            const recording = window.__bulgarianPlayback;
            if (!recording)
              throw new Error("Bulgarian playback recorder is not installed");
            return recording.finished;
          },
          null,
          { timeout: 12_000 }
        );
        await guide.getByRole("button", { name: "Pause", exact: true }).click();
        await expect(guide.locator("p[aria-live]")).toContainText("1/6");
      } finally {
        observed = await page.evaluate(() => {
          const recording = window.__bulgarianPlayback;
          if (!recording)
            throw new Error("Bulgarian playback recorder is not installed");
          recording.stop();
          return {
            startedAtEpochMs: recording.startedAtEpochMs,
            transitions: recording.transitions,
          };
        });
        await info.attach(`${theme}-live-transition-log.json`, {
          body: JSON.stringify(
            {
              theme,
              viewport: page.viewportSize(),
              nominalIntervalMs: 1200,
              expectedSources,
              sourcePins: bulgarianSourcePins,
              ...observed,
            },
            null,
            2
          ),
          contentType: "application/json",
        });
      }
      expect(observed.transitions.map((entry) => entry.src)).toEqual(
        expectedSources
      );
      for (const [index, entry] of observed.transitions.entries()) {
        expect(entry.activeImageCount).toBe(1);
        expect(entry.readyAtMs).not.toBeNull();
        expect(entry.dimensions).toEqual(set.frames[index % 6].dimensions);
        expect(entry.visibility).toBe("visible");
        expect(entry.documentVisibility).toBe("visible");
        if (index > 0) {
          expect(
            entry.elapsedMs - observed.transitions[index - 1].elapsedMs
          ).toBeGreaterThanOrEqual(1_100);
        }
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        )
      ).toBe(false);
      for (const control of await guide.getByRole("button").all()) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      expect(errors).toEqual([]);
    });
  }
});
