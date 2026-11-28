import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { firstPaintFontPreloads } from "./first-paint-fonts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const EMITTED = [
  "assets/index-Ab12Cd34.js",
  "assets/barlow-latin-ext-400-normal-lLTsRRxN.woff2",
  "assets/barlow-latin-400-normal-eXO_dkmS.woff2",
  "assets/barlow-latin-500-normal-B4kP2xQa.woff2",
  "assets/barlow-latin-600-normal-Cq1mT9zR.woff2",
  "assets/barlow-latin-700-normal-D7wE3nYu.woff2",
  "assets/barlow-latin-800-normal-Fh6sV0Lc.woff2",
  "assets/barlow-vietnamese-800-normal-qRpaaN48.woff2",
  "assets/archivo-latin-ext-wght-normal-C4zznr8T.woff2",
  "assets/archivo-latin-wght-normal-E0tuGl4L.woff2",
  "assets/archivo-vietnamese-wght-normal-XAtsl5Q_.woff2",
];

describe("first-paint font preloads", () => {
  it("preloads the Latin text face at each weight and the Latin numeral face, and nothing else", () => {
    const tags = firstPaintFontPreloads(EMITTED, "/Maiin/");
    expect(tags.map((t) => t.attrs?.href)).toEqual([
      "/Maiin/assets/barlow-latin-400-normal-eXO_dkmS.woff2",
      "/Maiin/assets/barlow-latin-500-normal-B4kP2xQa.woff2",
      "/Maiin/assets/barlow-latin-600-normal-Cq1mT9zR.woff2",
      "/Maiin/assets/barlow-latin-700-normal-D7wE3nYu.woff2",
      "/Maiin/assets/barlow-latin-800-normal-Fh6sV0Lc.woff2",
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
      ...readdirSync(resolve(root, "node_modules/@fontsource/barlow/files")),
      ...readdirSync(
        resolve(root, "node_modules/@fontsource-variable/archivo/files")
      ),
    ].map((name) => `assets/${name.replace(/\.woff2$/, "-HASHHASH.woff2")}`);
    expect(firstPaintFontPreloads(files, "/")).toHaveLength(6);

    const main = readFileSync(resolve(root, "src/main.tsx"), "utf8");
    expect(main).toContain('import "./styles/barlow.css";');
    expect(main).toContain('import "@fontsource-variable/archivo/wght.css";');
  });

  it("preloads the files styles/barlow.css declares, at the weights it declares", () => {
    const css = readFileSync(resolve(root, "src/styles/barlow.css"), "utf8");
    const latin = [
      ...css.matchAll(
        /@fontsource\/barlow\/files\/(barlow-latin-\d+-normal)\.woff2/g
      ),
    ].map(([, name]) => `assets/${name}-HASHHASH.woff2`);
    expect(latin).toHaveLength(5);
    const preloaded = firstPaintFontPreloads(
      [...latin, "assets/archivo-latin-wght-normal-HASHHASH.woff2"],
      "/"
    ).map((t) => String(t.attrs?.href).replace(/^\//, ""));
    expect(preloaded.slice(0, 5)).toEqual(latin);
  });

  it("ships Barlow's licence with the files, as the OFL asks", () => {
    /* public/legal goes into the app's build and the website's
       (WEBSITE_PUBLIC_DIRS). The package's first line runs every file's
       copyright together; the copy keeps one, then the licence as is. */
    const shipped = readFileSync(
      resolve(root, "public/legal/fonts/Barlow-OFL.txt"),
      "utf8"
    ).split("\n");
    const packaged = readFileSync(
      resolve(root, "node_modules/@fontsource/barlow/LICENSE"),
      "utf8"
    ).split("\n");
    expect(shipped[0]).toBe(
      "Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)"
    );
    expect(shipped.slice(1)).toEqual(packaged.slice(1));
    expect(shipped.join("\n")).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  it("is wired into the build", () => {
    const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    expect(config).toMatch(/firstPaintFontsPlugin\(\)/);
  });
});
