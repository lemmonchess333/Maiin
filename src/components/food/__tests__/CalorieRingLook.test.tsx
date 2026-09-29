/**
 * The calorie ring's look: the quiet ring (owner call; DS3's STATUS lines).
 *
 * One colour does one job. The arc is the food orange and nothing else on
 * the ring is: the number is the text colour, as the macro tiles' numbers
 * are; the label under it is plain grey text, not a tag; the track is a
 * grey groove; and nothing loops behind it. It was an orange number over
 * an orange tag with a swap arrow, a gradient arc, a shadowed track and a
 * slow pulsing glow, which read as decoration rather than a reading.
 *
 * Home's food card and the Food page draw this one component, so these
 * pins hold both screens.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
/* Motion ON: an ambient loop behind the ring renders only when motion is
   allowed, so the no-loop pin below is only a pin with it on. */
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

import CalorieRing, { type CalorieRingMode } from "../CalorieRing";
import { THEME } from "@/lib/theme";

function renderRing({
  consumed = 1000,
  target = 2000,
  mode = "left" as CalorieRingMode,
} = {}) {
  return render(
    <CalorieRing
      consumed={consumed}
      target={target}
      mode={mode}
      onToggleMode={() => {}}
      trajectoryLabel={null}
    />
  );
}

describe("CalorieRing — the label is plain text", () => {
  it("reads 'kcal left' as grey text, with no tag behind it", () => {
    renderRing();
    const label = screen.getByText("kcal left");
    expect(label.className).toContain("text-muted-foreground");
    expect(label.className).not.toMatch(/\bbg-|rounded-full/);
    expect(label.style.backgroundColor).toBe("");
    // No swap arrow beside the word: the whole ring is the tap target.
    expect(label.querySelector("svg")).toBeNull();
  });

  it("reads 'kcal logged' in the other view, not 'eaten'", () => {
    renderRing({ mode: "eaten" });
    expect(screen.getByText("kcal logged")).toBeInTheDocument();
    expect(screen.queryByText(/eaten/)).toBeNull();
  });

  it("reads 'kcal over' past the target", () => {
    renderRing({ consumed: 2300 });
    expect(screen.getByText("kcal over")).toBeInTheDocument();
  });

  it("says 'logged' to a screen reader too", () => {
    renderRing({ mode: "eaten" });
    const ring = screen.getByRole("button");
    expect(ring).toHaveAccessibleName(/^1000 of 2000 calories logged\./);
    expect(ring.getAttribute("aria-label")).not.toMatch(/eaten|consumed/);
  });
});

describe("CalorieRing — the number is the text colour", () => {
  function number(container: HTMLElement) {
    return container.querySelector<HTMLElement>("p.font-mono")!;
  }

  it("draws the number in the foreground colour, not the orange", () => {
    const { container } = renderRing();
    expect(number(container).className).toContain("text-foreground");
    expect(number(container).style.color).toBe("");
  });

  it("renders 0 at full strength, like any other value", () => {
    const { container } = renderRing({ consumed: 0, mode: "eaten" });
    const o = number(container).style.opacity;
    expect(o === "" || Number(o) >= 1).toBe(true);
  });
});

describe("CalorieRing — one orange arc on a grey groove", () => {
  it("draws the arc in the food orange, solid, with no gradient", () => {
    const { container } = renderRing();
    const strokes = Array.from(container.querySelectorAll("circle")).map((c) =>
      c.getAttribute("stroke")
    );
    expect(strokes).toContain(THEME.semantic.nutrition);
    expect(strokes).not.toContain(THEME.brand);
    expect(
      container.querySelector("linearGradient, radialGradient")
    ).toBeNull();
  });

  it("draws the track in the grey token, with no shadow filter", () => {
    const { container } = renderRing();
    const track = container.querySelector<SVGCircleElement>("circle")!;
    expect(track.style.stroke).toContain("var(--muted-foreground)");
    expect(container.querySelector("filter")).toBeNull();
    for (const c of Array.from(container.querySelectorAll("circle"))) {
      expect(c.getAttribute("filter")).toBeNull();
    }
  });

  it("draws the lap past the target in the deeper orange", () => {
    const { container } = renderRing({ consumed: 2600 });
    const strokes = Array.from(container.querySelectorAll("circle")).map((c) =>
      c.getAttribute("stroke")
    );
    expect(strokes).toContain(THEME.calorieRing.deep);
  });

  it("has nothing looping behind it", () => {
    const { container } = renderRing();
    expect(
      container.querySelectorAll('[style*="blur"], [style*="radial-gradient"]')
    ).toHaveLength(0);
  });
});

describe("CalorieRing — nothing paints past the viewBox (the clipped-halo regression)", () => {
  /* The ring's outer edge sits EXACTLY at the 160px viewBox edge
     (r + stroke/2 = 80), so anything drawn wider is clipped flat on all
     four sides; on device a wider halo read as a hard outline "cut off
     like it's in a box". Every circle's r + strokeWidth/2 must stay
     inside SIZE/2. */
  it("every circle stays inside the 160px box", () => {
    const { container } = renderRing({ consumed: 2600 });
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
    document.documentElement.classList.remove("dark");
  });
});
