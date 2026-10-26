/**
 * The break-social lab, filmed and measured. The activity card and the
 * leaderboard row with the worst data real people produce
 * (src/pages/dev/breakSocialFixtures.ts): long and right-to-left names,
 * a caption carrying a link, counts past a thousand, four-digit ranks.
 *
 * Each frame is also measured, at ordinary and at double text size, and
 * none of these may happen at the narrowest phone or at 393px: an
 * element spilling past its card or the screen; text wider than its own
 * box (a figure drawn over the one beside it, a long word cut off at the
 * card's edge); text drawn through the drawing beside it, which no box
 * overflows to show; an author's name cut before its first word is
 * whole; an ordinary word split across two lines because its line is
 * narrower than the word. Other text that ends in an ellipsis is
 * truncating on purpose and is not counted. Double text stands in for a
 * large-text setting: a browser's text zoom, or a WebView that follows
 * the system font size.
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";
import { settleFullPageHeight } from "../helpers/settleHeight";
import {
  brokenWords,
  clippedNames,
  layoutBreaks,
  textOverArt,
} from "../helpers/layoutBreaks";

const DATASETS = ["demo", "worst", "one"] as const;

async function shoot(page: Page, name: string) {
  await settleImages(page);
  await settleFullPageHeight(page);
  await page.screenshot({
    animations: "disabled",
    path: `screenshots/${name}.png`,
    fullPage: true,
  });
}

const CARDS = 'section[aria-label="Activity cards"]';
const ROWS = 'section[aria-label="Leaderboard rows"]';

/** The activity cards and leaderboard rows, measured against their card. */
const breaks = async (page: Page) => [
  ...(await layoutBreaks(page, `${CARDS} *, ${ROWS} *`, ".rounded-2xl")),
  ...(await textOverArt(page, CARDS, ".rounded-2xl")),
  // The author's name in a card's header, which links to their profile.
  ...(await clippedNames(page, `${CARDS} a[href*="/user/"] [dir="auto"]`)),
  ...(await brokenWords(page, undefined, `${CARDS}, ${ROWS}`)),
];

for (const width of [320, 393]) {
  test(`break-social lab at ${width}px — nothing spills or overflows`, async ({
    page,
  }) => {
    test.skip(!emulatorActive, "emulator capture only");
    test.setTimeout(180_000);
    // The emulator's notice and the lab's own data switch are fixed to
    // the screen, so a full-page frame draws them over the first cards'
    // author rows, which are part of what these frames are for. The data
    // is chosen by the URL here.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          '.firebase-emulator-warning, [role="radiogroup"][aria-label="Data"]{display:none !important}';
        document.head.appendChild(style);
      });
    });
    await page.setViewportSize({ width, height: 852 });
    await signInAsTestUser(page);

    const found: string[] = [];
    for (const data of DATASETS) {
      await page.goto(`dev/break-social?data=${data}`);
      await expect(
        page.getByRole("heading", { name: "Break social" })
      ).toBeVisible();
      for (const dark of [false, true]) {
        await page.evaluate(
          (value) => document.documentElement.classList.toggle("dark", value),
          dark
        );
        await page.waitForTimeout(300);
        await shoot(
          page,
          `break-social-${data}-${width}-${dark ? "dark" : "light"}`
        );
      }
      found.push(...(await breaks(page)).map((s) => `${data}: ${s}`));

      // Double text size: text grows, and boxes sized in px do not.
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await page.waitForTimeout(300);
      await shoot(page, `break-social-${data}-${width}-text200`);
      found.push(...(await breaks(page)).map((s) => `${data} 200%: ${s}`));
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
        document.documentElement.classList.remove("dark");
      });
    }
    expect(found).toEqual([]);
  });
}
