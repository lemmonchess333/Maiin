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

/** Nothing logged yet, "eaten" framing — the centre value is 0. */
function renderZeroRing() {
  return render(
    <CalorieRing
      consumed={0}
      target={2000}
      mode="eaten"
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

describe("CalorieRing centre number — theme-aware colour", () => {
  /* Same split as the chip, applied to the number (the light-mode-photo
     work): brand purple sat at the 3:1 large-text floor against the
     light wash, which forced the wash to stay heavy. The deep step buys
     the headroom that let the wash lighten.

     Asserted on the ZERO ring: AnimatedNumber counts up from 0, so a
     non-zero value isn't in the DOM at assert time — 0 is, immediately. */
  function centreNumberEl() {
    return screen.getByText("0").closest("p") as HTMLElement;
  }

  it("uses the BRAND purple in dark mode", () => {
    document.documentElement.classList.add("dark");
    renderZeroRing();
    expect(centreNumberEl()).toHaveStyle({ color: THEME.brand });
  });

  it("uses the DEEP ring step in light mode", () => {
    renderZeroRing();
    expect(centreNumberEl()).toHaveStyle({ color: THEME.calorieRing.deep });
  });
});

describe("CalorieRing mode chip — light backing is opaque", () => {
  it("uses the flattened-tint solid, not the sheer 10% tint", () => {
    renderRing();
    const el = screen.getByText(/kcal/i).closest("span") as HTMLElement;
    // Translucent tint went under AA over the photo wash (3.06:1 on the
    // busiest shot); the solid renders identically on the plain card.
    expect(el).toHaveStyle({
      backgroundColor: THEME.calorieRing.chipBgLight,
    });
  });
});

describe("CalorieRing centre value — zero is not dimmed", () => {
  /** The centre number is the only .font-mono element in the ring. */
  function centreNumber() {
    return screen.getByText("0").closest("p") as HTMLElement;
  }

  it("renders 0 at full opacity, like any other value", () => {
    renderZeroRing();
    const style = centreNumber().style;
    // Either unset or explicitly "1" — what must NOT happen is a
    // fractional dim. The old 0.4 made the hero's primary number
    // almost invisible over the dark-mode photo.
    expect(style.opacity === "" || style.opacity === "1").toBe(true);
  });

  it("does not special-case zero with a fractional opacity", () => {
    renderZeroRing();
    const o = centreNumber().style.opacity;
    if (o !== "") expect(Number(o)).toBeGreaterThanOrEqual(1);
  });
});

describe("CalorieRing — nothing paints past the viewBox (the clipped-halo regression)", () => {
  /* The SVG halo bed (2026-07-26, #1753/#1774) drew a STROKE+6 ring at
     r=RADIUS. The wheel's outer edge sits EXACTLY at the 160px viewBox
     edge (r + stroke/2 = 80), so the wider halo painted to r=83 and the
     box clipped it flat on all four sides — on device it read as a hard
     black outline "cut off like it's in a box". The halo is removed;
     this pin makes the geometry law explicit: every circle's
     r + strokeWidth/2 must stay inside SIZE/2. */
  it("every circle stays inside the 160px box", () => {
    const { container } = renderRing();
    const circles = Array.from(container.querySelectorAll("circle"));
    expect(circles.length).toBeGreaterThan(0);
    for (const c of circles) {
      const r = Number(c.getAttribute("r") ?? 0);
      const sw = Number(c.getAttribute("stroke-width") ?? 0);
      expect(r + sw / 2).toBeLessThanOrEqual(80);
    }
  });

  it("no dark or light halo under-stroke exists", () => {
    document.documentElement.classList.add("dark");
    const { container } = renderRing();
    for (const c of Array.from(container.querySelectorAll("circle"))) {
      const stroke = c.getAttribute("stroke") ?? "";
      expect(stroke.startsWith("rgba(0, 0, 0")).toBe(false);
      expect(stroke.startsWith("rgba(255, 255, 255")).toBe(false);
    }
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
