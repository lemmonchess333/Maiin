/**
 * PR-J Q5 chunk B3i — ExtrasExpandSheet contract tests.
 *
 * The sheet is the overflow surface for "+N more" taps from
 * RunWeekStrip + DayPeekCard. Pin the rendering contract here so
 * regressions surface independent of either consumer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ExtrasExpandSheet from "../ExtrasExpandSheet";
import type { SavedRunDoc } from "@/hooks/useClaimMap";

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

function savedRun(overrides: Partial<SavedRunDoc> = {}): SavedRunDoc {
  return {
    id: "saved-1",
    date: "2026-05-12",
    distance: 5000,
    avgPace: 330,
    templateId: "easy_30",
    type: "easy",
    duration: 1650,
    ...overrides,
  };
}

function renderSheet(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("ExtrasExpandSheet", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("renders nothing when open=false (no portal content)", () => {
    renderSheet(
      <ExtrasExpandSheet
        open={false}
        onClose={() => {}}
        dateKey="2026-05-12"
        extras={[savedRun()]}
      />
    );
    expect(screen.queryByText("Extra runs")).not.toBeInTheDocument();
  });

  it("renders the date header + one row per extra when open", () => {
    renderSheet(
      <ExtrasExpandSheet
        open={true}
        onClose={() => {}}
        dateKey="2026-05-12"
        extras={[
          savedRun({ id: "a", distance: 5000, type: "easy" }),
          savedRun({ id: "b", distance: 3000, type: "tempo" }),
        ]}
      />
    );
    expect(screen.getByText("Extra runs")).toBeInTheDocument();
    // Date label — present in both the body header AND the
    // sr-only Drawer.Title vaul renders for a11y, so use getAllBy.
    expect(screen.getAllByText(/Tue 12 May/i).length).toBeGreaterThan(0);
    // Count summary in the body header.
    expect(screen.getByText(/2 runs/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Extra run: 5\.0 km, easy/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Extra run: 3\.0 km, tempo/i })
    ).toBeInTheDocument();
  });

  it("singularises the header count when there's exactly one extra", () => {
    renderSheet(
      <ExtrasExpandSheet
        open={true}
        onClose={() => {}}
        dateKey="2026-05-12"
        extras={[savedRun({ id: "only" })]}
      />
    );
    expect(screen.getByText(/1 run/i)).toBeInTheDocument();
  });

  it("renders pace + duration on rows that carry them", () => {
    renderSheet(
      <ExtrasExpandSheet
        open={true}
        onClose={() => {}}
        dateKey="2026-05-12"
        extras={[
          savedRun({
            id: "detailed",
            distance: 5000,
            avgPace: 330, // 5:30/km
            duration: 1650, // 27:30
            type: "easy",
          }),
        ]}
      />
    );
    // The pace label is `5:30/km` from paceLabel(330).
    expect(screen.getByText(/5:30\/km/)).toBeInTheDocument();
  });

  it("tap on a row navigates to /run/:id then closes the sheet", () => {
    const onClose = vi.fn();
    renderSheet(
      <ExtrasExpandSheet
        open={true}
        onClose={onClose}
        dateKey="2026-05-12"
        extras={[savedRun({ id: "tap-target" })]}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Extra run: 5\.0 km, easy/i })
    );
    expect(navigateMock).toHaveBeenCalledWith("/run/tap-target");
    expect(onClose).toHaveBeenCalled();
  });

  it("defensive — open with zero extras renders the empty-state copy", () => {
    renderSheet(
      <ExtrasExpandSheet
        open={true}
        onClose={() => {}}
        dateKey="2026-05-12"
        extras={[]}
      />
    );
    expect(screen.getByText(/No extra runs to show/i)).toBeInTheDocument();
  });
});
