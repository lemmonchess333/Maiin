/**
 * A barcode result shows the product's photo, which Open Food Facts
 * serves from images.openfoodfacts.org. The CSP's img-src left that host
 * out, so the browser blocked every product photo and the result showed a
 * broken image. Pinned while the scanner still asks Open Food Facts for
 * `image_url`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

describe("CSP: Open Food Facts product photos", () => {
  it("allows the host the scanner's product photos come from", () => {
    const scanner = read("../../components/FoodAnalyzer.tsx");
    expect(scanner).toMatch(/fields=[^`"']*image_url/);

    // The policy attribute, not the first "img-src" in the file: the
    // comment above the tag names the host too, and this read it.
    const policy = read("../../../index.html").match(
      /http-equiv="Content-Security-Policy"\s+content="([\s\S]*?)"/
    );
    expect(policy).not.toBeNull();
    const imgSrc = policy![1]
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .find(([name]) => name === "img-src");
    expect(imgSrc).toBeDefined();
    expect(imgSrc!.slice(1)).toContain("https://images.openfoodfacts.org");
  });
});
