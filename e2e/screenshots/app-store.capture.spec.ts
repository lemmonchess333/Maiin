/**
 * App Store screenshots, iPhone 6.9-inch display class. A DRAFT set for
 * the owner to review, not the shipped listing.
 *
 * Each frame is exactly 1320 x 2868: a 440 x 956 CSS viewport at device
 * scale 3, portrait, the size App Store Connect takes for the 6.9-inch
 * class. Frames are named in listing order, `app-store-01-home.png` on,
 * and land in `screenshots/` with every other capture, so
 * app-screenshots.yml commits them to the `app-screenshots` branch.
 *
 * A frame is real use of the web build on the repo's demo seeds, settled:
 * no loading state, no guide, no toast.
 *
 *   - Each test signs in to a COPY of a seeded account, made for it: the
 *     profile, the collections the seeds write, and the account's follows,
 *     space memberships and challenge entries. A copy can be used the way
 *     a person would (water logged, sets ticked, a badge opened) without
 *     changing what the other capture specs see on the shared accounts,
 *     and the app builds its programme fresh, so the frame does not depend
 *     on which spec ran first.
 *   - The copy keeps the default dark theme. The seeds store light
 *     (`darkMode: false`) for their own light captures, and a profile's
 *     theme reaches more than the root class: RunDetail draws its basemap
 *     from `profile.darkMode`, so toggling `.dark` would leave a light map
 *     under a dark page.
 *   - The layout is an iPhone 16 Pro Max's: the app pads for
 *     `env(safe-area-inset-*)` (index.css `--safe-top` / `--safe-bottom`),
 *     and CDP's `Emulation.setSafeAreaInsetsOverride` gives those the
 *     phone's 62 px status bar and 34 px home indicator. The status bar
 *     itself is not drawn: that band is left as the app paints it.
 *   - Touch and a coarse pointer (`isMobile`, `hasTouch`), as on the
 *     phone. The project's desktop pointer would turn on index.css's
 *     desktop scrollbar.
 *   - Reduce Motion, so count-ups and entrances are at rest when the
 *     shutter fires.
 *
 * Which seeded account each frame copies, and why:
 *   - Home and Social: `e2e-test@tropos.test` (seed-e2e + seed-rich). It
 *     lifts every day but tomorrow, so Home always has a session to Start
 *     whatever day CI runs on, and it follows the seeded author whose
 *     posts fill the feed.
 *   - Train, the workout, Food, Analytics and the run: the season athlete
 *     (seed-season-athlete), sixteen weeks of lifting, running and food.
 *   - The race plan: `fellbehind-capture@tropos.test`, the one seed with a
 *     race goal. Its seeded programme carries a fell-behind prompt, and
 *     the copy leaves programmes behind, so the app builds the plan from
 *     the goal, as it does after setup.
 *
 * The run's map needs tiles.openfreemap.org, which CI reaches and the
 * agent sandbox does not: there the frame shows the map's own "Map tiles
 * unavailable" note over an empty map, after a capped wait.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { signInAsTestUser, TEST_USER } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleFullPageHeight } from "../helpers/settleHeight";
import { settleImages } from "../helpers/settleImages";

const FRAME = { width: 440, height: 956, scale: 3 } as const;
/** iPhone 16 Pro Max, portrait, in CSS px: the status bar above, the home
 *  indicator below. */
const SAFE_AREA = {
  top: 62,
  topMax: 62,
  bottom: 34,
  bottomMax: 34,
  left: 0,
  leftMax: 0,
  right: 0,
  rightMax: 0,
} as const;
/** How far down the status bar's scrim is solid: `.ds-safe-top-occluder`
 *  (components.css) is the page colour for 58% of the inset, then fades
 *  out. Content scrolled above this line is hidden; below it, it shows
 *  through. */
const SCRIM_SOLID = Math.floor(SAFE_AREA.top * 0.58);

test.use({
  viewport: { width: FRAME.width, height: FRAME.height },
  deviceScaleFactor: FRAME.scale,
  isMobile: true,
  hasTouch: true,
  locale: "en-GB",
  colorScheme: "dark",
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

// The seed scripts export these, but importing one runs it.
const SEASON_ATHLETE = "season-athlete@tropos.test";
const RACE_GOAL_ACCOUNT = "fellbehind-capture@tropos.test";

let adminApp: App | undefined;
function admin(): App {
  adminApp ??= initializeApp({ projectId: "demo-tropos" }, "app-store");
  return adminApp;
}

/** What the seeds write under `users/{uid}`. Copied by name, so whatever
 *  the app or another spec has since added to the shared account (its
 *  programme, streaks, water, the fell-behind prompt) stays behind. */
const SEEDED_COLLECTIONS = [
  "public",
  "workouts",
  "runs",
  "meals",
  "performance",
  "bodyweightLogs",
  "dailyNutrition",
] as const;

interface Account {
  email: string;
  password: string;
  uid: string;
}

async function copySeededAccount(
  sourceEmail: string,
  tag: string
): Promise<Account> {
  const auth = getAuth(admin());
  const db = getFirestore(admin());
  const source = await auth.getUserByEmail(sourceEmail);
  const email = `app-store-${tag}-${Date.now()}@tropos.test`;
  const { uid } = await auth.createUser({
    email,
    password: TEST_USER.password,
    displayName: source.displayName,
    emailVerified: true,
  });
  const from = db.collection("users").doc(source.uid);
  const to = db.collection("users").doc(uid);
  const profile = (await from.get()).data();
  expect(profile, `${sourceEmail} has no profile: is it seeded?`).toBeTruthy();
  await to.set({ ...profile, uid, email, darkMode: true });

  const writer = db.bulkWriter();
  const copies: Promise<unknown>[] = [];
  for (const name of SEEDED_COLLECTIONS) {
    const docs = (await from.collection(name).get()).docs;
    for (const doc of docs)
      copies.push(
        writer.set(
          to.collection(name).doc(doc.id),
          name === "public" ? { ...doc.data(), uid } : doc.data()
        )
      );
  }
  const follows = await db
    .collection("following")
    .doc(source.uid)
    .collection("users")
    .get();
  for (const follow of follows.docs)
    copies.push(
      writer.set(
        db.collection("following").doc(uid).collection("users").doc(follow.id),
        follow.data()
      ),
      writer.set(
        db.collection("followers").doc(follow.id).collection("users").doc(uid),
        follow.data()
      )
    );
  // Space memberships and challenge entries carry the member's uid.
  for (const group of ["members", "participants"]) {
    const rows = await db
      .collectionGroup(group)
      .where("uid", "==", source.uid)
      .get();
    for (const row of rows.docs)
      copies.push(writer.set(row.ref.parent.doc(uid), { ...row.data(), uid }));
  }
  await writer.close();
  await Promise.all(copies);
  return { email, password: TEST_USER.password, uid };
}

async function openAs(page: Page, account: Account) {
  const cdp = await page.context().newCDPSession(page);
  await cdp
    .send("Emulation.setSafeAreaInsetsOverride", { insets: SAFE_AREA })
    .catch((err: Error) =>
      console.log(
        `[capture] no safe-area override in this Chromium (${err.message}); frames are laid out without the iPhone insets`
      )
    );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".firebase-emulator-warning{display:none !important}";
      document.head.appendChild(style);
    });
  });
  await signInAsTestUser(page, account);
}

/** Cards that arrive with a second read (a coaching note, a badge) move
 *  everything under them, so wait for the page to stop growing. */
async function settled(page: Page) {
  await settleFullPageHeight(page, { timeoutMs: 10_000, stableForMs: 1_500 });
}

/** Scroll until `above` has gone under the status bar's solid scrim, so
 *  what follows it starts the frame. Instant: index.css scrolls smoothly,
 *  and a shot taken mid-glide is a different frame each run. */
async function scrollPast(page: Page, above: Locator) {
  const box = await above.boundingBox();
  expect(box, "nothing to scroll past").not.toBeNull();
  await page.evaluate(
    (by) => window.scrollBy({ top: by, behavior: "instant" }),
    box!.y + box!.height - SCRIM_SOLID
  );
}

function pageHeader(page: Page) {
  return page
    .locator("header")
    .filter({ has: page.getByRole("heading", { level: 1 }) })
    .first();
}

async function shoot(page: Page, name: string) {
  // Nothing transient over the frame.
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  const safeTop = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--safe-top")
      .trim()
  );
  if (safeTop !== `${SAFE_AREA.top}px`)
    console.log(`[capture] ${name}: --safe-top is "${safeTop}"`);
  await settleImages(page);
  const png = await page.screenshot({
    path: `screenshots/app-store-${name}.png`,
    animations: "disabled",
  });
  // The PNG's IHDR chunk: width at byte 16, height at byte 20.
  expect(png.readUInt32BE(16), "frame width").toBe(FRAME.width * FRAME.scale);
  expect(png.readUInt32BE(20), "frame height").toBe(FRAME.height * FRAME.scale);
}

/** A badge earned on the copy's first visit waits on Home as a row. Open
 *  each, as a person would, so the row is not in the frame. Awards land
 *  one after another once the streak data loads, so this waits a moment
 *  for the next before deciding there is none. */
async function openWaitingBadges(page: Page) {
  const row = page.getByRole("button", { name: /^New badge/ });
  for (let i = 0; i < 12; i++) {
    const waiting = await row
      .waitFor({ state: "visible", timeout: 2_500 })
      .then(() => true)
      .catch(() => false);
    if (!waiting) return;
    await row.click();
    const dialog = page.getByRole("dialog");
    const nice = dialog.getByRole("button", { name: "Nice", exact: true });
    for (let tap = 0; tap < 8 && !(await nice.isVisible()); tap++)
      await dialog
        .getByRole("button", { name: /^Break the seal/ })
        .click({ timeout: 2_000 })
        .catch(() => {});
    await nice.click();
    await expect(dialog).toHaveCount(0);
  }
}

/** RunDetail's map draws the route, and its start and finish markers, once
 *  the basemap has loaded. Wait for the route, then for MapLibre's credit
 *  to fold, which basemap.ts does CREDIT_OPEN_MS after the map loads: the
 *  map at rest, with that long for the fitted view's tiles. Where the
 *  basemap cannot be fetched the map says "Map tiles unavailable" and the
 *  route never draws. Every wait here is capped and none fails the test:
 *  a frame without tiles is still a frame. */
async function waitForRunMap(page: Page) {
  const route = page.locator(".maplibregl-marker");
  const unavailable = page.getByText(/^Map tiles unavailable/);
  await route
    .or(unavailable)
    .first()
    .waitFor({ state: "visible", timeout: 25_000 })
    .catch(() => {});
  // A tile error can put the note up before the map loads, so the route
  // gets a little longer before the basemap is given up on.
  const drawn = await route
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!drawn) {
    console.log("[capture] 08-run: the basemap did not load; no map tiles");
    return;
  }
  await page
    .locator(".maplibregl-ctrl-attrib.maplibregl-compact")
    .and(page.locator(":not(.maplibregl-compact-show)"))
    .waitFor({ state: "attached", timeout: 8_000 })
    .catch(() =>
      console.log("[capture] 08-run: the map's credit did not fold in time")
    );
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test.describe("App Store screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );
  // A copy, a sign-in and a settled page: more than the default 30 s.
  test.describe.configure({ timeout: 120_000 });

  test.afterAll(async () => {
    if (adminApp) await deleteApp(adminApp);
    adminApp = undefined;
  });

  test("01 home: today's session and food", async ({ page }) => {
    const account = await copySeededAccount(TEST_USER.email, "home");
    await openAs(page, account);

    await expect(
      page.getByRole("button", { name: "Start workout", exact: true })
    ).toBeVisible({ timeout: 20_000 });
    const food = page.getByRole("region", { name: "Today's food" });
    await expect(food).toContainText(/kcal (left|over)/, { timeout: 20_000 });
    await expect(food.getByText("Protein")).toBeVisible();

    // The day's water, logged the way it is: the tile's plus, a glass a tap.
    const addGlass = page.getByRole("button", { name: /^Add \d+ ml$/ });
    for (let glass = 0; glass < 4; glass++) await addGlass.click();
    await expect(page.getByText(/^Tap \+ for/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: /Add water — choose a container size/ })
    ).toHaveAccessibleName(/^Water 1 litres? logged/);

    // Last, so a badge the water earned is opened with the rest.
    await openWaitingBadges(page);
    await settled(page);
    await expect(page.getByRole("button", { name: /^New badge/ })).toHaveCount(
      0
    );
    // The top of the page, whatever the taps above scrolled into view.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await shoot(page, "01-home");
  });

  test("02 train: the week and a lift day", async ({ page }) => {
    const account = await copySeededAccount(SEASON_ATHLETE, "train");
    await openAs(page, account);
    await page.goto("program");

    await expect(
      page
        .getByRole("tablist", { name: "Lift sessions" })
        .getByRole("tab")
        .first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: "Start workout", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^More options for / }).nth(2)
    ).toBeAttached({ timeout: 15_000 });
    await settled(page);

    // The week, the day and its exercises, with the title and the
    // Lift / Run switch scrolled under the status bar.
    await scrollPast(page, pageHeader(page));
    await shoot(page, "02-train");
  });

  test("03 workout: a lift in progress", async ({ page }) => {
    const account = await copySeededAccount(SEASON_ATHLETE, "workout");
    await openAs(page, account);
    await page.goto("program");
    const start = page.getByRole("button", {
      name: "Start workout",
      exact: true,
    });
    await expect(start).toBeVisible({ timeout: 20_000 });
    // The sets below take seconds here and a quarter of an hour in a gym.
    // Hold the page's clock as the session starts, and move it on by that
    // quarter before the shot, so the session's running time reads as one
    // would. Only Date is held; timers run as normal.
    const startedAt = Date.now();
    await page.clock.setFixedTime(startedAt);
    await start.click();

    const complete = page.getByRole("button", {
      name: "Mark set complete",
      exact: true,
    });
    await expect(complete.first()).toBeVisible({ timeout: 15_000 });
    // The first lift's progression offer ("All sets hit 6 reps at 82.5 kg
    // last time — try 85 kg"), taken. It is built from the seeded history
    // once that has loaded.
    await page
      .getByRole("button", { name: "Apply", exact: true })
      .click({ timeout: 8_000 })
      .catch(() =>
        console.log("[capture] 03-workout: no progression offer to take")
      );

    // The warm-ups and two working sets, each rest ended as it starts.
    const endRest = page.getByRole("button", { name: "End rest", exact: true });
    const done = page.getByRole("button", { name: /^Edit completed / });
    const warmups = await page
      .getByRole("button", { name: /^Warm-up \d+\. Change set type$/ })
      .count();
    for (let set = 1; set <= warmups + 2; set++) {
      await complete.first().click();
      await expect(done).toHaveCount(set);
      if (await endRest.isVisible()) await endRest.click();
    }
    await expect(page.getByText(/^Set \d+ of \d+ · 2 done$/)).toBeVisible();
    // A set that beats last time's best is announced on the spot for a few
    // seconds; the frame is the screen once that has gone.
    await expect(page.getByTestId("new-best-moment")).toHaveCount(0, {
      timeout: 15_000,
    });
    await page.clock.setFixedTime(startedAt + (14 * 60 + 20) * 1000);
    await expect(page.getByText(/ · 14:2\d$/)).toBeVisible();
    await shoot(page, "03-workout");
  });

  test("04 food: the ring, macros and the day's diary", async ({ page }) => {
    const account = await copySeededAccount(SEASON_ATHLETE, "food");
    await openAs(page, account);
    await page.goto("food");

    // The diary once the day's meals have been read: its log or, when a
    // run straddles midnight after seeding, its empty state.
    await expect(
      page
        .getByText(/^Food log\s+·\s+\d+ items?$/)
        .or(page.getByText("Nothing logged yet"))
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /calories logged/ }).first()
    ).toBeVisible();
    // The free account's Pro line under the composer, closed as anyone
    // can close it, for room for the diary.
    await page
      .getByRole("note")
      .getByRole("button", { name: "Dismiss" })
      .click({ timeout: 3_000 })
      .catch(() => {});
    await settled(page);

    // The week's rings, the day's ring and macros, and the diary, with
    // the title scrolled under the status bar.
    await scrollPast(page, pageHeader(page));
    await shoot(page, "04-food");
  });

  test("05 analytics: the overview", async ({ page }) => {
    const account = await copySeededAccount(SEASON_ATHLETE, "analytics");
    await openAs(page, account);
    await page.goto("history");

    await expect(
      page.getByRole("heading", { name: "Performance", exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Last 30 days" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Muscles trained" })
        .getByRole("listitem")
        .first()
    ).toBeVisible({ timeout: 30_000 });
    // No skeleton left anywhere, the Performance card's included.
    await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0, {
      timeout: 30_000,
    });
    await settled(page);
    await shoot(page, "05-analytics");
  });

  test("06 race plan: the race cockpit", async ({ page }) => {
    const account = await copySeededAccount(RACE_GOAL_ACCOUNT, "race");
    await openAs(page, account);
    await page.goto("program?tab=run");

    const plan = page.getByRole("region", { name: "Race plan" });
    await expect(plan).toBeVisible({ timeout: 20_000 });
    await expect(plan).toContainText(/\d+ days? out/);
    // The phase rail, the last of each word in the card.
    for (const phase of ["Base", "Build", "Taper", "Race"])
      await expect(plan.getByText(phase, { exact: true }).last()).toBeVisible();
    await settled(page);
    await shoot(page, "06-race-plan");
  });

  test("07 social: the feed", async ({ page }) => {
    const account = await copySeededAccount(TEST_USER.email, "social");
    await openAs(page, account);
    await page.goto("social?tab=feed&feed=explore");

    await expect(page.getByText("Morning run")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Push day")).toBeVisible();
    await settled(page);
    await shoot(page, "07-social");
  });

  test("08 run: a saved run and its map", async ({ page }) => {
    const account = await copySeededAccount(SEASON_ATHLETE, "run");
    // The season's longest run of the last fortnight: an 18 km long run,
    // whichever day this runs on.
    const since = new Date();
    since.setDate(since.getDate() - 13);
    const runs = await getFirestore(admin())
      .collection("users")
      .doc(account.uid)
      .collection("runs")
      .where("date", ">=", dateKey(since))
      .get();
    const longest = runs.docs
      .map((doc) => ({ id: doc.id, metres: doc.get("distance") as number }))
      .sort((a, b) => b.metres - a.metres)[0];
    expect(longest, "the season seed has no recent runs").toBeTruthy();

    await openAs(page, account);
    await page.goto(`run/${longest.id}`);
    await expect(
      page.getByRole("heading", {
        name: `${(longest.metres / 1000).toFixed(2)} km`,
      })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("table", { name: "Splits" }).getByRole("row").nth(5)
    ).toBeAttached();
    await waitForRunMap(page);
    await settled(page);
    await shoot(page, "08-run");
  });
});
