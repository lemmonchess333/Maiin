/**
 * The app at large text, measured. The iPhone app follows the phone's
 * text size between 1× and 2× (src/lib/systemTextSize.ts), and three
 * passes (#2588, #2592, #2594) fixed some forty places where larger text
 * ran a word out of its card or a control off the screen. Nothing else
 * would notice one coming back: a new fixed width, a row that cannot
 * wrap, a picture that never gives way all pass every other test.
 *
 * The screens: Home, Train, History's five pages (and its charts again
 * on a Monday), Food and its manual entry and edit sheets, Social's
 * Together tab (again with its other challenges opened) and its feed
 * on Following and on Explore, a Space, a profile and its followers and
 * following, Settings and every section of it, Train's exercise menu, a
 * workout, a run before, during and after, the exercise, run and workout
 * detail pages, the Weekly review, sign-up, setup and the Pro page. The
 * sheets: the weight log,
 * the streak's days, Social's notifications and a run's share and
 * rename sheets,
 * with Food's two above.
 *
 * And the surfaces the notification tray, a return and a session left
 * open lead to: one shared session and one Space post on their own pages,
 * each with its comments and the Space post's not-available state; a
 * runner's welcome back on Home; a Circle's invite code live and expired,
 * in both sheets that show it; and the In progress strip on Home and on
 * Train, for a programme workout and for a saved routine's; and an empty
 * workout's review, with the sheets that say when it started and name it.
 *
 * And the training plan's week and all sessions: the plan page, its week
 * reset (as opened, and after a week that felt like a bit much) with the
 * Express chooser and the usual-week editor it opens, a race plan's week
 * with the sheet that moves a run, and Training history with its dates
 * sheet and a period with nothing in it.
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
import { SETUP } from "../../src/test/journeyScreens";
import { settleCommunity } from "../helpers/settleCommunity";
import { brokenWords, layoutBreaks } from "../helpers/layoutBreaks";
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
  "pantry",
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
    found: string[],
    more?: (page: Page) => Promise<string[]>
  ) {
    for (const scale of SCALES) {
      await page.evaluate((s) => {
        document.documentElement.style.fontSize = `${s}%`;
      }, scale);
      await page.waitForTimeout(400);
      const breaks = [
        ...(await layoutBreaks(page, "body *", "html", IGNORE)),
        ...(await brokenWords(page, IGNORE)),
        ...(more ? await more(page) : []),
      ];
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

  /* The Feed's sources, each name whole in its part. A part cut short
     is clipped inside the switch, where no check above looks: nothing
     leaves the screen. Explore's new-content dot made it reach past the
     screen too, but only when it showed, which depends on which read
     lands first. */
  async function wholeSources(page: Page): Promise<string[]> {
    return page
      .getByRole("radiogroup", { name: "Feed source" })
      .getByRole("radio")
      .evaluateAll((radios) =>
        radios.flatMap((radio) => {
          const label = radio.firstElementChild;
          const over = label
            ? label.getBoundingClientRect().width - radio.clientWidth
            : 0;
          return over > 1
            ? [
                `cuts "${radio.textContent?.trim()}" by ${Math.round(over)}px in the feed's source switch`,
              ]
            : [];
        })
      );
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

      // The streak's days (Mob1 call 4): the seeded meals make a streak,
      // so the flame opens its sheet.
      await page
        .getByRole("button", { name: /-day streak, show the days$/ })
        .click();
      await page
        .getByRole("dialog", { name: /-day streak$/ })
        .waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForTimeout(600);
      await measure(page, "home-streak-sheet", width, found);
      await page.keyboard.press("Escape");

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

      // The focused box's Quick add list, its More row and its Quick add
      // row (Mob2), opened to fifteen.
      await page.waitForTimeout(600);
      await page.getByLabel("What did you eat").focus();
      const more = page.getByRole("button", { name: "More", exact: true });
      if (await more.isVisible({ timeout: 3_000 }).catch(() => false))
        await more.click();
      await page
        .getByRole("button", { name: /^Quick add Calories/ })
        .waitFor({ state: "visible", timeout: 20_000 });
      await measure(page, "food-quick-add", width, found);
      await page.getByLabel("What did you eat").blur();

      // A diary row's sheet, with the day's line and Copy to another day,
      // and the copy sheet it opens.
      await page.waitForTimeout(600);
      await page
        .getByRole("button", { name: /^Edit / })
        .first()
        .click();
      const copy = page.getByRole("button", { name: "Copy to another day" });
      await copy.waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(800);
      await measure(page, "food-edit", width, found);
      await copy.click();
      await page
        .getByRole("dialog", { name: "Copy to another day" })
        .waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(800);
      await measure(page, "food-copy-entry", width, found);
      await page.keyboard.press("Escape");

      await page.goto("settings");
      await ready(page, nav);
      await measure(page, "settings", width, found);

      expect(found).toEqual([]);
    });

    /* How many bars a History chart draws depends on the day: the 30 days
       up to a Monday begin on a Sunday and touch six weeks, every other
       day's touch five, and a card that holds five weeks' labels need not
       hold six (binAxis.ts). So History is measured on a Monday whatever
       day this runs, at each range whose chart names every bar: a week's
       days, a month's weeks, six months. */
    test(`History's charts on a Monday at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 852 });
      // The coming Monday, so everything seeded is in the past.
      const monday = new Date();
      monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7));
      monday.setHours(12, 0, 0, 0);
      await page.clock.setFixedTime(monday);
      await signInAsTestUser(page);
      const found: string[] = [];
      const nav = page.getByRole("navigation").first();

      for (const [range, views] of [
        ["1W", [""]],
        ["1M", ["", "lifting", "running"]],
        ["6M", ["", "lifting", "running"]],
      ] as const) {
        for (const view of views) {
          await page.goto(
            `history?${view ? `view=${view}&` : ""}range=${range}`
          );
          await ready(page, nav);
          // The chart is what this measures: a page without it would pass.
          await page
            .getByTestId("axis-ends")
            .first()
            .waitFor({ state: "attached", timeout: 20_000 });
          await measure(
            page,
            `history${view ? `-${view}` : ""}-${range}-monday`,
            width,
            found
          );
        }
      }

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
      // Run9: nothing is chosen for a new goal's event, and setup holds
      // until it is.
      await page
        .getByRole("radiogroup", { name: SETUP.raceEntry })
        .getByRole("radio", { name: SETUP.raceEntered, exact: true })
        .click();
      await page
        .getByLabel(/race target date/i)
        .fill(
          new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
        );
      // The widest a recent race's time gets: a 10K in 1:45:59.
      const recentRace = page.getByRole("region", { name: "Recent race" });
      await recentRace.getByRole("radio", { name: "10K" }).click();
      await recentRace.getByRole("textbox", { name: "Minutes" }).fill("105");
      await recentRace.getByRole("textbox", { name: "Seconds" }).fill("59");
      // R5: the running the plan starts from, which setup holds for.
      await page.getByRole("textbox", { name: SETUP.weekMinutes }).fill("180");
      await page.getByRole("textbox", { name: SETUP.longestRun }).fill("70");
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
      // My pantry's food sheet, on the food seed:rich saves.
      await page.goto("settings/pantry");
      await page.getByRole("button", { name: /^Flat white/ }).click();
      await page
        .getByRole("dialog", { name: "Edit food" })
        .waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(800);
      await measure(page, "settings-pantry-food", width, found);
      await page.keyboard.press("Escape");
      expect(found).toEqual([]);
    });

    test(`Social, a Space and a profile at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];
      const nav = page.getByRole("navigation").first();

      await page.goto("social?tab=together");
      await ready(page, nav);
      await settleCommunity(page);
      await measure(page, "social-together", width, found);

      // The challenges behind "See N more", opened into their compact rows.
      await page
        .getByRole("button", { name: /^See \d+ more challenges?$/ })
        .click();
      await page
        .getByRole("heading", { name: "Available" })
        .waitFor({ state: "visible", timeout: 10_000 });
      await measure(page, "social-together-more", width, found);

      /* The Feed on Following, where Social opens for anyone who follows
         someone: its posts or its empty state, then the week card under
         them past its spinner. */
      await page.goto("social?tab=feed&feed=following");
      await ready(
        page,
        page
          .getByText("Nothing from people you follow yet")
          .or(page.getByText("You don't follow anyone yet"))
          .or(
            page
              .getByRole("button", { name: /^(Add a comment|View comments)$/ })
              .first()
          )
      );
      await expect(
        page.locator(
          'main [class*="animate-pulse"], main [aria-label="Loading trajectory"]'
        )
      ).toHaveCount(0, { timeout: 20_000 });
      await measure(page, "social-feed-following", width, found, wholeSources);

      await page.goto("social?tab=feed&feed=explore");
      await ready(page, page.getByText("Maya Chen").first());
      await measure(page, "social-feed", width, found, wholeSources);

      // A Space the seeded user has joined, with posts in it.
      await page.goto("space/womens-running");
      await ready(
        page,
        page.getByRole("heading", { name: "Women's Running", level: 1 })
      );
      await measure(page, "space", width, found);

      // The person's own profile, as others see it.
      await page.goto("settings/profile");
      await page
        .getByRole("button", { name: "See your profile as others do" })
        .click({ timeout: 20_000 });
      await page.waitForURL(/\/user\//);
      await ready(page, page.getByRole("heading", { level: 1 }));
      await measure(page, "profile", width, found);

      // Its counts open the person's own followers and following.
      for (const list of ["followers", "following"] as const) {
        await page.goto(list);
        await ready(page, page.getByRole("heading", { level: 1 }));
        await page.waitForTimeout(1500);
        await measure(page, list, width, found);
      }

      expect(found).toEqual([]);
    });

    test(`the sheets at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];
      const dialog = page.getByRole("dialog").first();

      const weight = page.getByRole("button", { name: /^Weight / }).first();
      await page.goto("");
      await ready(page, weight);
      await weight.click();
      await dialog.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await measure(page, "weight-sheet", width, found);
      // Closed through history: gone before the next goto, or they race.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      const bell = page.getByRole("button", { name: /^Notifications/ });
      await page.goto("social");
      await ready(page, bell);
      await bell.click();
      await dialog.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await measure(page, "notifications-sheet", width, found);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      const share = page.getByRole("button", { name: "Share" }).first();
      await page.goto("run/rich-r0");
      await ready(page, share);
      await share.click();
      await dialog.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(1500);
      await measure(page, "share-sheet", width, found);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // The same run's rename sheet.
      await page.getByRole("button", { name: "Rename run" }).click();
      await dialog.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await measure(page, "rename-run-sheet", width, found);

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

      // The recap's first card, not the spinner in front of it: the page's
      // own heading is there from the first frame.
      await page.goto("review");
      await ready(
        page,
        page.getByRole("heading", { name: "Your week", exact: true })
      );
      await measure(page, "weekly-review", width, found);

      // A meal's edit sheet, from yesterday's diary. seed:rich logs meals
      // on the five days up to the one it ran on, so yesterday has them
      // whether or not the run has crossed midnight since it seeded. One
      // that seeded at 23:59 on 7 October 2026 found today's diary empty.
      const yesterday = await page.evaluate(() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      });
      await page.goto(`food?date=${yesterday}`);
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

    /* The pages the notification tray opens: one shared session (seed:rich
       gives Maya's push day five props and two comments), whose comments
       are on the page, and one Space post (her "6 weeks in!", with one
       comment), again with its comments open, and a post that is not
       there. */
    test(`the one-post pages at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];
      const dialog = page.getByRole("dialog").first();

      await page.goto("activity/rich-feed-push");
      const props = page.getByRole("button", { name: /props — show list$/ });
      await ready(page, props);
      await props.click();
      await page.getByText("Jordan Reyes").waitFor({ timeout: 20_000 });
      await measure(page, "activity-post", width, found);

      // The session's comments are on its page, with the field in focus.
      await page.goto("activity/rich-feed-push?comments=1");
      await page
        .getByText("Strong session.", { exact: false })
        .waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      await measure(page, "activity-post-comments", width, found);

      await page.goto("space/womens-running/post/seed-maya");
      await ready(page, page.getByRole("link", { name: "Women's Running" }));
      await measure(page, "space-post", width, found);

      await page.goto("space/womens-running/post/seed-maya?comments=1");
      await dialog
        .getByText("Go for it.", { exact: false })
        .waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      await measure(page, "space-post-comments", width, found);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await page.goto("space/womens-running/post/no-such-post");
      await ready(page, page.getByText("This post isn't available"));
      await measure(page, "space-post-unavailable", width, found);

      expect(found).toEqual([]);
    });

    // seed:liftreturn's free runner, whose last run was 15 days ago.
    test(`a runner's welcome back at ${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page, {
        email: "runreturn-capture@tropos.test",
        password: "test-password-123",
      });
      const found: string[] = [];
      await page
        .getByRole("dialog")
        .getByText("since your last run", { exact: false })
        .waitFor({ timeout: 25_000 });
      await page.waitForTimeout(800);
      await measure(page, "run-return", width, found);
      expect(found).toEqual([]);
    });

    /* The training plan and all sessions: the plan page (with Add
       activity when today is a rest day), its week reset as opened and
       after a heavy week, the Express chooser and the usual-week editor
       the reset opens, Training history, its dates sheet and an empty
       period; then seed:fellbehind's race plan, whose week has runs to
       move, with the move sheet. */
    test(`the plan and all sessions at ${width}px`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];
      const dialog = page.getByRole("dialog").first();

      await page.goto("program/plan");
      await ready(page, page.getByRole("heading", { name: "Your plan" }));
      await page
        .getByRole("region", { name: "This week's plan" })
        .getByRole("listitem")
        .first()
        .waitFor({ timeout: 20_000 });
      await measure(page, "training-plan", width, found);
      if (
        !(await page
          .getByText("Add activity:")
          .isVisible()
          .catch(() => false))
      )
        test.info().annotations.push({
          type: "skipped-surface",
          description: "plan-add-activity: today is not a rest day",
        });

      await page.goto("program/plan?reset=1");
      const layout = page.getByRole("button", {
        name: "Change usual weekly layout",
      });
      // A fresh account's plan can still be settling from the first visit.
      await layout.waitFor({ state: "visible", timeout: 60_000 });
      await ready(page, layout);
      await measure(page, "week-reset", width, found);
      await layout.click();
      await dialog.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await measure(page, "layout-sheet", width, found);
      // One lifting day made a rest day (Lift, Run, Both, Rest), so the
      // review has a change to say and the plan stays valid.
      const liftDay = dialog.getByRole("button", { name: /: Lift\. / }).first();
      const dayName = ((await liftDay.getAttribute("aria-label")) ?? "").split(
        ":"
      )[0];
      const sameDay = dialog.getByRole("button", {
        name: new RegExp(`^${dayName}: `),
      });
      for (let i = 0; i < 3; i++) await sameDay.click({ timeout: 10_000 });
      await dialog
        .getByRole("button", { name: "Review change" })
        .click({ timeout: 10_000 });
      await dialog
        .getByRole("heading", { name: "Review usual week" })
        .waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await measure(page, "layout-review", width, found);
      await page.keyboard.press("Escape");

      // The reset as the weekly review opens it after "a bit much": the
      // dose comes first. The router reads the feel from history state.
      await page.goto("program/plan?reset=1");
      await layout.waitFor({ state: "visible", timeout: 60_000 });
      await page.evaluate(() => {
        const state = window.history.state as { idx?: number } | null;
        const next = {
          usr: { resetFeel: "a_bit_much" },
          key: "large-text",
          idx: (state?.idx ?? 0) + 1,
        };
        window.history.pushState(next, "", window.location.href);
        window.dispatchEvent(new PopStateEvent("popstate", { state: next }));
      });
      await page
        .getByText("You said last week felt like a bit much.")
        .waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await measure(page, "week-reset-heavy", width, found);
      const express = page.getByRole("button", {
        name: "Use this week's Express session",
      });
      if (await express.isVisible().catch(() => false)) {
        await express.click();
        await page
          .getByRole("dialog")
          .getByText("How do you want to train today?")
          .waitFor({ timeout: 20_000 });
        await page.waitForTimeout(800);
        await measure(page, "reset-express", width, found);
        await page.keyboard.press("Escape");
      } else {
        test.info().annotations.push({
          type: "skipped-surface",
          description: "reset-express: no lift left this week",
        });
      }

      await page.goto("history/sessions");
      const dates = page.locator('button[aria-haspopup="dialog"]').first();
      await ready(page, dates);
      await page
        .getByRole("region", { name: "Saved sessions" })
        .getByRole("link")
        .first()
        .waitFor({ timeout: 20_000 });
      await measure(page, "training-history", width, found);
      await dates.click();
      await dialog.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await measure(page, "history-dates", width, found);
      await page.keyboard.press("Escape");

      // A period with nothing in it offers the last session.
      await page.goto("history/sessions?from=2099-01-01&to=2099-01-31");
      const jump = page.getByRole("button", {
        name: "Jump to your last session",
      });
      await jump.waitFor({ timeout: 20_000 });
      await ready(page, jump);
      await measure(page, "history-empty", width, found);

      expect(found).toEqual([]);
    });

    test(`a race plan's week and its run move at ${width}px`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page, {
        email: "fellbehind-capture@tropos.test",
        password: "test-password-123",
      });
      const found: string[] = [];
      const dialog = page.getByRole("dialog").first();
      await page.goto("program/plan");
      await ready(page, page.getByRole("heading", { name: "Your plan" }));
      await measure(page, "race-plan", width, found);
      // A week whose runs have all passed (late on a Sunday) has none to
      // move; the plan page above still measured.
      const move = page.getByRole("button", { name: "Move a run" });
      if (await move.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await move.click();
        await dialog.waitFor({ timeout: 10_000 });
        await page.waitForTimeout(800);
        await measure(page, "move-run", width, found);
      } else {
        test.info().annotations.push({
          type: "skipped-surface",
          description: "move-run: no run left to move this week",
        });
      }

      expect(found).toEqual([]);
    });

    // seed:circles: a Circle of two whose code works for another day,
    // in the sheet its card opens.
    test(`a Circle's invite code at ${width}px`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 852 });
      const found: string[] = [];
      const dialog = page.getByRole("dialog");

      await signInAsTestUser(page, {
        email: "circles-capture@tropos.test",
        password: "test-password-123",
      });
      await page.goto("social?tab=crews");
      await page
        .getByRole("button", { name: /autumn strength crew/i })
        .click({ timeout: 20_000 });
      await dialog
        .getByText(/^Works until /)
        .waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(800);
      await measure(page, "circle-code-live", width, found);
      expect(found).toEqual([]);
    });

    // And a Circle of one whose code has expired: its invite sheet, then
    // its own sheet, each offering only a new code.
    test(`an expired Circle invite code at ${width}px`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 852 });
      const found: string[] = [];
      const dialog = page.getByRole("dialog");

      await signInAsTestUser(page, {
        email: "circles-expired-capture@tropos.test",
        password: "test-password-123",
      });
      await page.goto("social?tab=crews");
      await page
        .getByRole("button", { name: "Invite someone", exact: true })
        .click({ timeout: 20_000 });
      await dialog
        .getByRole("button", { name: "Make a new code", exact: true })
        .waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(800);
      await measure(page, "circle-invite-expired", width, found);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);

      await page
        .getByRole("button", { name: /lunchtime lifters/i })
        .click({ timeout: 20_000 });
      await dialog
        .getByRole("button", { name: "Make a new code", exact: true })
        .waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(800);
      await measure(page, "circle-detail-expired", width, found);

      expect(found).toEqual([]);
    });

    /* A workout left open, as the app keeps it: started, one set done and
       closed, which leaves its draft on the phone. First the day's own
       programme workout, which Home's and Train's day cards show in
       Start's place; then a saved routine's (seed:rich saves Maya's push
       day), newer, which they show on its own above the day. */
    test(`a workout in progress at ${width}px`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];

      // The warm-ups first, then the first working set, which is what the
      // strip counts.
      const leaveAfterOneSet = async () => {
        // A routine saved from someone's post carries no loads, and a
        // loaded lift can't be ticked at 0 kg: give its empty sets one.
        await page
          .getByRole("spinbutton", { name: /weight$/ })
          .first()
          .waitFor({ timeout: 20_000 });
        for (const field of await page
          .getByRole("spinbutton", { name: /weight$/ })
          .all())
          if ((await field.getAttribute("placeholder")) === "–")
            await field.fill("20");
        for (let i = 0; i < 4; i++) {
          const next = page.getByRole("button", { name: /^Complete / }).first();
          await next.waitFor({ timeout: 20_000 });
          const name = (await next.textContent())?.replace(/\s+/g, " ").trim();
          await next.click();
          await page.waitForTimeout(500);
          if (name === "Complete set 1") break;
        }
        await page
          .getByRole("button", { name: "Close workout", exact: true })
          .click();
        await page.waitForURL((url) => url.pathname.endsWith("/program"));
      };
      const strip = (name: RegExp) => page.getByRole("group", { name }).first();

      await page.goto("program");
      const start = page.getByRole("button", {
        name: "Start workout",
        exact: true,
      });
      await ready(page, start);
      await start.click();
      await leaveAfterOneSet();

      await page.goto("");
      await ready(page, strip(/ in progress$/));
      await measure(page, "home-in-progress-programme", width, found);
      await page.goto("program");
      await ready(page, strip(/ in progress$/));
      await measure(page, "train-in-progress-programme", width, found);

      await page.goto("routine/rich-routine-push");
      await leaveAfterOneSet();

      await page.goto("");
      await ready(page, strip(/^Push day in progress$/));
      await measure(page, "home-in-progress-routine", width, found);
      await page.goto("program");
      await ready(page, strip(/^Push day in progress$/));
      await measure(page, "train-in-progress-routine", width, found);

      expect(found).toEqual([]);
    });

    /* An empty workout's review (Mob2 calls 11 and 12): its Name and
       Started rows, and the sheet each opens. Push-ups, so the set needs
       no weight, and Finish after the first working set. */
    test(`an empty workout's review at ${width}px`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: 852 });
      await signInAsTestUser(page);
      const found: string[] = [];

      await page.goto("empty-workout");
      const add = page.getByRole("button", {
        name: "Add exercise",
        exact: true,
      });
      await ready(page, add);
      await add.click();
      await page
        .getByRole("textbox", { name: "Search exercises" })
        .fill("Push-Ups");
      await page
        .getByRole("checkbox", { name: "Push-Ups", exact: true })
        .first()
        .click();
      await page.getByRole("button", { name: /Add to workout$/ }).click();
      for (let i = 0; i < 4; i++) {
        const next = page.getByRole("button", { name: /^Complete / }).first();
        await next.waitFor({ timeout: 20_000 });
        const name = (await next.textContent())?.replace(/\s+/g, " ").trim();
        await next.click();
        await page.waitForTimeout(500);
        if (name === "Complete set 1") break;
      }
      await page
        .getByRole("button", { name: "Finish workout", exact: true })
        .first()
        .click();
      const started = page.getByRole("button", { name: /^Started: / });
      await started.waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      await measure(page, "workout-review", width, found);

      await started.click();
      await page
        .getByRole("dialog", { name: "When you started" })
        .waitFor({ timeout: 10_000 });
      await page.waitForTimeout(600);
      await measure(page, "start-time-sheet", width, found);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.waitForTimeout(600);

      await page.getByRole("button", { name: /^Name: / }).click();
      await page
        .getByRole("dialog", { name: "Name this workout" })
        .waitFor({ timeout: 10_000 });
      await page.waitForTimeout(600);
      await measure(page, "rename-sheet", width, found);

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
