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
