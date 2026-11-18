import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import EmptyWorkoutEntry from "../EmptyWorkoutEntry";
import { TRAIN } from "@/test/journeyScreens";

describe("EmptyWorkoutEntry", () => {
  it("opens an empty workout, named as the journeys find it", () => {
    render(
      <MemoryRouter>
        <EmptyWorkoutEntry />
      </MemoryRouter>
    );
    const entry = screen.getByRole("link", {
      name: new RegExp(`^${TRAIN.emptyWorkout} `),
    });
    expect(entry).toHaveAttribute("href", "/empty-workout");
    // Named by everything it shows, its line included (WCAG 2.5.3).
    expect(entry).toHaveAccessibleName(
      "Empty workout Add exercises as you go. Your plan stays as it is."
    );
  });
});
