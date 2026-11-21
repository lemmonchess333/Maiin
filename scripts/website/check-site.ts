/**
 * Opens every page of a Hosting build, and every address troposfit.com
 * keeps, in Chromium at a phone's width and a desktop's, served the way
 * Firebase Hosting serves it (`serveHosting.ts`). Fails on a page whose
 * headline is wrong, that has more than one headline or more than one
 * App Store badge, that is wider than the screen, or that logs an error.
 *
 *   npm run build:hosting
 *   node --import tsx scripts/website/check-site.ts [--capture <dir>]
 *
 * `--capture` also saves each page whole at each width, for the design
 * doc (docs/website/captures). PW_CHROMIUM names another browser.
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { HostingConfig } from "./hostingResolve.ts";
import { serveHosting } from "./serveHosting.ts";

const root = path.resolve(import.meta.dirname, "../..");
const WIDTHS = [393, 1440] as const;
const HEIGHT: Record<number, number> = { 393: 852, 1440: 900 };

interface Check {
  address: string;
  /** The capture's name, for a page that has one. */
  name?: string;
  h1: string | RegExp;
  /** Text the page shows as well. */
  shows?: RegExp;
  /** Where the browser ends up, when it is redirected. */
  lands?: string;
  /** Whether the page asks not to be listed. */
  noindex?: boolean;
  /** The answer's status, when it is not 200. */
  status?: number;
  /** Whether React draws the page, in place of the page Hosting wrote
   *  (`writtenFits`): the root loses `data-page` and, once React's page
   *  stands there, gains `data-drawn`. */
  drawn?: boolean;
}

const HOME_H1 = "Your training and food, planned together";

const CHECKS: readonly Check[] = [
  { address: "/", name: "home", h1: HOME_H1 },
  {
    address: "/lifting",
    name: "lifting",
    h1: "A lifting plan for the days you have",
  },
  {
    address: "/running",
    name: "running",
    h1: "Runs and race plans that fit your week",
  },
  { address: "/food", name: "food", h1: "Log food the way you’d say it" },
  { address: "/social", name: "social", h1: "Train alongside your people" },
  { address: "/pro", name: "pro", h1: "What Pro adds" },
  {
    address: "/about",
    name: "about",
    h1: "One plan for lifting, running and food",
  },
  { address: "/press", name: "press", h1: "Press kit" },
  { address: "/support", name: "support", h1: "Support" },
  { address: "/privacy", name: "privacy", h1: "Privacy Policy" },
  { address: "/terms", name: "terms", h1: "Terms of Service" },
  {
    address: "/no-such-page",
    name: "404",
    h1: "This page isn’t here",
    noindex: true,
    status: 404,
  },
  {
    address: "/?invite=K7P49M2H",
    name: "invite",
    h1: HOME_H1,
    shows: /invited you to Tropos/,
    drawn: true,
  },
  {
    address: "/space/brighton-marathon",
    h1: HOME_H1,
    shows: /open this Space/,
    drawn: true,
  },
  {
    address: "/upgrade?checkout=success",
    h1: "What Pro adds",
    shows: /If you just paid/,
    noindex: true,
    drawn: true,
  },
  { address: "/upgrade", h1: "What Pro adds" },
  { address: "/upgrade/", h1: "What Pro adds" },
  { address: "/index.html", h1: HOME_H1 },
  { address: "/pro/index.html", h1: "What Pro adds" },
  { address: "/history", h1: HOME_H1 },
  { address: "/space", h1: HOME_H1 },
  { address: "/settings/account", h1: HOME_H1, noindex: true },
  { address: "/?from=widget", h1: HOME_H1 },
  { address: "/program?day=0&from=widget", h1: HOME_H1 },
  { address: "/food?from=widget", h1: "Log food the way you’d say it" },
  {
    address: "/lifting/",
    h1: "A lifting plan for the days you have",
    lands: "/lifting",
  },
  // The post's card, never the home page's file that carries its preview:
  // here the post cannot be read, so it says so.
  {
    address: "/activity/run1",
    h1: /^(Couldn’t load this post|This post isn’t available|.+’s (run|lift))$/,
    drawn: true,
  },
];

/** The requests refused (`context.route` below): the invite's name and a
 *  post's figures. The page carries on without them. */
const EXPECTED_FAILURE = /cloudfunctions\.net|troposfit\.com|activity\/run1/;

async function checkOne(page: Page, origin: string, check: Check) {
  const errors: string[] = [];
  page.removeAllListeners("console");
  page.removeAllListeners("pageerror");
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const where = msg.location().url ?? "";
    if (EXPECTED_FAILURE.test(msg.text()) || EXPECTED_FAILURE.test(where))
      return;
    // The missing page's own 404, which the browser reports.
    if (check.status === 404 && where.endsWith(check.address)) return;
    errors.push(`console: ${msg.text()}`);
  });
  const response = await page.goto(`${origin}${check.address}`, {
    waitUntil: "networkidle",
  });
  const problems: string[] = [];
  if (!response || response.status() !== (check.status ?? 200))
    problems.push(`status ${response?.status()}`);
  if (check.lands && new URL(page.url()).pathname !== check.lands)
    problems.push(`landed on ${page.url()}`);
  if (check.drawn) {
    await page
      .locator("#root:not([data-page])[data-drawn] h1")
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => problems.push("React did not draw the page"));
  } else if (
    (await page.locator("#root[data-page]:not([data-drawn])").count()) !== 1
  ) {
    problems.push("the written page was replaced");
  }
  const h1 = page.locator("h1");
  await h1.first().waitFor({ timeout: 10_000 });
  if ((await h1.count()) !== 1) problems.push(`${await h1.count()} h1s`);
  const heading = (await h1.first().innerText()).replace(/\s+/g, " ").trim();
  if (
    typeof check.h1 === "string"
      ? heading !== check.h1
      : !check.h1.test(heading)
  )
    problems.push(`h1 "${heading}"`);
  if (check.shows) {
    try {
      await page.getByText(check.shows).first().waitFor({ timeout: 6_000 });
    } catch {
      problems.push(`no ${check.shows}`);
    }
  }
  const badges = await page
    .getByRole("link", { name: "Download on the App Store" })
    .count();
  if (badges > 1) problems.push(`${badges} App Store badges`);
  const noindex = await page
    .locator('meta[name="robots"][content="noindex"]')
    .count();
  if (Boolean(check.noindex) !== noindex > 0)
    problems.push(`noindex ${noindex}`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  if (overflow > 0) problems.push(`${overflow}px wider than the screen`);
  // Every picture arrives once it is near the screen: scroll through, as
  // a reader would, and wait for each (a lazy one fetches on approach).
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    // A row that scrolls sideways on a phone, to its end and back.
    for (const strip of document.querySelectorAll<HTMLElement>(".site-strip")) {
      strip.scrollIntoView({ block: "center", behavior: "instant" });
      strip.scrollLeft = strip.scrollWidth;
      await new Promise((r) => setTimeout(r, 120));
      strip.scrollLeft = 0;
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
  const unloaded = await page.evaluate(() =>
    Array.from(document.images)
      // Drawn, and not a fading photograph still waiting its turn.
      .filter(
        (img) =>
          img.getAttribute("src") &&
          !img.closest("[aria-hidden]") &&
          img.getClientRects().length > 0
      )
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute("src"))
  );
  if (unloaded.length) problems.push(`not loaded: ${unloaded.join(", ")}`);
  problems.push(...errors);
  return problems;
}

async function main() {
  const captureAt = process.argv.indexOf("--capture");
  const captureDir =
    captureAt > -1 ? path.resolve(process.argv[captureAt + 1]) : null;
  if (captureDir) await mkdir(captureDir, { recursive: true });
  const config = (
    JSON.parse(await readFile(path.join(root, "firebase.json"), "utf8")) as {
      hosting: HostingConfig;
    }
  ).hosting;
  const { server, origin } = await serveHosting({
    dir: path.join(root, "dist"),
    config,
  });
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM
      ? { executablePath: process.env.PW_CHROMIUM }
      : undefined
  );
  let failed = 0;
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: HEIGHT[width] },
      deviceScaleFactor: captureDir && width < 800 ? 2 : 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    // Nothing leaves the served build: the site loads nothing from
    // elsewhere, and a post's figures or an inviter's name, which would
    // come from production, are refused, so the run never depends on it.
    await context.route(
      (url) => url.origin !== origin,
      (route) => route.abort()
    );
    const page = await context.newPage();
    for (const check of CHECKS) {
      const problems = await checkOne(page, origin, check);
      const label = `${String(width).padStart(4)} ${check.address}`;
      if (problems.length) {
        failed++;
        console.log(`✗ ${label}: ${problems.join("; ")}`);
      } else console.log(`✓ ${label}`);
      if (captureDir && check.name) {
        // Each drawn picture decoded, so none is half-painted; one that is
        // not drawn (a phone's hidden screen) would wait for ever.
        await page.evaluate(() =>
          Promise.all(
            Array.from(document.images)
              .filter((img) => img.complete && img.getClientRects().length)
              .map((img) => img.decode().catch(() => null))
          )
        );
        await page.screenshot({
          path: path.join(captureDir, `${check.name}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await context.close();
  }
  await browser.close();
  server.close();
  if (failed) {
    console.log(`${failed} checks failed`);
    process.exit(1);
  }
}

await main();
