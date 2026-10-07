import { vi, expect, it, describe, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import CommentSheet from "@/components/social/CommentSheet";
import { OBJECTIONABLE_COMMENT_MESSAGE } from "@/lib/profanityFilter";

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
/* The sheet's chrome (vaul) is not what this file is about: render the
   body whenever the sheet is open. */
vi.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => null,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
const restriction = vi.hoisted(() => ({ isRestricted: false, loading: false }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => restriction,
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/* The block list: a set the test seeds, and an addBlocked that adds to it
   the way the real hook's cache does. */
const B = vi.hoisted(() => ({
  blocked: new Set<string>(),
  addBlocked: vi.fn(),
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: B.blocked,
    ready: true,
    addBlocked: B.addBlocked,
    removeBlocked: vi.fn(),
  }),
}));

type Result = { comments: unknown[]; lastDoc?: unknown; hasMore: boolean };
const H = vi.hoisted(() => ({
  reads: [] as {
    resolve: (r: Result) => void;
    reject: (e: unknown) => void;
  }[],
  addComment: vi.fn(),
  deleteComment: vi.fn(),
  toggleCommentReaction: vi.fn(),
  reportContent: vi.fn(),
  blockUser: vi.fn(),
}));
vi.mock("@/lib/socialApi", () => ({
  getComments: () =>
    new Promise<Result>((resolve, reject) => {
      H.reads.push({ resolve, reject });
    }),
  addComment: H.addComment,
  deleteComment: H.deleteComment,
  toggleCommentReaction: H.toggleCommentReaction,
  isPermissionDenied: (e: { code?: string }) => e?.code === "permission-denied",
  reportContent: H.reportContent,
  blockUser: H.blockUser,
}));

import { toast } from "@/lib/toast";

afterEach(cleanup);
beforeEach(() => {
  H.reads = [];
  vi.clearAllMocks();
  restriction.isRestricted = false;
  B.blocked = new Set<string>();
  B.addBlocked.mockImplementation((uid: string) => B.blocked.add(uid));
  H.reportContent.mockResolvedValue(undefined);
  H.blockUser.mockResolvedValue(undefined);
  H.deleteComment.mockResolvedValue(undefined);
});

function openSheet(commentCount = 3) {
  return render(
    <CommentSheet
      activityId="post-1"
      activityAuthorId="author"
      open
      onOpenChange={vi.fn()}
      commentCount={commentCount}
    />
  );
}

it("reads as loading until the comments arrive, not as none", async () => {
  openSheet();
  expect(screen.getByLabelText("Loading comments")).toBeInTheDocument();
  expect(screen.queryByText("No comments yet")).toBeNull();

  await act(async () => {
    H.reads[0].resolve({
      comments: [{ id: "c1", authorName: "Priya", text: "Strong finish" }],
      hasMore: false,
    });
  });
  expect(screen.getByText("Strong finish")).toBeInTheDocument();
  expect(screen.queryByLabelText("Loading comments")).toBeNull();
});

it("says no comments only once the read has answered empty", async () => {
  openSheet(0);
  await act(async () => {
    H.reads[0].resolve({ comments: [], hasMore: false });
  });
  expect(screen.getByText("No comments yet")).toBeInTheDocument();
});

it("says a failed read failed, and Try again reads again", async () => {
  openSheet();
  await act(async () => {
    H.reads[0].reject(new Error("offline"));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load comments");
  expect(screen.queryByText("No comments yet")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(H.reads).toHaveLength(2);
  expect(screen.getByLabelText("Loading comments")).toBeInTheDocument();

  await act(async () => {
    H.reads[1].resolve({
      comments: [{ id: "c1", authorName: "Priya", text: "Strong finish" }],
      hasMore: false,
    });
  });
  expect(screen.getByText("Strong finish")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

const PRIYA = {
  id: "c1",
  authorId: "priya",
  authorName: "Priya",
  text: "Strong finish",
};
const MINE = { id: "c2", authorId: "me", authorName: "Me", text: "Thanks" };

async function openWith(comments: unknown[]) {
  openSheet();
  await act(async () => {
    H.reads[0].resolve({ comments, hasMore: false });
  });
}

describe("someone else's comment — Report and Block user", () => {
  it("offers its options; your own comment offers Delete instead", async () => {
    await openWith([PRIYA, MINE]);
    expect(
      screen.getByRole("button", { name: "More options for Priya's comment" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "More options for Me's comment" })
    ).toBeNull();
    // Exactly one Delete: on your own comment, not on Priya's.
    expect(
      screen.getAllByRole("button", { name: "Delete comment" })
    ).toHaveLength(1);
  });

  it("files a report on the comment, in the sheet, then shows the list again", async () => {
    await openWith([PRIYA, MINE]);
    fireEvent.click(
      screen.getByRole("button", { name: "More options for Priya's comment" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Report comment" }));

    expect(
      screen.getByRole("heading", { name: "Report comment" })
    ).toBeInTheDocument();
    // The form replaces the list and the composer.
    expect(screen.queryByText("Strong finish")).toBeNull();
    expect(screen.queryByLabelText("Add a comment")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    });

    expect(H.reportContent).toHaveBeenCalledTimes(1);
    expect(H.reportContent).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "comment",
        targetId: "post-1:c1",
        category: "other",
      })
    );
    // The author's uid is the server's to resolve, never the client's.
    expect(H.reportContent.mock.calls[0][0]).not.toHaveProperty("targetUid");
    expect(screen.getByText("Strong finish")).toBeInTheDocument();
  });

  it("blocks the author after a confirmation, and their comments go", async () => {
    await openWith([PRIYA, MINE]);
    fireEvent.click(
      screen.getByRole("button", { name: "More options for Priya's comment" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Block user" }));
    expect(
      screen.getByRole("heading", { name: "Block Priya?" })
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Block" }));
    });

    expect(H.blockUser).toHaveBeenCalledWith("me", "priya");
    expect(B.addBlocked).toHaveBeenCalledWith("priya");
    expect(toast.success).toHaveBeenCalledWith("Blocked Priya");
    expect(screen.queryByText("Strong finish")).toBeNull();
    expect(screen.getByText("Thanks")).toBeInTheDocument();
  });

  it("Cancel goes back to the list without blocking", async () => {
    await openWith([PRIYA]);
    fireEvent.click(
      screen.getByRole("button", { name: "More options for Priya's comment" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Block user" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(H.blockUser).not.toHaveBeenCalled();
    expect(screen.getByText("Strong finish")).toBeInTheDocument();
  });

  it("leaves out the comments of someone already blocked", async () => {
    B.blocked = new Set(["priya"]);
    await openWith([PRIYA, MINE]);
    // Anchored on a comment that does show, so the absence below is not
    // just a list that has not rendered.
    expect(screen.getByText("Thanks")).toBeInTheDocument();
    expect(screen.queryByText("Strong finish")).toBeNull();
  });
});

describe("your own comment — Delete", () => {
  it("asks in the sheet and deletes on one tap", async () => {
    await openWith([PRIYA, MINE]);
    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    expect(
      screen.getByRole("heading", { name: "Delete comment?" })
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(H.deleteComment).toHaveBeenCalledTimes(1);
    expect(H.deleteComment).toHaveBeenCalledWith("post-1", "c2");
    // The row animates out; it is there first, so this waits for it to go.
    await waitFor(() => expect(screen.queryByText("Thanks")).toBeNull());
    expect(screen.getByText("Strong finish")).toBeInTheDocument();
  });
});

describe("the word filter", () => {
  it("refuses objectionable text before sending, with the server's sentence", async () => {
    await openWith([]);
    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "this hill sucks" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    expect(toast.error).toHaveBeenCalledWith(OBJECTIONABLE_COMMENT_MESSAGE);
    expect(H.addComment).not.toHaveBeenCalled();
  });
});

describe("a restricted account (S4e)", () => {
  it("reads the thread but cannot comment, and is told why", async () => {
    restriction.isRestricted = true;
    await openWith([{ id: "c1", authorId: "priya", text: "Strong finish" }]);
    expect(screen.getByText("Strong finish")).toBeInTheDocument();
    expect(screen.getByText("Your account is restricted")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Contact support" })
    ).toHaveAttribute("href", expect.stringMatching(/^mailto:support@/));
    expect(screen.getByLabelText("Add a comment")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("cannot add a reaction, but can take one back", async () => {
    restriction.isRestricted = true;
    H.toggleCommentReaction.mockResolvedValue({ reacted: false, count: 0 });
    await openWith([
      {
        id: "c1",
        authorId: "priya",
        text: "Strong finish",
        reactions: { muscle: ["me"] },
      },
    ]);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Add fire reaction" })
      );
    });
    expect(H.toggleCommentReaction).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Your account is restricted, so you can't do this for now.",
      expect.anything()
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Remove strong reaction" })
      );
    });
    expect(H.toggleCommentReaction).toHaveBeenCalledWith(
      "post-1",
      "c1",
      "muscle"
    );
  });

  it("says so when the server refuses a comment for a restriction", async () => {
    // Restricted after the sheet opened: the server's refusal is the
    // first the app hears of it.
    H.addComment.mockRejectedValue(
      Object.assign(new Error("restricted"), {
        code: "functions/permission-denied",
        details: { reason: "account-restricted" },
      })
    );
    await openWith([]);
    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "Nice one" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Your account is restricted, so you can't do this for now.",
      expect.anything()
    );
  });
});
