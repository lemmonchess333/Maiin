import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AnalyticsMuscles from "../AnalyticsMuscles";

vi.mock("@/components/analytics/MuscleHeatMap", () => ({
  default: () => <div data-testid="muscle-heat-map" />,
}));

afterEach(cleanup);

describe("AnalyticsMuscles", () => {
  it("returns null when no sets are trained", () => {
    const { container } = render(
      <AnalyticsMuscles data={{ Chest: 0 }} onOpen={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("treats catalogue Back aggregate as covering Lats", () => {
    render(
      <AnalyticsMuscles
        data={{
          Chest: 6,
          Shoulders: 4,
          Back: 8,
          Legs: 10,
          Biceps: 4,
          Triceps: 4,
          Core: 4,
        }}
        onOpen={vi.fn()}
      />
    );
    expect(screen.queryByText(/Not trained in this range/i)).toBeNull();
  });

  it("treats catalogue Legs aggregate as covering Quads & Glutes and Hamstrings & Glutes", () => {
    render(
      <AnalyticsMuscles
        data={{
          Legs: 12,
          Chest: 6,
          Shoulders: 4,
          Back: 6,
          Biceps: 3,
          Triceps: 3,
        }}
        onOpen={vi.fn()}
      />
    );
    expect(
      screen.getByText("Not trained in this range: Core")
    ).toBeInTheDocument();
  });

  it("normalizes raw movementCategory keys and truncates more than 3 untrained groups", () => {
    render(
      <AnalyticsMuscles
        data={{
          horizontal_push: 6,
          vertical_pull: 4,
        }}
        onOpen={vi.fn()}
      />
    );
    const note = screen.getByText(/Not trained in this range:/i);
    expect(note.textContent).not.toContain("Chest");
    expect(note.textContent).not.toContain("Lats");
    expect(note.textContent).toMatch(/\+\d+ more$/);
  });
});
