import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ExerciseRowSummary from "../ExerciseRowSummary";
import ExerciseThumb from "../ExerciseThumb";

function exercise(over: Record<string, unknown> = {}) {
  return {
    exerciseId: "bench-press",
    name: "Bench Press",
    sets: 3,
    reps: 8,
    repUnit: undefined,
    weight: 80,
    notes: undefined,
    ...over,
  } as Parameters<typeof ExerciseRowSummary>[0]["exercise"];
}

describe("ExerciseThumb — each exercise's picture", () => {
  it("shows the cut-out drawing when the exercise has released art", () => {
    const { container } = render(<ExerciseThumb exerciseId="bench-press" />);
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.dataset.thumb).toBe("drawing");
    expect(tile.querySelector("img")!.getAttribute("src")).toMatch(
      /form-art\/bench-press\.webp$/
    );
  });

  it("shows the muscles its category works when it has no drawing", () => {
    // Pull-ups have no released drawing yet; their category is Back.
    const { container } = render(<ExerciseThumb exerciseId="pull-ups" />);
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.dataset.thumb).toBe("muscles");
    expect(tile.querySelector("img")!.getAttribute("src")).toMatch(
      /^data:image\/svg\+xml,/
    );
  });

  it("falls back to a dumbbell for an exercise the library does not know", () => {
    const { container } = render(<ExerciseThumb exerciseId="my-own-lift" />);
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.dataset.thumb).toBe("icon");
    expect(tile.querySelector("img")).toBeNull();
    expect(tile.querySelector("svg")).not.toBeNull();
  });

  it("is decorative: the name beside it carries the meaning", () => {
    const { container } = render(<ExerciseThumb exerciseId="bench-press" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("ExerciseRowSummary — one row's words", () => {
  it("states a weighted lift's prescription and last set with their loads", () => {
    const { container } = render(
      <ExerciseRowSummary
        exercise={exercise()}
        lastPerf={{ weight: 77.5, reps: 8 }}
      />
    );
    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(container).toHaveTextContent("3 sets × 8 reps · 80 kg");
    expect(container).toHaveTextContent("Last: 77.5 kg × 8");
  });

  it("never prints a bodyweight lift's stored load as if it were lifted", () => {
    // Chin-ups read "3 sets x 13 reps" over "Last: 35 kg x 12" before the
    // bodyweight case came first.
    const { container } = render(
      <ExerciseRowSummary
        exercise={exercise({
          exerciseId: "pull-ups",
          name: "Pull-Ups",
          reps: 13,
          weight: 35,
        })}
        lastPerf={{ weight: 35, reps: 12 }}
      />
    );
    expect(container).toHaveTextContent("3 sets × 13 reps");
    expect(container).toHaveTextContent("Last: BW × 12");
    expect(container).not.toHaveTextContent("35 kg");
  });

  it("gives a timed exercise its seconds", () => {
    const { container } = render(
      <ExerciseRowSummary
        exercise={exercise({ reps: 30, repUnit: "seconds", weight: 0 })}
        lastPerf={{ weight: 0, reps: 30 }}
      />
    );
    expect(container).toHaveTextContent("3 sets × 30s");
    expect(container).not.toHaveTextContent("reps");
    expect(container).toHaveTextContent("Last: 30s");
  });

  it("shows the day's note only where the row asks for it", () => {
    const { rerender, container } = render(
      <ExerciseRowSummary
        exercise={exercise({ notes: "Pause at the chest" })}
      />
    );
    expect(container).not.toHaveTextContent("Pause at the chest");
    rerender(
      <ExerciseRowSummary
        exercise={exercise({ notes: "Pause at the chest" })}
        showNotes
      />
    );
    expect(container).toHaveTextContent("Pause at the chest");
  });

  it("leaves the last line out when there is no last session", () => {
    const { container } = render(<ExerciseRowSummary exercise={exercise()} />);
    expect(container).not.toHaveTextContent("Last:");
  });
});
