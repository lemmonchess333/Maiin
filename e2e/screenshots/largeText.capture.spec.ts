/**
 * The app at large text, measured. The iPhone app follows the phone's
 * text size between 1× and 2× (src/lib/systemTextSize.ts), and three
 * passes (#2588, #2592, #2594) fixed some forty places where larger text
 * ran a word out of its card or a control off the screen. Nothing else
 * would notice one coming back: a new fixed width, a row that cannot
 * wrap, a picture that never gives way all pass every other test.
 *
 * The screens: Home, Train, History's five pages, Food and its manual
 * entry and edit sheets, Settings and every section of it, Train's
 * exercise menu, a workout, a run before, during and after, the
 * exercise, run and workout detail pages, the Weekly review, sign-up,
 * setup and the Pro page.
 *
 * Each screen is opened at 393px and at 320px (Display Zoom on an SE or
 * a mini), with the root font at 135% (the largest standard size) and
 * 200% (where the app's scaling stops), and measured with layoutBreaks:
 * nothing may reach past the screen, and no text may be wider than its
 * own box unless it ends in an ellipsis on purpose.
 *
 * Skipped: rows that scroll sideways by design, text only for screen
 * readers, and the drawings inside SVGs. ACCEPTED lists the breaks that were judged and kept;
 * each says why. Add to it only with a reason, never to get green.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  openSignUpForm,
  openSignInForm,
  signInAsTestUser,
} from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { layoutBreaks } from "../helpers/layoutBreaks";
import { verifySignupEmail } from "../helpers/verifySignupEmail";

const WIDTHS = [393, 320] as const;
const SCALES = [135, 200] as const;

/* Not skipped: aria-hidden. Much of what it marks is visible text that
   is announced another way (a chart's axis dates, a row's status word),
   and it breaks the same as any other. */
const IGNORE = [
  ".sr-only",
  "svg",
  '[class*="snap-x"]',
  '[class*="overflow-x-auto"]',
  ".firebase-emulator-warning",
].join(", ");

/** Breaks judged and kept. `text` matches the quoted start of the label. */
const ACCEPTED: {
  screen: string;
  width: number;
  scale: number;
  text: RegExp;
  why: string;
}[] = [
  {
    screen: "workout",
    width: 320,
    scale: 200,
    text: /"(kg|Reps)"/,
    why:
      "The set table's column headers run a few px past their columns at " +
      "the extreme; the columns themselves fit, and nothing leaves the " +
      "screen (#2592).",
  },
];

/** Every Settings section, as App.tsx routes them. */
const SETTINGS_PAGES = [
  "profile",
  "account",
  "training",
  "lift-plan",
  "run-plan",
  "workout-prefs",
  "nutrition",
  "data",
  "recently-deleted-meals",
  "health",
  "shoes",
  "notifications",
  "privacy",
  "units-appearance",
  "subscription",
  "support-legal",
] as const;

const START = { latitude: 51.5074, longitude: -0.1657 };
test.use({
  geolocation: { ...START, accuracy: 5 },
  permissions: ["geolocation"],
});

test.describe("large text", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none !important}";
        document.head.appendChild(style);
      });
    });
  });

  /** Measures the screen as it stands at each text size, then resets. */
  async function measure(
    page: Page,
    screen: string,
    width: number,
    found: string[]
  ) {
    for (const scale of SCALES) {
      await page.evaluate((s) => {
        document.documentElement.style.fontSize = `${s}%`;
      }, scale);
      await page.waitForTimeout(400);
      const breaks = await layoutBreaks(page, "body *", "html", IGNORE);
      // The page itself, which the per-element check cannot see when what
      // widens it is skipped (a chart's axis labels are aria-hidden).
      const wider = await page.evaluate(
        () =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth
          ) - document.documentElement.clientWidth
      );
      if (wider > 1) breaks.push(`the page scrolls sideways by ${wider}px`);
      for (const b of breaks) {
        const kept = ACCEPTED.some(
          (a) =>
            a.screen === screen &&
            a.width === width &&
            a.scale === scale &&
            a.text.test(b)
        );
        if (!kept) found.push(`${screen} ${width}px ${scale}%: ${b}`);
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  }

  /** Waits for a screen's marker, then closes anything that opened over it. */
  async function ready(page: Page, marker: ReturnType<Page["getByRole"]>) {
    await marker.waitFor({ state: "visible", timeout: 20_000 });
    for (let i = 0; i < 6; i++) {
      if (
        !(await page
          .getByRole("dialog")
          .isVisible()
          .catch(() => false))
      )
        break;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(600);
  }

  for (const width of WIDTHS) {
    test(`the main screens at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];
      const nav = page.getByRole("navigation").first();

      await page.goto("");
      await ready(page, nav);
      await measure(page, "home", width, found);

      await page.goto("program");
      await ready(page, page.getByRole("heading", { name: "Train" }));
      await measure(page, "train", width, found);

      for (const view of ["", "lifting", "running", "body", "food"]) {
        await page.goto(view ? `history?view=${view}` : "history");
        await ready(page, nav);
        await measure(page, `history${view ? `-${view}` : ""}`, width, found);
      }

      await page.goto("food");
      await ready(page, page.getByRole("button", { name: "Enter manually" }));
      await measure(page, "food", width, found);
      await page.getByRole("button", { name: "Enter manually" }).click();
      await page.waitForTimeout(800);
      await measure(page, "food-manual-entry", width, found);
      await page.keyboard.press("Escape");

      await page.goto("settings");
      await ready(page, nav);
      await measure(page, "settings", width, found);

      expect(found).toEqual([]);
    });

    test(`a workout and a run at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];

      await page.goto("program");
      const more = page
        .getByRole("button", { name: /^More options for / })
        .first();
      await ready(page, more);
      await more.click();
      await page.waitForTimeout(600);
      await measure(page, "exercise-menu", width, found);
      await page.keyboard.press("Escape");

      await page.goto("program");
      const start = page.getByRole("button", {
        name: "Start workout",
        exact: true,
      });
      await ready(page, start);
      await start.click();
      await page
        .getByRole("button", { name: /^Complete / })
        .first()
        .waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await measure(page, "workout", width, found);

      await page.goto("run");
      await page.waitForTimeout(2500);
      await measure(page, "run-start", width, found);
      const freeRun = page.getByRole("button", { name: /free run/i }).first();
      const launch = page
        .getByRole("button", { name: /^start( run)?$/i })
        .first();
      const entered = await freeRun
        .click({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (!entered) await launch.click({ timeout: 10_000 });
      for (let i = 0; i < 5; i++) {
        await page.context().setGeolocation({
          latitude: START.latitude + (i * 6) / 111_320,
          longitude: START.longitude,
          accuracy: 5,
        });
        await page.waitForTimeout(2000);
      }
      await expect(
        page.getByRole("button", { name: /pause/i }).first()
      ).toBeVisible();
      await measure(page, "run-live", width, found);

      expect(found).toEqual([]);
    });

    test(`sign-up, setup and Pro at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 852 });
      const found: string[] = [];
      const next = async () => {
        await page
          .getByRole("button", { name: /continue/i })
          .first()
          .click({ timeout: 8000 });
        await page.waitForTimeout(500);
      };

      await page.goto("/");
      await page
        .getByRole("heading", {
          name: "Your training and food, planned together",
        })
        .waitFor({ timeout: 20_000 });
      await measure(page, "welcome", width, found);
      await openSignInForm(page);
      await page.waitForTimeout(500);
      await measure(page, "sign-in", width, found);
      await page.goto("/");
      await openSignUpForm(page);
      await page.waitForTimeout(500);
      await measure(page, "sign-up", width, found);

      const email = `e2e-large-text-${width}-${Date.now()}@tropos.test`;
      await page.fill("#login-email", email);
      await page.fill("#login-password", "test-password-123");
      await page
        .getByRole("button", { name: /create account/i })
        .click({ timeout: 8000 });
      await verifySignupEmail(page, email);

      await page
        .getByRole("button", { name: /build muscle/i })
        .waitFor({ state: "visible", timeout: 30_000 });
      await measure(page, "setup-goal", width, found);
      await page.getByRole("button", { name: /build muscle/i }).click();
      await next();
      await page.getByRole("radio", { name: "Both", exact: true }).click();
      await measure(page, "setup-days", width, found);
      await next();
      await page.getByRole("button", { name: /regular runner/i }).click();
      await page.getByRole("radio", { name: /race prep/i }).click();
      await page.getByRole("radio", { name: /^full$/i }).click();
      await page
        .getByLabel(/race target date/i)
        .fill(
          new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
        );
      await page.waitForTimeout(500);
      await measure(page, "setup-running", width, found);
      await next();
      await measure(page, "setup-equipment", width, found);
      await page.getByRole("button", { name: /full gym/i }).click();
      await page.getByRole("button", { name: /some experience/i }).click();
      await next();
      await measure(page, "setup-limitations", width, found);
      await page.getByRole("button", { name: "None", exact: true }).click();
      await next();
      await measure(page, "setup-about-you", width, found);
      await page.getByLabel("Weight (kg)", { exact: true }).fill("81.5");
      await page.getByLabel("Height (cm)", { exact: true }).fill("175");
      await page.getByRole("radio", { name: /^25/ }).click();
      await next();
      await measure(page, "setup-summary", width, found);

      expect(found).toEqual([]);
    });

    test(`the Settings pages at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];
      for (const section of SETTINGS_PAGES) {
        await page.goto(`settings/${section}`);
        await ready(page, page.getByRole("heading", { level: 1 }).first());
        await measure(page, `settings-${section}`, width, found);
      }
      expect(found).toEqual([]);
    });

    test(`the detail screens at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];
      const follow = async (from: string, href: string, screen: string) => {
        await page.goto(from);
        const link = page.locator(`a[href*="${href}"]`).first();
        await link.waitFor({ state: "attached", timeout: 20_000 });
        await link.scrollIntoViewIfNeeded();
        await link.click();
        await page.waitForURL((url) => url.pathname.includes(href));
        await page.waitForTimeout(2000);
        await measure(page, screen, width, found);
      };

      await follow("history?view=lifting", "/history/exercise/", "exercise");
      // A saved run and a saved workout, by the ids seed:rich gives them.
      for (const [path, screen] of [
        ["run/rich-r0", "run-detail"],
        ["workout/rich-w0", "workout-detail"],
      ] as const) {
        await page.goto(path);
        await ready(page, page.getByRole("heading").first());
        await page.waitForTimeout(1000);
        await measure(page, screen, width, found);
      }

      await page.goto("review");
      await ready(page, page.getByRole("heading").first());
      await measure(page, "weekly-review", width, found);

      // A meal's edit sheet, from today's diary.
      await page.goto("food");
      const meal = page.getByRole("button", { name: /^Edit / }).first();
      await ready(page, meal);
      await meal.click();
      await page.getByRole("dialog").waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await measure(page, "food-edit-sheet", width, found);
      await page.keyboard.press("Escape");

      // The run finish screen, handed a finished run through router
      // state as Run.tsx does (run-finish.capture.spec.ts); nothing is
      // saved.
      await page.evaluate(() => {
        const start = Date.now() - 30 * 60 * 1000;
        const points = Array.from({ length: 61 }, (_, i) => {
          const a = (i / 60) * 2 * Math.PI;
          const lat = 51.5074 + 0.0072 * Math.sin(a);
          const lon = -0.1278 + 0.0115 * Math.cos(a);
          return {
            lat,
            lon,
            rawLat: lat,
            rawLon: lon,
            altitude: 20 + 15 * Math.sin(a * 2),
            accuracy: 5,
            speed: 2.8,
            timestamp: start + i * 30_000,
          };
        });
        const splits = [372, 364, 352, 358, 354].map((paceSeconds, i) => ({
          km: i + 1,
          time: paceSeconds,
          pace: `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, "0")}`,
          paceSeconds,
          elevationGain: 6,
          elevationLoss: 6,
        }));
        history.pushState(
          {
            usr: {
              points,
              distance: 5000,
              elapsed: 1800,
              splits,
              elevationGain: 30,
              runConfig: { activityType: "tempo" },
            },
            key: "e2e-large-text-finish",
            idx: (history.state?.idx ?? 0) + 1,
          },
          "",
          "/Maiin/run-summary"
        );
        window.dispatchEvent(
          new PopStateEvent("popstate", { state: history.state })
        );
      });
      await page
        .getByRole("button", { name: "Save run", exact: true })
        .waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await measure(page, "run-summary", width, found);

      expect(found).toEqual([]);
    });

    test(`the Pro page at ${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];

      await page.goto("upgrade?from=onboarding");
      await page
        .getByRole("heading", { name: /your plan is ready/i })
        .waitFor({ timeout: 15_000 });
      await measure(page, "pro-offer", width, found);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("heading", { name: /choose your plan/i })
        .waitFor({ timeout: 10_000 });
      await measure(page, "pro-plans", width, found);

      expect(found).toEqual([]);
    });
  }
});
