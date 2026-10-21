/**
 * What the two Apple purchase callables tell the app when a purchase
 * fails: an HttpsError as it was thrown, a transaction bound to another
 * account in its own words, and anything else as a fixed sentence, never
 * the error's own text.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "tropos-unit-test";
const functions = require("firebase-functions/v1");
const { _purchaseCallableError: toCallableError } = require("../appleIAP");

describe("purchase callable errors", () => {
  it("never passes an internal error's own text on", () => {
    const out = toCallableError(new Error("Bundle mismatch: com.evil.app"));
    expect(out).toBeInstanceOf(functions.https.HttpsError);
    expect(out.code).toBe("internal");
    expect(out.message).not.toMatch(/Bundle|com\.evil/);
  });

  it("says a transaction is bound to another account, with a code", () => {
    const err = Object.assign(
      new Error("Apple transaction is bound to a different account."),
      {
        code: "transaction-bound-elsewhere",
      }
    );
    const out = toCallableError(err);
    expect(out.code).toBe("failed-precondition");
    expect(out.message).toMatch(/different account/);
    expect(out.details).toEqual({ errorCode: "transaction-bound-elsewhere" });
  });

  it("passes an HttpsError through as it was thrown", () => {
    const thrown = new functions.https.HttpsError(
      "failed-precondition",
      "Restore is unavailable."
    );
    expect(toCallableError(thrown)).toBe(thrown);
  });
});
