/**
 * Tests for `AnimatedNumber` — the framer-motion count-up component
 * used for the Home health-score hero, calorie deltas, and other
 * "watch the number tick up" surfaces.
 *
 * The animation runs via framer-motion's `animate(MotionValue, ...)`
 * which is hard to drive deterministically in JSDOM (no real RAF
 * frames). We pin the observable shape instead of the animation
 * timing:
 *
 *   1. Renders a span (motion.span resolves to a span in tests).
 *   2. Reduced-motion users see the final value immediately (no
 *      animation frames needed for the assertion).
 *   3. Custom `format` function is used over the default rounded
 *      toLocaleString formatter.
 *   4. `className` is forwarded to the rendered span.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { AnimatedNumber } from "../AnimatedNumber";
import { group } from "@/test/localeGrouping";

afterEach(() => cleanup());

beforeEach(() => {
  /* AnimatedNumber reads window.matchMedia via useReducedMotion. The
     default jsdom matchMedia (if missing) throws on call — stub a
     no-match implementation that the reduced-motion test will
     selectively override. */
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("AnimatedNumber — render shape", () => {
  it("renders a span element", () => {
    const { container } = render(<AnimatedNumber value={100} />);
    expect(container.querySelector("span")).not.toBeNull();
  });

  it("forwards className to the rendered span", () => {
    const { container } = render(
      <AnimatedNumber value={100} className="text-2xl" />
    );
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-2xl");
  });
});

describe("AnimatedNumber — reduced motion", () => {
  it("shows the final value immediately when reduced-motion is on", async () => {
    /* OS-level prefers-reduced-motion: reduce → useReducedMotion()
       returns true → effect calls count.set(value) directly without
       starting an animation. The display MotionValue therefore lands
       on the final formatted value synchronously. */
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const { container } = render(<AnimatedNumber value={1234} />);
    /* framer-motion's MotionValue → useTransform subscription is
       async on first paint, but with reduced-motion the value is
       set synchronously in the effect. Wait for the next tick. */
    await waitFor(() => {
      expect(container.querySelector("span")?.textContent).toBe(group(1234));
    });
  });
});

describe("AnimatedNumber — the first paint under Reduce Motion", () => {
  it("is the final figure at once, with no frame at zero", () => {
    /* A motion value reaches the screen a frame after it is set, so the
       counter used to paint "0" first even with motion off. Asserted
       straight after render, with nothing awaited: the waitFor above
       would pass either way. */
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const { container } = render(
      <AnimatedNumber value={1234} format={(n) => `${Math.round(n)} kg`} />
    );
    expect(container.querySelector("span")?.textContent).toBe("1234 kg");
  });
});

describe("AnimatedNumber — custom formatter", () => {
  it("uses the format prop instead of the default toLocaleString", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const { container } = render(
      <AnimatedNumber value={75} format={(n) => `${Math.round(n)}%`} />
    );
    await waitFor(() => {
      expect(container.querySelector("span")?.textContent).toBe("75%");
    });
  });
});

describe("AnimatedNumber — fromZero", () => {
  /* Food's hero remounts per day. A remount that counted from zero
     made browsing a week six racing counters per tap. Asserted
     straight after render, with motion on (the setup's matchMedia
     default): the first paint is the figure, not 0. */
  it("false paints the figure on the first frame", () => {
    const { container } = render(
      <AnimatedNumber value={640} fromZero={false} />
    );
    expect(container.querySelector("span")?.textContent).toBe("640");
  });

  it("the default still starts at zero", () => {
    const { container } = render(<AnimatedNumber value={640} />);
    expect(container.querySelector("span")?.textContent).toBe("0");
  });
});
