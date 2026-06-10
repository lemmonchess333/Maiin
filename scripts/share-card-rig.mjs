/**
 * Visual-audit rig for the ShareCardRenderer (SOCIAL S1).
 *
 * Renders the 3 templates × 3 background modes × 2 formats (= 18) to
 * docs/visual-audit/social/ so the cards can be eyeballed without a
 * device. The renderer is fully inline-styled + has no runtime imports,
 * so it SSRs cleanly here and screenshots with no app CSS needed.
 *
 * Note: web fonts (Archivo / Plus Jakarta) aren't loaded in this bare
 * page, so numerals fall back to the system sans — this rig verifies
 * LAYOUT, colour, route-line and hierarchy, not exact glyphs. `photo`
 * mode is excluded (it's a per-user image overlay, nothing to fixture).
 *
 * Run:  npx tsx scripts/share-card-rig.mjs
 *   (needs the local chromium at /opt/pw-browsers/chromium-1194)
 */

import { createElement as h } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// The component uses the app's automatic JSX runtime (no `import React`).
// tsx transforms it with the classic runtime here, emitting bare
// `React.createElement` — satisfy that by exposing React as a global for
// this rig process only. (Rig-only shim; the app build is unaffected.)
globalThis.React = React;
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ShareCardRenderer from "../src/components/share/ShareCardRenderer.tsx";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "visual-audit", "social");
mkdirSync(OUT, { recursive: true });

const sampleRoute =
  "M120,820L240,560L360,640L520,300L680,380L760,160L880,520L760,760L600,700L420,880L120,820";

const DATA = {
  run: {
    handle: "@alexruns",
    date: "12 Jun 2026",
    routePath: sampleRoute,
    distanceKm: 10.42,
    durationSec: 3245,
    pace: "5:12",
    elevationM: 84,
    splits: [
      { km: 1, pace: "5:05" },
      { km: 2, pace: "5:18" },
      { km: 3, pace: "5:09" },
    ],
  },
  lift: {
    handle: "@alexlifts",
    date: "12 Jun 2026",
    totalVolumeKg: 12400,
    exerciseCount: 6,
    durationSec: 4020,
    prCount: 2,
    prExercise: "Back Squat",
  },
  hybrid: {
    handle: "@alexhybrid",
    date: "12 Jun 2026",
    totalVolumeKg: 8600,
    distanceKm: 6.2,
    durationSec: 5400,
  },
};

const templates = ["run", "lift", "hybrid"];
const backgrounds = ["brand", "dark", "transparent", "photo"];
const formats = ["story", "square"];

// Sample "photo" for the photo-background captures — an SVG gradient data
// URL (real users pick a JPEG; this just verifies the photo layout +
// scrim + stat overlay compose). Same-origin data URI = no canvas taint.
const SAMPLE_PHOTO =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1920'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#e8995a'/><stop offset='1' stop-color='#5a4fc4'/></linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/></svg>"
  );

// Checkerboard so a TRANSPARENT card's emptiness is visible in the audit.
const CHECKER =
  "background-color:#888;background-image:linear-gradient(45deg,#666 25%,transparent 25%),linear-gradient(-45deg,#666 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#666 75%),linear-gradient(-45deg,transparent 75%,#666 75%);background-size:40px 40px;background-position:0 0,0 20px,20px -20px,-20px 0px;";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();
let count = 0;

for (const template of templates) {
  for (const background of backgrounds) {
    for (const format of formats) {
      const data = {
        ...DATA[template],
        template,
        format,
        background,
        ...(background === "photo" ? { photoUrl: SAMPLE_PHOTO } : {}),
      };
      const markup = renderToStaticMarkup(
        h(ShareCardRenderer, { data, offscreen: false })
      );
      const dims = format === "story" ? [1080, 1920] : [1080, 1080];
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0}body{${background === "transparent" ? CHECKER : ""}}</style></head><body>${markup}</body></html>`;
      await page.setViewportSize({ width: dims[0], height: dims[1] });
      await page.setContent(html, { waitUntil: "networkidle" });
      const card = page.locator("body > div").first();
      const file = join(OUT, `${template}-${background}-${format}.png`);
      await card.screenshot({ path: file });
      count++;
      console.log(`✓ ${template}-${background}-${format}`);
    }
  }
}

await browser.close();
console.log(`\n${count} share-card captures → docs/visual-audit/social/`);
