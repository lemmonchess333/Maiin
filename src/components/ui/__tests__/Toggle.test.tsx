import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toggle } from "../Toggle";

/**
 * The switch's knob slides when the switch is tapped, and only then: a state
 * that arrives with the page just shows (Pol1). jsdom draws nothing, so the
 * track and knob are given the places a phone draws them, the knob 5px from
 * the track's left edge when off (border and padding) and 20px when on.
 */

const TRACK_LEFT = 100;
let animate: ReturnType<typeof vi.fn>;

function placeTrackAndKnob() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const on =
        this.closest('[role="switch"]')?.getAttribute("aria-checked") ===
        "true";
      const isKnob = this.className.includes("size-[16px]");
      const left = isKnob ? TRACK_LEFT + (on ? 20 : 5) : TRACK_LEFT;
      return {
        left,
        right: left,
        top: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: left,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    }
  );
}

function Switch({ initial = false }: { initial?: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <Toggle checked={on} onChange={() => setOn((v) => !v)} label="Reminders" />
  );
}

beforeEach(() => {
  animate = vi.fn(() => ({ cancel: vi.fn() }));
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value: animate,
  });
  placeTrackAndKnob();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (Element.prototype as Partial<Element>).animate;
});

describe("Toggle's knob", () => {
  it("slides from where it was to its new place when tapped", () => {
    render(<Switch />);
    fireEvent.click(screen.getByRole("switch", { name: "Reminders" }));

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledWith(
      [{ transform: "translateX(-15px)" }, { transform: "none" }],
      { duration: 200, easing: "cubic-bezier(0.77, 0, 0.175, 1)" }
    );
  });

  it("slides back the other way when tapped off", () => {
    render(<Switch initial />);
    fireEvent.click(screen.getByRole("switch", { name: "Reminders" }));

    expect(animate).toHaveBeenCalledWith(
      [{ transform: "translateX(15px)" }, { transform: "none" }],
      expect.anything()
    );
  });

  it("just shows a state that arrives without a tap", () => {
    const { rerender } = render(
      <Toggle checked={false} onChange={() => {}} label="Reminders" />
    );
    rerender(<Toggle checked onChange={() => {}} label="Reminders" />);

    expect(animate).not.toHaveBeenCalled();
  });

  it("does not slide under Reduce Motion", () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...matchMedia(query),
      matches: query.includes("prefers-reduced-motion"),
    })) as typeof window.matchMedia;
    try {
      render(<Switch />);
      fireEvent.click(screen.getByRole("switch", { name: "Reminders" }));
    } finally {
      window.matchMedia = matchMedia;
    }

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(animate).not.toHaveBeenCalled();
  });

  it("just shows a change that comes long after the tap, as one a question held back", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    const { rerender } = render(
      <Toggle checked={false} onChange={() => {}} label="Reminders" />
    );
    fireEvent.click(screen.getByRole("switch", { name: "Reminders" }));
    now.mockReturnValue(2_500);
    rerender(<Toggle checked onChange={() => {}} label="Reminders" />);

    expect(animate).not.toHaveBeenCalled();
  });
});
