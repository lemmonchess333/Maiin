/**
 * AdminModeration's queue read: on mount for an admin, on Refresh, and
 * when the callable fails. And its restricted accounts, each with Lift
 * (S4e).
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

const h = vi.hoisted(() => ({
  list: vi.fn(),
  resolve: vi.fn(),
  restricted: vi.fn(),
  lift: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "admin-1" }));
vi.mock("@/lib/adminAuth", () => ({
  isAdminUid: (uid: string | null) => uid === "admin-1",
}));
vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) =>
    ({
      listPendingReports: h.list,
      resolveReport: h.resolve,
      listRestrictedUsers: h.restricted,
      liftRestriction: h.lift,
    })[name] ?? vi.fn(),
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

beforeEach(() => {
  h.list.mockReset();
  h.restricted.mockReset();
  h.restricted.mockResolvedValue({ data: { restricted: [] } });
});
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

function spaceCommentReport() {
  return {
    reportId: "r-space",
    reporterId: "reporter",
    targetType: "space_post_comment",
    targetId: "runners:p1:c1",
    targetUid: "commenter",
    targetActionable: true,
    targetHideable: true,
    reportedTargetType: "space_post_comment",
    reportedTargetId: "runners:p1:c1",
    reason: "harassment",
    details: "Third time this week.",
    createdAt: 1,
    target: { text: "rude words", authorName: "Sam", spaceId: "runners" },
  };
}

function profileReport() {
  return {
    reportId: "r-user",
    reporterId: "reporter",
    targetType: "user",
    targetId: "u9",
    targetUid: "u9",
    targetActionable: true,
    targetHideable: false,
    reportedTargetType: "user",
    reportedTargetId: "u9",
    reason: "other",
    details: null,
    createdAt: 1,
    target: { uid: "u9", displayName: "Dana" },
  };
}

describe("AdminModeration — Hide content", () => {
  beforeEach(() => h.resolve.mockReset());

  it("shows a Space comment report with its text, and hides it on request", async () => {
    h.list.mockResolvedValue(answer([spaceCommentReport()]));
    h.resolve.mockResolvedValue({ data: { ok: true } });
    render(<AdminModeration />);

    expect(await screen.findByText("rude words")).toBeInTheDocument();
    expect(screen.getByText(/Space comment/)).toBeInTheDocument();
    expect(screen.getByText("Third time this week.")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hide content" }));
    });
    expect(h.resolve).toHaveBeenCalledWith({
      reportId: "r-space",
      hideActivity: true,
      restrictUser: false,
    });
    expect(screen.queryByText("rude words")).toBeNull();
  });

  it("offers no Hide content on a profile, only Restrict user", async () => {
    h.list.mockResolvedValue(answer([profileReport()]));
    render(<AdminModeration />);

    expect(await screen.findByText("Dana")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide content" })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Restrict user/ })
    ).toBeInTheDocument();
  });

  it("still hides an activity for a server that does not say targetHideable", async () => {
    const legacy = report("r1", "First caption") as Record<string, unknown>;
    delete legacy.targetHideable;
    h.list.mockResolvedValue(answer([legacy]));
    render(<AdminModeration />);

    expect(await screen.findByText("First caption")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide content" })
    ).toBeInTheDocument();
  });
});

describe("AdminModeration — restricted accounts (S4e)", () => {
  beforeEach(() => {
    h.list.mockResolvedValue(answer([]));
    h.lift.mockReset();
    h.resolve.mockReset();
  });

  const sam = {
    uid: "sam-uid",
    displayName: "Sam",
    restrictedAt: null,
    lastActionedReport: "r1",
  };

  it("lists the restricted accounts, and lifts one after a confirm", async () => {
    h.restricted.mockResolvedValue({ data: { restricted: [sam] } });
    h.lift.mockResolvedValue({ data: { ok: true, lifted: true } });
    render(<AdminModeration />);

    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("sam-uid")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Lift the restriction on Sam" })
    );
    // Nothing is lifted until the confirm.
    expect(h.lift).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lift" }));
    });
    expect(h.lift).toHaveBeenCalledWith({ uid: "sam-uid" });
    expect(screen.queryByText("Sam")).toBeNull();
    expect(screen.getByText("No account is restricted.")).toBeInTheDocument();
  });

  it("keeps the account listed when the lift fails", async () => {
    h.restricted.mockResolvedValue({ data: { restricted: [sam] } });
    h.lift.mockRejectedValue(new Error("permission-denied"));
    render(<AdminModeration />);

    expect(await screen.findByText("Sam")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Lift the restriction on Sam" })
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lift" }));
    });
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });

  it("reads the list again after Restrict user, so the account shows", async () => {
    h.list.mockResolvedValue(answer([profileReport()]));
    h.resolve.mockResolvedValue({ data: { ok: true } });
    render(<AdminModeration />);

    expect(await screen.findByText("Dana")).toBeInTheDocument();
    expect(h.restricted).toHaveBeenCalledTimes(1);
    h.restricted.mockResolvedValue({
      data: {
        restricted: [{ ...sam, uid: "u9", displayName: "Dana R." }],
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Restrict user/ }));
    });
    expect(h.resolve).toHaveBeenCalledWith({
      reportId: "r-user",
      hideActivity: false,
      restrictUser: true,
    });
    expect(h.restricted).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Dana R.")).toBeInTheDocument();
  });
});
