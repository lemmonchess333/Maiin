/**
 * The cold start must be ONE colour, and it must be the app's own.
 *
 * Six surfaces paint the frames before React's first render — the iOS
 * launch image, Capacitor's splash + status bar, the Android window
 * background, the PWA manifest's install splash, and the browser's
 * theme-color. Nothing read any of them, and they had drifted into three
 * different answers: the launch PNG was stock Capacitor (a blue dumbbell
 * on WHITE), the manifest's `background_color` was `#ffffff`, and the
 * other four carried `#7C6EF6` — a purple that is not the brand purple
 * (`#7B72E9`) and appears nowhere else in the app.
 *
 * The right answer is the app's dark page background, because the app
 * boots dark: `public/init.js` applies `.dark` before first paint unless
 * the user has explicitly chosen light. So the cold start hands over to
 * the first real frame with nothing to flash through.
 *
 * These assertions derive that colour from the `.dark { --background }`
 * TOKEN rather than restating a hex, so moving the canvas moves the
 * launch chrome with it — including the rendered PNG, whose corner pixel
 * is read back here. That is what makes `scripts/art/gen-splash.mjs` a
 * pinned generator rather than prose: its output is checked, not its
 * source.
 *
 * Not covered, and not coverable here: how the handover LOOKS on a
 * device. The capture rig films the web app, which never shows a launch
 * image.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PNG } from "pngjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

/** `240 4% 7%` -> `#111113`. Mirrors the converter in gen-splash.mjs; the
 *  PNG-pixel assertion below is what keeps the two honest. */
function hslTokenToHex(token: string): string {
  const [h, s, l] = token.trim().split(/\s+/).map(parseFloat);
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][Math.floor(h / 60) % 6];
  return `#${[r, g, b]
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

const css = read("src/index.css");
const darkBlock = /\.dark\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
const bgToken = darkBlock
  ? /--background:\s*([^;]+);/.exec(darkBlock)?.[1]
  : undefined;

describe("cold-start chrome agrees with the dark canvas", () => {
  it("reads the dark --background token", () => {
    expect(bgToken).toBeTruthy();
    // Sanity: the token has to be a genuinely dark value, or every
    // assertion below would happily pin a light cold start.
    const lightness = parseFloat(bgToken!.trim().split(/\s+/)[2]);
    expect(lightness).toBeLessThan(20);
  });

  const ground = () => hslTokenToHex(bgToken!);

  it("converts the token to a hex the other files can carry", () => {
    // Pinned as a literal so a broken converter cannot make every
    // comparison below pass by agreeing with itself.
    expect(hslTokenToHex("240 4% 7%")).toBe("#111113");
    expect(hslTokenToHex("0 0% 100%")).toBe("#ffffff");
    expect(hslTokenToHex("0 0% 0%")).toBe("#000000");
  });

  it("the PWA manifest installs and splashes on the canvas", () => {
    const manifest = JSON.parse(read("public/manifest.json")) as {
      background_color: string;
      theme_color: string;
    };
    expect(manifest.background_color).toBe(ground());
    expect(manifest.theme_color).toBe(ground());
  });

  it("the browser theme-color matches the manifest", () => {
    const meta = /<meta name="theme-color" content="([^"]+)"/.exec(
      read("index.html")
    );
    expect(meta?.[1]).toBe(ground());
  });

  it("Capacitor's splash, status bar and Android window all match", () => {
    const cap = read("capacitor.config.ts");
    const colours = [...cap.matchAll(/backgroundColor:\s*"([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(colours.length).toBe(3);
    for (const colour of colours) expect(colour).toBe(ground());
  });

  it("no surface still carries the stray purple", () => {
    // #7C6EF6 was never a Tropos colour — the brand purple is #7B72E9.
    for (const file of [
      "capacitor.config.ts",
      "public/manifest.json",
      "index.html",
    ]) {
      expect(read(file).toLowerCase()).not.toContain("#7c6ef6");
    }
  });

  it("the iOS launch image is painted on that same canvas", () => {
    for (const name of [
      "splash-2732x2732.png",
      "splash-2732x2732-1.png",
      "splash-2732x2732-2.png",
    ]) {
      const png = PNG.sync.read(
        readFileSync(
          resolve(repoRoot, "ios/App/App/Assets.xcassets/Splash.imageset", name)
        )
      );
      expect(png.width).toBe(png.height);
      // The storyboard image view is scaleAspectFill, so the corner is
      // always cropped away on a phone — which is exactly why it must be
      // the ground colour and not something decorative.
      const corner = `#${[0, 1, 2]
        .map((i) => png.data[i].toString(16).padStart(2, "0"))
        .join("")}`;
      expect(corner).toBe(ground());
    }
  });

  it("the launch image carries the brand mark, centred", () => {
    const png = PNG.sync.read(
      readFileSync(
        resolve(
          repoRoot,
          "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png"
        )
      )
    );
    // The hexagon's widest row runs through the vertical centre. The
    // chevron is cut out of that row too, so the run is split into two
    // lobes — scanning inwards from both edges still finds the shape's
    // true extents.
    const row = png.height >> 1;
    const at = (x: number) => {
      const i = (png.width * row + x) << 2;
      return [png.data[i], png.data[i + 1], png.data[i + 2]];
    };
    const painted = (x: number) => at(x)[2] > 120;

    let left = 0;
    let right = png.width - 1;
    while (left < png.width && !painted(left)) left++;
    while (right > 0 && !painted(right)) right--;
    expect(right).toBeGreaterThan(left);

    // Centred: the two margins agree.
    expect(Math.abs(left - (png.width - 1 - right))).toBeLessThanOrEqual(2);

    // Brand purple, not some other fill.
    const [r, g, b] = at(left + Math.round((right - left) * 0.05));
    expect(b).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(g);

    // The mark has to sit in a size band, not at an exact width. The
    // hexagon is 520/1024 of its box, so the 22% box paints ~11.2% of the
    // square; the band below spans roughly a 0.20-0.245 box. Too small and
    // the phone crop leaves a speck; too large and it loses its padding
    // (the first draft of this asset was 0.26, which fails this).
    const share = (right - left) / png.width;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.125);
  });
});
