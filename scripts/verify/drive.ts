/**
 * Drives the feature map's steps in Chromium and keeps the evidence: a
 * trace of every step, a screenshot after each, and every console and page
 * error, attributed to the feature that was on screen.
 *
 * Isolation: each feature runs in a fresh browser context. A signed-in one
 * starts from the account's saved browser state (cookies, local storage
 * and IndexedDB, where Firebase keeps the session), so nothing one feature
 * leaves on the device (a lift under way, a dismissed card) reaches the
 * next, and the order of the map does not matter.
 *
 * Waiting: on what the person sees, with a deadline, never on a timer and
 * never on `networkidle` (the Firebase SDK keeps the network busy). A
 * failed step is not retried; the feature fails and says where.
 */
import {
  chromium,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Locator,
  type Page,
} from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Feature, Step, Target } from "./featureMap";
import { TEST_EMAIL, TEST_PASSWORD, VIEWPORT } from "./rigConfig";

export type Verdict = "pass" | "fail" | "not-run";

export interface StepResult {
  n: number;
  action: string;
  target?: string;
  url: string;
  ms: number;
  ok: boolean;
  error?: string;
  screenshot?: string;
}

export interface PageProblem {
  kind: "pageerror" | "console.error";
  text: string;
  /** The resource the message is about, when the browser names one. */
  source?: string;
  url: string;
  /** Environment noise (a blocked Google host, the favicon), not the app. */
  noise: boolean;
}

export interface FeatureResult {
  id: string;
  title: string;
  expected: string;
  round: number;
  verdict: Verdict;
  /** Why it failed or did not run. */
  reason?: string;
  ms: number;
  steps: StepResult[];
  problems: PageProblem[];
}

const DEFAULT_TIMEOUT = 20_000;
const GOTO_TIMEOUT = 45_000;

/* Hosts a cloud sandbox or an emulator build cannot reach, and that the
   app reaches for anyway (installations, remote config, analytics, fonts
   on a CDN). A failure to reach them is the environment's, not the
   change's. App URLs on the preview server are never noise. */
const NOISE_SOURCES = [
  /googleapis\.com/,
  /gstatic\.com/,
  /google-analytics\.com/,
  /googletagmanager\.com/,
  /firebaseinstallations/,
  /\/favicon\.ico$/,
];
const NOISE_TEXT = [
  /ERR_CERT_AUTHORITY_INVALID/,
  /ERR_TUNNEL_CONNECTION_FAILED/,
  /ERR_NAME_NOT_RESOLVED/,
  /ERR_PROXY_CONNECTION_FAILED/,
  /ERR_INTERNET_DISCONNECTED/,
  /installations\/request-failed/,
  /remoteconfig\//,
  /analytics\/.*(fetch|config)/i,
];

export function isNoise(text: string, source: string | undefined): boolean {
  if (source && /^https?:\/\/127\.0\.0\.1(:\d+)?\//.test(source)) {
    /* The app's own server and the emulators: a failure here is real,
       except the favicon the preview server does not have. */
    return /\/favicon\.ico$/.test(source);
  }
  if (source && NOISE_SOURCES.some((re) => re.test(source))) return true;
  return NOISE_TEXT.some((re) => re.test(text));
}

export function describeTarget(t: Target): string {
  if ("role" in t)
    return [
      `role=${t.role}`,
      t.name !== undefined ? `name=${String(t.name)}` : "",
      t.level ? `level=${t.level}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  if ("label" in t) return `label=${String(t.label)}`;
  if ("text" in t) return `text=${String(t.text)}`;
  if ("testId" in t) return `testid=${t.testId}`;
  return `css=${t.css}`;
}

function all(page: Page, t: Target): Locator {
  if ("role" in t)
    return page.getByRole(t.role, {
      name: t.name,
      exact: t.exact,
      level: t.level,
    });
  if ("label" in t) return page.getByLabel(t.label, { exact: t.exact });
  if ("text" in t) return page.getByText(t.text, { exact: t.exact });
  if ("testId" in t) return page.getByTestId(t.testId);
  return page.locator(t.css);
}

export function stepAction(step: Step): { action: string; target?: string } {
  if ("goto" in step) return { action: "goto", target: step.goto || "/" };
  if ("click" in step)
    return { action: "click", target: describeTarget(step.click) };
  if ("fill" in step)
    return { action: "fill", target: describeTarget(step.fill) };
  if ("see" in step) return { action: "see", target: describeTarget(step.see) };
  if ("absent" in step)
    return { action: "absent", target: describeTarget(step.absent) };
  if ("url" in step) return { action: "url", target: String(step.url) };
  return { action: "dismiss" };
}

/** Closes what opened over the screen: Escape first, then a tap on the
 *  backdrop's corner (a badge seal takes a tap, not Escape). Bounded. */
async function dismiss(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog").first();
  const closed = () =>
    dialog
      .waitFor({ state: "hidden", timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
  for (let i = 0; i < 6; i++) {
    if (!(await dialog.isVisible().catch(() => false))) return;
    await page.keyboard.press("Escape");
    if (await closed()) continue;
    await page.mouse.click(8, 8);
    await closed();
  }
}

async function runStep(page: Page, base: string, step: Step): Promise<void> {
  if ("goto" in step) {
    await page.goto(new URL(step.goto, base).href, {
      waitUntil: "domcontentloaded",
      timeout: GOTO_TIMEOUT,
    });
    return;
  }
  /* `visible: true` before `first()`: a page often holds a hidden copy of
     a control (a closed sheet's, a sr-only label), and the first match
     being hidden must not fail a step the person can see done. */
  if ("click" in step) {
    await all(page, step.click)
      .filter({ visible: true })
      .first()
      .click({ timeout: DEFAULT_TIMEOUT });
    return;
  }
  if ("fill" in step) {
    await all(page, step.fill)
      .filter({ visible: true })
      .first()
      .fill(step.value, { timeout: DEFAULT_TIMEOUT });
    return;
  }
  if ("see" in step) {
    await all(page, step.see)
      .filter({ visible: true })
      .first()
      .waitFor({
        state: "visible",
        timeout: step.timeoutMs ?? DEFAULT_TIMEOUT,
      });
    return;
  }
  if ("absent" in step) {
    const n = await all(page, step.absent).count();
    if (n > 0)
      throw new Error(
        `${describeTarget(step.absent)} is on the page (${n} found)`
      );
    return;
  }
  if ("url" in step) {
    await page.waitForURL((u) => step.url.test(u.pathname), {
      timeout: DEFAULT_TIMEOUT,
    });
    return;
  }
  await dismiss(page);
}

function contextOptions(storageState?: string, motion = false) {
  return {
    viewport: VIEWPORT,
    /* The production CSP does not allow 127.0.0.1:9099; bypassing it is
       safe only because this targets the emulators. */
    bypassCSP: true,
    /* A service worker would serve the previous build's chunks after a
       rebuild; the verify build is never the cached one. */
    serviceWorkers: "block" as const,
    /* Reduced motion by default: screenshots land on settled screens.
       `--motion` drives with the person's default instead. */
    reducedMotion: motion ? ("no-preference" as const) : ("reduce" as const),
    locale: "en-GB",
    geolocation: { latitude: 51.5074, longitude: -0.1657, accuracy: 5 },
    permissions: ["geolocation"],
    ...(storageState ? { storageState } : {}),
  };
}

async function newContext(
  browser: Browser,
  storageState?: string,
  motion = false
): Promise<BrowserContext> {
  const ctx = await browser.newContext(contextOptions(storageState, motion));
  /* The emulator SDK's fixed banner sits over the tab bar and takes taps
     (the capture specs hide it the same way). */
  await ctx.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".firebase-emulator-warning{display:none !important}";
      document.head.appendChild(style);
    });
  });
  return ctx;
}

export async function launch(executablePath: string): Promise<Browser> {
  return chromium.launch({ executablePath });
}

/**
 * Signs in as the seeded account through the real form (the flow
 * `e2e/helpers/auth.ts` uses) and saves the browser's state, IndexedDB
 * included, to `statePath`. Returns the milliseconds it took.
 */
export async function signIn(
  browser: Browser,
  base: string,
  statePath: string
): Promise<number> {
  const started = Date.now();
  const ctx = await newContext(browser);
  try {
    const page = await ctx.newPage();
    await page.goto(base, {
      waitUntil: "domcontentloaded",
      timeout: GOTO_TIMEOUT,
    });
    const email = page.locator("#login-email");
    const welcomeSignIn = page.getByRole("button", {
      name: "Sign in",
      exact: true,
    });
    await welcomeSignIn
      .or(email)
      .first()
      .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT });
    if (!(await email.isVisible())) await welcomeSignIn.first().click();
    await email.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT });
    await email.fill(TEST_EMAIL);
    await page.locator("#login-password").fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .waitFor({ state: "visible", timeout: GOTO_TIMEOUT });
    await ctx.storageState({ path: statePath, indexedDB: true });
    return Date.now() - started;
  } finally {
    await ctx.close();
  }
}

/** True when the saved state still opens the app signed in. */
export async function stillSignedIn(
  browser: Browser,
  base: string,
  statePath: string
): Promise<boolean> {
  const ctx = await newContext(browser, statePath);
  try {
    const page = await ctx.newPage();
    await page.goto(base, {
      waitUntil: "domcontentloaded",
      timeout: GOTO_TIMEOUT,
    });
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const welcome = page.getByRole("button", { name: "Get started" });
    await nav
      .or(welcome)
      .first()
      .waitFor({ state: "visible", timeout: GOTO_TIMEOUT });
    return nav.isVisible();
  } catch {
    return false;
  } finally {
    await ctx.close();
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Runs one feature in its own context and returns what happened. */
export async function driveFeature(
  browser: Browser,
  base: string,
  feature: Feature,
  opts: {
    outDir: string;
    round: number;
    storageState?: string;
    motion?: boolean;
  }
): Promise<FeatureResult> {
  const started = Date.now();
  const shots = join(opts.outDir, "screenshots");
  mkdirSync(shots, { recursive: true });
  const prefix =
    (opts.round > 1 ? `r${opts.round}-` : "") + feature.id.slice(0, 40);
  const result: FeatureResult = {
    id: feature.id,
    title: feature.title,
    expected: feature.expected,
    round: opts.round,
    verdict: "pass",
    ms: 0,
    steps: [],
    problems: [],
  };
  const ctx = await newContext(browser, opts.storageState, opts.motion);
  const page = await ctx.newPage();
  page.on("pageerror", (e) =>
    result.problems.push({
      kind: "pageerror",
      text: e.message,
      url: page.url(),
      noise: isNoise(e.message, undefined),
    })
  );
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error") return;
    const source = m.location().url || undefined;
    result.problems.push({
      kind: "console.error",
      text: m.text(),
      source,
      url: page.url(),
      noise: isNoise(m.text(), source),
    });
  });

  try {
    for (const [i, step] of feature.steps.entries()) {
      const n = i + 1;
      const { action, target } = stepAction(step);
      const t = Date.now();
      const rec: StepResult = { n, action, target, url: "", ms: 0, ok: true };
      try {
        await runStep(page, base, step);
      } catch (e) {
        rec.ok = false;
        rec.error = (e as Error).message.split("\n").slice(0, 6).join("\n");
      }
      rec.ms = Date.now() - t;
      rec.url = page.url().replace(base, "/");
      const file = `${prefix}-${String(n).padStart(2, "0")}-${slug(
        `${action} ${target ?? ""}`
      )}${rec.ok ? "" : "-FAIL"}.png`;
      try {
        await page.screenshot({
          path: join(shots, file),
          animations: "disabled",
          timeout: 10_000,
        });
        rec.screenshot = `screenshots/${file}`;
      } catch {
        /* A screenshot that times out is not the feature's failure. */
      }
      result.steps.push(rec);
      if (!rec.ok) {
        result.verdict = "fail";
        result.reason = `step ${n} (${action} ${target ?? ""}): ${rec.error}`;
        break;
      }
    }
  } finally {
    result.ms = Date.now() - started;
    await ctx.close();
  }
  return result;
}

export function notRun(
  feature: Feature,
  round: number,
  reason: string
): FeatureResult {
  return {
    id: feature.id,
    title: feature.title,
    expected: feature.expected,
    round,
    verdict: "not-run",
    reason,
    ms: 0,
    steps: [],
    problems: [],
  };
}
