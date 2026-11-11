/**
 * The water's surface and bubbles move on the compositor, not the main
 * thread.
 *
 * Both are Web Animations API animations of transform and opacity: no
 * animation-frame loop, no `d` rewrites, no React render per frame. They
 * pause while the card is off-screen or the app is in the background,
 * resume when it is back, stop on unmount, and do not run at all under
 * Reduce Motion. jsdom has no `Element.animate`, so it is stubbed here to
 * record what was asked of it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import WaterWave from "../WaterWave";
import WaterBubbles from "../WaterBubbles";

let reduced = false;
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reduced,
}));

let visibility: DocumentVisibilityState = "visible";
let ioCallback: ((entries: { isIntersecting: boolean }[]) => void) | null =
  null;
let rafScheduled = 0;

interface FakeAnimation {
  el: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  state: "running" | "paused" | "finished" | "cancelled";
  onfinish: (() => void) | null;
  play: () => void;
  pause: () => void;
  cancel: () => void;
}
let animations: FakeAnimation[] = [];
const originalAnimate = Element.prototype.animate;

beforeEach(() => {
  reduced = false;
  visibility = "visible";
  ioCallback = null;
  rafScheduled = 0;
  animations = [];

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
  vi.stubGlobal("requestAnimationFrame", () => {
    rafScheduled += 1;
    return rafScheduled;
  });

  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ) {
    const animation: FakeAnimation = {
      el: this,
      keyframes,
      options,
      state: "running",
      onfinish: null,
      play() {
        if (this.state !== "cancelled") this.state = "running";
      },
      pause() {
        if (this.state !== "cancelled") this.state = "paused";
      },
      cancel() {
        this.state = "cancelled";
      },
    };
    animations.push(animation);
    return animation as unknown as Animation;
  } as typeof Element.prototype.animate;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Element.prototype.animate = originalAnimate;
});

function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const slides = () =>
  animations.filter((a) => a.options.iterations === Infinity);
const live = (list: FakeAnimation[]) =>
  list.filter((a) => a.state === "running" || a.state === "paused");
/** The browser ends an animation, then tells it so. */
const finish = (animation: FakeAnimation) => {
  animation.state = "finished";
  animation.onfinish?.();
};

describe("WaterWave", () => {
  it("slides two waves on the compositor, with no frame loop", () => {
    render(<WaterWave fillPercent={50} splash={0} />);
    expect(rafScheduled).toBe(0);
    expect(slides()).toHaveLength(2);
    for (const slide of slides()) {
      expect(slide.options.easing).toBe("linear");
      // Only a transform moves.
      expect(
        slide.keyframes.every((k) => Object.keys(k).join() === "transform")
      ).toBe(true);
      expect(slide.state).toBe("running");
    }
    // The two travel at different speeds, so they drift against each other.
    const [a, b] = slides();
    expect(a.options.duration).not.toBe(b.options.duration);
  });

  it("stands the surface up once on arrival and on each new drink", () => {
    const { rerender } = render(<WaterWave fillPercent={50} splash={0} />);
    const splashes = () =>
      animations.filter((a) => a.options.iterations === undefined);
    expect(splashes()).toHaveLength(1);
    expect(String(splashes()[0].keyframes[0].transform)).toMatch(/scaleY/);
    rerender(<WaterWave fillPercent={50} splash={1} />);
    expect(splashes()).toHaveLength(2);
  });

  it("pauses off-screen and resumes when back", () => {
    render(<WaterWave fillPercent={50} splash={0} />);
    act(() => ioCallback?.([{ isIntersecting: false }]));
    expect(slides().every((a) => a.state === "paused")).toBe(true);
    act(() => ioCallback?.([{ isIntersecting: true }]));
    expect(slides().every((a) => a.state === "running")).toBe(true);
  });

  it("pauses while the app is in the background, or opens there", () => {
    render(<WaterWave fillPercent={50} splash={0} />);
    setVisibility("hidden");
    expect(slides().every((a) => a.state === "paused")).toBe(true);
    cleanup();
    animations = [];
    render(<WaterWave fillPercent={50} splash={0} />);
    expect(slides().every((a) => a.state === "paused")).toBe(true);
  });

  it("stops everything on unmount", () => {
    const { unmount } = render(<WaterWave fillPercent={50} splash={0} />);
    unmount();
    expect(live(animations)).toHaveLength(0);
  });

  it("under Reduce Motion is one still path, with nothing animated", () => {
    reduced = true;
    const { container } = render(<WaterWave fillPercent={50} splash={0} />);
    expect(animations).toHaveLength(0);
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

describe("WaterBubbles", () => {
  it("rises three bubbles on the compositor, invisible until they move", () => {
    const { container } = render(<WaterBubbles />);
    expect(rafScheduled).toBe(0);
    expect(container.querySelectorAll("[data-water-bubble]")).toHaveLength(3);
    expect(animations).toHaveLength(3);
    for (const rise of animations) {
      const props = new Set(rise.keyframes.flatMap((k) => Object.keys(k)));
      props.delete("offset");
      expect([...props].sort()).toEqual(["opacity", "transform"]);
      expect(rise.keyframes[0].opacity).toBe(0);
      expect(rise.keyframes.at(-1)?.opacity).toBe(0);
    }
  });

  it("starts each again from a new place when it reaches the top", () => {
    render(<WaterBubbles />);
    const first = animations[0];
    const leftBefore = (first.el as HTMLElement).style.left;
    act(() => finish(first));
    expect(animations).toHaveLength(4);
    expect(animations[3].el).toBe(first.el);
    expect((first.el as HTMLElement).style.left).not.toBe(leftBefore);
  });

  it("pauses off-screen, and a bubble that restarts while paused waits too", () => {
    render(<WaterBubbles />);
    act(() => ioCallback?.([{ isIntersecting: false }]));
    expect(animations.every((a) => a.state === "paused")).toBe(true);
    act(() => finish(animations[1]));
    expect(animations.at(-1)?.state).toBe("paused");
    act(() => ioCallback?.([{ isIntersecting: true }]));
    expect(live(animations).every((a) => a.state === "running")).toBe(true);
  });

  it("stops on unmount without starting another", () => {
    const { unmount } = render(<WaterBubbles />);
    const first = animations[0];
    unmount();
    expect(live(animations)).toHaveLength(0);
    expect(first.onfinish).toBeNull();
  });

  it("draws nothing under Reduce Motion", () => {
    reduced = true;
    const { container } = render(<WaterBubbles />);
    expect(container.firstChild).toBeNull();
    expect(animations).toHaveLength(0);
  });
});
