import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import ExerciseFormFrames from "../ExerciseFormFrames";
const reduced = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reduced.value,
}));
const beats = Array.from({ length: 6 }, (_, i) => ({
  t: i / 5,
  label: `Position ${i + 1}`,
  cue: `Cue ${i + 1}`,
  image: `form-frames/test/${i + 1}.webp`,
}));
const load = (container: HTMLElement) =>
  container.querySelectorAll("img").forEach((image) => fireEvent.load(image));
beforeEach(() => {
  reduced.value = false;
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("six-frame form guide", () => {
  it("waits for current and adjacent images before advancing, with only two mounted", () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    expect(view.container.querySelectorAll("img")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 1");
    load(view.container);
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 2");
  });
  it("plays all six in order and loops to the first without reversing", () => {
    const onStep = vi.fn();
    const view = render(
      <ExerciseFormFrames name="Squat" beats={beats} onStep={onStep} />
    );
    for (let i = 0; i < 6; i++) {
      load(view.container);
      act(() => vi.advanceTimersByTime(1200));
    }
    expect(onStep.mock.calls.map(([index]) => index)).toEqual([
      0, 1, 2, 3, 4, 5, 0,
    ]);
  });
  it("manual stepping pauses and slower playback takes twice as long", () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(view.container.querySelectorAll("img")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Slower playback" }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    load(view.container);
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 2");
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 3");
  });
  it("keeps the current pose on a preload failure, with an explicit retry", () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    const images = view.container.querySelectorAll("img");
    fireEvent.load(images[0]);
    fireEvent.error(images[1]);
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 1");
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry images" }));
    load(view.container);
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 2");
  });
  it("makes all six positions manually accessible with reduced motion", () => {
    reduced.value = true;
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    expect(
      view.container.querySelector("[data-demo-still=placard]")
    ).toBeInTheDocument();
    expect(view.container.querySelectorAll("img")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Pause" })
    ).not.toBeInTheDocument();
    for (let i = 0; i < 5; i++)
      fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 6");
  });
  it("suspends when inactive or the tab is hidden", () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    load(view.container);
    view.rerender(
      <ExerciseFormFrames name="Squat" beats={beats} active={false} />
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 1");
    view.rerender(<ExerciseFormFrames name="Squat" beats={beats} active />);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 1");
  });
  it("refuses partial sequences instead of presenting misleading form", () => {
    render(<ExerciseFormFrames name="Squat" beats={beats.slice(0, 4)} />);
    expect(screen.getByRole("status")).toHaveTextContent("not ready");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
