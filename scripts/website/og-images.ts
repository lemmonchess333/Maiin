/**
 * Draws troposfit.com's preview pictures (src/website/static/og/*.png,
 * 1200 by 630): the lockup, the page's headline and the page's picture,
 * in the page's one light. Run by hand when a headline or a screen
 * changes, and commit what it writes:
 *
 *   node --import tsx scripts/website/og-images.ts
 *
 * It needs Playwright's Chromium (preinstalled in the agent sandbox; set
 * PW_CHROMIUM to another browser's path). The fonts are the app's own
 * (@fontsource-variable), and the mark is `src/lib/brandMark.ts`'s.
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { MARK_BAR, MARK_STEM, MARK_VIEWBOX } from "../../src/lib/brandMark.ts";
import { THEME } from "../../src/lib/theme.ts";

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "src/website/static/og");

interface Card {
  file: string;
  headline: string;
  picture: string;
  /** The picture is a photograph (the home page's), not a screen. */
  photo?: boolean;
  light: string;
}

const CARDS: readonly Card[] = [
  {
    file: "home",
    headline: "Your training and food, planned together",
    picture: "src/assets/welcome/welcome-1-sprint.webp",
    photo: true,
    light: THEME.lifting,
  },
  {
    file: "lifting",
    headline: "A lifting plan for the days you have",
    picture: "src/website/screens/home.webp",
    light: THEME.lifting,
  },
  {
    file: "running",
    headline: "Runs and race plans that fit your week",
    picture: "src/website/screens/run.webp",
    light: THEME.running,
  },
  {
    file: "food",
    headline: "Log food the way you’d say it",
    picture: "src/website/screens/food.webp",
    light: THEME.semantic.nutrition,
  },
  {
    file: "social",
    headline: "Train alongside your people",
    picture: "src/website/screens/together.webp",
    light: THEME.lifting,
  },
  {
    file: "pro",
    headline: "What Pro adds",
    picture: "src/website/screens/pro-plans.webp",
    light: THEME.lifting,
  },
];

async function dataUrl(file: string, type: string): Promise<string> {
  const bytes = await readFile(path.join(root, file));
  return `data:${type};base64,${bytes.toString("base64")}`;
}

async function fontFace(family: string, file: string): Promise<string> {
  const url = await dataUrl(file, "font/woff2");
  return `@font-face{font-family:"${family}";src:url(${url}) format("woff2");font-weight:100 900;}`;
}

async function main() {
  await mkdir(out, { recursive: true });
  const fonts =
    (await fontFace(
      "Jakarta",
      "node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2"
    )) +
    (await fontFace(
      "Archivo",
      "node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2"
    ));
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM
      ? { executablePath: process.env.PW_CHROMIUM }
      : undefined
  );
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  for (const card of CARDS) {
    const picture = await dataUrl(card.picture, "image/webp");
    const pictureCss = card.photo
      ? "right:0;top:0;width:470px;height:630px;object-fit:cover;object-position:50% 18%;"
      : "right:96px;top:72px;width:300px;border-radius:30px;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 30px 80px -30px #000;";
    await page.setContent(`<!doctype html><html><head><style>${fonts}
      *{margin:0;box-sizing:border-box}
      body{width:1200px;height:630px;overflow:hidden;background:${THEME.bg};position:relative;font-family:Jakarta,sans-serif;color:#F4F4F6}
      .light{position:absolute;right:${card.photo ? -120 : 0}px;top:40px;width:640px;height:640px;background:radial-gradient(closest-side,${card.light}38,${card.light}00)}
      .pic{position:absolute;${pictureCss}}
      .lockup{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:14px}
      .lockup svg{height:40px;width:auto;color:${THEME.lifting}}
      .lockup span{font-family:Archivo,sans-serif;font-weight:800;font-size:36px;letter-spacing:-.01em}
      h1{position:absolute;left:72px;bottom:96px;width:${card.photo ? 600 : 640}px;font-weight:800;font-size:64px;line-height:1.06;letter-spacing:-.025em}
      p{position:absolute;left:72px;bottom:56px;font-size:22px;color:#A9A9B2}
    </style></head><body>
      <div class="light"></div>
      <img class="pic" src="${picture}">
      <div class="lockup"><svg viewBox="${MARK_VIEWBOX}"><path d="${MARK_BAR}" fill="currentColor"/><path d="${MARK_STEM}" fill="currentColor"/></svg><span>Tropos</span></div>
      <h1>${card.headline}</h1>
      <p>troposfit.com · on the App Store for iPhone</p>
    </body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, `${card.file}.png`) });
    console.log(`og/${card.file}.png`);
  }
  await browser.close();
}

await main();
