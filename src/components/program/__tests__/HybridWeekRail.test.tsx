/**
 * HybridWeekRail — hybrid run+lift week rail contract.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HybridWeekRail from "../HybridWeekRail";
import type { HybridWeekRailItem } from "@/lib/runProgrammeViewModel";
import type { SavedRunDoc } from "@/hooks/useClaimMap";

afterEach(cleanup);

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

function blankWeek(): HybridWeekRailItem[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dateKey: `2026-05-${String(10 + i).padStart(2, "0")}`,
    dayIndex: i,
    dayLabel: DAYS[i],
    isToday: false,
  }));
}

function renderRail(
  items: HybridWeekRailItem[],
  unclaimed: Map<string, SavedRunDoc[]> = new Map(),
  onDayTap = vi.fn()
) {
  render(
    <MemoryRouter>
      <HybridWeekRail
        items={items}
        unclaimedByDate={unclaimed}
        onDayTap={onDayTap}
      />
    </MemoryRouter>
  );
  return { onDayTap };
}

describe("HybridWeekRail", () => {
  it("renders BOTH a run lane and a lift lane on a combined day", () => {
    const items = blankWeek();
    items[1].run = {
      title: "Long 15K",
      shortLabel: "15K",
      status: "planned",
      isRace: false,
    };
    items[1].lift = {
      title: "Push — Chest",
      shortLabel: "Push",
      status: "planned",
    };
    renderRail(items);
    // Compact labels render; full names do NOT (they live in the sheet).
    expect(screen.getByText("15K")).toBeInTheDocument();
    expect(screen.getByText("Push")).toBeInTheDocument();
    expect(screen.queryByText("Long 15K")).not.toBeInTheDocument();
    // The day's accessible name names both disciplines.
    const tile = screen.getByRole("button", {
      name: /Mon.*run Long 15K.*lift Push/i,
    });
    expect(tile).toBeInTheDocument();
  });

  it("announces a race no-show run via the accessible name", () => {
    const items = blankWeek();
    items[2].run = {
      title: "Marathon Race",
      shortLabel: "Race",
      status: "race_no_show",
      isRace: true,
    };
    renderRail(items);
    expect(
      screen.getByRole("button", { name: /Tue.*race no-show/i })
    ).toBeInTheDocument();
  });

  it("fires onDayTap with the tapped day's date key", () => {
    const items = blankWeek();
    items[3].lift = { title: "Legs", shortLabel: "Legs", status: "planned" };
    const { onDayTap } = renderRail(items);
    fireEvent.click(screen.getByRole("button", { name: /Wed/i }));
    expect(onDayTap).toHaveBeenCalledWith("2026-05-13");
  });

  it("renders Q5 extras pills under a day with unclaimed logged runs", () => {
    const items = blankWeek();
    const extras = new Map<string, SavedRunDoc[]>([
      [
        "2026-05-11",
        [
          {
            id: "x1",
            date: "2026-05-11",
            distance: 5000,
            avgPace: 330,
            templateId: "easy_30",
            type: "easy",
          } as SavedRunDoc,
        ],
      ],
    ]);
    renderRail(items, extras);
    expect(
      screen.getByRole("button", { name: /Extra run: 5km/i })
    ).toBeInTheDocument();
  });

  it("marks today's tile and renders a rest day as a dash", () => {
    const items = blankWeek();
    items[0].isToday = true;
    renderRail(items);
    expect(
      screen.getByRole("button", { name: /Sun.*rest.*today/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
