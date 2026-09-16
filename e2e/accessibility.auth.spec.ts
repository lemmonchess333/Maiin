import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "./helpers/auth";

/**
 * Accessibility, on the surfaces behind sign-in.
 *
 * `accessibility.spec.ts` has never signed in. Every one of its tests
 * goes to `/` or `/privacy`, and its own comment admits the gap —
 * "other pages need their own auth fixture to test similarly". So the
 * Login screen has been checked since Sprint 1 and the app has not.
 *
 * What that hid: framer-motion's press gesture writes `tabIndex = 0`
 * onto any element carrying `whileTap` that is not natively focusable
 * (motion-dom's `isElementKeyboardAccessible` — BUTTON / INPUT / SELECT
 * / TEXTAREA / A). Three surfaces had it. The bottom navigation bar put
 * five unnamed, roleless stops in the tab order of EVERY authenticated
 * screen, and nothing here could see them because nothing here had ever
 * been to an authenticated screen.
 *
 * Runs in the `auth-emulator` project. The `emulator-tests` CI job
 * seeds only the cold-start user (`seed:e2e`) — `coldstart.auth.spec.ts`
 * asserts the empty experience and rich data would break it — so every
 * assertion below must hold for a fresh account rendering empty states.
 */

/** Routes reachable by a cold-start account, each rendering the shell. */
const ROUTES = [
  { path: "/", name: "Home" },
  { path: "/food", name: "Food" },
  { path: "/history", name: "Analytics" },
  { path: "/program", name: "Programme" },
  { path: "/social", name: "Social" },
  { path: "/settings", name: "Settings" },
] as const;

async function goTo(page: Page, path: string) {
  // Client-side navigation: `page.goto('/food')` would drop the
  // `/Maiin/` base path the SPA is mounted under (see helpers/auth.ts).
  await page.evaluate((p) => {
    window.history.pushState({}, "", `/Maiin${p === "/" ? "/" : p}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-tab-bar]")).toBeVisible({ timeout: 20_000 });
  // Let lazy route chunks and their first paint land.
  await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0, {
    timeout: 20_000,
  });
}

/**
 * Elements sitting in the tab order without being controls.
 *
 * Keyed on ROLE, not on having a name: text inside a container is not
 * an accessible name and does not make it actionable. An earlier
 * nameless-only version of this rule reported two of the three known
 * offenders as clean, because their tiles carry their own copy.
 */
async function phantomStops(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const NATIVE = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"]);
    return [...document.querySelectorAll('[tabindex="0"]')]
      .filter((el) => !NATIVE.has(el.tagName))
      .filter((el) => !el.hasAttribute("role"))
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => {
        const cls = (el.getAttribute("class") ?? "").slice(0, 60);
        const txt = (el.textContent ?? "").trim().slice(0, 30);
        return `<${el.tagName.toLowerCase()} class="${cls}"> "${txt}"`;
      });
  });
}

test.describe("Accessibility — authenticated shell", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await signInAsTestUser(page);
  });

  test("the sweep reaches a signed-in app, not the login screen", async ({
    page,
  }) => {
    /* Anchors every assertion below. All of them are "find nothing"
       shapes, so a sweep that silently stayed on Login — or never
       rendered the shell — would report a clean bill of health for a
       page it never visited. That is exactly how the signed-out spec
       came to look like coverage. */
    await goTo(page, "/");
    await expect(page.locator("[data-tab-bar]")).toBeVisible();
    await expect(page.locator("#login-email")).toHaveCount(0);
    const tabs = page.locator("[data-tab-bar] a");
    expect(await tabs.count()).toBeGreaterThanOrEqual(5);
  });

  for (const route of ROUTES) {
    test(`${route.name} puts no unnamed stop in the tab order`, async ({
      page,
    }) => {
      await goTo(page, route.path);
      const stops = await phantomStops(page);
      expect(
        stops,
        `${route.name} (${route.path}) has ${stops.length} focusable ` +
          `element(s) that are neither a control nor roled. A reader ` +
          `tabbing through lands on each one and is told nothing. ` +
          `Usual cause: \`whileTap\` on a \`motion.div\`.`
      ).toEqual([]);
    });
  }

  for (const route of ROUTES) {
    test(`${route.name} names every button`, async ({ page }) => {
      await goTo(page, route.path);
      const offenders = await page.evaluate(() => {
        return [...document.querySelectorAll("button")]
          .filter((b) => (b as HTMLElement).offsetParent !== null)
          .filter(
            (b) =>
              !(b.getAttribute("aria-label") ?? "").trim() &&
              !(b.getAttribute("title") ?? "").trim() &&
              !(b.textContent ?? "").trim()
          )
          .map((b) => `<button class="${b.getAttribute("class") ?? ""}">`);
      });
      expect(
        offenders,
        `${route.name} renders button(s) with no accessible name`
      ).toEqual([]);
    });
  }

  test("the bottom navigation bar is one stop per tab, each named", async ({
    page,
  }) => {
    /* The paired positive for the phantom-stop rule above. Taking the
       links themselves OUT of the tab order would satisfy "no unnamed
       stops" while breaking navigation for anyone using a keyboard. */
    await goTo(page, "/");
    const tabs = page.locator("[data-tab-bar] a");
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i);
      expect(await tab.getAttribute("tabindex")).not.toBe("-1");
      const name =
        (await tab.getAttribute("aria-label"))?.trim() ||
        (await tab.textContent())?.trim() ||
        "";
      expect(name, `nav tab ${i} has no accessible name`).not.toBe("");
    }
  });
});
