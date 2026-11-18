import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup } from "@testing-library/react";
import { Trophy } from "lucide-react";
import { BadgeHex } from "../BadgeHex";

afterEach(cleanup);

/**
 * How BadgeHex shows a badge's art (DS4 call 4). A badge not yet earned
 * shows its own drawing in greys, stepped back by a theme-aware opacity
 * (`.badge-art-locked`); art with no grey drawing is greyed by CSS. Earned
 * art keeps an inline shadow below the reveal's size, and from it carries
 * the tier's glow through `.badge-art-glow` (dark only).
 */
describe("BadgeHex — badge art", () => {
  it("shows the grey drawing for a badge not yet earned", () => {
    const { container } = render(
      <BadgeHex
        Icon={Trophy}
        tier="silver"
        earned={false}
        imageSrc="/badges/x.svg"
        lockedImageSrc="/badges/x-locked.svg"
      />
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/badges/x-locked.svg");
    expect(container.querySelector(".badge-art-locked")).not.toBeNull();
    // The drawing is already grey: no CSS greying on top of it.
    expect(container.querySelector(".badge-art-greyed")).toBeNull();
    // The locked class owns opacity, so nothing is set inline.
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.filter).toBe("");
    expect(el.style.opacity).toBe("");
  });

  it("greys the earned art by CSS when there is no grey drawing", () => {
    const { container } = render(
      <BadgeHex
        Icon={Trophy}
        tier="silver"
        earned={false}
        imageSrc="/badges/x.svg"
      />
    );
    expect(container.querySelector("img")!.getAttribute("src")).toBe(
      "/badges/x.svg"
    );
    expect(
      container.querySelector(".badge-art-locked.badge-art-greyed")
    ).not.toBeNull();
  });

  it("earned art on the shelf and in the grid has a shadow and no glow", () => {
    const { container } = render(
      <BadgeHex
        Icon={Trophy}
        tier="silver"
        earned
        size={64}
        imageSrc="/badges/x.svg"
        lockedImageSrc="/badges/x-locked.svg"
      />
    );
    expect(container.querySelector("img")!.getAttribute("src")).toBe(
      "/badges/x.svg"
    );
    expect(container.querySelector(".badge-art-locked")).toBeNull();
    expect(container.querySelector(".badge-art-glow")).toBeNull();
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.filter).toContain("drop-shadow");
    expect(el.style.filter).not.toContain("0 0 ");
    expect(el.style.opacity).toBe("1");
  });

  it("earned art at the reveal's size carries its tier's glow", () => {
    const { container } = render(
      <BadgeHex
        Icon={Trophy}
        tier="gold"
        earned
        size={120}
        imageSrc="/badges/x.svg"
      />
    );
    const el = container.querySelector(".badge-art-glow") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.getPropertyValue("--badge-glow")).not.toBe("");
    expect(el.style.getPropertyValue("--badge-glow-size")).toBe("17px");
  });

  it("starts the glow at 96 px, not below", () => {
    const at = (size: number) =>
      render(
        <BadgeHex
          Icon={Trophy}
          tier="gold"
          earned
          size={size}
          imageSrc="/badges/x.svg"
        />
      ).container;
    expect(at(95).querySelector(".badge-art-glow")).toBeNull();
    cleanup();
    expect(at(96).querySelector(".badge-art-glow")).not.toBeNull();
  });

  it("finds every class it sets in the stylesheet", () => {
    // A renamed class would show grey badges at full strength, silently.
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/components.css"),
      "utf8"
    );
    for (const selector of [
      ".badge-art-locked {",
      ".dark .badge-art-locked {",
      ".badge-art-greyed {",
      ".badge-art-glow {",
      ".dark .badge-art-glow {",
    ]) {
      expect(css).toContain(selector);
    }
    expect(css).toContain("var(--badge-glow-size) var(--badge-glow)");
  });

  it("SVG fallback (no art) does not use the artwork classes", () => {
    const { container } = render(
      <BadgeHex Icon={Trophy} tier="silver" earned={false} />
    );
    expect(container.querySelector(".badge-art-locked")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
