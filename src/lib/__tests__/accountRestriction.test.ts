/**
 * The app's words for a restricted account (S4e), and how it recognises
 * the server's refusal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/toast", () => ({ toast: { error: toastError } }));

import {
  RESTRICTED_LINE,
  RESTRICTED_TOAST,
  isRestrictedRefusal,
  restrictedSupportHref,
  showRestrictedToast,
} from "../accountRestriction";

beforeEach(() => toastError.mockReset());

describe("the words", () => {
  it("are Soc5a pin 2's line, and a toast that says what happened", () => {
    expect(RESTRICTED_LINE).toBe("Your account is restricted");
    expect(RESTRICTED_TOAST).toBe(
      "Your account is restricted, so you can't do this for now."
    );
  });

  it("mails support with a subject that says what it is about", () => {
    const href = restrictedSupportHref();
    expect(href.startsWith("mailto:support@troposfit.com?")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("subject")).toBe("My Tropos account is restricted");
  });

  it("puts Contact support on the toast", () => {
    showRestrictedToast();
    expect(toastError).toHaveBeenCalledWith(RESTRICTED_TOAST, {
      action: { label: "Contact support", onClick: expect.any(Function) },
    });
  });
});

describe("isRestrictedRefusal", () => {
  it("is the callable refusal with the restriction's reason", () => {
    expect(
      isRestrictedRefusal({
        code: "functions/permission-denied",
        details: { reason: "account-restricted" },
      })
    ).toBe(true);
  });

  it("is nothing else", () => {
    expect(isRestrictedRefusal({ code: "functions/permission-denied" })).toBe(
      false
    );
    expect(isRestrictedRefusal({ details: { reason: "blocked" } })).toBe(false);
    expect(isRestrictedRefusal(new Error("offline"))).toBe(false);
    expect(isRestrictedRefusal(null)).toBe(false);
    expect(isRestrictedRefusal("account-restricted")).toBe(false);
  });
});
