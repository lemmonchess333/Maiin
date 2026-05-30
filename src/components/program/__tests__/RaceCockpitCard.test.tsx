/**
 * RaceCockpitCard — cockpit identity card contract.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import RaceCockpitCard from "../RaceCockpitCard";

afterEach(cleanup);

function renderCard(
  props: Partial<React.ComponentProps<typeof RaceCockpitCard>> = {}
) {
  return render(
    <RaceCockpitCard
      distanceLabel="Marathon"
      targetDate="2026-10-17"
      daysToRace={140}
      currentWeek={0}
      totalWeeks={20}
      phaseLabel="Base"
      inTaper={false}
      compressed={false}
      onEdit={() => {}}
      {...props}
    />
  );
}

describe("RaceCockpitCard", () => {
  it("renders the readable distance as a heading (Marathon, not MARATHON)", () => {
    renderCard();
    const heading = screen.getByRole("heading", { name: "Marathon" });
    expect(heading).toBeInTheDocument();
    expect(screen.queryByText("MARATHON")).not.toBeInTheDocument();
  });

  it("shows the human date and days-out countdown", () => {
    renderCard();
    expect(screen.getByText(/17 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText(/140 days out/)).toBeInTheDocument();
  });

  it("renders week N of M and the current phase", () => {
    renderCard();
    expect(screen.getByText("1 / 20")).toBeInTheDocument();
    // Phase appears both as the stat value and as the highlighted rail
    // segment, so assert at least one match.
    expect(screen.getAllByText("Base").length).toBeGreaterThan(0);
  });

  it("sizes the progress bar from (currentWeek + 1) / totalWeeks", () => {
    const { container } = renderCard({ currentWeek: 4, totalWeeks: 20 });
    // (4 + 1) / 20 = 25%.
    const fill = container.querySelector(".h-full.rounded-full") as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe("25%");
  });

  it("hides progress + rail when there are no week counters", () => {
    renderCard({ currentWeek: null, totalWeeks: null });
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  it("surfaces the compressed-plan note when compressed", () => {
    renderCard({ compressed: true });
    expect(screen.getByText(/Compressed plan/i)).toBeInTheDocument();
  });

  it("calls onEdit when the edit affordance is tapped", () => {
    const onEdit = vi.fn();
    renderCard({ onEdit });
    fireEvent.click(screen.getByRole("button", { name: /Edit race goal/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
