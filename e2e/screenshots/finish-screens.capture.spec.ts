/**
 * The finish screens as DS4 rebuilt them (DESIGN_GUIDE §0 rule 12, §14m
 * rules 29-32): the full-screen reward and the calm summary, and the share
 * card.
 *
 * The lift's two registers come from the finish lab (`/dev/finish`), the
 * real SessionCompleteScreen with a pull day's fixtures: a reward needs a
 * best to beat, which a fresh account has not got. The run's come from
 * real saves on a fresh account: its first run (the reward for a first),
 * a shorter, slower one (the summary) and the same loop faster (a new
 * best: its fastest 1K and 5K).
 *
 * Reduced motion is requested so the figure is drawn at once and no
 * confetti is in the frame; one lift frame is taken with motion on, mid
 * confetti, for the record.
 */
import { writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser, TEST_USER } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";
import { settleMapTheme } from "../helpers/settleMapTheme";

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const DOCS = `http://${FIRESTORE}/v1/projects/demo-tropos/databases/(default)/documents`;

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

async function hideEmulatorBanner(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".firebase-emulator-warning{display:none !important}";
      document.head.appendChild(style);
    });
  });
}

async function theme(page: Page, dark: boolean) {
  await page.evaluate(
    (value) => document.documentElement.classList.toggle("dark", value),
    dark
  );
  await page.waitForTimeout(300);
}

/**
 * What §14m measures on the first screen, read from the page beside the
 * frame: the object's drawn width and top (an `object-fit: contain`
 * picture's own pixels, not its box; a band's box), and the text sizes,
 * largest first.
 */
async function measure(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const band = document.querySelector("[data-finish-band]");
    const img = document.querySelector(
      "[data-finish-object] img"
    ) as HTMLImageElement | null;
    let object: { width: number; top: number; height: number } | null = null;
    if (band) {
      const r = band.getBoundingClientRect();
      object = {
        width: r.width,
        top: r.top,
        height: Math.min(r.bottom, vh) - Math.max(r.top, 0),
      };
    } else if (img && img.naturalWidth) {
      const r = img.getBoundingClientRect();
      const scale = Math.min(
        r.width / img.naturalWidth,
        r.height / img.naturalHeight
      );
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      object = { width: w, top: r.top + (r.height - h) / 2, height: h };
    } else {
      const fig = document.querySelector(
        "[data-finish-object] [role=img], [data-finish-object] svg"
      );
      if (fig) {
        const r = fig.getBoundingClientRect();
        object = { width: r.width, top: r.top, height: r.height };
      }
    }
    const sizes = new Map<number, string>();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const el = node.parentElement;
      if (!text || !el) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh || r.width === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || Number(style.opacity) === 0)
        continue;
      const size = Math.round(parseFloat(style.fontSize));
      if (!sizes.has(size)) sizes.set(size, text.slice(0, 24));
    }
    const ordered = [...sizes.entries()].sort((a, b) => b[0] - a[0]);
    return {
      viewport: { width: vw, height: vh },
      object: object && {
        widthShare: +(object.width / vw).toFixed(3),
        top: Math.round(object.top),
        heightShare: +(object.height / vh).toFixed(3),
      },
      textSizes: ordered.map(([size, sample]) => ({ size, sample })),
      largestToNext:
        ordered.length > 1 ? +(ordered[0][0] / ordered[1][0]).toFixed(2) : null,
    };
  });
}

/** Focus off Done. The lab opens the screen saved, with no tap before
 *  it, so the focus the save hands Done draws the keyboard's ring; on a
 *  phone the save is a tap and draws none. */
async function unfocus(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
}

/** The first screen, as the person sees it on opening, and its numbers. */
async function shoot(page: Page, name: string) {
  await unfocus(page);
  await settleImages(page);
  await page.screenshot({
    path: `screenshots/${name}.png`,
    animations: "disabled",
  });
  writeFileSync(
    `screenshots/${name}.json`,
    JSON.stringify(await measure(page), null, 2)
  );
}

test("the lift's reward and summary, and the share card", async ({ page }) => {
  test.skip(!emulatorActive, "emulator capture only");
  test.setTimeout(150_000);
  await hideEmulatorBanner(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAsTestUser(page);

  for (const state of ["lift-best", "lift-routine"] as const) {
    await page.goto(`dev/finish?state=${state}`);
    await expect(
      page.getByRole("heading", { name: "Pull A done", exact: true })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    for (const width of [393, 320]) {
      await page.setViewportSize({ width, height: 852 });
      for (const dark of [false, true]) {
        if (width === 320 && !dark) continue;
        await theme(page, dark);
        await shoot(
          page,
          `finish-${state}-${width}-${dark ? "dark" : "light"}`
        );
      }
    }
    await page.setViewportSize({ width: 393, height: 852 });
  }

  // With motion: the reward's confetti, a moment after it opens.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("dev/finish?state=lift-best");
  await expect(
    page.getByRole("heading", { name: "Pull A done", exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await unfocus(page);
  await page.waitForTimeout(900);
  await page.screenshot({
    path: "screenshots/finish-lift-best-confetti-393.png",
    // CSS only: the confetti is a canvas, and stays in the frame.
    animations: "disabled",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.setViewportSize({ width: 540, height: 960 });
  for (const state of [
    "share-lift-best",
    "share-lift-routine",
    "share-run-best",
  ]) {
    await page.goto(`dev/finish?state=${state}`);
    const card = page.locator("[data-share-card]");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await settleImages(page);
    await card.screenshot({
      path: `screenshots/finish-${state}.png`,
      animations: "disabled",
    });
  }
});

test("the run's reward for a first, its summary, and its reward for a new best", async ({
  page,
  request,
}) => {
  test.skip(!emulatorActive, "isolated emulator account only");
  test.setTimeout(240_000);
  // A fresh account, its profile copied from the seeded one: its first
  // run is a first, and the bests are its own.
  const headers = { Authorization: "Bearer owner" };
  const accounts = await request.post(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-tropos/accounts:query`,
    { headers, data: {} }
  );
  const source = (await accounts.json()).userInfo.find(
    (user: { email: string }) => user.email === TEST_USER.email
  );
  const email = `finish-screens-${Date.now()}@tropos.test`;
  const password = "test-password-123";
  const signup = await request.post(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-dummy-key`,
    { data: { email, password, returnSecureToken: true } }
  );
  const { localId: uid } = await signup.json();
  const sourceDoc = await request.get(`${DOCS}/users/${source.localId}`, {
    headers,
  });
  const { fields } = await sourceDoc.json();
  fields.uid = { stringValue: uid };
  fields.runMode = { stringValue: "freeform" };
  // A free runner: Home's hero is the free run, captured after the runs.
  // What a person trains is read from the plan (App1 Q23), and free running
  // puts no day on it, so the running level says it, as setup writes it.
  fields.athleteType = { stringValue: "Runner" };
  fields.runFrequency = { stringValue: "regular" };
  fields.weekSchedule = {
    arrayValue: {
      values: Array.from({ length: 7 }, (_, day) => ({
        mapValue: {
          fields: {
            day: { integerValue: String(day) },
            type: { stringValue: "rest" },
          },
        },
      })),
    },
  };
  const copy = await request.patch(`${DOCS}/users/${uid}`, {
    headers,
    data: { fields },
  });
  expect(copy.ok()).toBe(true);

  await hideEmulatorBanner(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAsTestUser(page, { email, password });
  await page.goto("program");
  await page.addStyleTag({
    content: ".firebase-emulator-warning { pointer-events: none !important; }",
  });

  const runs = [
    // A 5 km loop at 6:00 /km: the account's first run.
    { name: "first", scale: 1, seconds: 1800, distance: 5000 },
    // 3 km at 6:30 /km: no first, no best.
    { name: "routine", scale: 0.6, seconds: 1170, distance: 3000 },
    // The 5 km loop at 4:50 /km: its fastest 1K and 5K.
    { name: "best", scale: 1, seconds: 1450, distance: 5000 },
  ];
  for (const [index, run] of runs.entries()) {
    await page.evaluate(
      ({ scale, seconds, distance, index }) => {
        const start = Date.now() - (3 - index) * 3 * 3600 * 1000;
        const points = Array.from({ length: 121 }, (_, i) => {
          const a = (i / 120) * 2 * Math.PI;
          const lat = 51.5074 + 0.0072 * scale * Math.sin(a);
          const lon = -0.1278 + 0.0115 * scale * Math.cos(a);
          return {
            lat,
            lon,
            rawLat: lat,
            rawLon: lon,
            altitude: 20 + 15 * Math.sin(a * 2),
            accuracy: 5,
            speed: distance / seconds,
            timestamp: start + (i * seconds * 1000) / 120,
          };
        });
        const km = Math.floor(distance / 1000);
        const pace = Math.round(seconds / (distance / 1000));
        const splits = Array.from({ length: km }, (_, i) => ({
          km: i + 1,
          time: pace,
          pace: `${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, "0")}`,
          paceSeconds: pace,
          elevationGain: 6,
          elevationLoss: 6,
        }));
        history.pushState(
          {
            usr: {
              points,
              distance,
              elapsed: seconds,
              splits,
              elevationGain: 30,
              finishedAt: start + seconds * 1000,
              runConfig: { activityType: "easy" },
            },
            key: `e2e-finish-${index}`,
            idx: (history.state?.idx ?? 0) + 1,
          },
          "",
          "/Maiin/run-summary"
        );
        window.dispatchEvent(
          new PopStateEvent("popstate", { state: history.state })
        );
      },
      { ...run, index }
    );
    const save = page.getByRole("button", { name: "Save run", exact: true });
    await expect(save).toBeVisible({ timeout: 20_000 });
    // The earlier runs the bests are measured against, read as it opens.
    await page.waitForTimeout(2500);
    await save.click();
    await expect(
      page.getByRole("button", { name: "Done", exact: true })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("status").filter({ hasText: "saved" })
    ).toBeVisible({
      timeout: 20_000,
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const width of [393, 320]) {
      await page.setViewportSize({ width, height: 852 });
      for (const dark of [false, true]) {
        if (width === 320 && !dark) continue;
        await theme(page, dark);
        await settleMapTheme(page);
        await shoot(
          page,
          `finish-run-${run.name}-${width}-${dark ? "dark" : "light"}`
        );
      }
    }
    await page.setViewportSize({ width: 393, height: 852 });
    await theme(page, false);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page).toHaveURL(/\/program/);
    // The summary gone, not only its address: the next run mounts afresh.
    await expect(page.locator("[data-finish-register]")).toHaveCount(0, {
      timeout: 20_000,
    });
  }

  // Home's free-run hero, the runner and its coral glow, with this week's
  // three runs on its line.
  await page.goto("");
  await expect(
    page.getByRole("heading", { name: "Free run", exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  for (const dark of [false, true]) {
    await theme(page, dark);
    await settleImages(page);
    await page.screenshot({
      path: `screenshots/home-free-run-393-${dark ? "dark" : "light"}.png`,
      animations: "disabled",
    });
  }
});
