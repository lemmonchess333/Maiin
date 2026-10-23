import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type ExerciseCard from "../ExerciseCard";
import ExerciseLibrary from "../ExerciseLibrary";

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reduced.value,
}));
vi.mock("@/lib/exercises", () => ({
  EXERCISES: [
    {
      id: "turkish-get-up",
      name: "Turkish Get-Up",
      muscleGroup: "Full Body",
      equipment: "Kettlebell",
    },
    {
      id: "kettlebell-swing",
      name: "Kettlebell Swing",
      muscleGroup: "Full Body",
      equipment: "Kettlebell",
    },
  ],
}));
vi.mock("@/lib/formArtwork", () => ({
  FORM_ARTWORK: {
    "turkish-get-up": { status: "approved" },
    "kettlebell-swing": { status: "approved" },
  },
}));
vi.mock("@/components/ExerciseFormContent", () => ({
  default: () => <p>Full exercise viewer</p>,
}));
vi.mock("../ExerciseCard", () => ({
  default: ({
    exercise,
    playing,
    flagged,
    onReplay,
    onComplete,
    onToggleFlag,
  }: ComponentProps<typeof ExerciseCard>) => (
    <article aria-label={exercise.name} data-playing={playing}>
      <button onClick={onReplay}>Replay</button>
      <button onClick={onComplete}>Finish sequence</button>
      <button onClick={onToggleFlag} aria-pressed={flagged}>
        Flag for review
      </button>
    </article>
  ),
}));

const card = (name: string) => screen.getByRole("article", { name });
beforeEach(() => {
  localStorage.clear();
  reduced.value = false;
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.restoreAllMocks();
});

describe("exercise review library controls", () => {
  it("replays only the requested sequence while paused and lets Pause stop it", () => {
    render(<ExerciseLibrary />);
    fireEvent.click(screen.getByRole("button", { name: "Pause grid" }));
    fireEvent.click(
      within(card("Turkish Get-Up")).getByRole("button", { name: "Replay" })
    );
    expect(card("Turkish Get-Up")).toHaveAttribute("data-playing", "true");
    expect(card("Kettlebell Swing")).toHaveAttribute("data-playing", "false");
    fireEvent.click(screen.getByRole("button", { name: "Pause grid" }));
    expect(card("Turkish Get-Up")).toHaveAttribute("data-playing", "false");
    expect(card("Kettlebell Swing")).toHaveAttribute("data-playing", "false");
  });

  it("starts still under reduced motion and settles isolated replay when the sequence finishes", () => {
    reduced.value = true;
    render(<ExerciseLibrary />);
    expect(card("Turkish Get-Up")).toHaveAttribute("data-playing", "false");
    fireEvent.click(
      within(card("Turkish Get-Up")).getByRole("button", { name: "Replay" })
    );
    expect(card("Turkish Get-Up")).toHaveAttribute("data-playing", "true");
    expect(card("Kettlebell Swing")).toHaveAttribute("data-playing", "false");
    fireEvent.click(
      within(card("Turkish Get-Up")).getByRole("button", {
        name: "Finish sequence",
      })
    );
    expect(card("Turkish Get-Up")).toHaveAttribute("data-playing", "false");
    expect(
      screen.getByRole("button", { name: "Play grid" })
    ).toBeInTheDocument();
  });

  it("restores flags after remount and combines flag filtering with trimmed multiword search", () => {
    const view = render(<ExerciseLibrary />);
    fireEvent.click(
      within(card("Turkish Get-Up")).getByRole("button", {
        name: "Flag for review",
      })
    );
    view.unmount();
    render(<ExerciseLibrary />);
    expect(
      within(card("Turkish Get-Up")).getByRole("button", {
        name: "Flag for review",
      })
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "  GET   Turkish  " },
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(card("Turkish Get-Up")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    fireEvent.click(screen.getByRole("button", { name: /Flagged only/ }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(
      within(card("Turkish Get-Up")).getByRole("button", {
        name: "Flag for review",
      })
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all exercises" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("keeps flags usable and reports when browser storage rejects a save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    render(<ExerciseLibrary />);
    fireEvent.click(
      within(card("Turkish Get-Up")).getByRole("button", {
        name: "Flag for review",
      })
    );
    expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
    fireEvent.click(screen.getByRole("button", { name: /Flagged only/ }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(card("Turkish Get-Up")).toBeInTheDocument();
  });
});
