import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { openSignInForm, TEST_USER } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { emulatorAdmin } from "./helpers/realCallables";

/**
 * Open Food Facts' credit on a small phone (an iPhone SE, 375 x 667).
 *
 * The database's licence (ODbL) asks for a credit wherever its data is
 * shown, and the unit tests pin the line in each place: under a barcode
 * result, under the search results and in the portion sheet. What they
 * cannot say is whether the portion sheet still fits on the smallest
 * screen once the credit sits under its Log food button. This opens the
 * sheet from a search result, for a food with a stated serving and for one
 * without (the per-100 g case), and checks both lines are on screen without
 * scrolling and nothing runs past the screen's edge.
 *
 * The rig has no network, so the search is answered here, in the shape
 * Open Food Facts answers it.
 */

const SE = { width: 375, height: 667 };
const CREDIT = "Food data from Open Food Facts";

const PRODUCTS = [
  {
    product_name: "Porridge Oats",
    brands: "Mornflake",
    serving_size: "40 g",
    nutriments: {
      "energy-kcal_100g": 375,
      proteins_100g: 11,
      carbohydrates_100g: 60,
      fat_100g: 8,
    },
  },
  {
    product_name: "Porridge Oats with Golden Syrup",
    brands: "Ready Brek",
    nutriments: {
      "energy-kcal_100g": 380,
      proteins_100g: 8.5,
      carbohydrates_100g: 68,
      fat_100g: 7,
    },
  },
];

/** Where an element sits against the screen, before anything scrolls. */
async function onScreen(page: Page, name: string) {
  const el = page.getByText(name, { exact: true });
  await expect(el).toBeVisible();
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2
    );
    return {
      inside: r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw,
      // Not covered by the tab bar, a toast or anything else.
      reachable: !!hit && (hit === node || node.contains(hit)),
      box: [r.left, r.top, r.right, r.bottom].map(Math.round),
    };
  });
}

/** Waits for the sheet to stop moving (it slides up). */
async function settled(page: Page) {
  const button = page.getByRole("button", { name: "Log food", exact: true });
  let last = "";
  for (let i = 0; i < 20; i++) {
    const box = JSON.stringify(await button.boundingBox());
    if (box === last) return;
    last = box;
    await page.waitForTimeout(150);
  }
}

test.describe("Open Food Facts credit on a small phone", () => {
  test.skip(!emulatorActive, "Requires the local Auth/Firestore emulators");
  test.use({ viewport: SE });
  test.setTimeout(90_000);

  for (const product of PRODUCTS) {
    const kind = product.serving_size ? "a stated serving" : "per 100 g";
    test(`the portion sheet for ${kind} shows Log food and the credit without scrolling`, async ({
      page,
    }) => {
      const { auth, db } = emulatorAdmin();
      const baseline = await auth.getUserByEmail(TEST_USER.email);
      const seed = (await db.doc(`users/${baseline.uid}`).get()).data();
      expect(seed?.onboardingComplete).toBe(true);
      const email = `off-credit-${randomUUID()}@tropos.test`;
      const user = await auth.createUser({
        email,
        password: TEST_USER.password,
        emailVerified: true,
      });
      const profile = db.doc(`users/${user.uid}`);
      try {
        await profile.set({ ...seed, uid: user.uid, email });
        await page.route(
          "https://world.openfoodfacts.org/cgi/search.pl**",
          (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              headers: { "Access-Control-Allow-Origin": "*" },
              body: JSON.stringify({ count: 2, products: PRODUCTS }),
            })
        );
        await page.addInitScript(() =>
          document.addEventListener("DOMContentLoaded", () => {
            const style = document.createElement("style");
            style.textContent =
              ".firebase-emulator-warning{display:none!important}";
            document.head.append(style);
          })
        );
        await page.goto("./");
        await openSignInForm(page);
        await page.locator("#login-email").fill(email);
        await page.locator("#login-password").fill(TEST_USER.password);
        await page.locator('button[type="submit"]').first().click();
        const nav = page.getByRole("navigation", {
          name: "Main navigation",
          exact: true,
        });
        await expect(nav).toBeVisible({ timeout: 20_000 });
        await nav.getByRole("link", { name: "Food", exact: true }).click();
        await page
          .getByRole("textbox", { name: "What did you eat", exact: true })
          .fill("porridge oats");
        const row = page.getByRole("button", {
          name: new RegExp(`^${product.product_name} ${product.brands} `),
        });
        await expect(row).toBeVisible({ timeout: 10_000 });
        // The search results carry the credit too, under the rows.
        await expect(page.getByText(CREDIT, { exact: true })).toHaveCount(1);
        await row.click();
        await settled(page);

        const logFood = await onScreen(page, "Log food");
        const credit = await onScreen(page, CREDIT);
        expect(logFood, `Log food at ${logFood.box}`).toMatchObject({
          inside: true,
          reachable: true,
        });
        expect(credit, `the credit at ${credit.box}`).toMatchObject({
          inside: true,
          reachable: true,
        });
        // Under the button, as the sheet sets it.
        expect(credit.box[1]).toBeGreaterThanOrEqual(logFood.box[3]);
        const sideways = await page.evaluate(
          () =>
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth
            ) - document.documentElement.clientWidth
        );
        expect(sideways).toBeLessThanOrEqual(1);
      } finally {
        await profile.delete();
        await auth.deleteUser(user.uid);
      }
    });
  }
});
