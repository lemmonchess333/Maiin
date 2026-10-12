import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Skeleton } from "../LoadingSkeleton";

/**
 * A staggered skeleton block used to start at opacity 0 and fill
 * `forwards` into Tailwind's `pulse`, whose only step is 50%. Under
 * Reduce Motion the global reset plays an animation once, instantly, so
 * the fill held opacity 0: Home and the feed loaded as blank screens for
 * exactly the people who asked for less motion. The block now never
 * hides, and its animation only exists when motion is welcome.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const css = readFileSync(
  resolve(repoRoot, "src/styles/animations.css"),
  "utf8"
).replace(/\/\*[\s\S]*?\*\//g, "");

describe("Skeleton — never hidden, motion only when welcome", () => {
  it("a staggered block carries no opacity, fill mode or inline animation", () => {
    const { container } = render(<Skeleton stagger={3} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.opacity).toBe("");
    expect(el.style.animationFillMode).toBe("");
    expect(el.style.animation).toBe("");
    expect(el.style.animationDelay).toBe("240ms");
    expect(el.classList.contains("ds-skeleton")).toBe(true);
  });

  it("the skeleton animation is declared once, inside a no-preference query", () => {
    expect(css.match(/\.ds-skeleton\b/g)).toHaveLength(1);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.ds-skeleton\s*\{[^}]*ds-skeleton-pulse[^}]*shimmer 1\.5s linear infinite/
    );
  });
});
