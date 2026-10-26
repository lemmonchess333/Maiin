/**
 * InlineFollow — Follow beside a post's author (2026-10-01).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const H = vi.hoisted(() => ({
  read: null as null | ((v: boolean) => void),
  asked: false,
  follow: vi.fn(
    async (_viewer: string, _target: string): Promise<string | void> => {}
  ),
  track: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "me" }));
const restriction = vi.hoisted(() => ({ isRestricted: false, loading: false }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => restriction,
}));
vi.mock("@/lib/socialApi", () => ({
  isFollowing: () =>
    new Promise<boolean>((resolve) => {
      H.read = resolve;
    }),
  hasRequestedFollow: async () => H.asked,
  followOrRequest: async (viewer: string, target: string) =>
    (await H.follow(viewer, target)) ?? "following",
  unfollowUser: vi.fn(),
  cancelFollowRequest: vi.fn(),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: H.toastError } }));
vi.mock("@/lib/socialAnalytics", () => ({ track: H.track }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import InlineFollow from "../InlineFollow";
import { __resetFollowStatesForTests } from "@/hooks/useFollowState";

beforeEach(() => {
  restriction.isRestricted = false;
  __resetFollowStatesForTests();
  H.read = null;
  H.asked = false;
  H.follow = vi.fn(
    async (_viewer: string, _target: string): Promise<string | void> => {}
  );
  H.track.mockClear();
  H.toastError.mockClear();
});
afterEach(cleanup);

async function answer(following: boolean) {
  await act(async () => H.read?.(following));
}

describe("InlineFollow", () => {
  it("waits for the answer instead of flashing Follow", async () => {
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    expect(screen.queryByRole("button")).toBeNull();
    await answer(false);
    expect(
      screen.getByRole("button", { name: "Follow Maya" })
    ).toBeInTheDocument();
  });

  it("shows nothing for someone already followed", async () => {
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    await answer(true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Following")).toBeNull();
  });

  it("following says so and stays, with no unfollow from a post", async () => {
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    await answer(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Follow Maya" }));
    });
    expect(H.follow).toHaveBeenCalledWith("me", "maya");
    expect(screen.getByText("Following")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(H.track).toHaveBeenCalledWith("social_follow", {
      followSource: "post",
    });
  });

  it("to someone who approves followers it says Requested, and stays", async () => {
    H.follow = vi.fn(async () => "requested");
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    await answer(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Follow Maya" }));
    });
    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.queryByText("Following")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows nothing for someone already asked", async () => {
    H.asked = true;
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    await answer(false);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a failed follow comes back as Follow, and says it failed", async () => {
    H.follow = vi.fn(async (_viewer: string, _target: string) => {
      throw new Error("offline");
    });
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    await answer(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Follow Maya" }));
    });
    expect(
      screen.getByRole("button", { name: "Follow Maya" })
    ).toBeInTheDocument();
    expect(H.toastError).toHaveBeenCalledWith("Couldn't follow. Try again.");
    expect(H.track).not.toHaveBeenCalled();
  });
});

describe("InlineFollow — a restricted account (S4e)", () => {
  it("offers no Follow beside a post, since it cannot follow anyone", async () => {
    restriction.isRestricted = true;
    render(<InlineFollow targetUid="maya" targetName="Maya" />);
    await answer(false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(H.follow).not.toHaveBeenCalled();
  });
});
