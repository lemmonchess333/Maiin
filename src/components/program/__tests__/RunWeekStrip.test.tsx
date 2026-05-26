/**
 * RunWeekStrip — Run7 Q3 + Q8 contract tests.
 *
 * Pin the 7-column shape, status visuals, and tap-through behaviour
 * so a refactor can't silently regress to the legacy dropdown stack.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RunWeekStrip from "../RunWeekStrip";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import type { SavedRunDoc } from "@/hooks/useClaimMap";

// PR-J chunk B3e — extras pills navigate via react-router-dom's
// useNavigate. Mock it so tests can assert the destination without
// rendering a full Router tree.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderStrip(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

function runDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: "runday_2026-05-10_2_easy_30",
    dayIndex: 2,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    date: "2026-05-12",
    weekKey: "2026-05-10",
    ...overrides,
  };
}

const emptyClaimMap: Map<string, ClaimState> = new Map();
const emptyUnclaimed: Map<string, SavedRunDoc[]> = new Map();

function claimMapWith(
  entries: Array<[string, Partial<ClaimState>]>
): Map<string, ClaimState> {
  const m = new Map<string, ClaimState>();
  for (const [id, partial] of entries) {
    m.set(id, {
      claimedSavedRunId: undefined,
      manualCompleted: false,
      legacyCompleted: false,
      ...partial,
    });
  }
  return m;
}

function savedRun(overrides: Partial<SavedRunDoc> = {}): SavedRunDoc {
  return {
    id: "saved-1",
    date: "2026-05-12",
    distance: 5000,
    avgPace: 330,
    templateId: "easy_30",
    type: "easy",
    ...overrides,
  };
}

describe("RunWeekStrip — shape", () => {
  it("renders exactly 7 columns even with sparse runDays", () => {
    render(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    expect(screen.getAllByRole("button")).toHaveLength(7);
  });

  it("renders empty (rest) days as the em-dash placeholder", () => {
    // Tuesday has a runDay; Sun/Mon/Wed/Thu/Fri/Sat do not.
    render(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    const restColumns = screen
      .getAllByRole("button")
      .filter((col) => col.textContent?.includes("—"));
    expect(restColumns).toHaveLength(6);
  });

  it("renders the matching RUN_TEMPLATES name for a populated day", () => {
    render(
      <RunWeekStrip
        runDays={[runDay({ templateId: "long_10k", dayIndex: 6 })]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    expect(screen.getByText(/Long 10K/i)).toBeInTheDocument();
  });

  it("prefers userOverride template over the underlying templateId", () => {
    render(
      <RunWeekStrip
        runDays={[runDay({ templateId: "easy_30", userOverride: "5x1k" })]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    expect(screen.getByText(/5×1K Intervals/i)).toBeInTheDocument();
    expect(screen.queryByText(/Easy 30/i)).not.toBeInTheDocument();
  });
});

describe("RunWeekStrip — status visuals", () => {
  it("manual completion (claim map entry) renders the Check icon and strikes through the label", () => {
    // PR-J chunk B3b — manualCompleted in the claim map drives the
    // ✅. Replaces the legacy "set status=completed_exact on the
    // runDay" path; same UI, different source of truth.
    const rd = runDay();
    const { container } = render(
      <RunWeekStrip
        runDays={[rd]}
        claimMap={claimMapWith([[rd.id!, { manualCompleted: true }]])}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    expect(container.querySelector(".line-through")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /completed/i })
    ).toBeInTheDocument();
  });

  it("saved-run claim renders the Check icon and strikes through the label", () => {
    const rd = runDay();
    const { container } = render(
      <RunWeekStrip
        runDays={[rd]}
        claimMap={claimMapWith([[rd.id!, { claimedSavedRunId: "saved-1" }]])}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    expect(container.querySelector(".line-through")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /completed/i })
    ).toBeInTheDocument();
  });

  it("legacy completed_* docs still render as completed via legacyCompleted", () => {
    // Old docs that pre-date the soft-link reframe still carry
    // status="completed_*". `computeClaims` surfaces them via
    // `legacyCompleted: true` in the claim map; the visual stays
    // identical so existing users see no regression.
    const rd = runDay({ status: "completed_exact" });
    const { container } = render(
      <RunWeekStrip
        runDays={[rd]}
        claimMap={claimMapWith([[rd.id!, { legacyCompleted: true }]])}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    expect(container.querySelector(".line-through")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /completed/i })
    ).toBeInTheDocument();
  });

  it("skipped renders the chevrons-right icon and strikethrough label", () => {
    const { container } = render(
      <RunWeekStrip
        runDays={[runDay({ status: "skipped" })]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    expect(container.querySelector(".line-through")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /skipped/i })
    ).toBeInTheDocument();
  });

  it("race_no_show surfaces a coral warning indicator (no strikethrough)", () => {
    const { container } = render(
      <RunWeekStrip
        runDays={[runDay({ status: "race_no_show" })]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    expect(container.querySelector(".line-through")).toBeNull();
    expect(
      screen.getByRole("button", { name: /race no-show/i })
    ).toBeInTheDocument();
  });

  it("planned (no claim, no terminal status) renders no completion or skip indicator", () => {
    // Defensive — proves the absence of a claim doesn't accidentally
    // strike through the label or surface the wrong icon.
    const { container } = render(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    expect(container.querySelector(".line-through")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /completed/i })
    ).not.toBeInTheDocument();
  });
});

describe("RunWeekStrip — tap behaviour", () => {
  it("clicking a column invokes onDayTap with that day's dateKey", () => {
    const onDayTap = vi.fn();
    // weekKey 2026-05-10 (Sunday). dayIndex 2 → 2026-05-12 (Tuesday).
    render(
      <RunWeekStrip
        runDays={[
          runDay({ dayIndex: 2, date: "2026-05-12", weekKey: "2026-05-10" }),
        ]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={onDayTap}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Tue/i }));
    expect(onDayTap).toHaveBeenCalledWith("2026-05-12");
  });

  it("rest-day columns are still tappable (DayActionSheet handles the empty state)", () => {
    const onDayTap = vi.fn();
    render(
      <RunWeekStrip
        runDays={[runDay({ dayIndex: 2, weekKey: "2026-05-10" })]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={onDayTap}
      />
    );
    // Wednesday (dayIndex 3) is a rest day in this fixture.
    fireEvent.click(screen.getByRole("button", { name: /Wed/i }));
    expect(onDayTap).toHaveBeenCalledWith("2026-05-13");
  });

  it("each column meets the iOS HIG 44px touch-target floor", () => {
    render(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);
    buttons.forEach((btn) => {
      expect(btn.className).toContain("min-h-[44px]");
    });
  });
});

describe("RunWeekStrip — Q5 extras pills (chunk B3e)", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("renders no extras pills when unclaimedByDate is empty", () => {
    renderStrip(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
        unclaimedByDate={emptyUnclaimed}
        onDayTap={() => {}}
      />
    );
    // No buttons with the extras-pill aria-label.
    expect(
      screen.queryByRole("button", { name: /Extra run/i })
    ).not.toBeInTheDocument();
  });

  it("renders a single extras pill for a date with one unclaimed saved run (Q5 P69)", () => {
    const extras = new Map<string, SavedRunDoc[]>([
      ["2026-05-12", [savedRun({ id: "saved-extra-1", distance: 5000 })]],
    ]);
    renderStrip(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
        unclaimedByDate={extras}
        onDayTap={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /Extra run: 5km easy/i })
    ).toBeInTheDocument();
  });

  it("tapping an extras pill navigates to RunDetail (/run/:id)", () => {
    const extras = new Map<string, SavedRunDoc[]>([
      ["2026-05-12", [savedRun({ id: "saved-extra-tap" })]],
    ]);
    renderStrip(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
        unclaimedByDate={extras}
        onDayTap={() => {}}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Extra run: 5km easy/i })
    );
    expect(navigateMock).toHaveBeenCalledWith("/run/saved-extra-tap");
  });

  it("caps visible extras at 2 and surfaces a '+N more' indicator (Q5 P71)", () => {
    const extras = new Map<string, SavedRunDoc[]>([
      [
        "2026-05-12",
        [
          savedRun({ id: "saved-1", distance: 3000 }),
          savedRun({ id: "saved-2", distance: 4000 }),
          savedRun({ id: "saved-3", distance: 5000 }),
          savedRun({ id: "saved-4", distance: 6000 }),
        ],
      ],
    ]);
    renderStrip(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
        unclaimedByDate={extras}
        onDayTap={() => {}}
      />
    );
    // Only the first two saved runs render as visible pills.
    expect(
      screen.getByRole("button", { name: /Extra run: 3km easy/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Extra run: 4km easy/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Extra run: 5km easy/i })
    ).not.toBeInTheDocument();
    // Overflow indicator surfaces with the residual count.
    expect(
      screen.getByRole("button", { name: /2 more extra runs/i })
    ).toBeInTheDocument();
  });

  it("tapping '+N more' opens the dedicated extras expand sheet (Q5 P71, chunk B3i)", () => {
    // Pre-B3i this navigated to /history as a functional fallback.
    // Post-B3i a date-scoped sheet opens listing every unclaimed
    // saved run for that day with full detail (pace + duration).
    const extras = new Map<string, SavedRunDoc[]>([
      [
        "2026-05-12",
        [
          savedRun({
            id: "saved-1",
            distance: 3000,
            type: "easy",
            avgPace: 330,
            duration: 990,
          }),
          savedRun({
            id: "saved-2",
            distance: 4000,
            type: "tempo",
          }),
          savedRun({
            id: "saved-3",
            distance: 5000,
            type: "long",
          }),
        ],
      ],
    ]);
    renderStrip(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
        unclaimedByDate={extras}
        onDayTap={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /1 more extra run/i }));
    // Sheet content surfaces inside the same document (vaul portal).
    // Match the eyebrow exactly to avoid colliding with the
    // sr-only Drawer.Title ("Extra runs on …") that vaul renders.
    expect(screen.getByText("Extra runs")).toBeInTheDocument();
    // The 3rd (overflowed) saved run is now listed in the sheet.
    expect(
      screen.getByRole("button", { name: /Extra run: 5\.0 km, long/i })
    ).toBeInTheDocument();
    // No navigation happened (overflow tap is a local sheet open).
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("renders extras even when no planned slot exists for that date (standalone case — Q5 scenario 1)", () => {
    // A rest-day Wednesday (dayIndex 3) with no runDay but an extras
    // entry for that date. Pill should still surface.
    const extras = new Map<string, SavedRunDoc[]>([
      ["2026-05-13", [savedRun({ id: "wed-extra", date: "2026-05-13" })]],
    ]);
    renderStrip(
      <RunWeekStrip
        runDays={[runDay({ dayIndex: 2, weekKey: "2026-05-10" })]}
        claimMap={emptyClaimMap}
        unclaimedByDate={extras}
        onDayTap={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /Extra run: 5km easy/i })
    ).toBeInTheDocument();
  });

  it("renders distance as a whole number when integer km, otherwise 1-decimal (Q5 P70 compact label)", () => {
    const extras = new Map<string, SavedRunDoc[]>([
      [
        "2026-05-12",
        [
          savedRun({ id: "saved-int", distance: 10000, type: "freerun" }),
          savedRun({ id: "saved-frac", distance: 5432, type: "tempo" }),
        ],
      ],
    ]);
    renderStrip(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
        unclaimedByDate={extras}
        onDayTap={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /Extra run: 10km freerun/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Extra run: 5\.4km tempo/i })
    ).toBeInTheDocument();
  });
});
