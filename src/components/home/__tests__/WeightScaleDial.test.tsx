import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WeightScaleDial from "../WeightScaleDial";
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

let clock = 0;
let serial = 0;
let frames: Map<number, FrameRequestCallback>;
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "touch";
    this.isPrimary = init.isPrimary ?? true;
  }
}
beforeEach(() => {
  clock = 0;
  frames = new Map();
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: true,
  } as MediaQueryList);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++serial, callback);
    return serial;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function surface() {
  const element = screen.getByRole("slider").parentElement!;
  Object.assign(element, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  return element;
}
function swipe(element: HTMLElement, toX: number) {
  fireEvent.pointerDown(element, { clientX: 180, pointerId: 1 });
  clock += 20;
  fireEvent.pointerMove(element, { clientX: toX, pointerId: 1 });
  fireEvent.pointerUp(element, { clientX: toX, pointerId: 1 });
}
describe("physical weight scale", () => {
  it("moves larger markings to the pointer on a left swipe and stops immediately with reduced motion", () => {
    const change = vi.fn();
    render(
      <WeightScaleDial
        value={81.6}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={change}
      />
    );
    swipe(surface(), 80);
    expect(change).toHaveBeenLastCalledWith(82.6);
    expect(frames.size).toBe(0);
  });
  it("clamps a swipe at both weight limits", () => {
    const change = vi.fn();
    render(
      <WeightScaleDial
        value={81.6}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={change}
      />
    );
    const element = surface();
    swipe(element, -100000);
    expect(change).toHaveBeenLastCalledWith(350);
    swipe(element, 100000);
    expect(change).toHaveBeenLastCalledWith(20);
  });
  it("a fast release coasts, but typing a new value interrupts it", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: false,
    } as MediaQueryList);
    const change = vi.fn();
    const { rerender } = render(
      <WeightScaleDial
        value={81.6}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={change}
      />
    );
    swipe(surface(), 80);
    expect(frames.size).toBe(1);
    act(() => {
      const [id, callback] = [...frames][0];
      frames.delete(id);
      clock += 16;
      callback(clock);
    });
    expect(change.mock.lastCall![0]).toBeGreaterThan(82.6);
    rerender(
      <WeightScaleDial
        value={70}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={change}
      />
    );
    expect(frames.size).toBe(0);
    expect(screen.getByRole("slider")).toHaveValue("70");
  });
  it("does not coast after a cancelled gesture or continue after unmount", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: false,
    } as MediaQueryList);
    const { unmount } = render(
      <WeightScaleDial
        value={81.6}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={vi.fn()}
      />
    );
    const element = surface();
    fireEvent.pointerDown(element, { clientX: 180 });
    fireEvent.pointerMove(element, { clientX: 80 });
    fireEvent.pointerCancel(element);
    expect(frames.size).toBe(0);
    swipe(element, 80);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });
  it("exposes stone and pounds to assistive technology and ignores disabled drags", () => {
    const change = vi.fn();
    render(
      <WeightScaleDial
        value={175}
        minimum={44.1}
        maximum={771.6}
        unit="st"
        disabled
        onChange={change}
      />
    );
    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      "12 st 7 lb"
    );
    swipe(surface(), 80);
    expect(change).not.toHaveBeenCalled();
  });
});

describe("an attempted scroll is not a weigh-in", () => {
  /* The drum sits inside the sheet's own `overflow-y-auto`. Before the
     axis gate the surface was `touch-none` across a full-width band, so
     a vertical swipe that landed on it could not scroll AND the move
     handler took `(startX - clientX)` with no threshold — about 5px of
     sideways drift in that failed scroll crossed a detent and emitted a
     new weight. 0.1-0.3 kg is exactly the magnitude that reads as a
     plausible weigh-in, so it would survive the confirmation step and
     land in the logs. */
  const vertical = (element: HTMLElement, driftX: number) => {
    fireEvent.pointerDown(element, {
      clientX: 180,
      clientY: 40,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
    });
    clock += 20;
    fireEvent.pointerMove(element, {
      clientX: 180 - driftX,
      clientY: 140,
      pointerId: 1,
      pointerType: "touch",
    });
    fireEvent.pointerUp(element, {
      clientX: 180 - driftX,
      clientY: 140,
      pointerId: 1,
      pointerType: "touch",
    });
  };

  it("ignores sideways drift inside a vertical swipe", () => {
    const change = vi.fn();
    render(
      <WeightScaleDial
        value={81.6}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={change}
      />
    );
    vertical(surface(), 5);
    expect(change).not.toHaveBeenCalled();
  });

  it("still commits once the gesture is clearly horizontal", () => {
    /* The counterweight: a gate that refused everything would pass the
       test above while breaking the control. 100px right-to-left from
       the origin is one whole kg at 10px per detent. */
    const change = vi.fn();
    render(
      <WeightScaleDial
        value={81.6}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={change}
      />
    );
    const element = surface();
    fireEvent.pointerDown(element, {
      clientX: 180,
      clientY: 40,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
    });
    clock += 20;
    fireEvent.pointerMove(element, {
      clientX: 80,
      clientY: 42,
      pointerId: 1,
      pointerType: "touch",
    });
    fireEvent.pointerUp(element, {
      clientX: 80,
      clientY: 42,
      pointerId: 1,
      pointerType: "touch",
    });
    expect(change).toHaveBeenLastCalledWith(82.6);
  });

  it("counts the travel before the gesture committed", () => {
    /* The commit threshold is a decision about the gesture, not a
       deadzone in the value. Applying from the last sample instead of
       the origin would silently drop the first 6px of every drag. */
    const change = vi.fn();
    render(
      <WeightScaleDial
        value={81.6}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={change}
      />
    );
    const element = surface();
    fireEvent.pointerDown(element, {
      clientX: 180,
      clientY: 40,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
    });
    clock += 20;
    // Two moves that together travel 100px, the first below the threshold.
    fireEvent.pointerMove(element, {
      clientX: 176,
      clientY: 40,
      pointerId: 1,
      pointerType: "touch",
    });
    clock += 20;
    fireEvent.pointerMove(element, {
      clientX: 80,
      clientY: 40,
      pointerId: 1,
      pointerType: "touch",
    });
    fireEvent.pointerUp(element, {
      clientX: 80,
      clientY: 40,
      pointerId: 1,
      pointerType: "touch",
    });
    expect(change).toHaveBeenLastCalledWith(82.6);
  });

  it("pages by a whole unit, not Chromium's 33 kg", () => {
    const change = vi.fn();
    render(
      <WeightScaleDial
        value={81.6}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={change}
      />
    );
    fireEvent.keyDown(screen.getByRole("slider"), { key: "PageUp" });
    expect(change).toHaveBeenLastCalledWith(82.6);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "PageDown" });
    expect(change).toHaveBeenLastCalledWith(81.6);
  });
});

describe("the markings scale with the container; the type does not", () => {
  /* The SVG has a viewBox and `w-full`, so everything inside it scales
     with the container. That is right for the arc — a drum that did not
     grow with the sheet would not read as physical — and wrong for text:
     with the labels inside the viewBox, `text-micro` rendered at ~11.4px
     on a 375 phone and ~9.6px on a 320 one, under the app's 11px floor.

     The labels therefore live in an HTML layer positioned by percentage
     of the same box. These pin that split, because a future edit that
     moves a label back inside the <svg> for tidiness would silently
     reintroduce the shrink — it looks correct at the width you happen to
     be testing at. */
  it("draws no text inside the scaling viewBox", () => {
    const { container } = render(
      <WeightScaleDial
        value={81.6}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={vi.fn()}
      />
    );
    expect(container.querySelectorAll("svg text")).toHaveLength(0);
    expect(container.querySelectorAll("svg tspan")).toHaveLength(0);
  });

  it("still labels the majors, at a real CSS size, outside the svg", () => {
    /* The counterweight: an empty label layer would pass the test above
       and leave an unreadable drum. */
    const { container } = render(
      <WeightScaleDial
        value={81.6}
        minimum={20}
        maximum={350}
        unit="kg"
        onChange={vi.fn()}
      />
    );
    const labels = Array.from(
      container.querySelectorAll("span.text-micro")
    ) as HTMLElement[];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.closest("svg"), "a label is inside the svg").toBeNull();
      expect(label).toHaveClass("font-mono", "tabular-nums");
      // Positioned as a percentage of the same 360x128 box the arc uses.
      expect(label.style.left).toMatch(/%$/);
      expect(label.style.top).toMatch(/%$/);
    }
    expect(labels.map((l) => l.textContent)).toContain("82");
  });
});
