/**
 * The break-social lab, filmed and measured. The activity card and the
 * leaderboard row with the worst data real people produce
 * (src/pages/dev/breakSocialFixtures.ts): long and right-to-left names,
 * a caption carrying a link, counts past a thousand, four-digit ranks.
 *
 * Each frame is also measured, at ordinary and at double text size, and
 * two things may not happen at the narrowest phone or at 393px: an
 * element spilling past its card or the screen, and text wider than its
 * own box (a figure drawn over the one beside it, a long word cut off at
 * the card's edge). Text that ends in an ellipsis is truncating on
 * purpose and is not counted. Double text stands in for a large-text
 * setting: a browser's text zoom, or a WebView that follows the system
 * font size.
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";
import { settleFullPageHeight } from "../helpers/settleHeight";

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

/** Elements that spill past their card or the screen, and text that
 *  is wider than its own box without an ellipsis. */
async function breaks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const scope = document.querySelectorAll(
      'section[aria-label="Activity cards"] *, section[aria-label="Leaderboard rows"] *'
    );
    for (const el of Array.from(scope)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const label = `${el.tagName.toLowerCase()} "${(el.textContent ?? "")
        .trim()
        .slice(0, 40)}"`;
      const card = el.closest(".rounded-2xl");
      const edge = Math.min(card ? card.getBoundingClientRect().right : vw, vw);
      if (rect.right > edge + 1) {
        out.push(`spills ${Math.round(rect.right - edge)}px: ${label}`);
      }
      const ownText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ""
      );
      if (
        ownText &&
        el.clientWidth > 0 &&
        el.scrollWidth > el.clientWidth + 1 &&
        getComputedStyle(el).textOverflow !== "ellipsis"
      ) {
        out.push(
          `overflows its box by ${el.scrollWidth - el.clientWidth}px: ${label}`
        );
      }
    }
    return out;
  });
}

for (const width of [320, 393]) {
  test(`break-social lab at ${width}px — nothing spills or overflows`, async ({
    page,
  }) => {
    test.skip(!emulatorActive, "emulator capture only");
    test.setTimeout(180_000);
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
