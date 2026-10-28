/**
 * A post's comments on its own page (Mob2's Mobbin finding 9): the thread
 * under the post, through the callables the feed's sheet uses, with the
 * field to add one on the page. The sheet's own suite (CommentSheet.test)
 * holds the shared behaviour in depth; this one holds the page.
 */
import { vi, expect, it, describe, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import ActivityPostComments from "@/components/social/ActivityPostComments";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "me", emailVerified: true },
    profile: { displayName: "Me" },
  }),
  useUid: () => "me",
}));
vi.mock("@/hooks/useEmailVerificationGate", () => ({
  useEmailVerificationGate: () => ({
    needsVerification: false,
    recheck: vi.fn(),
  }),
}));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => null,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/wordFilter", () => ({
  loadWordFilter: async () => ({ containsProfanity: () => false }),
}));
const B = vi.hoisted(() => ({ blocked: new Set<string>() }));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: B.blocked,
    ready: true,
    addBlocked: vi.fn(),
    removeBlocked: vi.fn(),
  }),
}));

const H = vi.hoisted(() => ({
  comments: [] as Record<string, unknown>[],
  getComments: vi.fn(),
  addComment: vi.fn(),
}));
vi.mock("@/lib/socialApi", () => ({
  getComments: H.getComments,
  addComment: H.addComment,
  deleteComment: vi.fn(),
  toggleCommentReaction: vi.fn(),
  isPermissionDenied: (e: { code?: string }) => e?.code === "permission-denied",
  reportContent: vi.fn(),
  blockUser: vi.fn(),
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  B.blocked = new Set();
  H.comments = [
    { id: "c1", authorId: "ann", authorName: "Ann", text: "Strong finish" },
    { id: "c2", authorId: "blocker", authorName: "Blocker", text: "Hidden" },
  ];
  H.getComments.mockImplementation(async () => ({
    comments: H.comments,
    hasMore: false,
  }));
  H.addComment.mockResolvedValue(undefined);
});

function renderComments(
  props: Partial<Parameters<typeof ActivityPostComments>[0]> = {}
) {
  const onCountChange = vi.fn();
  const onUnavailable = vi.fn();
  const view = render(
    <ActivityPostComments
      activityId="a1"
      activityAuthorId="author"
      commentCount={2}
      quickChips={["Nice run"]}
      onCountChange={onCountChange}
      onUnavailable={onUnavailable}
      focusKey={0}
      {...props}
    />
  );
  return { ...view, onCountChange, onUnavailable };
}

describe("ActivityPostComments", () => {
  it("shows the thread on the page under a heading with the count", async () => {
    renderComments();
    expect(screen.getByRole("heading", { name: "Comments (2)" })).toBeVisible();
    expect(await screen.findByText("Strong finish")).toBeInTheDocument();
    // No sheet: the comments are part of the page.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves out comments from anyone either side of a block", async () => {
    B.blocked = new Set(["blocker"]);
    renderComments();
    expect(await screen.findByText("Strong finish")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).toBeNull();
  });

  it("adds a comment through the same callable, and counts it", async () => {
    const { onCountChange } = renderComments();
    await screen.findByText("Strong finish");
    fireEvent.change(screen.getByRole("textbox", { name: "Add a comment" }), {
      target: { value: "Great pace" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    expect(H.addComment).toHaveBeenCalledWith(
      "a1",
      "me",
      "Me",
      "Great pace",
      "author",
      undefined
    );
    expect(onCountChange).toHaveBeenCalledWith(1);
  });

  it("puts the field in focus when asked", async () => {
    const { rerender, onCountChange, onUnavailable } = renderComments();
    await screen.findByText("Strong finish");
    const field = screen.getByRole("textbox", { name: "Add a comment" });
    expect(field).not.toHaveFocus();
    rerender(
      <ActivityPostComments
        activityId="a1"
        activityAuthorId="author"
        commentCount={2}
        onCountChange={onCountChange}
        onUnavailable={onUnavailable}
        focusKey={1}
      />
    );
    expect(field).toHaveFocus();
  });

  it("says so when there are none yet", async () => {
    H.comments = [];
    renderComments({ commentCount: 0 });
    expect(await screen.findByText("No comments yet")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Comments" })).toBeVisible();
  });

  it("tells the page when the post can no longer be read", async () => {
    H.getComments.mockRejectedValue({ code: "permission-denied" });
    const { onUnavailable } = renderComments();
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalled());
  });
});
