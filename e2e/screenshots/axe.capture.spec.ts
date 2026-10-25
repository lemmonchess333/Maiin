/**
 * axe on the signed-in app. The two hand-rolled specs
 * (`a11yAuthenticated.auth.spec.ts`, `accessibility.auth.spec.ts`) check
 * the shapes someone thought to write down: unnamed buttons, phantom tab
 * stops, one h1. axe checks what else a machine can see (names, roles,
 * ARIA that does not resolve, lists, labels, contrast) on the screens
 * people use and inside the sheets they open.
 *
 * The screens: Home, Food, Train, History and its Lifting page, Social
 * (Together and the Explore feed), Settings and six of its sections, a
 * profile, a Space, an exercise, a run, a workout and the Weekly review.
 * The sheets: Food's manual entry and a meal's edit sheet, the weight
 * log, Train's exercise menu, Social's notifications and a run's share
 * sheet, each measured on its own (the screen behind has its own check).
 * Everything is measured in the light theme the seeded account keeps and
 * again in dark.
 *
 * Each screen is measured once its data is in, not after a fixed wait: a
 * skeleton has no text to fail, so a check that lands on one passes for
 * a screen it never saw (Home's session card did, on the first run).
 *
 * It fails on a `serious` or `critical` violation. ACCEPTED lists the
 * ones judged and kept, each with its reason, in the style of
 * `largeText.capture.spec.ts`: add to it only with a reason, never to
 * get green.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

/** Violations judged and kept. `target` matches the node's CSS path. */
const ACCEPTED: {
  rule: string;
  screen?: RegExp;
  target?: RegExp;
  why: string;
}[] = [];

const BLOCKING = new Set(["serious", "critical"]);

/* Not the app: the emulator's own banner, hidden below but still in the
   DOM. */
const EXCLUDE = [".firebase-emulator-warning"];

interface Finding {
  screen: string;
  rule: string;
  impact: string;
  target: string;
  summary: string;
}

async function axeFindings(
  page: Page,
  screen: string,
  scope?: string
): Promise<Finding[]> {
  const builder = new AxeBuilder({ page });
  if (scope) builder.include(scope);
  for (const sel of EXCLUDE) builder.exclude(sel);
  const results = await builder.analyze();
  const out: Finding[] = [];
  for (const v of results.violations) {
    if (!v.impact || !BLOCKING.has(v.impact)) continue;
    for (const node of v.nodes) {
      out.push({
        screen,
        rule: v.id,
        impact: v.impact,
        target: node.target.map(String).join(" "),
        summary: (node.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 220),
      });
    }
  }
  return out;
}

function unaccepted(found: Finding[]): string[] {
  return found
    .filter(
      (f) =>
        !ACCEPTED.some(
          (a) =>
            a.rule === f.rule &&
            (!a.screen || a.screen.test(f.screen)) &&
            (!a.target || a.target.test(f.target))
        )
    )
    .map(
      (f) => `${f.screen}: ${f.rule} (${f.impact}) ${f.target} — ${f.summary}`
    );
}

test.describe("axe", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    /* Reduce Motion, so no fade is mid-flight when contrast is read: a
       half-faded label measures as a contrast failure it does not have. */
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none !important}";
        document.head.appendChild(style);
      });
    });
    await signInAsTestUser(page);
  });

  /** Closes anything that opened over a screen by itself (a badge seal). */
  async function closeStrayDialogs(page: Page) {
    for (let i = 0; i < 6; i++) {
      if (
        !(await page
          .getByRole("dialog")
          .isVisible()
          .catch(() => false))
      )
        return;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }
  }

  /** Runs axe in both themes and adds what it finds to `found`. */
  async function check(
    page: Page,
    screen: string,
    found: Finding[],
    scope?: string
  ) {
    for (const dark of [false, true]) {
      await page.evaluate(
        (d) => document.documentElement.classList.toggle("dark", d),
        dark
      );
      // The colours a component reads in JS need a render to follow.
      await page.waitForTimeout(300);
      found.push(
        ...(await axeFindings(
          page,
          `${screen}-${dark ? "dark" : "light"}`,
          scope
        ))
      );
    }
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  /* A sheet closes through history (its back-dismiss), so the next
     navigation waits for it to be gone, or the two race and the goto is
     aborted. */
  async function close(page: Page, what = page.getByRole("dialog")) {
    await page.keyboard.press("Escape");
    await expect(what).toHaveCount(0, { timeout: 10_000 });
  }

  /** Waits for `marker`, then for the screen's skeletons to go. */
  async function settle(page: Page, marker: Locator) {
    await marker.waitFor({ state: "visible", timeout: 20_000 });
    await closeStrayDialogs(page);
    await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0, {
      timeout: 20_000,
    });
    await page.waitForTimeout(400);
  }

  async function open(page: Page, route: string, marker: Locator) {
    await page.goto(route);
    await settle(page, marker);
  }

  test("the main screens", async ({ page }) => {
    test.setTimeout(300_000);
    const found: Finding[] = [];
    const nav = page.getByRole("navigation", { name: /main navigation/i });

    // Home's session card, not the skeleton in its place.
    await open(
      page,
      "",
      page
        .getByRole("group", { name: "Today’s training" })
        .getByRole("button")
        .first()
    );
    await check(page, "home", found);

    await open(
      page,
      "food",
      page.getByRole("button", { name: "Enter manually" })
    );
    await check(page, "food", found);

    await open(page, "program", page.getByRole("heading", { name: "Train" }));
    await check(page, "train", found);

    await open(
      page,
      "history",
      page
        .getByRole("region", { name: "Muscles trained" })
        .getByRole("listitem")
        .first()
    );
    await check(page, "history", found);

    await open(page, "history?view=lifting", nav);
    await check(page, "history-lifting", found);

    /* The Community section, then (in `settle`) its skeletons gone: which
       Circles card it shows depends on what other specs on the shared
       account have done, so the marker names none of them. */
    await open(page, "social", page.getByRole("region", { name: "Community" }));
    await check(page, "social", found);

    await open(
      page,
      "social?tab=feed&feed=explore",
      page.getByText("Maya Chen").first()
    );
    await check(page, "social-explore", found);

    expect(unaccepted(found)).toEqual([]);
  });

  test("Settings, a profile, a Space and the detail screens", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const found: Finding[] = [];
    const h1 = page.getByRole("heading", { level: 1 }).first();

    await open(page, "settings", h1);
    await check(page, "settings", found);
    for (const section of [
      "profile",
      "training",
      "nutrition",
      "notifications",
      "privacy",
      "units-appearance",
    ]) {
      await open(page, `settings/${section}`, h1);
      await check(page, `settings-${section}`, found);
    }

    // The person's own profile, as others see it.
    await open(page, "settings/profile", h1);
    await page
      .getByRole("button", { name: "See your profile as others do" })
      .click();
    await page.waitForURL(/\/user\//);
    await settle(page, page.getByRole("heading", { level: 1 }));
    await check(page, "profile", found);

    await open(
      page,
      "space/womens-running",
      page.getByRole("heading", { name: "Women's Running", level: 1 })
    );
    await check(page, "space", found);

    await open(
      page,
      "history/exercise/Bench%20Press",
      page.getByRole("heading", { level: 1 }).first()
    );
    await check(page, "exercise", found);

    await open(
      page,
      "run/rich-r0",
      page.getByRole("button", { name: "Share" }).first()
    );
    await check(page, "run-detail", found);

    await open(page, "workout/rich-w0", page.getByRole("heading").first());
    await check(page, "workout-detail", found);

    // The recap's first card, not the spinner in front of it.
    await open(
      page,
      "review",
      page.getByRole("heading", { name: "Your week", exact: true })
    );
    await check(page, "weekly-review", found);

    expect(unaccepted(found)).toEqual([]);
  });

  test("with sheets open", async ({ page }) => {
    test.setTimeout(300_000);
    const found: Finding[] = [];
    const sheet = '[role="dialog"]';
    const dialog = page.locator(sheet).first();

    await open(
      page,
      "food",
      page.getByRole("button", { name: "Enter manually" })
    );
    await page.getByRole("button", { name: "Enter manually" }).click();
    await dialog.waitFor();
    await page.waitForTimeout(700);
    await check(page, "sheet-food-manual", found, sheet);
    await close(page);

    // A meal's edit sheet, from yesterday's diary (seed:rich logs meals on
    // the five days up to the one it ran on).
    const yesterday = await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    const meal = page.getByRole("button", { name: /^Edit / }).first();
    await open(page, `food?date=${yesterday}`, meal);
    await meal.click();
    await dialog.waitFor();
    await page.waitForTimeout(700);
    await check(page, "sheet-meal-edit", found, sheet);
    await close(page);

    const weight = page.getByRole("button", { name: /^Weight / }).first();
    await open(page, "", weight);
    await weight.click();
    await dialog.waitFor();
    await page.waitForTimeout(700);
    await check(page, "sheet-weight", found, sheet);
    await close(page);

    const more = page
      .getByRole("button", { name: /^More options for / })
      .first();
    await open(page, "program", more);
    await more.click();
    await page.getByRole("menu").waitFor();
    await page.waitForTimeout(400);
    await check(page, "exercise-menu", found, '[role="menu"]');
    await close(page, page.getByRole("menu"));

    const bell = page.getByRole("button", { name: /^Notifications/ });
    await open(page, "social", bell);
    await bell.click();
    await dialog.waitFor();
    await page.waitForTimeout(900);
    await check(page, "sheet-notifications", found, sheet);
    await close(page);

    const share = page.getByRole("button", { name: "Share" }).first();
    await open(page, "run/rich-r0", share);
    await share.click();
    await dialog.waitFor();
    await page.waitForTimeout(1500);
    await check(page, "sheet-share", found, sheet);

    expect(unaccepted(found)).toEqual([]);
  });
});
