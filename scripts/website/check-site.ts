/**
 * Opens troposfit.com as Firebase Hosting would serve it, in Chromium, at
 * a phone's width (393 px) and a computer's (1440 px), and fails on what
 * the unit tests cannot see: a page that does not answer as its address
 * says it should, a console error (a failed hydration among them), a page
 * wider than the screen, or a picture that did not load.
 *
 *   npm run build:hosting && npm run check:site
 *
 * It serves `dist/` with `serveHosting.ts` (firebase.json's slashes,
 * rewrites and headers, and the real `publicPostPage` over one demo post)
 * and refuses every request that leaves it, so nothing is fetched from
 * production. What each address should show comes from the routes' own
 * table (`websiteRoute`), so a page added to `SITE_PAGES` or an address
 * of the app's is checked without a change here. CI's `website` job runs
 * it (ci.yml).
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import {
  APP_ADDRESS_PREFIXES,
  NOT_FOUND_TITLE,
  SITE_PAGES,
  normalisePath,
  sitePage,
  websiteRoute,
  withoutIndexFile,
} from "../../src/website/sitePages";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.CHECK_SITE_PORT ?? 5057);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const HOME_TITLE = sitePage("home").title;
/** A shared post's page names the post, not the website (WebsiteRoutes). */
const POST_TITLE = "Tropos";

/** Every page, each with its slash, a page by its file's name, every
 *  address of the app's, the addresses a link hands out, a shared post
 *  and one nobody hands out. */
function addresses(): string[] {
  const out = new Set<string>();
  for (const page of SITE_PAGES) {
    out.add(page.path);
    if (page.path !== "/") out.add(`${page.path}/`);
  }
  out.add("/index.html");
  out.add("/lifting/index.html");
  for (const prefix of APP_ADDRESS_PREFIXES) {
    out.add(prefix);
    out.add(`${prefix}/x`);
  }
  out.add("/?invite=K7P49M2H");
  out.add("/upgrade?checkout=success");
  out.add("/space/brighton-marathon/post/p1");
  out.add("/activity/demo-run");
  out.add("/activity/no-such-post");
  out.add("/blog");
  out.add("/no-such-page/deeper");
  return [...out];
}

interface Expected {
  status: number;
  path: string;
  title: string | null;
}

/** What an address should answer with, from the routes' own table. */
function expected(address: string): Expected {
  const { pathname } = new URL(address, ORIGIN);
  const path = withoutIndexFile(normalisePath(pathname));
  const route = websiteRoute(path);
  if (route.kind === "page") {
    return { status: 200, path, title: sitePage(route.key).title };
  }
  if (route.kind === "appAddress") {
    return { status: 200, path, title: HOME_TITLE };
  }
  if (route.kind === "post") {
    // A post that cannot be shown has a page of its own words.
    return {
      status: 200,
      path,
      title: path === "/activity/demo-run" ? POST_TITLE : null,
    };
  }
  return { status: 404, path: pathname, title: NOT_FOUND_TITLE };
}

/** Asks for every lazy picture at once, waits for them, then lists the
 *  ones that are drawn and did not load. */
async function brokenPictures(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    for (const img of document.querySelectorAll("img[loading=lazy]"))
      (img as HTMLImageElement).loading = "eager";
  });
  await page
    .waitForFunction(
      () => [...document.images].every((img) => img.complete),
      undefined,
      { timeout: 10_000 }
    )
    .catch(() => undefined);
  return page.evaluate(() =>
    [...document.images]
      .filter((img) => {
        const box = img.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      })
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src)
  );
}

async function check(page: Page, address: string): Promise<string[]> {
  const want = expected(address);
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() !== "error") return;
    // The 404's own status, which the console reports as a failed load.
    if (want.status === 404 && /status of 404/.test(m.text())) return;
    errors.push(m.text());
  };
  const onError = (e: Error) => errors.push(String(e));
  page.on("console", onConsole);
  page.on("pageerror", onError);
  const problems: string[] = [];
  try {
    const res = await page.goto(ORIGIN + address, { waitUntil: "networkidle" });
    const status = res?.status() ?? 0;
    if (status !== want.status)
      problems.push(`status ${status}, not ${want.status}`);
    const path = new URL(page.url()).pathname;
    if (normalisePath(path) !== normalisePath(want.path))
      problems.push(`at ${path}, not ${want.path}`);
    const h1 = await page.locator("h1").count();
    if (h1 !== 1) problems.push(`${h1} headlines, not 1`);
    const title = await page.title();
    if (want.title !== null && title !== want.title)
      problems.push(`title "${title}", not "${want.title}"`);
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    if (wide) problems.push("wider than the screen");
    for (const src of await brokenPictures(page))
      problems.push(`picture did not load: ${src}`);
  } catch (error) {
    problems.push(String(error));
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onError);
  }
  for (const error of errors) problems.push(`console: ${error.slice(0, 200)}`);
  return problems;
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${ORIGIN}/robots.txt`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`check-site: the server did not answer at ${ORIGIN}`);
}

const server = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/website/serveHosting.ts", String(PORT)],
  { cwd: root, stdio: ["ignore", "inherit", "inherit"] }
);

let failed = 0;
try {
  await waitForServer();
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM
      ? { executablePath: process.env.PW_CHROMIUM }
      : undefined
  );
  try {
    for (const width of [393, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 393 ? 852 : 900 },
      });
      // Nothing off the served build: no production, no font host.
      await context.route("**/*", (route) =>
        route.request().url().startsWith(ORIGIN)
          ? route.continue()
          : route.abort()
      );
      const page = await context.newPage();
      for (const address of addresses()) {
        const problems = await check(page, address);
        if (problems.length) {
          failed++;
          console.log(`✗ ${width} ${address}\n    ${problems.join("\n    ")}`);
        } else {
          console.log(`✓ ${width} ${address}`);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}

const total = addresses().length * 2;
console.log(`check-site: ${total - failed} of ${total} passed`);
if (failed) process.exit(1);
