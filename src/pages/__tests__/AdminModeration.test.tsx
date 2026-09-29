/**
 * AdminModeration's queue read: on mount for an admin, on Refresh, and
 * when the callable fails.
 *
 * The mount read commits only when the callable answers — the page starts
 * in its loading state, so there is nothing to clear first. Refresh clears
 * the list and any error itself, returning the page to loading until the
 * new answer lands.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const h = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useUid: () => "admin-1" }));
vi.mock("@/lib/adminAuth", () => ({
  isAdminUid: (uid: string | null) => uid === "admin-1",
}));
vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) =>
    name === "listPendingReports" ? h.list : vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import AdminModeration from "../AdminModeration";

function report(reportId: string, caption: string) {
  return {
    reportId,
    reporterId: "reporter",
    targetType: "activity",
    targetId: "activity-1",
    targetUid: "author",
    targetActionable: true,
    reportedTargetType: "activity",
    reportedTargetId: "activity-1",
    reason: "spam",
    details: null,
    createdAt: 1,
    target: { caption },
  };
}

const answer = (reports: unknown[]) => ({ data: { reports } });

beforeEach(() => h.list.mockReset());
afterEach(() => cleanup());

describe("AdminModeration — the pending queue", () => {
  it("reads the queue once on mount, showing loading until it answers", async () => {
    h.list.mockResolvedValue(answer([report("r1", "First caption")]));
    render(<AdminModeration />);
    expect(screen.getByText("Loading pending reports…")).toBeInTheDocument();
    expect(await screen.findByText("First caption")).toBeInTheDocument();
    expect(h.list).toHaveBeenCalledTimes(1);
  });

  it("Refresh returns to loading, then shows the new answer", async () => {
    h.list.mockResolvedValueOnce(answer([report("r1", "First caption")]));
    render(<AdminModeration />);
    // POSITIVE anchor: the first answer is on screen.
    expect(await screen.findByText("First caption")).toBeInTheDocument();

    let land!: (value: unknown) => void;
    h.list.mockReturnValueOnce(
      new Promise((resolve) => {
        land = resolve;
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("Loading pending reports…")).toBeInTheDocument();
    expect(screen.queryByText("First caption")).toBeNull();

    await act(async () => {
      land(answer([]));
    });
    expect(screen.getByText("No pending reports.")).toBeInTheDocument();
  });

  it("a failed read shows its message, and Refresh clears it", async () => {
    h.list.mockRejectedValueOnce(new Error("permission-denied"));
    render(<AdminModeration />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "permission-denied"
    );

    h.list.mockResolvedValueOnce(answer([]));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(await screen.findByText("No pending reports.")).toBeInTheDocument();
  });
});
