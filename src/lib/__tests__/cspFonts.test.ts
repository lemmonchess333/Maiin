/**
 * Fonts reach the page as files, never as data: URLs.
 *
 * index.html's CSP takes fonts from the app's own origin only
 * (`font-src 'self'`). Vite inlines an asset under its inline limit as a
 * data: URL, and Plus Jakarta Sans's extended-Cyrillic subset (2.3 KB)
 * came in under the 4 KB limit: the browser refused it on every load, a
 * console error the signed-out smoke spec caught once it ran in CI, and
 * text in that range fell back to another font.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { UserConfig } from "vite";
import viteConfig from "../../../vite.config";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const config = (
  viteConfig as unknown as (env: {
    mode: string;
    command: string;
  }) => UserConfig
)({ mode: "production", command: "build" });

/** Vite's own limit, which applies when a callback has no answer. */
const VITE_DEFAULT_LIMIT = 4096;

/** Whether the build inlines `file` of `bytes` as a data: URL. */
function inlined(file: string, bytes: number): boolean {
  const limit = config.build?.assetsInlineLimit;
  if (typeof limit === "function")
    return limit(file, Buffer.alloc(bytes)) ?? bytes < VITE_DEFAULT_LIMIT;
  return bytes < (limit ?? VITE_DEFAULT_LIMIT);
}

describe("fonts reach the page as files", () => {
  it("index.html's CSP takes fonts from the app's own origin only", () => {
    const fontSrc = read("../../../index.html").match(/font-src ([^;]*);/);
    expect(fontSrc).not.toBeNull();
    expect(fontSrc![1].split(/\s+/)).toEqual(["'self'"]);
  });

  it.each([
    "plus-jakarta-sans-cyrillic-ext-wght-normal.woff2",
    "archivo-latin-wght-normal.woff2",
    "a-font.woff",
    "a-font.ttf",
    "a-font.otf",
  ])("%s is never inlined, however small", (file) => {
    expect(
      inlined(`/node_modules/@fontsource-variable/x/files/${file}`, 2311)
    ).toBe(false);
  });

  it("a small image still is", () => {
    expect(inlined("/src/assets/icon.png", 1000)).toBe(true);
  });
});
