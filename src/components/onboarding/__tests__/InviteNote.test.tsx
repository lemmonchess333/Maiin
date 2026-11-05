/**
 * The signed-out screen's invite line (Soc15 call 5): only for someone who
 * arrived from an invite link, naming the inviter when the server says who
 * it is and "A friend" otherwise, without waiting on the network for the
 * line to appear.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const h = vi.hoisted(() => ({ lookup: vi.fn(), native: false }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => h.native }));
vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => h.lookup }));

import InviteNote from "@/components/onboarding/InviteNote";
import { savePendingInvite } from "@/lib/pendingInvite";

beforeEach(() => {
  localStorage.clear();
  h.lookup.mockReset().mockResolvedValue({ data: { inviter: null } });
  h.native = false;
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
      screen.getByText("They'll follow you once you've set up your plan.")
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

describe("install fallback", () => {
  it("copies the displayed code only on request and explains installation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    savePendingInvite("K7P49M2H");
    render(<InviteNote />);
    expect(screen.getByText("K7P4-9M2H")).toHaveClass("select-all");
    expect(writeText).not.toHaveBeenCalled();
    expect(
      screen.getByText(/won’t transfer automatically/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy invite code" }));
    await screen.findByText(
      "Code copied. Keep it for setup after installing Tropos."
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith("K7P4-9M2H");
  });
  it("offers manual copy if clipboard access fails or is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    savePendingInvite("K7P49M2H");
    render(<InviteNote />);
    fireEvent.click(screen.getByRole("button", { name: "Copy invite code" }));
    await screen.findByText(/Touch and hold the code/);
    expect(screen.getByText("K7P4-9M2H")).toBeInTheDocument();
  });
  it("does not offer installation inside the installed app", async () => {
    h.native = true;
    savePendingInvite("K7P49M2H");
    render(<InviteNote />);
    await waitFor(() => expect(h.lookup).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "Copy invite code" })
    ).toBeNull();
  });
  it("updates for a late native link and ignores an older lookup response", async () => {
    let resolveOld!: (value: unknown) => void;
    h.lookup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    render(<InviteNote />);
    act(() => {
      savePendingInvite("K7P49M2H");
    });
    act(() => {
      savePendingInvite("A2B3C4D5");
    });
    expect(screen.getByText("A2B3-C4D5")).toBeInTheDocument();
    await act(async () => {
      resolveOld({ data: { inviter: { firstName: "Old" } } });
    });
    expect(screen.queryByText("Old invited you to Tropos")).toBeNull();
  });
});
