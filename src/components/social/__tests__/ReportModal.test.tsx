/**
 * ReportModal — S4 two-tier picker + three-checkbox contract tests.
 *
 * Pins:
 *   - Top-level categories surfaced as a radiogroup
 *   - Sub-reasons only render after a category that has them is picked
 *   - Three action checkboxes with the locked defaults (Report on,
 *     Hide on, Block off)
 *   - Submit is disabled until a category is picked AND at least one
 *     action checkbox is on AND the sub-reason (when required) is set
 *   - On submit: report is queued, block fires when checked, hide
 *     fires for activity targets when checked
 *   - Block checkbox only renders when targetAuthorUid is supplied
 *     and isn't the current user
 *   - Freeform note enforces the 500-char cap
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const reportContentMock = vi.fn(async () => undefined);
const blockUserMock = vi.fn(async () => undefined);
vi.mock("../../../lib/socialApi", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/socialApi")>(
    "../../../lib/socialApi",
  );
  return {
    ...actual,
    reportContent: (...args: unknown[]) =>
      reportContentMock(...(args as Parameters<typeof reportContentMock>)),
    blockUser: (...args: unknown[]) =>
      blockUserMock(...(args as Parameters<typeof blockUserMock>)),
  };
});

const hideMock = vi.fn();
vi.mock("@/hooks/useHiddenActivities", () => ({
  useHiddenActivities: () => ({
    hidden: new Set<string>(),
    hide: hideMock,
    unhide: vi.fn(),
  }),
}));

vi.mock("../../../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u-self" } }),
}));

import ReportModal from "../ReportModal";

function renderWith(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

beforeEach(() => {
  reportContentMock.mockClear();
  blockUserMock.mockClear();
  hideMock.mockClear();
});

describe("ReportModal — category picker", () => {
  it("renders the 5 top-level categories as a radiogroup", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: /Report category/i });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("sub-reason picker only appears once a category with sub-reasons is selected", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("radiogroup", { name: /Sub-reason/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Harassment or bullying/i }));
    expect(screen.getByRole("radiogroup", { name: /Sub-reason/i })).toBeInTheDocument();
  });

  it("'Other' category has no sub-reasons", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    expect(screen.queryByRole("radiogroup", { name: /Sub-reason/i })).not.toBeInTheDocument();
  });
});

describe("ReportModal — action checkboxes", () => {
  it("locked defaults: Report ON, Hide ON, Block OFF", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    expect(screen.getByRole("checkbox", { name: /Send to review team/i }).getAttribute("aria-checked"))
      .toBe("true");
    expect(screen.getByRole("checkbox", { name: /Hide from my feed/i }).getAttribute("aria-checked"))
      .toBe("true");
    expect(screen.getByRole("checkbox", { name: /Block this user/i }).getAttribute("aria-checked"))
      .toBe("false");
  });

  it("Block checkbox is hidden when targetAuthorUid is missing", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    expect(screen.queryByRole("checkbox", { name: /Block this user/i })).not.toBeInTheDocument();
  });

  it("Block checkbox is hidden when targetAuthorUid is the current user (self-report)", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-self"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    expect(screen.queryByRole("checkbox", { name: /Block this user/i })).not.toBeInTheDocument();
  });

  it("Hide checkbox is hidden for user targets (only meaningful on activities)", () => {
    renderWith(
      <ReportModal
        targetType="user"
        targetId="u-other"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    expect(screen.queryByRole("checkbox", { name: /Hide from my feed/i })).not.toBeInTheDocument();
  });
});

describe("ReportModal — submit gating", () => {
  it("Submit disabled until a category is picked", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    const submit = screen.getByRole("button", { name: /^Submit$/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("Submit disabled when a category with sub-reasons is picked but no sub-reason chosen", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Harassment/i }));
    const submit = screen.getByRole("button", { name: /^Submit$/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("Submit disabled when all three action checkboxes are unchecked", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    // Toggle off all three.
    fireEvent.click(screen.getByRole("checkbox", { name: /Send to review team/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Hide from my feed/i }));
    // Block is already off by default.
    const submit = screen.getByRole("button", { name: /^Submit$/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("Submit enabled once a sub-reason-free category is picked + at least one action is on", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    const submit = screen.getByRole("button", { name: /^Submit$/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });
});

describe("ReportModal — submit orchestration", () => {
  it("fires reportContent + hide for an activity report with defaults", async () => {
    const onClose = vi.fn();
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Submit$/i }));
    });
    expect(reportContentMock).toHaveBeenCalledTimes(1);
    expect(blockUserMock).not.toHaveBeenCalled();
    expect(hideMock).toHaveBeenCalledWith("act-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("fires blockUser when Block-author is toggled on", async () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Block this user/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Submit$/i }));
    });
    expect(blockUserMock).toHaveBeenCalledWith("u-self", "u-other");
  });

  it("skips reportContent when only Hide is checked (informant-free fast path)", async () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Send to review team/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Submit$/i }));
    });
    expect(reportContentMock).not.toHaveBeenCalled();
    expect(hideMock).toHaveBeenCalledWith("act-1");
  });

  it("includes the chosen category + sub-reason in the report payload", async () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Harassment/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Targeted insults or threats/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Submit$/i }));
    });
    expect(reportContentMock).toHaveBeenCalledWith(
      "u-self",
      expect.objectContaining({
        category: "harassment",
        subReason: "Targeted insults or threats",
        targetUid: "u-other",
        hideFromFeed: true,
        blockAuthor: false,
      }),
    );
  });
});

describe("ReportModal — freeform note cap", () => {
  it("clips input at 500 chars", () => {
    renderWith(
      <ReportModal
        targetType="activity"
        targetId="act-1"
        targetAuthorUid="u-other"
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    const textarea = screen.getByLabelText(/Anything else/i) as HTMLTextAreaElement;
    const longText = "x".repeat(600);
    fireEvent.change(textarea, { target: { value: longText } });
    expect(textarea.value.length).toBe(500);
  });
});
