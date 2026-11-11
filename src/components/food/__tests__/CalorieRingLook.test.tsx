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
import { groupText } from "@/test/localeGrouping";

function renderRing({
  consumed = 1000,
  target = 2000,
  mode = "left" as CalorieRingMode,
  drawIn = true,
  size = undefined as "hero" | "compact" | undefined,
} = {}) {
  return render(
    <CalorieRing
      consumed={consumed}
      target={target}
      mode={mode}
      onToggleMode={() => {}}
      trajectoryLabel={null}
      drawIn={drawIn}
      size={size}
    />
  );
}

/**
 * Which way the arc runs (Food11 call 5): it is what is logged, in both
 * modes, and only the number follows the left and logged switch. In
 * "left" the arc used to start full and empty as food was logged, so a
 * day with nothing logged was a fully orange wheel, and 410 kcal left of
 * 2,200 was a wheel 19% full under a week mark 81% full.
 */
describe("CalorieRing — the arc is what is logged, in both modes", () => {
  /** The share of the circle the orange arc covers, 0 to 1. */
  function arcShare(container: HTMLElement) {
    const arc = container.querySelector(
      `circle[stroke="${THEME.semantic.nutrition}"]`
    )!;
    const around = Number(arc.getAttribute("stroke-dasharray"));
    const hidden = Number(arc.getAttribute("stroke-dashoffset"));
    return 1 - hidden / around;
  }

  it.each(["left", "eaten"] as const)(
    "%s: nothing logged is the bare grey track",
    (mode) => {
      const { container } = renderRing({ consumed: 0, mode, drawIn: false });
      expect(arcShare(container)).toBe(0);
    }
  );

  it.each(["left", "eaten"] as const)(
    "%s: 1,790 of 2,200 is a wheel 81% full",
    (mode) => {
      const { container } = renderRing({
        consumed: 1790,
        target: 2200,
        mode,
        drawIn: false,
      });
      expect(arcShare(container)).toBeCloseTo(0.8136, 3);
    }
  );

  it.each(["left", "eaten"] as const)(
    "%s: the target reached is a full wheel",
    (mode) => {
      const { container } = renderRing({
        consumed: 2000,
        mode,
        drawIn: false,
      });
      expect(arcShare(container)).toBe(1);
    }
  );

  it("LEFT mode still counts the number down while the arc fills", () => {
    renderRing({ consumed: 1790, target: 2200, drawIn: false });
    expect(
      screen.getByText(/^kcal left of/).previousElementSibling
    ).toHaveTextContent(/^410$/);
  });
});

describe("CalorieRing — the label is plain text", () => {
  it("reads 'kcal left of 2,000' as grey text, with no tag behind it", () => {
    renderRing();
    const label = screen.getByText(`kcal left of ${groupText(2000)}`);
    expect(label.tagName).toBe("P");
    expect(label.className).toContain("text-muted-foreground");
    expect(label.className).not.toMatch(/\bbg-|rounded-full/);
    expect(label.style.backgroundColor).toBe("");
  });

  it("reads 'kcal logged of' in the other view, not 'eaten'", () => {
    renderRing({ mode: "eaten" });
    expect(
      screen.getByText(`kcal logged of ${groupText(2000)}`)
    ).toBeInTheDocument();
    expect(screen.queryByText(/eaten/)).toBeNull();
  });

  it("reads 'kcal over 2,000' past the target", () => {
    renderRing({ consumed: 2300 });
    expect(
      screen.getByText(`kcal over ${groupText(2000)}`)
    ).toBeInTheDocument();
  });

  it("says 'logged' to a screen reader too", () => {
    renderRing({ mode: "eaten" });
    const ring = screen.getByRole("button");
    expect(ring).toHaveAccessibleName(/^1000 of 2000 calories logged\./);
    expect(ring.getAttribute("aria-label")).not.toMatch(/eaten|consumed/);
  });
});

/**
 * Food11 call 2, from the research. The number on Food's wheel has both
 * ends of its range beside it (5 of the 6 food apps with a ring print the
 * goal by the number; Apple's gauge rule asks for the value and both
 * ends), and a small mark says the wheel can be tapped (the two apps that
 * switch on a tap both mark it).
 *
 * The mark partly undoes a DS3 call: the quiet ring took a swap arrow off
 * the label along with the orange tag it sat in. This one is 13px, grey,
 * after plain words, on Food's wheel only.
 */
describe("CalorieRing — Food's wheel carries its target and a tap mark", () => {
  it("is the default size, 264px, with the label at 14px", () => {
    renderRing();
    expect(screen.getByRole("button")).toHaveClass("w-[264px]", "max-w-full");
    expect(screen.getByText(/^kcal left of/)).toHaveClass("text-sm");
  });

  it("marks the label with a small grey up-and-down mark", () => {
    renderRing();
    const label = screen.getByText(/^kcal left of/);
    const mark = label.querySelector("[data-tap-mark]")!;
    expect(mark).toBeTruthy();
    expect(mark).toHaveAttribute("aria-hidden", "true");
    // In the line and sized from the text: 13px at the label's 14, and
    // beside the last word when the label wraps at larger text.
    expect(mark).toHaveClass("inline-block", "size-[0.93em]");
    expect(label.lastElementChild).toBe(mark);
    // Grey with the words, not the orange: it inherits the label's colour.
    expect(mark.getAttribute("class")).not.toMatch(
      /text-nutrition|text-primary/
    );
  });

  it("lets the label wrap inside the ring at larger text", () => {
    renderRing();
    expect(screen.getByText(/^kcal left of/)).toHaveClass(
      "text-balance",
      "text-center",
      "max-w-[72cqw]"
    );
  });

  it("the compact wheel keeps the short label and has no mark", () => {
    // Home's wheel is 104px: the target does not fit inside it.
    const { container } = renderRing({ size: "compact" });
    expect(screen.getByText("kcal left")).toBeInTheDocument();
    expect(container.querySelector("[data-tap-mark]")).toBeNull();
    expect(container.querySelector("p svg")).toBeNull();
  });
});

/**
 * The second lap's head (Food11 call 2). The lap past the target is the
 * first lap's hue a step deeper, so where its head lies on the first lap
 * a sliver of the surface's colour keeps the two apart.
 */
describe("CalorieRing — the second lap's head stands clear of the first lap", () => {
  const gap = (container: HTMLElement) =>
    container.querySelector<SVGCircleElement>("[data-lap-gap]");

  it("draws no sliver on a day at or under its target", () => {
    expect(gap(renderRing({ consumed: 1790 }).container)).toBeNull();
    expect(gap(renderRing({ consumed: 2000 }).container)).toBeNull();
  });

  it("sets a dot of the ring's own width just ahead of the lap's head", () => {
    const { container } = renderRing({
      consumed: 2600,
      target: 2000,
      drawIn: false,
    });
    const dot = gap(container)!;
    const lap = container.querySelector(
      `circle[stroke="${THEME.calorieRing.deep}"]`
    )!;
    // Under the lap, so only its leading edge shows.
    expect(
      dot.compareDocumentPosition(lap) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // No wider than the ring: the box would clip it flat.
    expect(dot.getAttribute("stroke-width")).toBe(
      lap.getAttribute("stroke-width")
    );
    expect(dot.getAttribute("stroke-linecap")).toBe("round");
    // 600 over 2,000: the lap is 30% of the way round, the dot 2.5 on.
    const around = Number(lap.getAttribute("stroke-dasharray"));
    const lapLength = around - Number(lap.getAttribute("stroke-dashoffset"));
    expect(lapLength / around).toBeCloseTo(0.3, 5);
    expect(-Number(dot.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      lapLength + 2.5,
      5
    );
  });

  it("is the colour of what the wheel stands on", () => {
    const page = gap(renderRing({ consumed: 2600 }).container)!;
    expect(page.style.stroke).toBe("hsl(var(--background))");
    const onCard = gap(
      renderRing({ consumed: 2600, size: "compact" }).container
    )!;
    expect(onCard.style.stroke).toBe("hsl(var(--card))");
  });
});

describe("CalorieRing — the number is the text colour", () => {
  function number(container: HTMLElement) {
    // The ring's centre number is a stand-alone figure: `font-figure`.
    return container.querySelector<HTMLElement>("p.font-figure")!;
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
