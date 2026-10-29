import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import ExerciseFormFrames from "../ExerciseFormFrames";
import { FORM_ART_COMPOSITES } from "@/lib/formArtComposites";
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
  it("shows the current movement cue in the compact picker guide", () => {
    const view = render(
      <ExerciseFormFrames name="Squat" beats={beats} compact />
    );
    expect(screen.getByText("Cue 1")).toBeInTheDocument();
    expect(
      view.container.querySelector(".max-w-\\[min\\(260px\\,34dvh\\)\\]")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    expect(screen.getByText("Cue 2")).toBeInTheDocument();
    expect(screen.queryByText("Cue 1")).not.toBeInTheDocument();
  });
  it("keeps one camera for every pose while stepping", () => {
    const view = render(
      <ExerciseFormFrames
        name="Squat"
        beats={beats}
        framing={{ scale: 1.5, x: 0.02, y: -0.03 }}
      />
    );
    const camera = "translate(2%, -3%) scale(1.5)";
    for (let frame = 1; frame <= 6; frame += 1) {
      expect(screen.getByRole("img").parentElement?.parentElement).toHaveStyle({
        transform: camera,
      });
      if (frame < 6)
        fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    }
    expect(view.container.querySelector(".aspect-square")).toBeInTheDocument();
  });
  it("waits for current and adjacent images before advancing, with only two mounted", () => {
    const view = render(<ExerciseFormFrames name="Squat" beats={beats} />);
    expect(view.container.querySelectorAll("img")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 1");
    load(view.container);
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Squat, Position 2");
  });
  it("holds the Man Maker press until its planted-shoe layer loads", () => {
    const view = render(
      <ExerciseFormFrames
        name="Man Maker"
        beats={beats}
        initialIndex={4}
        autoPlay={false}
        composite={FORM_ART_COMPOSITES["man-maker"]}
      />
    );
    const images = view.container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "/form-frames/test/5.webp");
    expect(images[1]).toHaveAttribute("src", "/form-frames/test/4.webp");
    expect(images[1].style.clipPath).toContain("85.86956521739131%");
    fireEvent.load(images[0]);
    expect(screen.getByRole("status")).toHaveTextContent("Loading frame");
    fireEvent.load(images[1]);
    expect(screen.queryByText("Loading frame…")).not.toBeInTheDocument();
    expect(images[0].parentElement?.parentElement).toHaveStyle({
      visibility: "visible",
    });
  });
  it("retries a failed Man Maker shoe layer with the press frame", () => {
    const view = render(
      <ExerciseFormFrames
        name="Man Maker"
        beats={beats}
        initialIndex={4}
        autoPlay={false}
        composite={FORM_ART_COMPOSITES["man-maker"]}
      />
    );
    const first = view.container.querySelectorAll("img");
    fireEvent.load(first[0]);
    fireEvent.error(first[1]);
    expect(screen.getByText("Frame could not load.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry images" }));
    const retried = view.container.querySelectorAll("img");
    expect(retried[0]).not.toBe(first[0]);
    retried.forEach((image) => fireEvent.load(image));
    expect(screen.queryByText("Frame could not load.")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading frame…")).not.toBeInTheDocument();
  });
  it("keeps both grounded dumbbell ends fixed in the Man Maker return", () => {
    const view = render(
      <ExerciseFormFrames
        name="Man Maker"
        beats={beats}
        initialIndex={5}
        autoPlay={false}
        composite={FORM_ART_COMPOSITES["man-maker"]}
      />
    );
    const images = view.container.querySelectorAll("img");
    expect(images).toHaveLength(3);
    expect(images[1]).toHaveAttribute("src", "/form-frames/test/1.webp");
    expect(images[2]).toHaveAttribute("src", "/form-frames/test/1.webp");
    expect(images[1].style.clipPath).not.toBe(images[2].style.clipPath);
    // The small dumbbell-end rectangles must crop the portrait artwork,
    // not the letterboxed square stage around it.
    expect(images[0].parentElement).toHaveStyle({
      width: `${(700 / 920) * 100}%`,
    });
    expect(images[1].style.clipPath).toContain(`${(40 / 700) * 100}%`);
    expect(images[2].style.clipPath).toContain(`${(165 / 700) * 100}%`);
    images.forEach((image) => fireEvent.load(image));
    expect(images[0].parentElement?.parentElement).toHaveStyle({
      visibility: "visible",
    });
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
  it("stops an ascent-only lesson at the final pose until Replay is pressed", () => {
    const onStep = vi.fn();
    const view = render(
      <ExerciseFormFrames
        name="Get-up"
        beats={beats}
        loop={false}
        onStep={onStep}
      />
    );
    for (let i = 0; i < 5; i++) {
      load(view.container);
      act(() => vi.advanceTimersByTime(1200));
    }
    load(view.container);
    act(() => vi.advanceTimersByTime(12000));
    expect(onStep.mock.calls.map(([index]) => index)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(view.container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByRole("img")).toHaveAttribute(
      "alt",
      "Get-up, Position 6"
    );
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByRole("img")).toHaveAttribute(
      "alt",
      "Get-up, Position 1"
    );
    load(view.container);
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("img")).toHaveAttribute(
      "alt",
      "Get-up, Position 2"
    );
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
