/**
 * FoodLogFlight: a logged food's picture rising to the end of the
 * calorie wheel's arc (Food11 call 6). jsdom lays nothing out and has no
 * `Element.animate`, so the wheel and the field are given boxes and the
 * animation is a stub that records what it was asked for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import FoodLogFlight, { type FoodFlight } from "../FoodLogFlight";
import { restoreRealTimers } from "@/test/fakeTimers";

interface StubAnimation {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  cancel: ReturnType<typeof vi.fn>;
}

const originalAnimate = Element.prototype.animate;
let animations: StubAnimation[] = [];

function stubAnimate() {
  Element.prototype.animate = function (
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ) {
    const animation: StubAnimation = {
      keyframes,
      options,
      onfinish: null,
      oncancel: null,
      cancel: vi.fn(),
    };
    animations.push(animation);
    return animation as unknown as Animation;
  } as typeof Element.prototype.animate;
}

function box(el: HTMLElement, rect: Partial<DOMRect>) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 0, height: 0, ...rect }) as DOMRect;
}

/** A 264px wheel at 65,92 and the composer's row at 16,536, as on a
 *  393px phone. */
function page({ wheelTop = 92 } = {}) {
  const wheel = document.createElement("button");
  wheel.setAttribute("data-calorie-wheel", "");
  box(wheel, { left: 65, top: wheelTop, width: 264, height: 264 });
  const field = document.createElement("div");
  field.setAttribute("data-guide-anchor", "food-composer");
  box(field, { left: 16, top: 536, width: 361, height: 48 });
  document.body.append(wheel, field);
}

const flight = (over: Partial<FoodFlight> = {}): FoodFlight => ({
  key: "meal-1",
  src: "/food-art/plate.webp",
  fromCalories: 550,
  target: 2200,
  ...over,
});

beforeEach(() => {
  animations = [];
  vi.useFakeTimers();
  Object.defineProperty(window, "innerHeight", {
    value: 852,
    configurable: true,
  });
});

afterEach(async () => {
  await restoreRealTimers();
  Element.prototype.animate = originalAnimate;
  document.body.innerHTML = "";
});

describe("FoodLogFlight", () => {
  it("draws nothing with no flight", () => {
    stubAnimate();
    page();
    render(<FoodLogFlight flight={null} onArrive={vi.fn()} onDone={vi.fn()} />);
    expect(document.querySelector("[data-food-flight]")).toBeNull();
    expect(animations).toHaveLength(0);
  });

  it("lands the picture on the end of the arc and starts it at the field", () => {
    stubAnimate();
    page();
    render(
      <FoodLogFlight flight={flight()} onArrive={vi.fn()} onDone={vi.fn()} />
    );
    const picture =
      document.querySelector<HTMLImageElement>("[data-food-flight]")!;
    // A quarter of the target logged: the arc ends at three o'clock,
    // 122.1px right of the wheel's centre at 197,224. The 44px picture
    // is centred on it.
    expect(parseFloat(picture.style.left)).toBeCloseTo(197 + 122.1 - 22, 1);
    expect(parseFloat(picture.style.top)).toBeCloseTo(224 - 22, 1);
    expect(animations).toHaveLength(1);
    const [from, , , to] = animations[0].keyframes;
    // From a third of the way along the field's row, at its middle.
    const dx = 16 + 361 / 3 - (197 + 122.1);
    const dy = 536 + 24 - 224;
    const [, x, y] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
      String(from.transform)
    )!;
    expect(Number(x)).toBeCloseTo(dx, 1);
    expect(Number(y)).toBeCloseTo(dy, 1);
    expect(from.opacity).toBe(0);
    expect(String(to.transform)).toContain("translate(0px, 0px)");
    expect(to.opacity).toBe(0);
  });

  it("is 400 ms of transform and opacity, and nothing else", () => {
    stubAnimate();
    page();
    render(
      <FoodLogFlight flight={flight()} onArrive={vi.fn()} onDone={vi.fn()} />
    );
    expect(animations[0].options.duration).toBe(400);
    for (const frame of animations[0].keyframes) {
      const moved = Object.keys(frame).filter((key) => key !== "offset");
      expect(
        moved.every((key) => key === "transform" || key === "opacity"),
        `a frame animates ${moved.join(", ")}`
      ).toBe(true);
    }
  });

  it("lets the wheel go 250 ms in, and is done when the picture has gone", () => {
    stubAnimate();
    page();
    const onArrive = vi.fn();
    const onDone = vi.fn();
    render(
      <FoodLogFlight flight={flight()} onArrive={onArrive} onDone={onDone} />
    );
    vi.advanceTimersByTime(249);
    expect(onArrive).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onArrive).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
    animations[0].onfinish?.();
    expect(onDone).toHaveBeenCalledOnce();
    expect(onArrive).toHaveBeenCalledOnce();
  });

  it("takes no taps and no focus, so it never gets in the way of typing", () => {
    stubAnimate();
    page();
    render(
      <FoodLogFlight flight={flight()} onArrive={vi.fn()} onDone={vi.fn()} />
    );
    const picture = document.querySelector("[data-food-flight]")!;
    expect(picture).toHaveClass("pointer-events-none", "fixed");
    expect(picture).toHaveAttribute("aria-hidden", "true");
    expect(picture).toHaveAttribute("alt", "");
    expect(document.activeElement).toBe(document.body);
  });

  it.each([
    ["scrolled off the top", -300],
    ["below the screen", 900],
  ])("does not fly to a wheel %s: the wheel is let go at once", (_, top) => {
    stubAnimate();
    page({ wheelTop: top });
    const onArrive = vi.fn();
    const onDone = vi.fn();
    render(
      <FoodLogFlight flight={flight()} onArrive={onArrive} onDone={onDone} />
    );
    expect(animations).toHaveLength(0);
    expect(onArrive).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("does not fly where there is no wheel on the page", () => {
    stubAnimate();
    const onDone = vi.fn();
    render(
      <FoodLogFlight flight={flight()} onArrive={vi.fn()} onDone={onDone} />
    );
    expect(animations).toHaveLength(0);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("does not fly where the browser cannot animate an element", () => {
    // jsdom, and any WebView without the Web Animations API.
    Element.prototype.animate =
      undefined as unknown as typeof Element.prototype.animate;
    page();
    const onArrive = vi.fn();
    const onDone = vi.fn();
    render(
      <FoodLogFlight flight={flight()} onArrive={onArrive} onDone={onDone} />
    );
    expect(onArrive).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("a second log takes over: the first stops without ending the second", () => {
    stubAnimate();
    page();
    const onArrive = vi.fn();
    const onDone = vi.fn();
    const { rerender } = render(
      <FoodLogFlight flight={flight()} onArrive={onArrive} onDone={onDone} />
    );
    rerender(
      <FoodLogFlight
        flight={flight({ key: "meal-2", fromCalories: 1100 })}
        onArrive={onArrive}
        onDone={onDone}
      />
    );
    expect(animations).toHaveLength(2);
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    // The first is silent from here on: its end is not the second's.
    expect(animations[0].onfinish).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onArrive).toHaveBeenCalledOnce();
  });

  it("runs on the compositor: no animation-frame loop in its source", () => {
    // WaterWave's lesson: a frame loop for an ornament cost a fifth of
    // the main thread on an idle Home.
    const source = readFileSync(
      join(process.cwd(), "src/components/food/FoodLogFlight.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/requestAnimationFrame|useAnimationFrame/);
    expect(source).toContain(".animate(");
  });
});
