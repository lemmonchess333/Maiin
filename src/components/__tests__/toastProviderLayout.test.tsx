/**
 * Two-action toasts must keep a readable title at phone width.
 *
 * sonner lays a toast out as one flex row — icon, content, cancel pill,
 * action pill — and ToastProvider gives the pills `flex-shrink: 0`. With
 * two pills on a 393px screen the content was squeezed to its min-content
 * width and the title rendered one character per line (the Food page's
 * "Couldn't search foods." toast, reproduced 2026-09-05). The fix is
 * CSS only: the row wraps, and the content claims a real share of the
 * width. jsdom has no layout engine, so this pins the rules the fix is
 * made of rather than a measured box; the screenshot channel is where the
 * rendered result is checked.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastProvider";

describe("ToastProvider — two-action toast layout", () => {
  it("lets the toast row wrap and gives the content a width floor", () => {
    const { container } = render(<ToastProvider />);
    const css = (container.querySelector("style")?.textContent ?? "")
      // Comments sit between rules and would otherwise ride along with
      // the next selector.
      .replace(/\/\*[\s\S]*?\*\//g, "");
    // Rule blocks for a selector (there are several `[data-sonner-toast]`
    // blocks; the layout one is whichever carries these declarations).
    const blocks = (selector: string) =>
      [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter((m) => m[1].trim() === selector)
        .map((m) => m[2]);
    expect(
      blocks("[data-sonner-toast]").some((b) => /flex-wrap:\s*wrap/.test(b))
    ).toBe(true);
    const content = blocks("[data-sonner-toast] [data-content]");
    expect(content.some((b) => /flex:\s*1 1 60%/.test(b))).toBe(true);
    expect(content.some((b) => /min-width:\s*0/.test(b))).toBe(true);
  });

  /* The × sat on the action button: centred at the right edge with no
     room kept for it, it covered the right of "Undo" on a deleted meal
     and of "Retry" on the failed food search (Food pass, 393px, both
     themes), so a tap there closed the toast. The toast's right padding
     has to hold the whole button. */
  it("keeps the close button in a gutter of its own, at 44px", () => {
    const { container } = render(<ToastProvider />);
    const css = (container.querySelector("style")?.textContent ?? "").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
    const last = (selector: string, property: string) =>
      [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter((m) => m[1].trim() === selector)
        .flatMap((m) => [
          ...m[2].matchAll(
            new RegExp(`(?:^|;)\\s*${property}:\\s*([\\d.]+)px`, "g")
          ),
        ])
        .map((m) => Number(m[1]))
        .at(-1);
    const gutter = last("[data-sonner-toast]", "padding-right");
    const right = last("[data-sonner-toast] [data-close-button]", "right");
    const width = last("[data-sonner-toast] [data-close-button]", "width");
    const height = last("[data-sonner-toast] [data-close-button]", "height");
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
    expect(gutter).toBeGreaterThanOrEqual((right ?? 0) + (width ?? 20));
  });
});
