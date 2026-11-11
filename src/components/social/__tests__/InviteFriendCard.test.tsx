/**
 * People's invite card (Soc15 calls 4 and 5, and the STATUS of 2026-11-10):
 * the code it shows is the server's, since a block can renew it after the
 * profile was read, and New code renews it on purpose, the old one
 * stopping at once.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const profile = vi.hoisted(() => ({
  current: { inviteCode: "K7P49M2H" } as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: profile.current }),
}));
const invites = vi.hoisted(() => ({
  fetchMyInviteCode: vi.fn(async () => "K7P49M2H"),
  renewMyInviteCode: vi.fn(async () => "A2B3C4D5"),
}));
vi.mock("@/lib/invites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invites")>()),
  fetchMyInviteCode: invites.fetchMyInviteCode,
  renewMyInviteCode: invites.renewMyInviteCode,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));

import InviteFriendCard from "../InviteFriendCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  invites.fetchMyInviteCode.mockImplementation(async () => "K7P49M2H");
  invites.renewMyInviteCode.mockImplementation(async () => "A2B3C4D5");
});

describe("the invite card's code", () => {
  it("shows the server's code, not a profile copy a block has renewed since", async () => {
    // Blocking someone who joined from K7P4-9M2H renewed it on the server.
    invites.fetchMyInviteCode.mockResolvedValueOnce("Z9Y8X7W6");
    render(<InviteFriendCard active disabled={false} />);
    expect(screen.getByText("K7P4-9M2H")).toBeInTheDocument();
    expect(await screen.findByText("Z9Y8-X7W6")).toBeInTheDocument();
    expect(screen.queryByText("K7P4-9M2H")).toBeNull();
  });

  it("New code shows the new one and says the old one no longer works", async () => {
    render(<InviteFriendCard active disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "New code" }));
    expect(await screen.findByText("A2B3-C4D5")).toBeInTheDocument();
    expect(invites.renewMyInviteCode).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith(
      "New invite code. The old one no longer works."
    );
  });

  it("keeps the code it has when a new one cannot be made", async () => {
    invites.renewMyInviteCode.mockRejectedValueOnce(new Error("offline"));
    render(<InviteFriendCard active disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "New code" }));
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn’t make a new code. Try again."
      )
    );
    expect(screen.getByText("K7P4-9M2H")).toBeInTheDocument();
  });

  it("asks for no code, and offers no New code, for a restricted account", () => {
    render(<InviteFriendCard active disabled />);
    expect(invites.fetchMyInviteCode).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "New code" })).toBeNull();
  });
});
