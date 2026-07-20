/**
 * RaceCockpitCard — cockpit identity card contract.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// PROGRAM-CIRCLE-01: the card's "Train together" action navigates —
// mock useNavigate so tests can pin the exact hand-off URL.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import RaceCockpitCard from "../RaceCockpitCard";

afterEach(cleanup);
beforeEach(() => {
  navigateMock.mockClear();
});

function renderCard(
  props: Partial<React.ComponentProps<typeof RaceCockpitCard>> = {}
) {
  return render(
    <MemoryRouter>
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
    </MemoryRouter>
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

  /* PROGRAM-CIRCLE-01 (slice 4a) — the hand-off carries EXACTLY the
     space type, a readable title and the race date. Nothing else may
     ever travel (privacy fence). */
  it("Train together navigates with exactly type/title/date params", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Train together" }));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(
      "/social?circleCreate=race&circleTitle=Marathon%20training&circleDate=2026-10-17"
    );
  });

  it("Train together renders even without week counters", () => {
    renderCard({ currentWeek: null, totalWeeks: null });
    expect(
      screen.getByRole("button", { name: "Train together" })
    ).toBeInTheDocument();
  });

  /* Races plan PR4 — cockpit → race space cross-link, exact-id (Q4). */
  it("Race community links to the space when the binding resolves", () => {
    renderCard({ raceSpaceId: "london-marathon" });
    fireEvent.click(screen.getByRole("button", { name: /Race community/i }));
    expect(navigateMock).toHaveBeenCalledWith("/space/london-marathon");
  });

  it("no community row without a binding or with an unknown/non-race id", () => {
    renderCard();
    expect(
      screen.queryByRole("button", { name: /Race community/i })
    ).not.toBeInTheDocument();
    cleanup();
    renderCard({ raceSpaceId: "not-a-real-space" });
    expect(
      screen.queryByRole("button", { name: /Race community/i })
    ).not.toBeInTheDocument();
    cleanup();
    // An interest space id must never render as a race community.
    renderCard({ raceSpaceId: "runners" });
    expect(
      screen.queryByRole("button", { name: /Race community/i })
    ).not.toBeInTheDocument();
  });
});
