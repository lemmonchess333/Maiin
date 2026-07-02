import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

// Overridable reduced-motion mock — defaults to "motion OK" (animated path).
const reducedMotionMock = vi.fn(() => false);
vi.mock("@/hooks/useReducedMotion", function () {
  return { useReducedMotion: () => reducedMotionMock() };
});

import ExerciseDemoPlayer from "../ExerciseDemoPlayer";

beforeEach(function () {
  reducedMotionMock.mockReturnValue(false);
});

describe("ExerciseDemoPlayer", function () {
  it("renders nothing when there are no frames", function () {
    const { container } = render(
      <ExerciseDemoPlayer frames={[]} name="Squat" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a single static image for one frame", function () {
    render(<ExerciseDemoPlayer frames={["/a.webp"]} name="Squat" />);
    expect(screen.getByAltText("Squat demonstration")).toBeInTheDocument();
  });

  it("exposes the animated loop as a single accessible image", function () {
    render(<ExerciseDemoPlayer frames={["/a.webp", "/b.webp"]} name="Squat" />);
    expect(
      screen.getByRole("img", { name: "Squat demonstration" })
    ).toBeInTheDocument();
  });

  it("reduced motion shows a static Start/Finish 2-up of the ROM extremes", function () {
    reducedMotionMock.mockReturnValue(true);
    render(
      <ExerciseDemoPlayer
        frames={["/a.webp", "/b.webp", "/c.webp"]}
        name="Squat"
      />
    );
    // First + last frame only, captioned Start/Finish.
    expect(screen.getByAltText("Squat — start position")).toHaveAttribute(
      "src",
      "/a.webp"
    );
    expect(screen.getByAltText("Squat — finish position")).toHaveAttribute(
      "src",
      "/c.webp"
    );
  });

  it("ping-pongs with a longer hold at the range-of-motion extremes", function () {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <ExerciseDemoPlayer
          frames={["/a.webp", "/b.webp", "/c.webp"]}
          name="Squat"
          intervalMs={500}
        />
      );
      const activeIndex = () =>
        container
          .querySelector('[data-active="true"]')
          ?.getAttribute("data-frame-index");

      // Extremes hold TURNAROUND_HOLD (1.8×) the mid-frame interval — a rep
      // pauses at the top/bottom before reversing (visual audit Phase 5).
      expect(activeIndex()).toBe("0");
      act(() => void vi.advanceTimersByTime(500));
      expect(activeIndex()).toBe("0"); // still in the start hold (900ms)
      act(() => void vi.advanceTimersByTime(400));
      expect(activeIndex()).toBe("1"); // 900ms — leaves the extreme
      act(() => void vi.advanceTimersByTime(500));
      expect(activeIndex()).toBe("2"); // mid frame moves on 1× interval
      // Far extreme holds 900ms, then reverses (ping-pong, no jump to 0).
      act(() => void vi.advanceTimersByTime(500));
      expect(activeIndex()).toBe("2");
      act(() => void vi.advanceTimersByTime(400));
      expect(activeIndex()).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops broken frames and calls onUnavailable when all fail to load", function () {
    const onUnavailable = vi.fn();
    const { container } = render(
      <ExerciseDemoPlayer
        frames={["/a.webp", "/b.webp"]}
        name="Squat"
        onUnavailable={onUnavailable}
      />
    );
    // Error every rendered <img> until the player has nothing usable left.
    for (let round = 0; round < 3; round++) {
      act(() => {
        container
          .querySelectorAll("img")
          .forEach((img) => fireEvent.error(img));
      });
    }
    expect(onUnavailable).toHaveBeenCalled();
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("does not run the timer when inactive (paused)", function () {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <ExerciseDemoPlayer
          frames={["/a.webp", "/b.webp"]}
          name="Squat"
          active={false}
          intervalMs={500}
        />
      );
      const activeIndex = () =>
        container
          .querySelector('[data-active="true"]')
          ?.getAttribute("data-frame-index");
      expect(activeIndex()).toBe("0");
      act(() => void vi.advanceTimersByTime(2000));
      expect(activeIndex()).toBe("0");
    } finally {
      vi.useRealTimers();
    }
  });
});
