import { describe, it, expect } from "vitest";
import {
  appErrorMessage,
  describeRejection,
  isRateLimitedRejection,
  stripCallablePrefix,
} from "../callableErrors";

describe("stripCallablePrefix", () => {
  it("drops the FirebaseError and failed-precondition prefixes, keeping the sentence", () => {
    expect(
      stripCallablePrefix(
        "FirebaseError: failed-precondition: Undo the deload week first."
      )
    ).toBe("Undo the deload week first.");
    expect(
      stripCallablePrefix("failed-precondition: Refresh and try again.")
    ).toBe("Refresh and try again.");
  });

  it("leaves any other message alone apart from the FirebaseError prefix", () => {
    expect(stripCallablePrefix("FirebaseError: internal")).toBe("internal");
    expect(stripCallablePrefix("Comment delete failed.")).toBe(
      "Comment delete failed."
    );
  });
});

describe("describeRejection", () => {
  it("surfaces the sentence of a failed-precondition identified by code", () => {
    expect(
      describeRejection({
        code: "functions/failed-precondition",
        message:
          "This workout changed since you started. Refresh and try again.",
      })
    ).toBe("This workout changed since you started. Refresh and try again.");
  });

  it("surfaces it when the code only rides the message", () => {
    expect(
      describeRejection({
        message: "FirebaseError: failed-precondition: Comment delete failed.",
      })
    ).toBe("Comment delete failed.");
  });

  it("returns null for every other code — those are developer messages", () => {
    expect(
      describeRejection({
        code: "functions/invalid-argument",
        message: "activityId + commentId required.",
      })
    ).toBeNull();
    expect(
      describeRejection({ code: "functions/internal", message: "INTERNAL" })
    ).toBeNull();
    expect(
      describeRejection({
        code: "functions/unauthenticated",
        message: "Sign-in required.",
      })
    ).toBeNull();
  });

  it("returns null when there is no message to show", () => {
    expect(describeRejection(new Error(""))).toBeNull();
    expect(describeRejection(undefined)).toBeNull();
    expect(
      describeRejection({ code: "functions/failed-precondition", message: "" })
    ).toBeNull();
  });
});

describe("isRateLimitedRejection", () => {
  it("is a call refused for coming too often, and nothing else", () => {
    expect(
      isRateLimitedRejection({
        code: "functions/resource-exhausted",
        message: "Too many attempts. Try again in a few minutes.",
      })
    ).toBe(true);
    expect(isRateLimitedRejection({ code: "resource-exhausted" })).toBe(true);
    expect(isRateLimitedRejection({ code: "functions/internal" })).toBe(false);
    expect(isRateLimitedRejection(new Error("offline"))).toBe(false);
    expect(isRateLimitedRejection(undefined)).toBe(false);
  });
});

describe("describeRejection — a rejection that names an account", () => {
  it("is not copy, though it is failed-precondition", () => {
    const lock = Object.assign(
      new Error(
        "Account u-123 has an in-progress deletion. Writes are frozen until the deletion completes or is cancelled."
      ),
      {
        code: "functions/failed-precondition",
        details: { errorCode: "account-deleting", uid: "u-123" },
      }
    );
    expect(describeRejection(lock)).toBeNull();
    const referenced = Object.assign(
      new Error(
        "Cannot complete write: referenced account u-9 is being deleted."
      ),
      {
        code: "functions/failed-precondition",
        details: {
          errorCode: "referenced-account-deleting",
          referencedUid: "u-9",
        },
      }
    );
    expect(describeRejection(referenced)).toBeNull();
  });

  it("still reads a coded sentence that names no account", () => {
    const restore = Object.assign(
      new Error(
        "Restore is currently unavailable for this subscription. Contact support if you need help."
      ),
      {
        code: "functions/failed-precondition",
        details: { errorCode: "restore-unavailable" },
      }
    );
    expect(describeRejection(restore)).toBe(
      "Restore is currently unavailable for this subscription. Contact support if you need help."
    );
  });
});

describe("appErrorMessage", () => {
  const FALLBACK = "Couldn't save. Try again.";

  it("passes the app's own sentence through", () => {
    expect(
      appErrorMessage(new Error("Sign in again to log food."), FALLBACK)
    ).toBe("Sign in again to log food.");
  });

  it.each([
    [
      "a Firebase error",
      Object.assign(new Error("Missing or insufficient permissions."), {
        code: "permission-denied",
      }),
    ],
    ["a browser's network error", new TypeError("Failed to fetch")],
    ["an Error with no message", new Error("")],
    ["a string", "boom"],
    ["nothing", undefined],
  ])("gives the fallback for %s", (_label, err) => {
    expect(appErrorMessage(err, FALLBACK)).toBe(FALLBACK);
  });
});
