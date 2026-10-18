import { test, expect, type Page } from "@playwright/test";
import { openSignInForm, openSignUpForm } from "./helpers/auth";

test.describe("Legal pages", () => {
  test("privacy policy renders with headings", async ({ page }) => {
    await page.goto("privacy");
    await page.waitForTimeout(1000);
    const headings = await page.locator("h1, h2").count();
    expect(headings).toBeGreaterThan(0);
    const text = await page.locator("#root").textContent();
    expect(text?.toLowerCase()).toContain("privacy");
  });

  test("terms of service renders with headings", async ({ page }) => {
    await page.goto("terms");
    await page.waitForTimeout(1000);
    const headings = await page.locator("h1, h2").count();
    expect(headings).toBeGreaterThan(0);
    const text = await page.locator("#root").textContent();
    expect(text?.toLowerCase()).toContain("terms");
  });

  test("privacy page has back navigation or links", async ({ page }) => {
    await page.goto("privacy");
    await page.waitForTimeout(1000);
    // PR B (audit): pre-fix this asserted `links >= 0` which always
    // passes. The test's stated purpose is to confirm at least one
    // link exists (back-nav, contact, related policy). Strengthened
    // to require at least one anchor — a regression where the
    // privacy page renders without ANY link would break user
    // navigation back to the app.
    const links = await page.locator("a").count();
    expect(
      links,
      "privacy page must render at least one link for navigation"
    ).toBeGreaterThan(0);
  });

  test("terms page has back navigation or links", async ({ page }) => {
    await page.goto("terms");
    await page.waitForTimeout(1000);
    const links = await page.locator("a").count();
    expect(
      links,
      "terms page must render at least one link for navigation"
    ).toBeGreaterThan(0);
  });
});

/* The agreement line under sign-in and sign-up (App Review 1.2), on the
   smallest phone the app supports: it wraps inside the screen, and its two
   links open the Terms and the Privacy Policy while signed out. */
test.describe("Login's agreement line on a small phone", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  /** The line's own box and its links' boxes, against the screen. */
  async function measureAgreement(page: Page) {
    const line = page
      .locator("p")
      .filter({ hasText: "By continuing, you agree to the" });
    await expect(line).toHaveText(
      "By continuing, you agree to the Terms and Privacy Policy."
    );
    await line.scrollIntoViewIfNeeded();
    return line.evaluate((p) => {
      const vw = document.documentElement.clientWidth;
      const inside = (r: DOMRect) => r.left >= -1 && r.right <= vw + 1;
      const range = document.createRange();
      range.selectNodeContents(p);
      return {
        vw,
        lineInside: inside(p.getBoundingClientRect()),
        textInside: Array.from(range.getClientRects()).every(inside),
        linksInside: Array.from(p.querySelectorAll("a")).every((a) =>
          inside(a.getBoundingClientRect())
        ),
        textOverflow: p.scrollWidth - p.clientWidth,
        pageOverflow:
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth
          ) - vw,
      };
    });
  }

  for (const [screen, open] of [
    ["sign-in", openSignInForm],
    ["sign-up", openSignUpForm],
  ] as const) {
    test(`${screen}: the line wraps inside the screen`, async ({ page }) => {
      await page.goto("");
      await open(page);
      const m = await measureAgreement(page);
      expect(m.vw).toBe(320);
      expect(m.lineInside).toBe(true);
      expect(m.textInside).toBe(true);
      expect(m.linksInside).toBe(true);
      expect(m.textOverflow).toBeLessThanOrEqual(1);
      expect(m.pageOverflow).toBeLessThanOrEqual(1);
    });
  }

  for (const [name, path, heading] of [
    ["Terms", "terms", "Terms of Service"],
    ["Privacy Policy", "privacy", "Privacy Policy"],
  ] as const) {
    test(`its ${name} link opens ${heading} signed out`, async ({ page }) => {
      await page.goto("");
      await openSignUpForm(page);
      await page
        .locator("p")
        .filter({ hasText: "By continuing, you agree to the" })
        .getByRole("link", { name, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/${path}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible();
      await expect(page.locator("#login-email")).toHaveCount(0);
    });
  }
});
