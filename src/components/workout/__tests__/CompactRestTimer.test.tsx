import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CompactRestTimer from "../CompactRestTimer";

/** The rest row between sets (DS3): the time left as a clock beside a ring
 *  that empties, and a plain "done" once it is over. */
describe("CompactRestTimer", () => {
  function row(seconds: number, target: number) {
    const onExtend = vi.fn();
    const onStop = vi.fn();
    const view = render(
      <CompactRestTimer
        seconds={seconds}
        target={target}
        onExtend={onExtend}
        onStop={onStop}
      />
    );
    return { ...view, onExtend, onStop };
  }

  it("reads the time left as minutes and seconds", () => {
    row(6, 90);
    const group = screen.getByRole("group", { name: "Rest timer" });
    expect(group).toHaveTextContent("Rest");
    expect(group).toHaveTextContent("1:24");
  });

  it("empties the ring as the rest runs down", () => {
    const { container, rerender } = row(0, 100);
    const arc = () =>
      Number(
        container
          .querySelectorAll("circle")[1]
          .getAttribute("stroke-dashoffset")
      );
    const full = arc();
    rerender(
      <CompactRestTimer
        seconds={50}
        target={100}
        onExtend={() => {}}
        onStop={() => {}}
      />
    );
    expect(full).toBe(0);
    expect(arc()).toBeCloseTo(Math.PI * 15, 5);
  });

  it("says the rest is done once it is over, in the status green", () => {
    const { container } = row(95, 90);
    const group = screen.getByRole("group", { name: "Rest timer" });
    expect(group).toHaveTextContent("Rest done");
    expect(group).toHaveTextContent("0:00");
    const arc = container.querySelectorAll("circle")[1];
    expect(arc).toHaveClass("stroke-success");
    // The green has to be drawn to be seen. An arc offset by its whole
    // length paints nothing, which is where an emptied ring leaves it.
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBe(0);
  });

  it("draws the full green ring on the second the rest runs out", () => {
    const { container } = row(90, 90);
    const arc = container.querySelectorAll("circle")[1];
    expect(arc).toHaveClass("stroke-success");
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBe(0);
  });

  it("draws the track in the rings' groove, which reads on the page", () => {
    // `stroke-muted` is a near-white tile colour in the light theme, lighter
    // than the workout page behind it, so the emptied part of the ring
    // disappeared there. ProgressRing's track is the groove Home's rings use.
    const { container } = row(10, 90);
    const track = container.querySelectorAll("circle")[0];
    expect(track).not.toHaveClass("stroke-muted");
    expect(track).toHaveAttribute(
      "stroke",
      "hsl(var(--muted-foreground) / 0.22)"
    );
  });

  it("adds fifteen seconds and ends the rest", () => {
    const { onExtend, onStop } = row(10, 90);
    fireEvent.click(
      screen.getByRole("button", { name: "Add 15 seconds of rest" })
    );
    expect(onExtend).toHaveBeenCalledWith(15);
    fireEvent.click(screen.getByRole("button", { name: "End rest" }));
    expect(onStop).toHaveBeenCalled();
  });
});
