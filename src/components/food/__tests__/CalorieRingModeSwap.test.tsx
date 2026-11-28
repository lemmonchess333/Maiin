/**
 * The left and logged switch changes what the figures mean, not the food,
 * so the wheel's figure and the macros' swap with a short crossfade
 * (`SwapFade`) and are never counted from one meaning to the other. On
 * the phone a tap counted 0 logged up through 2,954 left to 3,400 left,
 * and back down through 84 logged, with the macros landing at a different
 * moment from the wheel (0 kcal beside 4g, 14g and 3g).
 *
 * A real change still counts: a food logged moves the figure from the old
 * value to the new one.
 *
 * Motion is on here: under Reduce Motion nothing counts at all, so the
 * pins would hold whatever the components did. Every figure drawn is
 * recorded through a MutationObserver, so a frame mid-count cannot slip
 * between two polls.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import { useState } from "react";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

import CalorieRing, { type CalorieRingMode } from "../CalorieRing";
import MacroColumn from "../MacroColumn";
import { Beef } from "lucide-react";

afterEach(cleanup);

/** The figures on screen as numbers: the wheel's, and the macro's (its
 *  "g" left off). Both copies while a crossfade runs. */
function figures(container: HTMLElement) {
  const read = (selector: string) =>
    Array.from(container.querySelectorAll(selector)).map((el) =>
      Number((el.textContent ?? "").replace(/\D/g, ""))
    );
  return {
    wheel: read("[data-calorie-wheel] .font-figure"),
    macro: read("[data-macro] .font-figure"),
  };
}

/** Records every set of figures the page draws, frame by frame. */
function recordFigures(container: HTMLElement) {
  const seen = [figures(container)];
  const observer = new MutationObserver(() => seen.push(figures(container)));
  observer.observe(container, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  return {
    seen,
    stop: () => {
      seen.push(figures(container));
      observer.disconnect();
    },
  };
}

/** Food's wheel and a macro under one mode, as the page wires them, with
 *  short counts so a test runs in a few frames. */
function Food({ calories, protein }: { calories: number; protein: number }) {
  const [mode, setMode] = useState<CalorieRingMode>("eaten");
  const toggle = () => setMode((m) => (m === "left" ? "eaten" : "left"));
  return (
    <>
      <CalorieRing
        consumed={calories}
        target={3400}
        mode={mode}
        onToggleMode={toggle}
        trajectoryLabel={null}
        ringDurationMs={300}
        ringDelayMs={0}
        drawIn={false}
      />
      <MacroColumn
        size="row"
        macroKey="protein"
        Icon={Beef}
        consumed={protein}
        target={150}
        label="Protein"
        color="currentColor"
        mode={mode}
        onTap={toggle}
        numberDurationSec={0.3}
        barDurationSec={0.3}
        drawIn={false}
      />
    </>
  );
}

const only = (values: number[], allowed: number[]) =>
  values.every((v) => allowed.includes(v));

describe("Food's left and logged switch", () => {
  it("swaps the figures without counting: nothing drawn is a value between", async () => {
    const { container } = render(<Food calories={446} protein={4} />);
    expect(figures(container)).toEqual({ wheel: [446], macro: [4] });

    const tape = recordFigures(container);
    fireEvent.click(container.querySelector("[data-calorie-wheel]")!);
    // Settled: one copy of each, at the other meaning.
    await waitFor(() =>
      expect(figures(container)).toEqual({ wheel: [2954], macro: [146] })
    );
    // Held past the length of a count, in case one started late.
    await act(() => new Promise((r) => setTimeout(r, 400)));
    tape.stop();

    expect(tape.seen.length).toBeGreaterThan(2);
    for (const frame of tape.seen) {
      expect(only(frame.wheel, [446, 2954])).toBe(true);
      expect(only(frame.macro, [4, 146])).toBe(true);
    }
    expect(figures(container)).toEqual({ wheel: [2954], macro: [146] });
  });

  it("the wheel and the macro swap in the same frame", async () => {
    const { container } = render(<Food calories={446} protein={4} />);
    const tape = recordFigures(container);
    fireEvent.click(container.querySelector("[data-calorie-wheel]")!);
    await waitFor(() =>
      expect(figures(container)).toEqual({ wheel: [2954], macro: [146] })
    );
    tape.stop();

    const wheelArrives = tape.seen.findIndex((f) => f.wheel.includes(2954));
    const macroArrives = tape.seen.findIndex((f) => f.macro.includes(146));
    expect(wheelArrives).toBeGreaterThan(0);
    expect(macroArrives).toBe(wheelArrives);
  });

  it("and back: logged again, still with nothing between", async () => {
    const { container } = render(<Food calories={446} protein={4} />);
    const wheel = container.querySelector("[data-calorie-wheel]")!;
    fireEvent.click(wheel);
    await waitFor(() =>
      expect(figures(container)).toEqual({ wheel: [2954], macro: [146] })
    );

    const tape = recordFigures(container);
    fireEvent.click(wheel);
    await waitFor(() =>
      expect(figures(container)).toEqual({ wheel: [446], macro: [4] })
    );
    await act(() => new Promise((r) => setTimeout(r, 400)));
    tape.stop();
    for (const frame of tape.seen) {
      expect(only(frame.wheel, [446, 2954])).toBe(true);
      expect(only(frame.macro, [4, 146])).toBe(true);
    }
  });
});

describe("A food logged still counts", () => {
  it("the wheel and the macro count from the old figures to the new", async () => {
    const { container, rerender } = render(<Food calories={446} protein={4} />);
    const tape = recordFigures(container);
    rerender(<Food calories={1446} protein={64} />);
    await waitFor(() =>
      expect(figures(container)).toEqual({ wheel: [1446], macro: [64] })
    );
    tape.stop();

    // Positive: figures between the two were drawn on the way.
    const between = (values: number[], from: number, to: number) =>
      values.some((v) => v > from && v < to);
    expect(tape.seen.some((f) => between(f.wheel, 446, 1446))).toBe(true);
    expect(tape.seen.some((f) => between(f.macro, 4, 64))).toBe(true);
  });

  it("after a switch too: the figure that swapped in counts a log", async () => {
    const { container, rerender } = render(<Food calories={446} protein={4} />);
    fireEvent.click(container.querySelector("[data-calorie-wheel]")!);
    await waitFor(() =>
      expect(figures(container)).toEqual({ wheel: [2954], macro: [146] })
    );

    const tape = recordFigures(container);
    rerender(<Food calories={1446} protein={64} />);
    await waitFor(() =>
      expect(figures(container)).toEqual({ wheel: [1954], macro: [86] })
    );
    tape.stop();
    expect(
      tape.seen.some((f) => f.wheel.some((v) => v < 2954 && v > 1954))
    ).toBe(true);
  });
});
