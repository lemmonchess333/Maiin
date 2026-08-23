import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Skeleton } from "../LoadingSkeleton";

/**
 * The skeleton's shimmer has to flip with the theme, and this is checkable
 * arithmetic rather than a matter of taste.
 *
 * `LoadingSkeleton` hardcoded `rgba(255,255,255,0.04)` as its sweep. That
 * is correct on the dark canvas it was written against and inert on the
 * light one: the skeleton sits on `bg-muted`, which in light mode is
 * hsl(240 6% 97.5%) = rgb(248,248,249), and 4% white over that composites
 * to rgb(248,248,249) — the same bytes. Not "subtle". Absent. Every
 * light-mode loading state in the app had only the `pulse` opacity and no
 * sweep at all, and no capture frame could ever have shown it, because
 * skeletons are transient by definition.
 *
 * Black at the same alpha moves it by 10, against the 9 the dark sweep
 * gets — so a theme-flipped token gives both modes the same perceptual
 * weight. `--food-photo-ring-bed` is the same pattern, already in the
 * stylesheet, for the same reason.
 *
 * The composite arithmetic is asserted here rather than described, because
 * the entire argument for the change is that one of those numbers is zero.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const css = readFileSync(resolve(repoRoot, "src/index.css"), "utf8");

/** The value of a custom property inside a given selector block. */
function tokenIn(selector: string, name: string): string | null {
  const block = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\{([\\s\\S]*?)\\n\\}`
  ).exec(css)?.[1];
  if (!block) return null;
  return new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim() ?? null;
}

/** sRGB bytes of an hsl() triple, as the browser composites it. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [r, g, b].map((v) => Math.round((v + m) * 255)) as [
    number,
    number,
    number,
  ];
}

function composite(
  base: [number, number, number],
  overlay: [number, number, number],
  alpha: number
): [number, number, number] {
  return base.map((v, i) =>
    Math.round(alpha * overlay[i] + (1 - alpha) * v)
  ) as [number, number, number];
}

/** `--muted` as declared for a theme, resolved to bytes. */
function mutedBytes(selector: string): [number, number, number] {
  const raw = tokenIn(selector, "--muted");
  expect(raw, `no --muted in ${selector}`).not.toBeNull();
  const [h, s, l] = raw!
    .split(/\s+/)
    .map((t) => Number.parseFloat(t.replace("%", "")));
  return hslToRgb(h, s, l);
}

describe("skeleton shimmer — theme flip", () => {
  it("declares the token in both themes, with opposite polarity", () => {
    const light = tokenIn(":root", "--skeleton-shimmer");
    const dark = tokenIn(".dark", "--skeleton-shimmer");
    expect(light, "no --skeleton-shimmer in :root").not.toBeNull();
    expect(dark, "no --skeleton-shimmer in .dark").not.toBeNull();
    expect(light).not.toBe(dark);
    // Light darkens, dark lightens. Either declaration flipping makes the
    // sweep vanish on that theme, which is the bug this replaced.
    expect(light).toMatch(/rgba\(\s*0,\s*0,\s*0/);
    expect(dark).toMatch(/rgba\(\s*255,\s*255,\s*255/);
  });

  it("both sweeps actually move the pixel — the SHIPPED token, not a stand-in", () => {
    /* Composites the token's real declared value, not a hardcoded overlay.
       An earlier draft of this test passed [0,0,0] and [255,255,255] in
       directly, which proved the CONCEPT while leaving the shipped values
       unchecked — flipping the light token back to white failed only the
       polarity assertion, and this one stayed green over the exact bug it
       exists to catch. */
    for (const selector of [":root", ".dark"] as const) {
      const raw = tokenIn(selector, "--skeleton-shimmer");
      expect(raw, `no --skeleton-shimmer in ${selector}`).not.toBeNull();
      const parts = raw!
        .replace(/rgba?\(|\)/g, "")
        .split(",")
        .map((t) => Number.parseFloat(t));
      const overlay: [number, number, number] = [parts[0], parts[1], parts[2]];
      const alpha = parts[3] ?? 1;
      const base = mutedBytes(selector);
      const swept = composite(base, overlay, alpha);
      const delta = Math.abs(swept[0] - base[0]);
      expect(
        delta,
        `${selector}: the declared sweep ${raw} moves the surface by ` +
          `${delta} bytes — at 0 it does not render, which is exactly what ` +
          `the hardcoded white literal did on light mode`
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it("the WHITE literal it replaced was inert on light — the proof it was a bug", () => {
    // Stated as a test so the justification cannot rot into folklore.
    const base = mutedBytes(":root");
    const swept = composite(base, [255, 255, 255], 0.04);
    expect(swept).toEqual(base);
  });

  it("the component reads the token rather than a literal", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    const image = el.style.backgroundImage;
    expect(image).toContain("var(--skeleton-shimmer)");
    expect(image).not.toMatch(/rgba\(/);
  });
});
