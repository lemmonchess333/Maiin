/**
 * The signed-out screen's invite line (Soc15 call 5): only for someone who
 * arrived from an invite link, naming the inviter when the server says who
 * it is and "A friend" otherwise, without waiting on the network for the
 * line to appear.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => h.lookup }));

import InviteNote from "@/components/onboarding/InviteNote";
import { savePendingInvite } from "@/lib/pendingInvite";

beforeEach(() => {
  localStorage.clear();
  h.lookup.mockReset();
});
afterEach(cleanup);

describe("InviteNote", () => {
  it("shows nothing without an invite, and asks nothing", () => {
    const { container } = render(<InviteNote />);
    expect(container).toBeEmptyDOMElement();
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it("names the inviter once the server says who it is", async () => {
    savePendingInvite("K7P49M2H");
    h.lookup.mockResolvedValue({ data: { inviter: { firstName: "Maya" } } });
    render(<InviteNote />);
    // At once, before the answer.
    expect(
      screen.getByText("A friend invited you to Tropos")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Maya invited you to Tropos")
    ).toBeInTheDocument();
    expect(h.lookup).toHaveBeenCalledWith({ code: "K7P49M2H" });
    expect(
      screen.getByText("You'll follow each other once you've set up your plan.")
    ).toBeInTheDocument();
  });

  it("stays general for a code the server does not name, or a failed ask", async () => {
    savePendingInvite("K7P49M2H");
    h.lookup.mockResolvedValue({ data: { inviter: null } });
    render(<InviteNote />);
    await vi.waitFor(() => expect(h.lookup).toHaveBeenCalled());
    expect(
      screen.getByText("A friend invited you to Tropos")
    ).toBeInTheDocument();
    cleanup();

    h.lookup.mockRejectedValue(new Error("offline"));
    render(<InviteNote />);
    await vi.waitFor(() => expect(h.lookup).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText("A friend invited you to Tropos")
    ).toBeInTheDocument();
  });
});
