/**
 * ScanDemo's motion rules, read off what each animated layer is actually
 * handed rather than off the source text.
 *
 * - One clock: every layer loops on the same 12-second LOOP, so the
 *   surface has one ambient loop and the beats stay in step.
 * - Only opacity and transform animate (the WKWebView-safe recipe).
 * - Opacity runs linear. The browser runs opacity animations natively,
 *   and there a single ease bends the whole loop's timeline instead of
 *   each step: an ease-out on the shutter flash fired it about 0.7 s
 *   before the reading beat it belongs to. Measured on a recording, and
 *   invisible in a unit test's DOM, so the rule is pinned where the
 *   props are set.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement, forwardRef, type Ref } from "react";

type Recorded = {
  animate: Record<string, unknown>;
  transition: Record<string, unknown> | undefined;
};
const recorded: Recorded[] = [];

/* motion.* components that record what they are asked to animate and
   render a plain element. Motion-only props are dropped so React does not
   see them as DOM attributes. */
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  const MOTION_ONLY = [
    "animate",
    "transition",
    "initial",
    "exit",
    "layout",
    "layoutDependency",
    "whileTap",
    "whileHover",
  ];
  const cache = new Map<string, unknown>();
  const make = (tag: string) => {
    if (!cache.has(tag)) {
      cache.set(
        tag,
        forwardRef(function Recorder(
          props: Record<string, unknown>,
          ref: Ref<unknown>
        ) {
          if (props.animate && typeof props.animate === "object") {
            recorded.push({
              animate: props.animate as Record<string, unknown>,
              transition: props.transition as
                Record<string, unknown> | undefined,
            });
          }
          const rest = Object.fromEntries(
            Object.entries(props).filter(([k]) => !MOTION_ONLY.includes(k))
          );
          return createElement(tag, { ...rest, ref });
        })
      );
    }
    return cache.get(tag);
  };
  return {
    ...actual,
    motion: new Proxy({}, { get: (_t, tag: string) => make(tag) }),
  };
});

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: vi.fn(() => false),
}));

/* The Food page inside the phone draws the app's own wheel and macros,
   which carry their own one-off motion for a real log. These rules are
   about the demo's loop, so the two are left out of it; they say what
   they were asked to draw, which is how the page's tests read them. */
vi.mock("@/components/food/CalorieRing", () => ({
  default: (props: { consumed: number; target: number; size?: string }) => (
    <span
      data-wheel=""
      data-size={props.size ?? "hero"}
      data-consumed={props.consumed}
      data-target={props.target}
    />
  ),
}));
vi.mock("@/components/food/MacroColumn", () => ({
  default: (props: { macroKey: string; size?: string }) => (
    <span data-macro={props.macroKey} data-size={props.size ?? "tile"} />
  ),
}));

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { FLIGHT_MS, FLIGHT_WHEEL_HOLD_MS } from "@/lib/foodFlight";
import ScanDemo from "../ScanDemo";

/** The transition that governs one animated key. */
function transitionFor(r: Recorded, key: string): Record<string, unknown> {
  const t = r.transition ?? {};
  const own = t[key];
  return own && typeof own === "object" ? (own as Record<string, unknown>) : t;
}

beforeEach(() => {
  recorded.length = 0;
  vi.mocked(useReducedMotion).mockReturnValue(false);
});
afterEach(cleanup);

describe("ScanDemo motion", () => {
  it("animates its layers when motion is allowed", () => {
    render(<ScanDemo />);
    // The phone, the camera's pan, shutter, flash, reading overlay, laser
    // and stage lines, the sheet with its tap and Saved, the page's
    // scroll, and each thing the meal changes on the page.
    expect(recorded.length).toBeGreaterThanOrEqual(20);
  });

  it("runs every layer on one clock: the same 12-second infinite loop", () => {
    render(<ScanDemo />);
    for (const r of recorded) {
      for (const key of Object.keys(r.animate)) {
        const t = transitionFor(r, key);
        expect(t.duration, key).toBe(12);
        expect(t.repeat, key).toBe(Infinity);
      }
    }
  });

  it("animates only opacity and transform", () => {
    render(<ScanDemo />);
    for (const r of recorded) {
      for (const key of Object.keys(r.animate)) {
        expect(["opacity", "x", "y", "scale"]).toContain(key);
      }
    }
  });

  it("runs every opacity track linear, so no ease can bend the loop's timeline", () => {
    render(<ScanDemo />);
    const opacityTracks = recorded.filter((r) => "opacity" in r.animate);
    expect(opacityTracks.length).toBeGreaterThanOrEqual(8);
    for (const r of opacityTracks) {
      expect(transitionFor(r, "opacity").ease).toBe("linear");
    }
  });

  it("keyframes and their times line up on every track", () => {
    render(<ScanDemo />);
    for (const r of recorded) {
      for (const [key, values] of Object.entries(r.animate)) {
        const times = transitionFor(r, key).times as number[] | undefined;
        expect(Array.isArray(values), key).toBe(true);
        expect(times?.length, key).toBe((values as unknown[]).length);
        expect(times?.[0], key).toBe(0);
        expect(times?.[times.length - 1], key).toBe(1);
      }
    }
  });

  it("under reduced motion, nothing animates", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    render(<ScanDemo />);
    expect(recorded).toHaveLength(0);
  });
});

/**
 * The Food page inside the phone is the page the app draws. It showed
 * the page as it was before Food11 (a title, a ring a day, the wheel in
 * a card, three macro tiles, four meal buttons and a filled camera
 * square) for as long as nothing here said what it has to match.
 */
describe("ScanDemo's Food page", () => {
  function foodPage(): HTMLElement {
    const { container } = render(<ScanDemo />);
    const page = container.querySelector<HTMLElement>('[data-screen="food"]');
    if (!page) throw new Error("the demo draws no Food page");
    return page;
  }

  it("has no page title: the day leads the header row", () => {
    const page = foodPage();
    expect(page.querySelector(".text-h1")).toBeNull();
    expect(page).toHaveTextContent("Today");
    expect(page).toHaveTextContent("Thu 15 Jan");
  });

  it("draws the page's own wheel, on the page, before the meal and after it", () => {
    const page = foodPage();
    const wheels = [...page.querySelectorAll<HTMLElement>("[data-wheel]")];
    expect(wheels.map((w) => w.dataset.size)).toEqual(["hero", "hero"]);
    expect(wheels.map((w) => Number(w.dataset.consumed))).toEqual([
      1412,
      1412 + 720,
    ]);
    // On the page, not in a card.
    for (const wheel of wheels) {
      expect(wheel.closest(".card-shadow, .bg-card")).toBeNull();
    }
    expect(page).toHaveTextContent("Details");
  });

  it("draws the week as the page's strip of bars, today the day in view", () => {
    const page = foodPage();
    const strips = [
      ...page.querySelectorAll<HTMLElement>(
        '[role="group"][aria-label^="Week of"]'
      ),
    ];
    expect(strips).toHaveLength(2);
    const todayFill = strips.map((strip) => {
      const bars = [...strip.querySelectorAll<HTMLElement>("[data-week-bar]")];
      expect(bars).toHaveLength(7);
      const selected = bars.findIndex((bar) => bar.dataset.selected);
      // Thursday, the fourth day of a week that starts on Monday.
      expect(selected).toBe(3);
      const fill =
        bars[selected].querySelector<HTMLElement>("[data-week-fill]");
      return parseFloat(fill?.style.width ?? "");
    });
    // The meal moves today's bar.
    expect(todayFill[1]).toBeGreaterThan(todayFill[0]);
  });

  it("draws the macros as one row with no boxes", () => {
    const page = foodPage();
    const macros = [...page.querySelectorAll<HTMLElement>("[data-macro]")];
    expect(macros.map((m) => m.dataset.macro)).toEqual([
      "protein",
      "carbs",
      "fat",
      "protein",
      "carbs",
      "fat",
    ]);
    for (const macro of macros) {
      expect(macro.dataset.size).toBe("row");
      expect(macro.closest(".card-shadow, .bg-card")).toBeNull();
    }
  });

  it("names the meal once, on a chip in the field, with the camera inside it", () => {
    const page = foodPage();
    const box = page.querySelector(".ds-input-box");
    const field = box?.parentElement;
    if (!field) throw new Error("the demo's Food page has no field");
    expect(field).toHaveTextContent("Dinner");
    expect(field).toHaveTextContent("Describe a meal");
    const camera = field.querySelector(".lucide-camera");
    expect(camera).not.toBeNull();
    expect(camera?.parentElement?.className).toContain("text-nutrition-strong");
    // No filled orange control, and no row of four meals above the field.
    expect(page.querySelector('[class*="bg-nutrition-fill"]')).toBeNull();
    expect(page).not.toHaveTextContent("Breakfast");
  });

  it("flies the food to the wheel, and the page takes the meal as the page's own does", () => {
    render(<ScanDemo />);
    const flight = recorded.find(
      (r) => "x" in r.animate && "scale" in r.animate && "opacity" in r.animate
    );
    if (!flight) throw new Error("no flight in the demo");
    const moveTimes = transitionFor(flight, "x").times as number[];
    const [, takeOff, landing] = moveTimes;
    expect((landing - takeOff) * 12 * 1000).toBeCloseTo(FLIGHT_MS, 6);
    // It ends where it is placed, smaller, having come from the field
    // below the wheel.
    expect((flight.animate.x as number[]).at(-1)).toBe(0);
    expect((flight.animate.y as number[]).at(-1)).toBe(0);
    expect((flight.animate.y as number[])[0]).toBeGreaterThan(0);
    expect((flight.animate.scale as number[]).at(-1)).toBe(0.45);
    // What the meal changes comes in together, the wheel's hold after
    // take-off: the wheel, the week, the macros, the log's count and
    // the new row.
    const counted = recorded.filter((r) => {
      const opacity = r.animate.opacity as number[] | undefined;
      const times = transitionFor(r, "opacity").times as number[] | undefined;
      return (
        opacity?.join() === "0,0,1,1" &&
        times !== undefined &&
        Math.abs((times[1] - takeOff) * 12 * 1000 - FLIGHT_WHEEL_HOLD_MS) < 1e-6
      );
    });
    expect(counted.length).toBeGreaterThanOrEqual(5);
  });

  it("under reduced motion, shows the page before the meal and no flight", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const page = foodPage();
    const wheels = [...page.querySelectorAll<HTMLElement>("[data-wheel]")];
    expect(wheels.map((w) => Number(w.dataset.consumed))).toEqual([1412]);
    expect(page.querySelector('[data-beat="logged"]')).toBeNull();
    expect(page.querySelectorAll("img")).toHaveLength(0);
  });
});
