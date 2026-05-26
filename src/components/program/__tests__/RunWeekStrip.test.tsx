/**
 * RunWeekStrip — Run7 Q3 + Q8 contract tests.
 *
 * Pin the 7-column shape, status visuals, and tap-through behaviour
 * so a refactor can't silently regress to the legacy dropdown stack.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RunWeekStrip from "../RunWeekStrip";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import type { ClaimState } from "@/lib/scheduledRunCompletion";

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

describe("RunWeekStrip — shape", () => {
  it("renders exactly 7 columns even with sparse runDays", () => {
    render(
      <RunWeekStrip
        runDays={[runDay()]}
        claimMap={emptyClaimMap}
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
