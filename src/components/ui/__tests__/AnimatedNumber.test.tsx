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
      <AnimatedNumber value={100} className="text-2xl" />,
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
      expect(container.querySelector("span")?.textContent).toBe("1,234");
    });
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
      <AnimatedNumber value={75} format={(n) => `${Math.round(n)}%`} />,
    );
    await waitFor(() => {
      expect(container.querySelector("span")?.textContent).toBe("75%");
    });
  });
});
