import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./helpers/auth";
import { settleImages } from "./helpers/settleImages";
import { suppressCoachmarks } from "./helpers/suppressCoachmarks";
import { emulatorActive } from "./helpers/emulator";

test.use({ viewport: { width: 393, height: 852 } });
test.describe("weekly layout confirmation on mobile", () => {
  test.skip(!emulatorActive, "Requires the local Firebase emulators.");
  for (const colorScheme of ["dark", "light"] as const) {
    test(`confirmation stays open and cancellation preserves the draft — ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      await suppressCoachmarks(page);
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await signInAsTestUser(page);
      // Firebase's test-only banner covers the mobile bottom navigation.
      await page.addStyleTag({
        content: ".firebase-emulator-warning { display: none !important; }",
      });
      await page.getByRole("link", { name: "Train", exact: true }).click();
      await page
        .getByRole("button", { name: "More options", exact: true })
        .click();
      await page.getByRole("button", { name: /Edit weekly layout/ }).click();
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        colorScheme === "dark"
      );
      await expect(page.locator("html")).toHaveClass(
        colorScheme === "dark" ? /dark/ : /^(?!.*dark)/
      );
      const sheet = page.getByRole("dialog", {
        name: "Edit weekly layout",
        exact: true,
      });
      const lift = sheet
        .getByRole("button", { name: /: Lift\. Tap to change\./ })
        .first();
      const originalLabel = await lift.getAttribute("aria-label");
      expect(originalLabel).toBeTruthy();
      const newLabel = originalLabel!.replace(": Lift.", ": Run.");
      await lift.click();
      await sheet
        .getByRole("button", { name: "Apply changes", exact: true })
        .click();
      const confirmation = page.getByRole("alertdialog", {
        name: "Restructure programme?",
        exact: true,
      });
      await expect(confirmation).toBeVisible();
      await expect(
        confirmation.getByRole("button", { name: "Confirm", exact: true })
      ).toBeEnabled();
      await settleImages(page);
      await testInfo.attach(`layout-confirmation-${colorScheme}`, {
        body: await page.screenshot({
          path: testInfo.outputPath(`layout-confirmation-${colorScheme}.png`),
          animations: "disabled",
        }),
        contentType: "image/png",
      });
      await confirmation
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(confirmation).not.toBeVisible();
      await expect(
        sheet.getByRole("button", { name: newLabel, exact: true })
      ).toBeVisible();
      await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(sheet).not.toBeVisible();
      await page
        .getByRole("button", { name: "More options", exact: true })
        .click();
      await page.getByRole("button", { name: /Edit weekly layout/ }).click();
      await expect(
        sheet.getByRole("button", { name: originalLabel!, exact: true })
      ).toBeVisible();
    });
  }
});
