/**
 * Comments on a Space post: someone else's comment can be reported (as a
 * `space_post_comment`, the id shape the server validates) and its author
 * blocked; a blocked author's comments are left out; your own comment is
 * deleted after a confirmation inside the sheet; and objectionable text is
 * refused with the sentence the server refuses it with.
 */
import { vi, expect, it, describe, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import type { ReactNode } from "react";
import SpaceCommentSheet from "../SpaceCommentSheet";
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
vi.mock("@/components/Avatar", () => ({ default: () => null }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

const H = vi.hoisted(() => ({
  getSpacePostComments: vi.fn(),
  addSpacePostComment: vi.fn(),
  deleteSpacePostComment: vi.fn(),
  reportContent: vi.fn(),
  blockUser: vi.fn(),
}));
vi.mock("@/lib/socialApi", () => H);

import { toast } from "@/lib/toast";

const PRIYA = {
  id: "c1",
  authorId: "priya",
  authorName: "Priya",
  text: "Strong finish",
  createdAt: null,
};
const MINE = {
  id: "c2",
  authorId: "me",
  authorName: "Me",
  text: "Thanks",
  createdAt: null,
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  B.blocked = new Set<string>();
  B.addBlocked.mockImplementation((uid: string) => B.blocked.add(uid));
  H.getSpacePostComments.mockResolvedValue([PRIYA, MINE]);
  H.reportContent.mockResolvedValue(undefined);
  H.blockUser.mockResolvedValue(undefined);
  H.deleteSpacePostComment.mockResolvedValue(undefined);
});

async function openSheet() {
  const onCountChange = vi.fn();
  await act(async () => {
    render(
      <SpaceCommentSheet
        spaceId="runners"
        postId="p1"
        open
        onOpenChange={vi.fn()}
        onCountChange={onCountChange}
      />
    );
  });
  return { onCountChange };
}

describe("someone else's comment", () => {
  it("is reported as a space_post_comment, space:post:comment", async () => {
    await openSheet();
    fireEvent.click(
      screen.getByRole("button", { name: "More options for Priya's comment" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Report comment" }));
    expect(
      screen.getByRole("heading", { name: "Report comment" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    });

    expect(H.reportContent).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "space_post_comment",
        targetId: "runners:p1:c1",
        category: "other",
      })
    );
    expect(screen.getByText("Strong finish")).toBeInTheDocument();
  });

  it("can have its author blocked, and their comments go", async () => {
    await openSheet();
    fireEvent.click(
      screen.getByRole("button", { name: "More options for Priya's comment" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Block user" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Block" }));
    });

    expect(H.blockUser).toHaveBeenCalledWith("me", "priya");
    expect(B.addBlocked).toHaveBeenCalledWith("priya");
    expect(screen.getByText("Thanks")).toBeInTheDocument();
    expect(screen.queryByText("Strong finish")).toBeNull();
  });

  it("is left out when its author is already blocked", async () => {
    B.blocked = new Set(["priya"]);
    await openSheet();
    expect(screen.getByText("Thanks")).toBeInTheDocument();
    expect(screen.queryByText("Strong finish")).toBeNull();
  });
});

describe("your own comment", () => {
  it("has Delete, not Report, and deletes after one confirmation", async () => {
    const { onCountChange } = await openSheet();
    expect(
      screen.queryByRole("button", { name: "More options for Me's comment" })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    expect(
      screen.getByRole("heading", { name: "Delete comment?" })
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(H.deleteSpacePostComment).toHaveBeenCalledTimes(1);
    expect(H.deleteSpacePostComment).toHaveBeenCalledWith(
      "runners",
      "p1",
      "c2"
    );
    expect(onCountChange).toHaveBeenCalledWith(-1);
    expect(screen.queryByText("Thanks")).toBeNull();
    expect(screen.getByText("Strong finish")).toBeInTheDocument();
  });
});

describe("the word filter", () => {
  it("refuses objectionable text before sending it", async () => {
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText("Add a comment…"), {
      target: { value: "this hill sucks" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    });
    expect(toast.error).toHaveBeenCalledWith(OBJECTIONABLE_COMMENT_MESSAGE);
    expect(H.addSpacePostComment).not.toHaveBeenCalled();
  });

  it("shows the server's sentence when the callable refuses", async () => {
    const refusal =
      "Your display name contains objectionable language. Change it in Settings, then try again.";
    H.addSpacePostComment.mockRejectedValue(
      Object.assign(new Error(refusal), {
        code: "functions/failed-precondition",
      })
    );
    await openSheet();
    fireEvent.change(screen.getByPlaceholderText("Add a comment…"), {
      target: { value: "Nice one" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    });
    expect(H.addSpacePostComment).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      `Couldn't post the comment. ${refusal}`
    );
  });
});
