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
  it("carries the line when the plan lowered the lift itself", () => {
    const { container } = render(
      <ExerciseRowSummary
        exercise={exercise({
          weight: 90,
          reps: 5,
          lowered: {
            exerciseId: "bench-press",
            from: 100,
            unit: "kg",
            target: 5,
          },
        })}
      />
    );
    expect(container).toHaveTextContent(
      "Down from 100 kg: two sessions under 5 reps"
    );
  });

  it("states a climbing lift's range, and a fixed lift's target (Lift4 (3))", () => {
    const { container, rerender } = render(
      <ExerciseRowSummary
        exercise={exercise({
          reps: 10,
          baseReps: 8,
          repRangeMax: 12,
          progressionType: "double",
          weight: 60,
        })}
      />
    );
    expect(container).toHaveTextContent("3 sets × 8–12 reps · 60 kg");
    rerender(
      <ExerciseRowSummary
        exercise={exercise({
          reps: 5,
          baseReps: 5,
          repRangeMax: 7,
          progressionType: "linear",
          weight: 100,
        })}
      />
    );
    expect(container).toHaveTextContent("3 sets × 5 reps · 100 kg");
  });

  it("states a weighted lift's prescription and last set with their loads", () => {
    const { container } = render(
      <ExerciseRowSummary
        exercise={exercise()}
        lastSets={[{ weightKg: 77.5, reps: 8 }]}
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
        lastSets={[{ weightKg: 35, reps: 12 }]}
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
        lastSets={[{ weightKg: 0, reps: 30 }]}
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

  it("lists every set of the last session, not just the best", () => {
    // A weight held after 12, 12, 10 explains itself only if the 10 shows.
    const { container } = render(
      <ExerciseRowSummary
        exercise={exercise({ reps: 10, repRangeMax: 12, weight: 60 })}
        lastSets={[
          { weightKg: 60, reps: 12 },
          { weightKg: 60, reps: 12 },
          { weightKg: 60, reps: 10 },
        ]}
      />
    );
    expect(container).toHaveTextContent("Last: 60 kg × 12, 12, 10");
  });

  it("names each weight where the sets changed weight", () => {
    const { container } = render(
      <ExerciseRowSummary
        exercise={exercise()}
        lastSets={[
          { weightKg: 100, reps: 5 },
          { weightKg: 90, reps: 5 },
          { weightKg: 90, reps: 5 },
        ]}
      />
    );
    expect(container).toHaveTextContent("Last: 100 kg × 5 · 90 kg × 5, 5");
  });

  it("lists a bodyweight lift's and a hold's sets too", () => {
    const { container, rerender } = render(
      <ExerciseRowSummary
        exercise={exercise({ exerciseId: "pull-ups", name: "Pull-Ups" })}
        lastSets={[
          { weightKg: 0, reps: 10 },
          { weightKg: 0, reps: 8 },
        ]}
      />
    );
    expect(container).toHaveTextContent("Last: BW × 10, 8");
    rerender(
      <ExerciseRowSummary
        exercise={exercise({ reps: 30, repUnit: "seconds", weight: 0 })}
        lastSets={[
          { weightKg: 0, reps: 30 },
          { weightKg: 0, reps: 25 },
        ]}
      />
    );
    expect(container).toHaveTextContent("Last: 30s, 25s");
  });

  it("keeps every number in the numeral face", () => {
    const { container } = render(
      <ExerciseRowSummary
        exercise={exercise()}
        lastSets={[
          { weightKg: 60, reps: 12 },
          { weightKg: 60, reps: 10 },
        ]}
      />
    );
    const line = [...container.querySelectorAll("p")].find((p) =>
      p.textContent?.startsWith("Last:")
    )!;
    const numbers = [...line.querySelectorAll("span")].map((span) => [
      span.textContent,
      span.className,
    ]);
    expect(numbers).toEqual([
      ["60", "font-mono tabular-nums"],
      ["12", "font-mono tabular-nums"],
      ["10", "font-mono tabular-nums"],
    ]);
  });

  it("leaves the last line out when there is no last session", () => {
    const { container } = render(<ExerciseRowSummary exercise={exercise()} />);
    expect(container).not.toHaveTextContent("Last:");
  });
});
