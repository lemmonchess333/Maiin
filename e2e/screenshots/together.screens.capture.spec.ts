/**
 * Social → Together, every state the seeds give it, at the two phone widths
 * the large-text spec checks, light and dark, at normal and enlarged text.
 *
 * Two accounts: the shared e2e user after the full seed chain (joined
 * challenges, two Spaces, no Circle) and the circles-capture user (a
 * Circle of two with a week's focus). Frames land in
 * `screenshots/together/`, named `{who}-{width}-{theme}-{text}.png`.
 *
 * The capture-specs job runs it as a gate: a renamed tab or a page that
 * fails to render fails here.
 *
 * Same rig conventions as circles.screens.capture.spec.ts: fresh context
 * per test, the emulator banner hidden, best-effort waits with short
 * timeouts.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";

test.use({
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

const ACCOUNTS = [
  {
    who: "member",
    email: "e2e-test@tropos.test",
    password: "test-password-123",
  },
  {
    who: "circle",
    email: "circles-capture@tropos.test",
    password: "test-password-123",
  },
] as const;

const WIDTHS = [393, 320] as const;
const TEXT = [
  { name: "text100", size: "" },
  { name: "text135", size: "135%" },
] as const;

async function openTogether(page: Page) {
  await page.goto("/Maiin/social?tab=together");
  await page
    .getByRole("radio", { name: "Together" })
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  // The page reads several collections; give the cards a moment to land.
  await page.waitForTimeout(2_500);
  await settleImages(page).catch(() => {});
}

test.describe("Together page", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  for (const account of ACCOUNTS) {
    test(`${account.who}: every width, theme and text size`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent =
            ".firebase-emulator-warning{display:none !important}";
          document.head.appendChild(style);
        });
      });
      await page.setViewportSize({ width: 393, height: 852 });
      await signInAsTestUser(page, account);
      await openTogether(page);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 852 });
        for (const theme of ["light", "dark"] as const) {
          await page.evaluate((dark) => {
            document.documentElement.classList.toggle("dark", dark);
          }, theme === "dark");
          for (const text of TEXT) {
            await page.evaluate((size) => {
              document.documentElement.style.fontSize = size;
            }, text.size);
            await page.setViewportSize({ width, height: 852 });
            await page.waitForTimeout(400);
            // The page's own height as the viewport, so the fixed tab bar
            // sits at the bottom of the frame rather than over a card
            // halfway down, as a fullPage shot leaves it.
            const height = await page.evaluate(
              () => document.documentElement.scrollHeight
            );
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(300);
            await page.screenshot({
              animations: "disabled",
              path: `screenshots/together/${account.who}-${width}-${theme}-${text.name}.png`,
            });
          }
        }
      }
    });
  }
});
