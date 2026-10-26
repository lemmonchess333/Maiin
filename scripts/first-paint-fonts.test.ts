import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { firstPaintFontPreloads } from "./first-paint-fonts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const EMITTED = [
  "assets/index-Ab12Cd34.js",
  "assets/plus-jakarta-sans-cyrillic-ext-wght-normal-lLTsRRxN.woff2",
  "assets/plus-jakarta-sans-latin-ext-wght-normal-DmpS2jIq.woff2",
  "assets/plus-jakarta-sans-latin-wght-normal-eXO_dkmS.woff2",
  "assets/archivo-latin-ext-wght-normal-C4zznr8T.woff2",
  "assets/archivo-latin-wght-normal-E0tuGl4L.woff2",
  "assets/archivo-vietnamese-wght-normal-XAtsl5Q_.woff2",
];

describe("first-paint font preloads", () => {
  it("preloads the Latin text face and the Latin numeral face, and nothing else", () => {
    const tags = firstPaintFontPreloads(EMITTED, "/Maiin/");
    expect(tags.map((t) => t.attrs?.href)).toEqual([
      "/Maiin/assets/plus-jakarta-sans-latin-wght-normal-eXO_dkmS.woff2",
      "/Maiin/assets/archivo-latin-wght-normal-E0tuGl4L.woff2",
    ]);
  });

  it("asks for a font, in CORS mode, so the browser uses the preload", () => {
    for (const tag of firstPaintFontPreloads(EMITTED, "/")) {
      expect(tag.tag).toBe("link");
      expect(tag.attrs).toMatchObject({
        rel: "preload",
        as: "font",
        type: "font/woff2",
        crossorigin: "",
      });
      expect(String(tag.attrs?.href)).toMatch(/^\/assets\//);
    }
  });

  it("fails the build when a face is missing rather than dropping its preload", () => {
    expect(() =>
      firstPaintFontPreloads(
        EMITTED.filter((f) => !f.includes("archivo-latin-wght")),
        "/"
      )
    ).toThrow(/archivo-latin-wght-normal/);
  });

  it("matches the files fontsource ships, and the faces main.tsx loads", () => {
    /* The patterns are fontsource's file names. Hold them to the
       packages, so an upgrade that renames a file fails here first. */
    const files = [
      ...readdirSync(
        resolve(
          root,
          "node_modules/@fontsource-variable/plus-jakarta-sans/files"
        )
      ),
      ...readdirSync(
        resolve(root, "node_modules/@fontsource-variable/archivo/files")
      ),
    ].map((name) => `assets/${name.replace(/\.woff2$/, "-HASHHASH.woff2")}`);
    expect(firstPaintFontPreloads(files, "/")).toHaveLength(2);

    const main = readFileSync(resolve(root, "src/main.tsx"), "utf8");
    expect(main).toContain(
      'import "@fontsource-variable/plus-jakarta-sans/index.css";'
    );
    expect(main).toContain('import "@fontsource-variable/archivo/wght.css";');
  });

  it("is wired into the build", () => {
    const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    expect(config).toMatch(/firstPaintFontsPlugin\(\)/);
  });
});
