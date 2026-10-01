/**
 * The brand mark (DS3): the app icon's rounded hexagon with its chevron
 * cut out, small enough for Home's date line. Decorative, in the brand
 * purple, and the chevron in the page's own colour so it reads as a cut.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import BrandMark from "../BrandMark";

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
    const hexagon = container.querySelector("polygon")!;
    const chevron = container.querySelector("polyline")!;
    // The icon declares each shape by id; the generators read them so.
    const declared = (id: string) =>
      new RegExp(`<(?:polygon|polyline) id="${id}"([^>]*)>`).exec(icon)?.[1];
    expect(declared("hexagon")).toContain(
      `points="${hexagon.getAttribute("points")}"`
    );
    // The corners are rounded by the hexagon's own round-joined stroke.
    expect(declared("hexagon")).toContain(
      `stroke-width="${hexagon.getAttribute("stroke-width")}"`
    );
    expect(hexagon).toHaveAttribute("stroke-linejoin", "round");
    expect(declared("chevron")).toContain(
      `points="${chevron.getAttribute("points")}"`
    );
    expect(declared("chevron")).toContain(
      `stroke-width="${chevron.getAttribute("stroke-width")}"`
    );
  });

  it("fills in the brand purple and cuts the chevron in the page colour", () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector("svg")).toHaveClass("text-lifting");
    expect(container.querySelector("polygon")).toHaveAttribute(
      "fill",
      "currentColor"
    );
    expect(container.querySelector("polygon")).toHaveAttribute(
      "stroke",
      "currentColor"
    );
    // A class, never a var() in the stroke attribute: WKWebView does not
    // substitute var() in SVG presentation attributes reliably.
    const chevron = container.querySelector("polyline")!;
    expect(chevron).toHaveClass("stroke-background");
    expect(chevron.getAttribute("stroke") ?? "").not.toMatch(/var\(/);
  });

  it("takes a size from its caller", () => {
    const { container } = render(<BrandMark className="h-6" />);
    expect(container.querySelector("svg")).toHaveClass("h-6");
    expect(container.querySelector("svg")).not.toHaveClass("h-4");
  });
});
