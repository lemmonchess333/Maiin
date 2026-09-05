import { describe, it, expect } from "vitest";
import { describeRejection, stripCallablePrefix } from "../callableErrors";

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
