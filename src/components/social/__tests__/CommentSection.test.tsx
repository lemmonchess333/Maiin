import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Packet 13 — a comment fetch that gets permission-denied (the parent
// activity turned private/followers-only after render) must CLEAR any content
// and show a neutral notice, never leave stale private text on screen.
const mockGetComments = vi.fn();

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: { displayName: "Alex" } }),
}));
vi.mock("@/lib/socialApi", () => ({
  getComments: (...a: unknown[]) => mockGetComments(...a),
  addComment: vi.fn(),
  isPermissionDenied: (err: unknown) =>
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "permission-denied",
}));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => <div data-testid="avatar" />,
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import CommentSection from "../CommentSection";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CommentSection — visibility denial (packet 13)", () => {
  it("renders comments on a successful load", async () => {
    mockGetComments.mockResolvedValue({
      comments: [{ id: "c1", authorName: "Bo", text: "secret note" }],
      lastDoc: undefined,
      hasMore: false,
    });
    render(<CommentSection activityId="act1" />);
    expect(await screen.findByText("secret note")).toBeInTheDocument();
  });

  it("clears content and shows a neutral notice when the read is denied", async () => {
    mockGetComments.mockRejectedValue({ code: "permission-denied" });
    render(<CommentSection activityId="act1" />);
    expect(
      await screen.findByText(/this activity is unavailable/i)
    ).toBeInTheDocument();
    // No comment input / stale text leaks through.
    expect(screen.queryByLabelText("Add a comment")).toBeNull();
  });
});
