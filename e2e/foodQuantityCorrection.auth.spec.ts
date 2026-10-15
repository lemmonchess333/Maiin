import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { openSignInForm, TEST_USER } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { emulatorAdmin } from "./helpers/realCallables";
import { settleImages } from "./helpers/settleImages";
import { settleFullPageHeight } from "./helpers/settleHeight";

test.describe("food quantity correction", () => {
  test.skip(!emulatorActive, "Requires the local Auth/Firestore emulators");
  test.setTimeout(90_000);

  for (const text of ["50g milk", "xylophone"]) {
    test(`${text} stays editable and its correction saves the measured amount`, async ({
      page,
      context,
    }, info) => {
      const { auth, db, Timestamp } = emulatorAdmin();
      const baseline = await auth.getUserByEmail(TEST_USER.email);
      const seed = (await db.doc(`users/${baseline.uid}`).get()).data();
      expect(seed?.onboardingComplete).toBe(true);
      const email = `food-correction-${randomUUID()}@tropos.test`;
      const user = await auth.createUser({
        email,
        password: TEST_USER.password,
        emailVerified: true,
      });
      const profile = db.doc(`users/${user.uid}`);
      const meals = profile.collection("meals");
      try {
        await profile.set({
          ...seed,
          uid: user.uid,
          email,
          subscriptionTier: "free",
          aiAnalysisEnabled: false,
        });
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
        const input = page.getByRole("textbox", {
          name: "What did you eat",
          exact: true,
        });
        await input.fill(text);
        if (text === "50g milk") {
          const geometry: unknown[] = [];
          const measure = async (
            name: string,
            portion: string,
            action: "Select" | "Log"
          ) => {
            const row = page.getByRole("button", {
              name: new RegExp(`^${name}\\s*${portion}\\s*·\\s*${action}`),
            });
            await expect(row).toHaveCount(1);
            await row.scrollIntoViewIfNeeded();
            const result = await row.evaluate(
              (element, expected) => {
                const button = element as HTMLButtonElement;
                const bounds = button.getBoundingClientRect();
                const walker = document.createTreeWalker(
                  button,
                  NodeFilter.SHOW_TEXT
                );
                const nodes: Text[] = [];
                while (walker.nextNode())
                  nodes.push(walker.currentNode as Text);
                const tokens = [
                  expected.name,
                  expected.portion,
                  expected.action,
                ].map((value) => {
                  const node = nodes.find((node) =>
                    value === expected.name || value === expected.action
                      ? node.textContent?.trim() === value
                      : node.textContent?.includes(value)
                  );
                  if (!node) return { value, found: false, fits: false };
                  const range = document.createRange();
                  range.selectNodeContents(node);
                  const rects = [...range.getClientRects()];
                  let fits = rects.every(
                    (rect) =>
                      rect.left >= bounds.left - 1 &&
                      rect.right <= bounds.right + 1
                  );
                  for (
                    let ancestor = node.parentElement;
                    ancestor && ancestor !== button;
                    ancestor = ancestor.parentElement
                  ) {
                    const style = getComputedStyle(ancestor);
                    if (/hidden|clip|auto|scroll/.test(style.overflowX)) {
                      const clip = ancestor.getBoundingClientRect();
                      fits &&= rects.every(
                        (rect) =>
                          rect.left >= clip.left - 1 &&
                          rect.right <= clip.right + 1
                      );
                    }
                  }
                  return {
                    value,
                    found: true,
                    fits,
                    textWidth: range.getBoundingClientRect().width,
                    ownerWidth:
                      node.parentElement?.getBoundingClientRect().width,
                  };
                });
                return {
                  name: expected.name,
                  tokens,
                  width: bounds.width,
                  height: bounds.height,
                  focusable: !button.disabled && button.tabIndex >= 0,
                  overflow: button.scrollWidth > button.clientWidth + 1,
                };
              },
              { name, portion, action }
            );
            expect(
              result.tokens.filter((token) => !token.found || !token.fits),
              `${name} name, reference portion and ${action} remain readable`
            ).toEqual([]);
            expect(result.height).toBeGreaterThanOrEqual(44);
            expect(result.focusable).toBe(true);
            expect(result.overflow).toBe(false);
            return result;
          };
          for (const query of ["milk", "50g milk"])
            for (const width of [320, 393])
              for (const scale of [100, 200])
                for (const dark of [false, true]) {
                  await page.setViewportSize({ width, height: 852 });
                  await page.evaluate(
                    ({ scale, dark }) => {
                      document.documentElement.style.fontSize = `${scale}%`;
                      document.documentElement.classList.toggle("dark", dark);
                    },
                    { scale, dark }
                  );
                  await input.fill(query);
                  await input.focus();
                  await settleImages(page);
                  await settleFullPageHeight(page);
                  const rows = [];
                  for (const name of ["Milk", "Almond milk", "Oat milk"])
                    rows.push(await measure(name, "240ml", "Select"));
                  geometry.push({
                    source: "local references",
                    query,
                    width,
                    scale,
                    dark,
                    rows,
                  });
                  if (scale === 200)
                    await page.screenshot({
                      path: info.outputPath(
                        `suggestions-${query.replaceAll(" ", "-")}-${width}-${dark ? "dark" : "light"}-200.png`
                      ),
                      animations: "disabled",
                      fullPage: true,
                    });
                }
          // A real stored favourite exercises both homologous Log surfaces.
          const favouriteName = "Milk with oats and berries";
          await profile.collection("foodFavourites").doc("readable-milk").set({
            name: favouriteName,
            calories: 532,
            protein: 28,
            carbs: 64,
            fat: 18,
            servingSize: "1 breakfast bowl",
            lastUsed: Timestamp.now(),
            useCount: 4,
            timeOfDay: "any",
            source: "manual",
          });
          for (const query of ["milk", ""]) {
            await page.setViewportSize({ width: 320, height: 852 });
            await page.evaluate(() => {
              document.documentElement.style.fontSize = "200%";
              document.documentElement.classList.remove("dark");
            });
            await input.fill(query);
            await input.focus();
            await expect(
              page
                .getByRole("button", { name: new RegExp(`^${favouriteName}`) })
                .first()
            ).toBeVisible({ timeout: 15_000 });
            await settleImages(page);
            await settleFullPageHeight(page);
            const row = await measure(favouriteName, "1 breakfast bowl", "Log");
            if (!query) {
              const edit = page.getByRole("button", {
                name: `Change portion for ${favouriteName}`,
                exact: true,
              });
              await expect(edit).toBeVisible();
              const bounds = await edit.boundingBox();
              expect(bounds!.width).toBeGreaterThanOrEqual(44);
              expect(bounds!.height).toBeGreaterThanOrEqual(44);
              expect(bounds!.x).toBeGreaterThanOrEqual(0);
              expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
            }
            geometry.push({
              source: query ? "pantry" : "quick add",
              width: 320,
              scale: 200,
              dark: false,
              row,
            });
          }
          await writeFile(
            info.outputPath("food-suggestion-readability.json"),
            JSON.stringify(geometry, null, 2)
          );
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "";
            document.documentElement.classList.remove("dark");
          });
          await page.setViewportSize({ width: 393, height: 852 });
          await input.fill("50g milk");
          // Every geometry check above is read-only; neither Log was invoked.
          expect((await meals.get()).size).toBe(0);
        }

        await page
          .getByRole("button", { name: "Log meal", exact: true })
          .click();
        const warning = page
          .locator("[data-sonner-toast]")
          .filter({ hasText: /Nothing logged/ });
        await expect(warning).toBeVisible();
        expect((await meals.get()).size).toBe(0);
        await expect(input).toHaveValue(text);
        // Real browsers restore focus on leaving the toast. A DOM simulator
        // does not reproduce that handoff, so exercise the actual action.
        await warning
          .getByRole("button", { name: "Edit description", exact: true })
          .click();
        await expect(input).toBeFocused();
        await input.fill("120ml milk");
        await page
          .getByRole("button", { name: "Log meal", exact: true })
          .click();
        await expect
          .poll(async () => (await meals.get()).size, { timeout: 20_000 })
          .toBe(1);
        expect((await meals.get()).docs[0].data()).toMatchObject({
          confidence: "nl-parse",
          totalCalories: 75,
          totalProtein: 4,
          totalCarbs: 6,
          totalFat: 4,
          items: [
            {
              name: "120ml milk",
              portionSize: "120ml",
              calories: 75,
              protein: 4,
              carbs: 6,
              fat: 4,
            },
          ],
        });
        await expect(input).toHaveValue("");
      } finally {
        await context.close();
        try {
          await db.recursiveDelete(profile);
        } finally {
          await auth.deleteUser(user.uid);
        }
      }
    });
  }
});
