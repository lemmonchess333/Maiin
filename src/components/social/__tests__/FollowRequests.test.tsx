/**
 * Answering follow requests (Polish2: an account approves each follower
 * unless it turns that off): the list at the top of People, and the one
 * request on the asker's profile, where its notification opens.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const H = vi.hoisted(() => ({
  list: vi.fn(),
  accept: vi.fn(async (_me: string, _them: string) => {}),
  decline: vi.fn(async (_me: string, _them: string) => {}),
  askedBy: vi.fn(async (_me: string, _them: string) => true),
  toastError: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "me" }));
vi.mock("@/lib/socialApi", () => ({
  getFollowRequests: (uid: string) => H.list(uid),
  acceptFollowRequest: (me: string, them: string) => H.accept(me, them),
  declineFollowRequest: (me: string, them: string) => H.decline(me, them),
  hasFollowRequestFrom: (me: string, them: string) => H.askedBy(me, them),
}));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => <span />,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: H.toastError } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import FollowRequestsSection from "../FollowRequestsSection";
import FollowRequestBanner from "../FollowRequestBanner";

const MAYA = {
  uid: "maya",
  displayName: "Maya",
  requestedAt: new Date(Date.now() - 5 * 60_000),
};
const SAM = { uid: "sam", displayName: "Sam", requestedAt: null };

beforeEach(() => {
  H.list.mockReset().mockResolvedValue([MAYA, SAM]);
  H.accept.mockReset().mockResolvedValue(undefined);
  H.decline.mockReset().mockResolvedValue(undefined);
  H.askedBy.mockReset().mockResolvedValue(true);
  H.toastError.mockClear();
});
afterEach(cleanup);

const renderSection = async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <FollowRequestsSection active />
      </MemoryRouter>
    );
  });
};

describe("FollowRequestsSection", () => {
  it("lists the requests waiting, each with Accept and Decline", async () => {
    await renderSection();
    expect(
      screen.getByRole("heading", { name: "Follow requests" })
    ).toBeInTheDocument();
    expect(screen.getByText("Maya")).toBeInTheDocument();
    expect(screen.getByText("Asked 5m ago")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept Sam" })
    ).toBeInTheDocument();
    expect(H.list).toHaveBeenCalledWith("me");
  });

  it("accepting writes the follow and takes the row away", async () => {
    await renderSection();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept Maya" }));
    });
    expect(H.accept).toHaveBeenCalledWith("me", "maya");
    expect(screen.queryByText("Maya")).toBeNull();
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });

  it("declining takes the row away without a follow", async () => {
    await renderSection();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Decline Sam" }));
    });
    expect(H.decline).toHaveBeenCalledWith("me", "sam");
    expect(H.accept).not.toHaveBeenCalled();
    expect(screen.queryByText("Sam")).toBeNull();
  });

  it("an answer that failed puts the row back, and says so", async () => {
    H.accept.mockRejectedValue(new Error("offline"));
    await renderSection();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept Maya" }));
    });
    expect(screen.getByText("Maya")).toBeInTheDocument();
    expect(H.toastError).toHaveBeenCalledWith(
      "Couldn't accept the request. Try again."
    );
  });

  it("says nothing while there are none", async () => {
    H.list.mockResolvedValue([]);
    await renderSection();
    expect(screen.queryByText("Follow requests")).toBeNull();
  });

  it("a list that could not be read says so, rather than looking empty", async () => {
    H.list.mockRejectedValueOnce(new Error("unavailable"));
    await renderSection();
    expect(
      screen.getByText("Couldn’t load your follow requests.")
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.getByText("Maya")).toBeInTheDocument();
  });
});

describe("FollowRequestBanner", () => {
  const renderBanner = async (onAccepted = vi.fn()) => {
    await act(async () => {
      render(
        <FollowRequestBanner
          requesterUid="maya"
          name="Maya"
          onAccepted={onAccepted}
        />
      );
    });
    return onAccepted;
  };

  it("shows the request on the asker's profile, and accepting it goes", async () => {
    const accepted = await renderBanner();
    expect(screen.getByText("Maya asked to follow you")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    });
    expect(H.accept).toHaveBeenCalledWith("me", "maya");
    expect(accepted).toHaveBeenCalledOnce();
    expect(screen.queryByText("Maya asked to follow you")).toBeNull();
  });

  it("declining goes too, and says nothing of a follow", async () => {
    const accepted = await renderBanner();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    });
    expect(H.decline).toHaveBeenCalledWith("me", "maya");
    expect(accepted).not.toHaveBeenCalled();
    expect(screen.queryByText("Maya asked to follow you")).toBeNull();
  });

  it("shows nothing when they have not asked", async () => {
    H.askedBy.mockResolvedValue(false);
    await renderBanner();
    expect(screen.queryByText("Maya asked to follow you")).toBeNull();
  });
});
