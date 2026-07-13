/**
 * WaterWave — one visibility-paused RAF loop.
 *
 * The old component ran one parent useAnimationFrame plus three per-WavePath
 * callbacks perpetually (even off-screen / hidden). Now a single loop runs
 * only while the card is on-screen, the tab is visible, and motion is allowed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import WaterWave from "../WaterWave";

let reduced = false;
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reduced,
}));

let visibility: DocumentVisibilityState = "visible";
let ioCallback: ((entries: { isIntersecting: boolean }[]) => void) | null =
  null;
let rafScheduled = 0;
let rafCanceled = 0;

beforeEach(() => {
  reduced = false;
  visibility = "visible";
  ioCallback = null;
  rafScheduled = 0;
  rafCanceled = 0;

  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        ioCallback = cb;
      }
      observe() {}
      disconnect() {}
    }
  );

  // rAF that schedules but does NOT auto-run (we only count scheduling), so a
  // "one loop" assertion measures the initial schedule, not a runaway count.
  vi.stubGlobal("requestAnimationFrame", () => {
    rafScheduled += 1;
    return rafScheduled;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    rafCanceled += 1;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("WaterWave", () => {
  it("schedules exactly one RAF loop while active", () => {
    render(<WaterWave fillPercent={50} splash={0} />);
    expect(rafScheduled).toBe(1);
  });

  it("schedules zero frames when the document starts hidden", () => {
    visibility = "hidden";
    render(<WaterWave fillPercent={50} splash={0} />);
    expect(rafScheduled).toBe(0);
  });

  it("cancels the loop when it goes off-screen, and resumes when back", () => {
    render(<WaterWave fillPercent={50} splash={0} />);
    expect(rafScheduled).toBe(1);
    act(() => ioCallback?.([{ isIntersecting: false }]));
    expect(rafCanceled).toBeGreaterThanOrEqual(1);
    const before = rafScheduled;
    act(() => ioCallback?.([{ isIntersecting: true }]));
    expect(rafScheduled).toBe(before + 1);
  });

  it("cancels the loop when the tab is hidden", () => {
    render(<WaterWave fillPercent={50} splash={0} />);
    setVisibility("hidden");
    expect(rafCanceled).toBeGreaterThanOrEqual(1);
  });

  it("cancels the outstanding frame on unmount", () => {
    const { unmount } = render(<WaterWave fillPercent={50} splash={0} />);
    unmount();
    expect(rafCanceled).toBeGreaterThanOrEqual(1);
  });

  it("reduced motion schedules zero frames and renders one static path", () => {
    reduced = true;
    const { container } = render(<WaterWave fillPercent={50} splash={0} />);
    expect(rafScheduled).toBe(0);
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });

  it("gives each instance a distinct gradient id", () => {
    const a = render(<WaterWave fillPercent={50} splash={0} />);
    const b = render(<WaterWave fillPercent={50} splash={0} />);
    const idA = a.container.querySelector("linearGradient")?.id;
    const idB = b.container.querySelector("linearGradient")?.id;
    expect(idA).toBeTruthy();
    expect(idA).not.toBe(idB);
  });
});
