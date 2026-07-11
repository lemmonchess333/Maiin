/**
 * App screenshot capture (design-review channel).
 *
 * Tropos's runtime browser is blocked in the agent sandbox (Playwright's CDN
 * is not on the egress allowlist), so this runs in CI — where chromium IS
 * allowed — and the workflow commits the PNGs to a branch the agent can
 * `git fetch` + view. The point is to actually SEE the app to design against
 * it, not to assert anything (no expectations beyond "Home rendered").
 *
 * Mobile viewport (Tropos is mobile-first); fullPage so the whole scroll is
 * captured. Light + dark (dark = the `.dark` class on <html>).
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

// iPhone-15-ish portrait. Overrides the auth-emulator project's desktop
// viewport while keeping its bypassCSP (needed for the emulator).
test.use({
  viewport: { width: 393, height: 852 },
  // TEMP-LOCAL-DEBUG: sandbox chromium override — do not commit.
  launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
});

test.describe("app screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    // TEMP-LOCAL-DEBUG: pipe interesting page console lines — do not commit.
    page.on("console", (msg) => {
      const text = msg.text();
      if (/trainingBlock|nutritionConsistency|permission|denied/i.test(text)) {
        console.log(`[page:${msg.type()}] ${text.slice(0, 300)}`);
      }
    });
    // Pre-dismiss first-use coachmarks (useCoachMarks localStorage flags) so
    // floating tooltips don't occlude the surfaces under review — the Social
    // invite coachmark was covering the card copy in every People-tab capture.
    // Keys mirror src/hooks/useCoachMarks.ts (`tropos-coach-marks-dismissed`)
    // + the Coachmark storageKeys currently in the app.
    await page.addInitScript(() => {
      const BASE = "tropos-coach-marks-dismissed";
      for (const k of [
        BASE,
        `${BASE}:social-find-invite`,
        `${BASE}:extras-pill-v1`,
      ]) {
        try {
          window.localStorage.setItem(k, "1");
        } catch {
          /* storage unavailable — capture just shows the coachmark */
        }
      }
      // The emulator SDK injects a fixed "Running in emulator mode" banner
      // that overlays the bottom nav — it intercepted pointer events in past
      // runs and is pure noise in design-review PNGs. Hide it on every
      // document (init scripts re-run per navigation).
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none !important}";
        document.head.appendChild(style);
      });
    });
    await signInAsTestUser(page);
  });

  async function shoot(page: Page, name: string) {
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }

  /** The rich-seeded user legitimately EARNS a badge on first open, so the
   * BadgeEarnedModal seal fires over Home and occludes the capture. Its
   * backdrop tap counts as a seal tap pre-reveal and dismisses post-reveal
   * (BadgeEarnedModal.tsx), so a bounded backdrop-click loop walks the whole
   * seal → reveal → dismiss lifecycle. Bounded so a modal redesign can't
   * hang the capture run. */
  async function dismissBadgeSeal(page: Page) {
    for (let i = 0; i < 10; i++) {
      const dialog = page.getByRole("dialog");
      const open = await dialog.isVisible().catch(() => false);
      if (!open) return;
      await page.mouse.click(8, 8);
      await page.waitForTimeout(400);
    }
  }

  test("home — light + dark", async ({ page }) => {
    await page.goto("");
    // Home is ready once its signature control is interactive.
    await page
      .getByRole("button", { name: /add water/i })
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
    // let count-ups / entry animations settle
    await page.waitForTimeout(1200);
    // Badge-earned seal fires over Home for the seeded user — tap it away
    // so the capture shows the page, not the modal.
    await dismissBadgeSeal(page);
    await page.waitForTimeout(400);

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await shoot(page, "home-light");

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(400);
    await shoot(page, "home-dark");
  });

  // Main tabs under the DS2 foundation + rich-seeded data — the design
  // uplift is global (token-driven), so every primary surface must be
  // reviewed, not just Home. Captures light + dark for each.
  test("main tabs — light + dark", async ({ page }) => {
    // Capture job, not a perf gate: five tabs × (nav + hydration waits + two
    // full-page shots) legitimately exceeds the default 30s budget — the
    // 2026-07-04 runs timed out here on slow CI hydration ("browser has been
    // closed" was the teardown artifact, not a crash).
    test.setTimeout(180_000);
    const tabs: [route: string, name: string][] = [
      ["food", "food"],
      ["history", "history"],
      ["program", "program"],
      ["social", "social"],
      ["settings", "settings"],
    ];
    for (const [route, name] of tabs) {
      await page.goto(route);
      // The Layout's bottom nav is present on every main-tab route — use it
      // as the readiness proxy (Firebase listeners never go networkidle).
      await page
        .getByRole("navigation", { name: /main navigation/i })
        .waitFor({ state: "visible", timeout: 20000 });
      // Social's solo-first stack is gated behind an async followingCount
      // read; give it room to resolve (and let the discover query settle)
      // before capturing so we don't shoot a perpetual-skeleton frame.
      if (name === "social") {
        await page
          .getByText(/Crews unlock|Share your training/i)
          .first()
          .waitFor({ state: "visible", timeout: 12000 })
          .catch(() => {
            /* still gated/loading after the wait — capture whatever's there */
          });
      }
      // History/Analytics hydrates workouts/runs/meals subscriptions + a
      // lazy heat-map chunk after the nav appears; the fixed 1400ms settle
      // shot a full-page skeleton (2026-07-04 run). Wait for the lifting
      // heat-map heading (rich-seeded data guarantees it) before shooting.
      // 15s still lost the race on a slow runner (the 3a87dd8 run shot
      // skeletons again) — 40s of the test's 180s budget buys certainty,
      // and a log line makes the silent-miss visible in the CI output.
      if (name === "history") {
        await page
          .getByText(/Muscle Groups Trained/i)
          .first()
          .waitFor({ state: "visible", timeout: 40000 })
          .catch(() =>
            console.log(
              "[capture] history never hydrated within 40s — shooting the skeleton"
            )
          );
      }
      await page.waitForTimeout(1400); // entry animations / count-ups settle

      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
      await shoot(page, `${name}-light`);
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.waitForTimeout(400);
      await shoot(page, `${name}-dark`);
      // reset to light before the next route so each starts clean
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
    }
  });

  // Deeper, less-travelled sub-surfaces that the tab capture can't reach —
  // driven deterministically off the seeded fixtures (no brittle interaction
  // scripting). Each block is independent so one failing nav doesn't sink the
  // rest.
  test("deeper sub-surfaces — light + dark", async ({ page }) => {
    async function shootLightDark(name: string) {
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
      await shoot(page, `${name}-light`);
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.waitForTimeout(350);
      await shoot(page, `${name}-dark`);
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
    }

    // Run Detail — historical run view. rich-r0 is seeded by seed-rich, read
    // from users/{uid}/runs/{runId}; run pages render full-screen (no nav), so
    // wait on a fixed settle rather than the nav proxy.
    await page.goto("run/rich-r0");
    await page.waitForTimeout(2500);
    await shootLightDark("run-detail");

    // User Profile (own) — reached via Settings → View Profile so the spec
    // never has to know the uid.
    await page.goto("settings");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await page
      .getByRole("button", { name: /view profile/i })
      .click({ timeout: 4000 })
      .catch(() => {
        /* button moved/absent — capture lands on settings, still useful */
      });
    await page.waitForTimeout(2000);
    await shootLightDark("user-profile");
  });

  // Visual-improvement-audit surfaces (Prompt 8): the badge family on its
  // real dark/light card surface, and the exercise guide (ExerciseFormContent
  // muscle diagram + instructions) — both reachable deterministically.
  test("audit surfaces — badges + exercise form", async ({ page }) => {
    // Two navigations + four fullPage shots (the badges grid is very tall)
    // overrun the default 30s — the first run lost the exercise-form shots
    // to exactly that.
    test.setTimeout(90_000);
    async function shootLightDark(name: string) {
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
      await shoot(page, `${name}-light`);
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.waitForTimeout(350);
      await shoot(page, `${name}-dark`);
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
    }

    // Badge grid — History's Badges tab. The stashed-tab hook (History.tsx
    // reads sessionStorage("history-tab") on mount) gives a deterministic
    // route without scripting the tab UI.
    await page.addInitScript(() => {
      try {
        window.sessionStorage.setItem("history-tab", "badges");
      } catch {
        /* fine — capture lands on Analytics instead */
      }
    });
    await page.goto("history");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1600);
    await shootLightDark("badges-grid");

    // Exercise guide — ExerciseHistory's Form tab (ExerciseFormContent:
    // muscle diagram hero + pills + instructions + watch-out callout).
    // The Progress/Form switch is a SegmentedControl → role="radio", NOT
    // "button" (the first run's button locator never matched, and the
    // swallowed click burned its full 30s action timeout per retry —
    // that's what blew the 90s test budget). Short explicit timeout so
    // any future miss costs 4s, not 30s.
    await page.goto("history/exercise/Bench%20Press");
    await page.waitForTimeout(1800);
    await page
      .getByRole("radio", { name: /^form$/i })
      .click({ timeout: 4000 })
      .catch(() => {
        /* tab moved — capture lands on Progress, still useful */
      });
    await page.waitForTimeout(1400);
    await shootLightDark("exercise-form");
  });

  // Editing sheets (vaul drawers) — interaction-gated, so each trigger is
  // best-effort (try/catch) and independent: a brittle open doesn't sink the
  // other capture. Goal is to SEE/verify the sheets, not assert.
  test("editing sheets", async ({ page }) => {
    // Same capture-budget reasoning as "main tabs": two navigations + a 20s
    // hydration waitFor + html-to-image rendering ride the default 30s.
    test.setTimeout(120_000);
    // ShareCardSheet — opened from Run Detail's "Share" button.
    await page.goto("run/rich-r0");
    await page.waitForTimeout(2200);
    await page
      .getByRole("button", { name: /share/i })
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
    await page.waitForTimeout(1400); // share-card preview renders (html-to-image)
    await shoot(page, "sheet-share-light");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(350);
    await shoot(page, "sheet-share-dark");
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );

    // DayActionSheet — Home → tap today's day node → "Manage day".
    await page.goto("");
    await page
      .getByRole("button", { name: /add water/i })
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(800);
    await dismissBadgeSeal(page);
    await page
      .getByRole("button", { name: /today/i })
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
    await page.waitForTimeout(700);
    // "Manage day" only renders when today has a MATCHED lift/run session
    // (DayPeekCard PR-1 gating) — on weekends the seeded user has none, so
    // this locator legitimately misses. A timeout-less click here retried
    // until the test budget and failed the whole run every Sat/Sun (the
    // 2026-07-04 failures: green Fri, red Sat, no code change involved).
    // Short timeout + honest log: the shot degrades to the day peek.
    await page
      .getByRole("button", { name: /manage day/i })
      .click({ timeout: 4000 })
      .catch(() =>
        console.log(
          "[capture] Manage day not available (no matched session today) — capturing the day peek instead"
        )
      );
    await page.waitForTimeout(1100);
    await shoot(page, "sheet-dayaction-light");
  });

  // GsPb1-slate surfaces (Circles / Training Blocks / logging focus) —
  // the parallel-session merges plus the design-consistency pass over
  // them. Same rules as the other interaction-gated captures: every
  // trigger is best-effort with a SHORT timeout (a missed locator costs
  // seconds, not its 30s default), and SegmentedControl options are
  // role="radio", not buttons.
  test("new surfaces — circles, block sheet, food focus", async ({ page }) => {
    test.setTimeout(180_000);
    async function shootLightDark(name: string) {
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
      await shoot(page, `${name}-light`);
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.waitForTimeout(350);
      await shoot(page, `${name}-dark`);
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
    }

    // Circles — Social's Crews sub-tab leads with the Goal Space section;
    // the seeded user has no circles, so this captures the EmptyState
    // hexagon cold-start (the state every launch user sees).
    await page.goto("social?tab=crews");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1600);
    await shootLightDark("circles-crews");

    // Training Block create sheet — Program lift tab entry row opens the
    // preset cards + the block-length SegmentedControl.
    await page.goto("program");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    // Same explicit wait: the block row renders only after the
    // trainingBlocks read settles.
    const blockRowStart = Date.now();
    await page
      .getByRole("button", { name: /start a training block/i })
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() =>
        console.log(
          `[capture] training-block row visible after ${Date.now() - blockRowStart}ms`
        )
      )
      .catch(() =>
        console.log(
          "[capture] training-block row NEVER appeared within 15s (active block or no programme?) — capturing the tab as-is"
        )
      );
    await page
      .getByRole("button", { name: /start a training block/i })
      .click({ timeout: 2000 })
      .catch(() => {});
    await page.waitForTimeout(900);
    await shootLightDark("sheet-trainingblock");
    // Close the sheet so the next navigation starts clean.
    await page.keyboard.press("Escape").catch(() => {});

    // Weekly logging focus — Food's consistency card expands its picker
    // in place (SegmentedControl + Set focus). The card renders nothing
    // until its commitment+meals reads settle, so WAIT for it rather
    // than settling blind — under a loaded capture run those one-shot
    // reads can trail the page by several seconds.
    await page.goto("food");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    const foodRowStart = Date.now();
    await page
      .getByRole("button", { name: /set a weekly logging focus/i })
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() =>
        console.log(
          `[capture] logging-focus row visible after ${Date.now() - foodRowStart}ms`
        )
      )
      .catch(() =>
        console.log(
          "[capture] logging-focus row NEVER appeared within 15s — capturing the card-less state"
        )
      );
    await page
      .getByRole("button", { name: /set a weekly logging focus/i })
      .click({ timeout: 2000 })
      .catch(() => {});
    await page.waitForTimeout(700);
    await shootLightDark("food-focus-picker");
  });
});
