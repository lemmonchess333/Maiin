/**
 * Draws the pictures a pasted link to troposfit.com shows
 * (`src/website/og/*.jpg`, 1200 x 630, named by `SitePage.image`): the
 * lockup, the page's headline and its picture from the website itself
 * (the welcome's photographs, the app's drawings, an app screen) on the
 * website's dark ground. A development tool, run again when a headline or
 * a picture changes; the build copies the files it made.
 *
 *   PW_CHROMIUM=<chrome> node --import tsx scripts/website/renderOgImages.ts
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function dataUrl(path: string): string {
  const type = path.endsWith(".webp")
    ? "image/webp"
    : path.endsWith(".woff2")
      ? "font/woff2"
      : "image/png";
  return `data:${type};base64,${readFileSync(join(root, path)).toString("base64")}`;
}

const brand = readFileSync(join(root, "src/lib/brandMark.ts"), "utf8");
const bar = brand.match(/MARK_BAR =\s*"([^"]+)"/)![1];
const stem = brand.match(/MARK_STEM =\s*"([^"]+)"/)![1];
const viewBox = brand.match(/MARK_VIEWBOX = "([^"]+)"/)![1];

const archivo = dataUrl(
  "node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2"
);
/** The text face at the weights a card sets, as src/styles/barlow.css declares it. */
const barlow = [600, 700, 800].map(
  (weight) =>
    `@font-face { font-family: Barlow; src: url(${dataUrl(
      `node_modules/@fontsource/barlow/files/barlow-latin-${weight}-normal.woff2`
    )}) format("woff2"); font-weight: ${weight}; size-adjust: 106%; }`
);

/** Each card: its file, the headline, the line under it and the picture. */
const CARDS = [
  {
    file: "home",
    kicker: "For iPhone",
    title: "Your training and food, planned together",
    picture: `<div class="strip">${[1, 2, 3]
      .map(
        (n) =>
          `<img src="${dataUrl(
            [
              "src/assets/welcome/welcome-1-sprint.webp",
              "src/assets/welcome/welcome-2-squat.webp",
              "src/assets/welcome/welcome-3-crew.webp",
            ][n - 1]
          )}" style="object-position:${["50% 15%", "50% 40%", "50% 45%"][n - 1]}">`
      )
      .join("")}</div>`,
  },
  {
    file: "lifting",
    kicker: "Lifting",
    kickerColour: "#9B93EE",
    title: "Strength sessions built around your week",
    picture: `<div class="art" style="--light:123 114 233"><img src="${dataUrl("public/form-art/overhead-press.webp")}"></div>`,
  },
  {
    file: "running",
    kicker: "Running",
    kickerColour: "#DF8B9C",
    title: "From your first 5K to a marathon",
    picture: `<div class="art" style="--light:212 99 122"><img src="${dataUrl("public/form-art/run-fast.webp")}"></div>`,
  },
  {
    file: "food",
    kicker: "Food",
    kickerColour: "#DA8A50",
    title: "Eat for the plan you’re on",
    picture: `<div class="art" style="--light:217 136 78"><div class="foods">${[
      "eggs",
      "bowl",
      "salad",
      "protein",
      "fruit",
      "bread",
    ]
      .map((food) => `<img src="${dataUrl(`public/food-art/${food}.webp`)}">`)
      .join("")}</div></div>`,
  },
  {
    file: "social",
    kicker: "Social",
    kickerColour: "#9B93EE",
    title: "Train with the people you know",
    picture: `<div class="strip one"><img src="${dataUrl("src/assets/welcome/welcome-3-crew.webp")}" style="object-position:50% 45%"></div>`,
  },
  {
    file: "pro",
    kicker: "Tropos Pro",
    kickerColour: "#9B93EE",
    title: "Photo food logging, and a target that adapts to you",
    picture: `<div class="art" style="--light:123 114 233"><img class="screen" src="${dataUrl("src/website/screens/food-day.webp")}"></div>`,
  },
] as const;

const page = (
  card: (typeof CARDS)[number]
) => `<!doctype html><html><head><style>
@font-face { font-family: Archivo; src: url(${archivo}) format("woff2"); font-weight: 100 900; }
${barlow.join("\n")}
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #0E0E11; color: #F4F4F6; font-family: Barlow; display: grid; grid-template-columns: 600px 600px; overflow: hidden; }
.words { padding: 64px 0 64px 72px; display: flex; flex-direction: column; justify-content: space-between; }
.lockup { display: flex; align-items: center; gap: 16px; }
.lockup svg { height: 44px; color: #7B72E9; }
.lockup span { font-family: Archivo; font-weight: 800; font-size: 40px; letter-spacing: -0.01em; }
.kicker { font-weight: 700; font-size: 26px; color: ${"kickerColour" in card ? card.kickerColour : "#B4B4BC"}; }
h1 { margin-top: 12px; font-weight: 800; font-size: 60px; line-height: 1.06; letter-spacing: -0.02em; }
.site { font-weight: 600; font-size: 24px; color: #B4B4BC; }
.strip { display: grid; grid-auto-flow: column; gap: 4px; height: 630px; }
.strip img { width: 100%; height: 630px; object-fit: cover; }
.strip.one { padding: 40px 72px 40px 40px; } .strip.one img { height: 550px; border-radius: 28px; }
.art { position: relative; display: grid; place-items: center; height: 630px; }
.art::before { content: ""; position: absolute; inset: 40px; border-radius: 50%; background: radial-gradient(closest-side, rgb(var(--light) / 0.34), rgb(var(--light) / 0.1) 55%, transparent); }
.art img { position: relative; max-height: 520px; max-width: 460px; }
.foods { position: relative; display: grid; grid-template-columns: repeat(3, 150px); gap: 16px; }
.foods img { width: 150px; height: 150px; }
.art img.screen { max-height: none; width: 300px; border-radius: 30px; margin-top: 180px; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.1); }
</style></head><body>
<div class="words">
  <div class="lockup"><svg viewBox="${viewBox}"><path d="${bar}" fill="currentColor"/><path d="${stem}" fill="currentColor"/></svg><span>Tropos</span></div>
  <div><p class="kicker">${card.kicker}</p><h1>${card.title}</h1></div>
  <p class="site">troposfit.com</p>
</div>
${card.picture}
</body></html>`;

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
const tab = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
for (const card of CARDS) {
  await tab.setContent(page(card));
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(150);
  await tab.screenshot({
    path: join(root, "src/website/og", `${card.file}.jpg`),
    type: "jpeg",
    quality: 82,
  });
}
await browser.close();
console.log(`og: ${CARDS.length} pictures in src/website/og/`);
