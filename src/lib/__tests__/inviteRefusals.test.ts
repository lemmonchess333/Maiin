// @vitest-environment jsdom
/**
 * Every reason the server refuses an invite with has words here
 * (src/lib/invites.ts), so a new refusal cannot reach a person as the
 * fallback; and the words never say more than the server does. A block,
 * an unknown code and a restricted or deleting inviter are one reason on
 * the server, `code-not-found`, so there is no sentence that could tell
 * them apart.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

vi.mock("@/lib/firebase", () => ({ functions: {} }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: toasts }));
const callable = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("firebase/functions", () => ({
  httpsCallable: () => callable.run,
}));

import {
  describeInviteRefusal,
  ENTER_CODE_LATER,
  INVITE_FAILED_FALLBACK,
  INVITE_REFUSAL_WORDS,
  inviteJoinedLine,
  isFinalInviteRefusal,
  redeemInviteAfterSetup,
} from "@/lib/invites";
import { RESTRICTED_TOAST } from "@/lib/accountRestriction";
import { readPendingInvite, savePendingInvite } from "@/lib/pendingInvite";

const require = createRequire(import.meta.url);
const { INVITE_REFUSALS } = require("../../../functions/lib/inviteCodes.js");

/** A refusal as the callable delivers it. */
const refusal = (reason: string, code = "functions/failed-precondition") => ({
  code,
  message: reason,
  details: { reason },
});

describe("invite refusals in words", () => {
  it("words every reason the server can give", () => {
    expect(Object.keys(INVITE_REFUSAL_WORDS).sort()).toEqual(
      [...INVITE_REFUSALS].sort()
    );
    for (const reason of INVITE_REFUSALS) {
      const words = describeInviteRefusal(refusal(reason), "people");
      expect(words, reason).toBe(INVITE_REFUSAL_WORDS[reason]);
      expect(words).not.toBe(INVITE_FAILED_FALLBACK);
      expect(words).not.toMatch(/!/);
    }
  });

  it("never mentions a block", () => {
    for (const words of Object.values(INVITE_REFUSAL_WORDS)) {
      expect(words).not.toMatch(/block/i);
    }
  });

  it("tells someone leaving setup where to try again", () => {
    expect(describeInviteRefusal(refusal("code-not-found"), "setup")).toBe(
      `${INVITE_REFUSAL_WORDS["code-not-found"]} ${ENTER_CODE_LATER}`
    );
    expect(describeInviteRefusal(refusal("own-code"), "setup")).toBe(
      INVITE_REFUSAL_WORDS["own-code"]
    );
  });

  it("says a restricted account is restricted, and too many tries is too many", () => {
    expect(
      describeInviteRefusal(
        refusal("account-restricted", "functions/permission-denied"),
        "people"
      )
    ).toBe(RESTRICTED_TOAST);
    expect(
      describeInviteRefusal(
        { code: "functions/resource-exhausted", message: "Too many tries." },
        "people"
      )
    ).toBe("Too many tries. Wait a few minutes, then try again.");
    expect(
      describeInviteRefusal(new TypeError("Failed to fetch"), "people")
    ).toBe(INVITE_FAILED_FALLBACK);
  });

  it("keeps a code it could not use yet, and forgets one the server answered for", () => {
    expect(isFinalInviteRefusal(refusal("code-not-found"))).toBe(true);
    expect(isFinalInviteRefusal(refusal("already-invited"))).toBe(true);
    expect(isFinalInviteRefusal(refusal("invite-limit"))).toBe(false);
    expect(isFinalInviteRefusal({ code: "functions/resource-exhausted" })).toBe(
      false
    );
    expect(isFinalInviteRefusal(new TypeError("Failed to fetch"))).toBe(false);
  });

  it("names the inviter in the one line, or a friend", () => {
    expect(inviteJoinedLine("Maya")).toBe("You and Maya now follow each other");
    expect(inviteJoinedLine(null)).toBe(
      "You and your friend now follow each other"
    );
  });

  it("says the request waits when the inviter approves followers", () => {
    expect(inviteJoinedLine("Maya", true)).toBe(
      "Maya follows you now. Your request to follow them is waiting"
    );
    expect(inviteJoinedLine(null, true)).toBe(
      "Your friend follows you now. Your request to follow them is waiting"
    );
  });
});

describe("redeemInviteAfterSetup", () => {
  it.each(["success", "refused", "offline"])(
    "does not restore a superseded link after a manually entered code is %s",
    async (outcome) => {
      savePendingInvite("K7P49M2H");
      if (outcome === "success")
        callable.run.mockResolvedValueOnce({ data: { inviterName: "Lee" } });
      else
        callable.run.mockRejectedValueOnce(
          outcome === "refused"
            ? refusal("code-not-found")
            : new TypeError("offline")
        );
      await redeemInviteAfterSetup("A2B3C4D5");
      expect(readPendingInvite()).toBe(
        outcome === "offline" ? "A2B3C4D5" : null
      );
    }
  );
  it("says who they now follow, and forgets the code", async () => {
    savePendingInvite("K7P49M2H");
    callable.run.mockResolvedValueOnce({
      data: { inviterName: "Maya Patel", alreadyJoined: false },
    });
    await redeemInviteAfterSetup("K7P49M2H");
    expect(callable.run).toHaveBeenLastCalledWith({ code: "K7P49M2H" });
    expect(toasts.success).toHaveBeenLastCalledWith(
      "You and Maya Patel now follow each other"
    );
    expect(readPendingInvite()).toBeNull();
  });

  it("keeps a code it could not send, for People to offer", async () => {
    callable.run.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await redeemInviteAfterSetup("A2B3C4D5");
    expect(readPendingInvite()).toBe("A2B3C4D5");
    expect(toasts.error).toHaveBeenLastCalledWith(INVITE_FAILED_FALLBACK);

    callable.run.mockRejectedValueOnce(refusal("code-not-found"));
    await redeemInviteAfterSetup("A2B3C4D5");
    expect(readPendingInvite()).toBeNull();
    expect(toasts.error).toHaveBeenLastCalledWith(
      `${INVITE_REFUSAL_WORDS["code-not-found"]} ${ENTER_CODE_LATER}`
    );
  });
});

describe("a newer link while setup redemption is pending", () => {
  it.each(["success", "refused", "offline"])(
    "keeps the newer code after an older %s",
    async (outcome) => {
      let resolve!: (value: unknown) => void;
      let reject!: (reason: unknown) => void;
      callable.run.mockReturnValueOnce(
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        })
      );
      savePendingInvite("K7P49M2H");
      const pending = redeemInviteAfterSetup("K7P49M2H");
      savePendingInvite("A2B3C4D5");
      if (outcome === "success") resolve({ data: { inviterName: "Maya" } });
      else
        reject(
          outcome === "refused"
            ? refusal("code-not-found")
            : new TypeError("offline")
        );
      await pending;
      expect(readPendingInvite()).toBe("A2B3C4D5");
    }
  );
});
