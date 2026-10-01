import { vi, expect, it, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import type { ReactNode } from "react";
import CommentSheet from "@/components/social/CommentSheet";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "me", emailVerified: true },
    profile: { displayName: "Me" },
  }),
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

type Result = { comments: unknown[]; lastDoc?: unknown; hasMore: boolean };
const H = vi.hoisted(() => ({
  reads: [] as {
    resolve: (r: Result) => void;
    reject: (e: unknown) => void;
  }[],
}));
vi.mock("@/lib/socialApi", () => ({
  getComments: () =>
    new Promise<Result>((resolve, reject) => {
      H.reads.push({ resolve, reject });
    }),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
  toggleCommentReaction: vi.fn(),
  isPermissionDenied: (e: { code?: string }) => e?.code === "permission-denied",
}));

afterEach(cleanup);
beforeEach(() => {
  H.reads = [];
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
