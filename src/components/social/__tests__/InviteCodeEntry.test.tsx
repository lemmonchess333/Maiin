/**
 * People's "Invited by a friend?" (Soc15 call 4): for an account in its
 * first 14 days that has not joined from an invite. A code is used at
 * once, and the line that says what it made (the two following each other,
 * or the inviter following and the new request waiting) replaces the
 * field; a refusal says why under it, and a code that cannot be one is
 * not sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const h = vi.hoisted(() => ({
  redeem: vi.fn(),
  refresh: vi.fn(),
  creationTime: "",
  profile: {} as Record<string, unknown>,
}));
vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => h.redeem }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "sam", metadata: { creationTime: h.creationTime } },
    profile: h.profile,
    refreshProfile: h.refresh,
  }),
}));

import InviteCodeEntry from "@/components/social/InviteCodeEntry";
import { readPendingInvite, savePendingInvite } from "@/lib/pendingInvite";
import { INVITE_REFUSAL_WORDS, NOT_A_CODE } from "@/lib/invites";

const field = () =>
  screen.getByLabelText("Enter their invite code and they’ll follow you.");
const use = () =>
  fireEvent.click(screen.getByRole("button", { name: "Use code" }));

beforeEach(() => {
  localStorage.clear();
  h.redeem.mockReset();
  h.refresh.mockReset().mockResolvedValue(undefined);
  h.creationTime = new Date().toUTCString();
  h.profile = { uid: "sam" };
});
afterEach(cleanup);

describe("InviteCodeEntry", () => {
  it("holds the submitted input while a request is pending, then restores editing on failure", async () => {
    let reject!: (reason: unknown) => void;
    h.redeem.mockReturnValue(
      new Promise((_done, fail) => {
        reject = fail;
      })
    );
    savePendingInvite("K7P49M2H");
    render(<InviteCodeEntry disabled={false} />);
    use();
    expect(field()).toBeDisabled();
    await act(async () => {
      reject(new TypeError("offline"));
    });
    expect(field()).toBeEnabled();
    expect(field()).toHaveValue("K7P4-9M2H");
  });
  it("does not attach an older request's error to a newly opened link", async () => {
    let reject!: (reason: unknown) => void;
    h.redeem.mockReturnValue(
      new Promise((_done, fail) => {
        reject = fail;
      })
    );
    savePendingInvite("K7P49M2H");
    render(<InviteCodeEntry disabled={false} />);
    use();
    act(() => {
      savePendingInvite("A2B3C4D5");
    });
    await act(async () => {
      reject(new TypeError("offline"));
    });
    expect(field()).toHaveValue("A2B3-C4D5");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears an old refusal when the same link is explicitly reopened", async () => {
    h.redeem.mockRejectedValue(new TypeError("offline"));
    savePendingInvite("K7P49M2H");
    render(<InviteCodeEntry disabled={false} />);
    use();
    await screen.findByRole("alert");
    act(() => {
      savePendingInvite("K7P49M2H");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it.each(["success", "refused", "offline"])(
    "replaces the pending link with the manually entered code after %s",
    async (outcome) => {
      savePendingInvite("K7P49M2H");
      if (outcome === "success")
        h.redeem.mockResolvedValue({ data: { inviterName: "Lee" } });
      else
        h.redeem.mockRejectedValue(
          outcome === "refused"
            ? {
                code: "functions/not-found",
                details: { reason: "code-not-found" },
              }
            : new TypeError("offline")
        );
      render(<InviteCodeEntry disabled={false} />);
      fireEvent.change(field(), { target: { value: "A2B3C4D5" } });
      use();
      if (outcome === "success")
        await screen.findByText("You and Lee now follow each other");
      else await screen.findByRole("alert");
      expect(readPendingInvite()).toBe(
        outcome === "offline" ? "A2B3C4D5" : null
      );
    }
  );

  it("preserves a newer link while a manually entered code is submitted", async () => {
    let resolve!: (value: unknown) => void;
    h.redeem.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    savePendingInvite("K7P49M2H");
    render(<InviteCodeEntry disabled={false} />);
    fireEvent.change(field(), { target: { value: "A2B3C4D5" } });
    use();
    act(() => {
      savePendingInvite("K7P49M2H");
    });
    await act(async () => {
      resolve({ data: { inviterName: "Lee" } });
    });
    expect(readPendingInvite()).toBe("K7P49M2H");
  });
  it("uses a code at once and says the inviter follows them and their request waits", async () => {
    // The inviter approves followers, the default (Soc15 call 4, STATUS
    // 2026-11-05): they follow the new person, who asks to follow back.
    h.redeem.mockResolvedValue({
      data: {
        inviterName: "Maya Patel",
        alreadyJoined: false,
        requested: true,
      },
    });
    render(<InviteCodeEntry disabled={false} />);
    fireEvent.change(field(), { target: { value: "k7p4-9m2h" } });
    use();
    expect(
      await screen.findByText(
        "Maya Patel follows you now. Your request to follow them is waiting"
      )
    ).toBeInTheDocument();
    expect(h.redeem).toHaveBeenCalledWith({ code: "K7P49M2H" });
    expect(screen.queryByRole("button", { name: "Use code" })).toBeNull();
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it("starts from a code a link left, and forgets it once used", async () => {
    savePendingInvite("A2B3C4D5");
    h.redeem.mockResolvedValue({ data: { inviterName: "Lee" } });
    render(<InviteCodeEntry disabled={false} />);
    expect(field()).toHaveValue("A2B3-C4D5");
    use();
    await screen.findByText("You and Lee now follow each other");
    expect(readPendingInvite()).toBeNull();
  });

  it("says why a code was refused, and keeps the field", async () => {
    h.redeem.mockRejectedValue({
      code: "functions/not-found",
      message: "code-not-found",
      details: { reason: "code-not-found" },
    });
    render(<InviteCodeEntry disabled={false} />);
    fireEvent.change(field(), { target: { value: "A2B3C4D5" } });
    use();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      INVITE_REFUSAL_WORDS["code-not-found"]
    );
    expect(field()).toHaveAttribute("aria-invalid", "true");
  });

  it("does not send something that cannot be a code", async () => {
    render(<InviteCodeEntry disabled={false} />);
    fireEvent.change(field(), { target: { value: "MAYA" } });
    use();
    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_A_CODE);
    expect(h.redeem).not.toHaveBeenCalled();
  });

  it("is not offered after 14 days, after an invite, or to a restricted account", async () => {
    h.creationTime = new Date(Date.now() - 15 * 86_400_000).toUTCString();
    const { container, rerender } = render(
      <InviteCodeEntry disabled={false} />
    );
    expect(container).toBeEmptyDOMElement();

    h.creationTime = new Date().toUTCString();
    h.profile = { uid: "sam", invitedAt: { seconds: 1 } };
    rerender(<InviteCodeEntry disabled={false} />);
    expect(container).toBeEmptyDOMElement();

    h.profile = { uid: "sam" };
    rerender(<InviteCodeEntry disabled />);
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(h.redeem).not.toHaveBeenCalled());
  });
});
