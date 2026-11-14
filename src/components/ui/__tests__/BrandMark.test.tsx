/**
 * The brand mark (DS3, DS7): the app icon's T, its stem rising into its
 * bar, small enough for Home's date line. Decorative, in the brand purple.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import BrandMark from "../BrandMark";
import { MARK_VIEWBOX } from "@/lib/brandMark";

afterEach(cleanup);

describe("BrandMark", () => {
  it("is decorative: hidden from assistive tech and out of the tab order", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });

  it("is the app icon's geometry, not a redrawing of it", () => {
    const icon = readFileSync(
      resolve(process.cwd(), "src/assets/brand/app-icon.svg"),
      "utf8"
    );
    const { container } = render(<BrandMark />);
    const [bar, stem] = [...container.querySelectorAll("path")];
    // The icon declares each shape by id; the generators read them so.
    const declared = (id: string) =>
      new RegExp(`<path id="${id}"([^>]*)>`).exec(icon)?.[1];
    expect(declared("bar")).toContain(`d="${bar.getAttribute("d")}"`);
    expect(declared("stem")).toContain(`d="${stem.getAttribute("d")}"`);
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("fits its box: the two shapes fill the viewBox edge to edge", () => {
    const [x, y, w, h] = MARK_VIEWBOX.split(" ").map(Number);
    const { container } = render(<BrandMark />);
    const numbers = [...container.querySelectorAll("path")]
      .map((p) => p.getAttribute("d")!)
      .join(" ");
    // The bar starts at the box's top and spans its width; the stem ends
    // on its bottom edge.
    expect(numbers).toContain(`M${x + 20} ${y} H${x + w - 20}`);
    expect(numbers).toContain(`V${y + h - 20}`);
  });

  it("fills both shapes in the brand purple, with no cut in a page colour", () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector("svg")).toHaveClass("text-lifting");
    for (const path of container.querySelectorAll("path")) {
      expect(path).toHaveAttribute("fill", "currentColor");
      // The gap between the shapes shows the surface behind the mark.
      expect(path).not.toHaveAttribute("stroke");
    }
  });

  it("takes a size from its caller", () => {
    const { container } = render(<BrandMark className="h-6" />);
    expect(container.querySelector("svg")).toHaveClass("h-6");
    expect(container.querySelector("svg")).not.toHaveClass("h-4");
  });
});
