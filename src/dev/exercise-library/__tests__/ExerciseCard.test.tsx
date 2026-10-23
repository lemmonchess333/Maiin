import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { EXERCISES } from "@/lib/exercises";
import ExerciseCard from "../ExerciseCard";

const exercise = EXERCISES.find((item) => item.id === "turkish-get-up")!;
const props = () => ({
  exercise,
  playing: false,
  delay: 1200,
  restart: 0,
  flagged: false,
  onOpen: vi.fn(),
  onReplay: vi.fn(),
  onComplete: vi.fn(),
  onToggleFlag: vi.fn(),
});
const loadImages = (container: HTMLElement) =>
  container.querySelectorAll("img").forEach((image) => fireEvent.load(image));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        this.callback(
          [{ target, isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver
        );
      }
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("exercise review card", () => {
  it("recovers a failed image with Retry while preserving a paused grid", () => {
    const callbacks = props();
    const view = render(<ExerciseCard {...callbacks} />);
    const failedImage = screen.getByRole("img");
    fireEvent.error(failedImage);
    expect(
      screen.getByText("Frame unavailable · retry below")
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: `Retry ${exercise.name} preview` })
    );
    expect(
      screen.queryByRole("button", { name: `Retry ${exercise.name} preview` })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img")).not.toBe(failedImage);
    loadImages(view.container);
    act(() => vi.advanceTimersByTime(6000));
    expect(view.container.querySelector("[data-preview]")).toHaveAttribute(
      "data-frame",
      "1"
    );
    expect(view.container.querySelector("[data-preview]")).toHaveAttribute(
      "data-running",
      "false"
    );
    expect(callbacks.onReplay).not.toHaveBeenCalled();
    expect(callbacks.onOpen).not.toHaveBeenCalled();
  });

  it("retains the visible pose on preload failure and recovers through global Restart", () => {
    const callbacks = { ...props(), playing: true };
    const view = render(<ExerciseCard {...callbacks} />);
    const images = view.container.querySelectorAll("img");
    fireEvent.load(images[0]);
    fireEvent.error(images[1]);
    expect(screen.getByRole("img")).toBe(images[0]);
    expect(
      screen.getByRole("button", { name: `Retry ${exercise.name} preview` })
    ).toBeInTheDocument();
    view.rerender(<ExerciseCard {...callbacks} restart={1} />);
    expect(
      screen.queryByRole("button", { name: `Retry ${exercise.name} preview` })
    ).not.toBeInTheDocument();
    loadImages(view.container);
    act(() => vi.advanceTimersByTime(1200));
    expect(view.container.querySelector("[data-preview]")).toHaveAttribute(
      "data-frame",
      "2"
    );
    expect(callbacks.onReplay).not.toHaveBeenCalled();
  });

  it("announces sequence completion once and holds the final pose until Replay", () => {
    const callbacks = { ...props(), playing: true };
    const view = render(<ExerciseCard {...callbacks} />);
    for (let index = 0; index < 5; index++) {
      loadImages(view.container);
      act(() => vi.advanceTimersByTime(1200));
    }
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector("[data-preview]")).toHaveAttribute(
      "data-frame",
      "6"
    );
    act(() => vi.advanceTimersByTime(12000));
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector("[data-preview]")).toHaveAttribute(
      "data-frame",
      "6"
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Replay ${exercise.name} preview` })
    );
    expect(callbacks.onReplay).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector("[data-preview]")).toHaveAttribute(
      "data-frame",
      "1"
    );
  });
});
