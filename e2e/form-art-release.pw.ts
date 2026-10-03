import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { getFormBeats } from "../src/lib/formGuides";

for (const { id, dimensions, cardWidth } of [
  { id: "calf-raise", dimensions: [1024, 1536], cardWidth: 320 },
  { id: "standing-calf-raise", dimensions: [1024, 1536], cardWidth: 320 },
  { id: "donkey-calf-raise", dimensions: [1536, 1024], cardWidth: 480 },
  { id: "leg-raise", dimensions: [1024, 1536], cardWidth: 422 },
  { id: "plank", dimensions: [1536, 1024], cardWidth: 480 },
  { id: "crunches", dimensions: [1536, 1024], cardWidth: 480 },
  { id: "shrugs", dimensions: [1024, 1536], cardWidth: 200 },
]) {
  const beats = getFormBeats(id);
  if (!beats || beats.length !== 6)
    throw new Error(`Missing released guide: ${id}`);

  for (const theme of ["dark", "light"] as const) {
    test(`released ${id}: delivery frames, cues and card in ${theme}`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => {
        const host = new URL(route.request().url()).hostname;
        return ["127.0.0.1", "localhost", "[::1]"].includes(host)
          ? route.continue()
          : route.abort("blockedbyclient");
      });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("/e2e/fixtures/form-art.html");
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole("combobox", { name: "Exercise" }).selectOption(id);
      const guide = page.getByRole("region", {
        name: `${id} form guide`,
        exact: true,
      });
      await guide.getByRole("button", { name: "Pause", exact: true }).click();
      if (theme === "light")
        await page
          .getByRole("button", { name: "Light theme", exact: true })
          .click();
      await expect(page.locator("html")).toHaveClass(
        theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
      );
      const image = guide.locator('img[aria-hidden="false"]');
      let firstPixels: Buffer | undefined;
      for (const [index, beat] of beats.entries()) {
        await expect(image).toHaveAttribute("src", `/${beat.image}`);
        await expect
          .poll(() =>
            image.evaluate((node) => {
              const img = node as HTMLImageElement;
              return img.complete ? [img.naturalWidth, img.naturalHeight] : [];
            })
          )
          .toEqual(dimensions);
        await expect(guide.locator("p[aria-live]")).toContainText(
          `${index + 1}/6`
        );
        await expect(page.locator('button[aria-current="step"]')).toContainText(
          beat.cue
        );
        if (id === "plank" && (index === 3 || index === 4)) {
          // Alignment and breathing teach the same sustained position.
          expect(
            readFileSync(`public/${beat.image}`).equals(
              readFileSync(`public/${beats[2].image}`)
            )
          ).toBe(true);
          if (index === 4) expect(beat.cue).toContain("Hold for time");
        }
        // The player uses decoding="async": load completion alone does not
        // guarantee that the browser has decoded the pixels for its next paint.
        await image.evaluate((node) => (node as HTMLImageElement).decode());
        const displayed = await image.screenshot({
          path: info.outputPath(`${theme}-pixels-${index + 1}.png`),
        });
        if (index === 0) firstPixels = displayed;
        if (index === 5) {
          expect(
            readFileSync(`public/${beats[0].image}`).equals(
              readFileSync(`public/${beat.image}`)
            )
          ).toBe(true);
          const first = PNG.sync.read(firstPixels!);
          const last = PNG.sync.read(displayed);
          expect([last.width, last.height]).toEqual([
            first.width,
            first.height,
          ]);
          // The blend compositor varied 57 RGB channels by <=4/255 between
          // byte-identical endpoint WebPs. Require zero perceptual differences,
          // allowing only that small rounding error, including at antialiased edges.
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
        await guide.screenshot({
          path: info.outputPath(`${theme}-${index + 1}.png`),
        });
        if (index < 5)
          await guide
            .getByRole("button", { name: "Next frame", exact: true })
            .click();
      }
      await guide.getByRole("button", { name: "Play", exact: true }).click();
      await expect(image).toHaveAttribute("src", `/${beats[0].image}`, {
        timeout: 5000,
      });
      await guide.getByRole("button", { name: "Pause", exact: true }).click();
      const card = page.getByTestId("card-artwork");
      const thumbnail = card.getByRole("img", { name: `${id} card artwork` });
      await expect(thumbnail).toHaveAttribute("src", `/form-art/${id}.webp`);
      await expect
        .poll(() =>
          thumbnail.evaluate((node) => (node as HTMLImageElement).naturalWidth)
        )
        .toBe(cardWidth);
      await card.screenshot({ path: info.outputPath(`${theme}-card.png`) });
      await page.screenshot({
        path: info.outputPath(`${theme}-page.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        )
      ).toBe(false);
      expect(errors).toEqual([]);
    });
  }

  test(`released ${id}: reduced motion keeps delivered frames still`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await page.goto("/e2e/fixtures/form-art.html");
    await page.getByRole("combobox", { name: "Exercise" }).selectOption(id);
    const guide = page.getByRole("region", {
      name: `${id} form guide`,
      exact: true,
    });
    await expect(guide).toHaveAttribute("data-demo-still", "placard");
    const image = guide.locator('img[aria-hidden="false"]');
    await expect(image).toHaveAttribute("src", `/form-frames/${id}/1.webp`);
    await page.clock.fastForward(8000);
    await expect(image).toHaveAttribute("src", `/form-frames/${id}/1.webp`);
    await expect(
      guide.getByRole("button", { name: "Play", exact: true })
    ).toHaveCount(0);
    await guide
      .getByRole("button", { name: "Next frame", exact: true })
      .click();
    await expect(image).toHaveAttribute("src", `/form-frames/${id}/2.webp`);
  });
}
