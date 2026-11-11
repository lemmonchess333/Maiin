/**
 * requestPasswordReset: one forgot-password request, from what the caller
 * sent to what to reply, with the real rate limiter on the in-memory
 * Firestore. The callable's own replies are driven end to end in
 * accountEmailCallables.test.js; this file pins what is logged, which only
 * shows when the logger is handed in.
 */
import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  requestPasswordReset,
  PASSWORD_RESET_SEND_CAP,
  PASSWORD_RESET_SENDS_PER_DAY,
} = require("../lib/passwordResetRequest");

function harness({ accounts = ["alice@example.com"] } = {}) {
  const firestore = memoryFirestore();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const generateLink = vi.fn(async (email) => {
    if (!accounts.includes(email)) {
      throw new Error("There is no user record (auth/email-not-found).");
    }
    return "https://tropos.example/reset";
  });
  const sendEmail = vi.fn(async () => {});
  const request = (email) =>
    requestPasswordReset({
      data: { email },
      firestore,
      generateLink,
      sendEmail,
      logger,
    });
  return { firestore, logger, generateLink, sendEmail, request };
}

describe("requestPasswordReset", () => {
  it("refuses a malformed address before the limiter or Auth is reached", async () => {
    const h = harness();
    await expect(h.request("not an address")).resolves.toEqual({
      refused: {
        code: "invalid-argument",
        message: "A valid email is required.",
      },
    });
    expect(h.firestore.data.size).toBe(0);
    expect(h.generateLink).not.toHaveBeenCalled();
  });

  it("logs a send that failed, without the address, and replies { ok: true }", async () => {
    const h = harness();
    h.sendEmail.mockRejectedValue(
      new Error(
        "Resend send failed (403): testing emails go to alice@example.com only"
      )
    );
    await expect(h.request("alice@example.com")).resolves.toEqual({
      ok: true,
    });
    expect(h.logger.error).toHaveBeenCalledWith(
      "sendPasswordResetLinkCallable.error",
      { error: expect.stringContaining("Resend send failed (403)") }
    );
    const logged = JSON.stringify(h.logger.error.mock.calls);
    expect(logged).toContain("[address]");
    expect(logged).not.toContain("alice@");
  });

  it("logs a link that could not be made, and replies { ok: true }", async () => {
    const h = harness();
    h.generateLink.mockRejectedValue(
      new Error("The user record is disabled. (auth/user-disabled)")
    );
    await expect(h.request("alice@example.com")).resolves.toEqual({
      ok: true,
    });
    expect(h.logger.error).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("logs no error for an address with no account", async () => {
    const h = harness();
    await expect(h.request("nobody@example.com")).resolves.toEqual({
      ok: true,
    });
    expect(h.logger.error).not.toHaveBeenCalled();
    expect(h.logger.info).toHaveBeenCalledWith(
      "sendPasswordResetLinkCallable",
      { sent: false, reason: "no-account" }
    );
  });

  it("warns when the day's cap on sends stops a send, and replies { ok: true }", async () => {
    const h = harness();
    h.firestore.data.set(
      `rateLimits/${PASSWORD_RESET_SEND_CAP.key}_${PASSWORD_RESET_SEND_CAP.action}`,
      { timestamps: Array(PASSWORD_RESET_SENDS_PER_DAY).fill(Date.now()) }
    );
    await expect(h.request("alice@example.com")).resolves.toEqual({
      ok: true,
    });
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.logger.warn).toHaveBeenCalledWith(
      "sendPasswordResetLinkCallable.dailyCap",
      { cap: PASSWORD_RESET_SENDS_PER_DAY }
    );
    expect(h.logger.error).not.toHaveBeenCalled();
  });
});
