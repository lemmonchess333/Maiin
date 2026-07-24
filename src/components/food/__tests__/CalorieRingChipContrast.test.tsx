/**
 * CalorieRing mode-chip — theme-aware contrast.
 *
 * The chip ("KCAL LEFT" / "KCAL EATEN") carries the ring's mode. Its deep
 * brand purple is tuned for the lavender tint over a WHITE card, where it
 * clears AA at 11px. On the DARK card that same deep purple lands at
 * ~2.8:1 — under AA — and it all but disappears over the dark-mode hero
 * photo, whose 10% tint is too sheer to give the text a surface.
 *
 * This suite pins the split so a future "simplify the colours" pass can't
 * silently collapse it back to one value: light mode keeps the deep step,
 * dark mode uses the lighter ring step over a stronger backing.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import CalorieRing from "../CalorieRing";
import { THEME } from "@/lib/theme";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

/** Relative luminance + contrast ratio (WCAG 2.1). */
function luminance(r: number, g: number, b: number) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").slice(0, 6);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function contrast(fg: string, bg: string) {
  const a = luminance(...hexToRgb(fg));
  const b = luminance(...hexToRgb(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function renderRing() {
  return render(
    <CalorieRing
      consumed={1000}
      target={2000}
      mode="left"
      onToggleMode={() => {}}
      trajectoryLabel={null}
    />
  );
}

/** The mode chip is the element carrying the unit + mode word. */
function chip() {
  return screen.getByText(/kcal/i).closest("span") as HTMLElement;
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("CalorieRing mode chip — theme-aware colour", () => {
  it("uses the DEEP ring step in light mode", () => {
    renderRing();
    expect(chip()).toHaveStyle({ color: THEME.calorieRing.deep });
  });

  it("uses the LIGHT ring step in dark mode", () => {
    document.documentElement.classList.add("dark");
    renderRing();
    expect(chip()).toHaveStyle({ color: THEME.calorieRing.light });
  });

  it("does not reuse the light-mode deep purple in dark mode", () => {
    document.documentElement.classList.add("dark");
    renderRing();
    // The regression this guards: the chip rendering deep purple on the
    // dark card, which fails AA and is invisible over the hero photo.
    expect(chip()).not.toHaveStyle({ color: THEME.calorieRing.deep });
  });
});

describe("CalorieRing mode chip — contrast maths", () => {
  // Card surfaces: --card is 0 0% 100% (light) and 240 4% 13% (dark).
  const LIGHT_CARD = "#FFFFFF";
  const DARK_CARD = "#202024";

  it("the deep step would FAIL AA on the dark card (why the split exists)", () => {
    expect(contrast(THEME.calorieRing.deep, DARK_CARD)).toBeLessThan(4.5);
  });

  it("the light step clears AA on the dark card", () => {
    expect(contrast(THEME.calorieRing.light, DARK_CARD)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it("the deep step still clears AA on the light card", () => {
    expect(contrast(THEME.calorieRing.deep, LIGHT_CARD)).toBeGreaterThanOrEqual(
      4.5
    );
  });
});
