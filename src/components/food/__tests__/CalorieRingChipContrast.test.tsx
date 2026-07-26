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

describe("CalorieRing halo bed — the wheel reads on any photo", () => {
  /* Over a busy hero photo the 24%-tint track vanished and the arc
     muddied into the food — which users read as "the ring is hard to
     see" AND "the ring looks off-centre". The halo is a contrasting
     under-stroke painted once beneath the whole wheel (the cartographic
     outline technique): dark bed under the bright arc in dark mode,
     light bed under the deep arc in light mode. */

  function circles() {
    const { container } = renderRing();
    return Array.from(container.querySelectorAll("circle"));
  }

  it("paints a LIGHT halo under the wheel in light mode", () => {
    const halo = circles().find(
      (c) => c.getAttribute("stroke") === THEME.calorieRing.haloLight
    );
    expect(halo).toBeTruthy();
  });

  it("paints a DARK halo under the wheel in dark mode", () => {
    document.documentElement.classList.add("dark");
    const halo = circles().find(
      (c) => c.getAttribute("stroke") === THEME.calorieRing.haloDark
    );
    expect(halo).toBeTruthy();
  });

  it("the halo is wider than the stroke and painted FIRST (underneath)", () => {
    const all = circles();
    const haloIndex = all.findIndex(
      (c) => c.getAttribute("stroke") === THEME.calorieRing.haloLight
    );
    expect(haloIndex).toBe(0); // under everything — track, arc, overshoot
    const halo = all[haloIndex];
    const track = all[haloIndex + 1];
    expect(Number(halo.getAttribute("stroke-width"))).toBeGreaterThan(
      Number(track.getAttribute("stroke-width"))
    );
    expect(halo.getAttribute("fill")).toBe("none");
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
