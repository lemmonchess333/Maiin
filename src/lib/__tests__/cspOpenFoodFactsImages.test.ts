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

    const imgSrc = read("../../../index.html").match(/img-src ([^;]*);/);
    expect(imgSrc).not.toBeNull();
    expect(imgSrc![1].split(/\s+/)).toContain(
      "https://images.openfoodfacts.org"
    );
  });
});
