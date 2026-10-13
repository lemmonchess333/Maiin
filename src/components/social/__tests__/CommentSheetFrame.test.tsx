/**
 * The comment sheet around both kinds of thread: the title carries the
 * count, the list says when it is loading, failed or empty, and the field
 * sends on Send or Enter, offers quick replies only when given them, and
 * holds a comment the callables would refuse.
 */
import { vi, expect, it, describe, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import CommentSheetFrame from "../CommentSheetFrame";

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
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(cleanup);

type Props = ComponentProps<typeof CommentSheetFrame>;
type Composer = Props["composer"];

function renderFrame(
  props: Partial<Omit<Props, "composer">> = {},
  composer: Partial<Composer> = {}
) {
  const onSend = vi.fn();
  const onTextChange = vi.fn();
  const onRetry = vi.fn();
  render(
    <CommentSheetFrame
      open
      onOpenChange={vi.fn()}
      commentCount={0}
      panel={null}
      status={null}
      onRetry={onRetry}
      composer={{
        text: "",
        onTextChange,
        onSend,
        sending: false,
        needsVerification: false,
        onRecheck: vi.fn().mockResolvedValue(false),
        isRestricted: false,
        ...composer,
      }}
      {...props}
    >
      {props.children}
    </CommentSheetFrame>
  );
  return { onSend, onTextChange, onRetry };
}

describe("the title", () => {
  it("carries the count the card shows", () => {
    renderFrame({ commentCount: 3 });
    expect(screen.getByRole("dialog", { name: "Comments (3)" })).toBeVisible();
  });

  it("is just Comments when there are none", () => {
    renderFrame({ commentCount: 0 });
    expect(screen.getByRole("dialog", { name: "Comments" })).toBeVisible();
  });
});

describe("the list", () => {
  it("says it is loading, not that there are none", () => {
    renderFrame({ status: "loading" });
    expect(screen.getByLabelText("Loading comments")).toBeInTheDocument();
    expect(screen.queryByText("No comments yet")).toBeNull();
  });

  it("says a thread with no comments has none, and asks for the first", () => {
    renderFrame({ status: "empty" });
    expect(screen.getByText("No comments yet")).toBeInTheDocument();
    expect(
      screen.getByText("Be the first to leave a comment")
    ).toBeInTheDocument();
  });

  it("says a failed read failed, with Try again", () => {
    const { onRetry } = renderFrame({ status: "failed" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load comments"
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a comment being acted on in place of the list and the field", () => {
    renderFrame({
      panel: <p>Report comment</p>,
      children: <p>Strong finish</p>,
    });
    expect(screen.getByText("Report comment")).toBeInTheDocument();
    expect(screen.queryByText("Strong finish")).toBeNull();
    expect(screen.queryByLabelText("Add a comment")).toBeNull();
  });
});

describe("the field", () => {
  it("holds Send until there is something to send", () => {
    renderFrame({}, { text: "   " });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("sends on Send and on Enter", () => {
    const { onSend } = renderFrame({}, { text: "Nice one" });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.keyDown(screen.getByLabelText("Add a comment"), {
      key: "Enter",
    });
    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it("does not send on the Enter that finishes a composed word", () => {
    const { onSend } = renderFrame({}, { text: "にほん" });
    fireEvent.keyDown(screen.getByLabelText("Add a comment"), {
      key: "Enter",
      isComposing: true,
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("stops at the 1,000 characters both callables accept", () => {
    renderFrame();
    expect(screen.getByLabelText("Add a comment")).toHaveAttribute(
      "maxLength",
      "1000"
    );
  });

  it("offers quick replies only when given them, and a tap fills the field", () => {
    const { onTextChange } = renderFrame({}, { quickChips: ["Great run!"] });
    fireEvent.click(screen.getByRole("button", { name: "Great run!" }));
    expect(onTextChange).toHaveBeenCalledWith("Great run!");

    cleanup();
    renderFrame();
    expect(screen.queryByRole("button", { name: "Great run!" })).toBeNull();
  });

  it("is held, and says why, for a restricted account", () => {
    renderFrame({}, { text: "Nice one", isRestricted: true });
    expect(screen.getByText("Your account is restricted")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
