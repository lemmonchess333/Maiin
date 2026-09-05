import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseDemo } from "@/lib/exerciseDemo";

// Entire data boundary is mocked: this suite cannot contact Firebase or
// the external exercise database. Deferred promises reproduce navigation
// races rather than assuming requests finish in invocation order.
const { loadDemo } = vi.hoisted(() => ({ loadDemo: vi.fn() }));
vi.mock("@/lib/exerciseDemo", () => ({
  getExerciseDemo: loadDemo,
  mapMuscles: () => [],
  needsPosterior: () => false,
  needsAnterior: () => false,
}));
vi.mock("@/lib/bodyRig", () => ({
  getBodyDemo: () => null,
  getFormBeats: () => null,
  getDemoMuscleKey: () => null,
}));
vi.mock("@/lib/exercises", () => ({ EXERCISES: [] }));
vi.mock("react-body-highlighter", () => ({ default: () => null }));
vi.mock("@/components/ExerciseRigDemo", () => ({ default: () => null }));
vi.mock("@/components/ExerciseDemoPlayer", () => ({ default: () => null }));
vi.mock("@/components/BodyMapGlow", () => ({ default: () => null }));

import ExerciseFormContent from "../ExerciseFormContent";

function deferredDemo() {
  let resolve!: (demo: ExerciseDemo | null) => void;
  const promise = new Promise<ExerciseDemo | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function demo(name: string): ExerciseDemo {
  return {
    name,
    category: "",
    equipment: "",
    primaryMuscles: [],
    secondaryMuscles: [],
    instructions: [`${name} instruction`],
    images: [],
    mediaKind: "none",
  };
}

beforeEach(() => loadDemo.mockReset());

describe("ExerciseFormContent request ownership", () => {
  it("keeps the new exercise when an older request finishes last", async () => {
    const first = deferredDemo();
    const second = deferredDemo();
    loadDemo
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender } = render(<ExerciseFormContent exerciseName="Row" />);
    rerender(<ExerciseFormContent exerciseName="Squat" />);

    await act(async () => second.resolve(demo("Squat")));
    expect(screen.getByText("Squat instruction")).toBeInTheDocument();
    await act(async () => first.resolve(demo("Row")));
    expect(screen.getByText("Squat instruction")).toBeInTheDocument();
    expect(screen.queryByText("Row instruction")).toBeNull();
  });

  it("does not end the new exercise's loading state with an old response", async () => {
    const first = deferredDemo();
    const second = deferredDemo();
    loadDemo
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender } = render(<ExerciseFormContent exerciseName="Row" />);
    rerender(<ExerciseFormContent exerciseName="Squat" />);

    await act(async () => first.resolve(demo("Row")));
    expect(
      screen.getByRole("status", { name: "Loading exercise demo" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Row instruction")).toBeNull();
    await act(async () => second.resolve(demo("Squat")));
    expect(screen.getByText("Squat instruction")).toBeInTheDocument();
  });

  it("invalidates the request on close and protects a reopened guide", async () => {
    const abandoned = deferredDemo();
    const reopened = deferredDemo();
    loadDemo
      .mockReturnValueOnce(abandoned.promise)
      .mockReturnValueOnce(reopened.promise);
    const { rerender } = render(<ExerciseFormContent exerciseName="Row" />);
    rerender(<ExerciseFormContent exerciseName="Row" active={false} />);
    rerender(<ExerciseFormContent exerciseName="Row" />);

    await act(async () => reopened.resolve(demo("Current row")));
    expect(screen.getByText("Current row instruction")).toBeInTheDocument();
    await act(async () => abandoned.resolve(demo("Abandoned row")));
    expect(screen.getByText("Current row instruction")).toBeInTheDocument();
    expect(screen.queryByText("Abandoned row instruction")).toBeNull();
  });

  it("does not load an inactive guide until it opens", async () => {
    loadDemo.mockResolvedValue(demo("Row"));
    const { rerender } = render(
      <ExerciseFormContent exerciseName="Row" active={false} />
    );
    expect(loadDemo).not.toHaveBeenCalled();
    rerender(<ExerciseFormContent exerciseName="Row" />);
    expect(await screen.findByText("Row instruction")).toBeInTheDocument();
    expect(loadDemo).toHaveBeenCalledTimes(1);
  });
});
