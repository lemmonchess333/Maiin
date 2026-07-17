/**
 * Pre-session chooser contract (PROGRAM-FLEX-01 + PROGRAM-ADAPT-01):
 * Full is always the primary choice; "Easier today" is ALWAYS offered;
 * its "Recommended — {reason}" sublabel appears only when the caller's
 * pure recommendation says so (one factual reason, no percentages);
 * and each option fires onStart with its variant.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ExpressSessionSheet from "../ExpressSessionSheet";
import type {
  ProgramExercise,
  WorkoutDay,
} from "@/features/program/programTypes";

afterEach(() => cleanup());

let uid = 0;
function ex(
  name: string,
  sets: number,
  isAccessory?: boolean
): ProgramExercise {
  return {
    name,
    exerciseId: `${name.toLowerCase().replace(/\s+/g, "-")}-${uid++}`,
    movementCategory: "horizontal_push",
    sets,
    reps: 8,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...(isAccessory === undefined ? {} : { isAccessory }),
  } as ProgramExercise;
}

/** Short day (~20 min): no express budget would change it. */
function shortDay(): WorkoutDay {
  return {
    dayName: "Push",
    dayType: "push",
    exercises: [ex("Bench Press", 4, false), ex("Lateral Raise", 4, true)],
    completed: false,
  };
}

function setup(
  overrides: Partial<React.ComponentProps<typeof ExpressSessionSheet>> = {}
) {
  const onStart = vi.fn();
  render(
    <ExpressSessionSheet
      open
      day={shortDay()}
      onClose={vi.fn()}
      onStart={onStart}
      {...overrides}
    />
  );
  return { onStart };
}

describe("ExpressSessionSheet", () => {
  it("always offers Easier today, even when no express budget applies", () => {
    const { onStart } = setup();
    expect(
      screen.getByRole("button", { name: /full session/i })
    ).toBeInTheDocument();
    const easier = screen.getByRole("button", { name: /easier today/i });
    expect(easier).toHaveTextContent(/one set less per lift, lighter loads/i);
    fireEvent.click(easier);
    expect(onStart).toHaveBeenCalledWith("easier_today");
  });

  it("full stays the primary choice and fires its own variant", () => {
    const { onStart } = setup();
    fireEvent.click(screen.getByRole("button", { name: /full session/i }));
    expect(onStart).toHaveBeenCalledWith("full");
  });

  it("shows the Recommended sublabel ONLY when the caller's signal says so", () => {
    setup({
      easierRecommendation: {
        recommended: true,
        reason: "hard run yesterday, and this session loads the same legs",
      },
    });
    expect(
      screen.getByText(/Recommended — hard run yesterday/i)
    ).toBeInTheDocument();

    cleanup();
    setup({ easierRecommendation: { recommended: false, reason: null } });
    expect(screen.queryByText(/Recommended/i)).toBeNull();

    cleanup();
    setup(); // no recommendation prop at all
    expect(screen.queryByText(/Recommended/i)).toBeNull();
  });
});
