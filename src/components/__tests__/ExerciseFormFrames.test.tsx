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
const decode = vi.fn<() => Promise<void>>();
const originalDecode = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  "decode"
);
const load = async (container: HTMLElement) => {
  await act(async () => {
    container.querySelectorAll("img").forEach((image) => fireEvent.load(image));
  });
};
const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
beforeEach(() => {
  reduced.value = false;
  vi.useFakeTimers();
  decode.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: decode,
  });
});
afterEach(() => {
  cleanup();
  if (originalDecode)
    Object.defineProperty(HTMLImageElement.prototype, "decode", originalDecode);
  else Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("six-frame form guide", () => {
  it("waits for current and adjacent images before advancing, with only two mounted", async () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    expect(view.container.querySelectorAll("img")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 1");
    await load(view.container);
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 2");
  });
  it("plays all six in order and loops to the first without reversing", async () => {
    const onStep = vi.fn();
    const view = render(
      <ExerciseFormFrames name="Squat" beats={beats} onStep={onStep} />
    );
    for (let i = 0; i < 6; i++) {
      await load(view.container);
      act(() => vi.advanceTimersByTime(1200));
    }
    expect(onStep.mock.calls.map(([index]) => index)).toEqual([
      0, 1, 2, 3, 4, 5, 0,
    ]);
  });
  it("manual stepping pauses and slower playback takes twice as long", async () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(view.container.querySelectorAll("img")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Slower playback" }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await load(view.container);
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 2");
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 3");
  });
  it("keeps the current pose on a preload failure, with an explicit retry", async () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    const images = view.container.querySelectorAll("img");
    await act(async () => fireEvent.load(images[0]));
    fireEvent.error(images[1]);
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 1");
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry images" }));
    await load(view.container);
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
  it("suspends when inactive or the tab is hidden", async () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    await load(view.container);
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
  it("keeps the current pose until both mounted images finish decoding", async () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    const [current, adjacent] = view.container.querySelectorAll("img");
    const first = deferred();
    const second = deferred();
    Object.defineProperty(current, "decode", { value: () => first.promise });
    Object.defineProperty(adjacent, "decode", { value: () => second.promise });
    expect(current).toHaveAttribute("decoding", "sync");
    expect(adjacent).toHaveAttribute("decoding", "sync");
    await load(view.container);
    await act(async () => first.resolve());
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("img")).toBe(current);
    expect(screen.getByText(/Position 1/)).toHaveTextContent("1/6");
    await act(async () => second.resolve());
    act(() => vi.advanceTimersByTime(1199));
    expect(screen.getByRole("img")).toBe(current);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("img")).toBe(adjacent);
    expect(view.container.querySelectorAll("img")).toHaveLength(2);
  });
  it("requires a new decode when a previously ready adjacent frame remounts", async () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    await load(view.container);
    const oldAdjacent = view.container.querySelectorAll("img")[1];
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    const adjacent = view.container.querySelectorAll("img")[1];
    expect(adjacent).not.toBe(oldAdjacent);
    const pending = deferred();
    Object.defineProperty(adjacent, "decode", { value: () => pending.promise });
    await act(async () => fireEvent.load(adjacent));
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 1");
    await act(async () => pending.resolve());
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toBe(adjacent);
  });
  it("pauses on a mounted adjacent decode rejection and can retry", async () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    const [current, adjacent] = view.container.querySelectorAll("img");
    Object.defineProperty(adjacent, "decode", {
      value: () => Promise.reject(new Error("Decode failed")),
    });
    await load(view.container);
    expect(screen.getByRole("img")).toBe(current);
    expect(screen.getByText(/next frame could not load/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry images" }));
    await load(view.container);
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 2");
  });
  it.each(["resolve", "reject"] as const)(
    "ignores a stale decode %s after retry replaces the image node",
    async (settlement) => {
      const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
      const oldAdjacent = view.container.querySelectorAll("img")[1];
      const obsolete = deferred();
      Object.defineProperty(oldAdjacent, "decode", {
        value: () => obsolete.promise,
      });
      await load(view.container);
      fireEvent.error(oldAdjacent);
      fireEvent.click(screen.getByRole("button", { name: "Retry images" }));
      const [current, adjacent] = view.container.querySelectorAll("img");
      const pending = deferred();
      Object.defineProperty(adjacent, "decode", {
        value: () => pending.promise,
      });
      await load(view.container);
      await act(async () => {
        if (settlement === "resolve") obsolete.resolve();
        else obsolete.reject(new Error("Obsolete decode failed"));
      });
      act(() => vi.advanceTimersByTime(6000));
      expect(screen.getByRole("img")).toBe(current);
      expect(
        screen.queryByRole("button", { name: "Retry images" })
      ).not.toBeInTheDocument();
      await act(async () => pending.resolve());
      act(() => vi.advanceTimersByTime(1200));
      expect(screen.getByRole("img")).toBe(adjacent);
    }
  );
});
