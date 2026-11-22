/**
 * The Resend transport (email/accountEmails.js sendViaResend), with fetch
 * stubbed: nothing here sends an email.
 *
 * The emails a person chose (App1 Q55) ask two more things of it: their
 * List-Unsubscribe headers travel with the email, and an idempotency key
 * travels with the request, so a retried send goes once. A refusal says
 * Resend's status, which the sweep reads to stop (429), give up (another
 * 4xx) or try again with the same key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sendViaResend } = require("../email/accountEmails");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendViaResend", () => {
  it("sends the email's own headers and the request's idempotency key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await sendViaResend({
      to: "sam@example.com",
      subject: "Your week, reviewed: 9–15 Nov",
      html: "<p>hi</p>",
      text: "hi",
      headers: {
        "List-Unsubscribe": "<https://troposfit.com/email/unsubscribe?u=a&t=b>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      idempotencyKey: "weeklyReview/sam/2026-11-09",
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Idempotency-Key"]).toBe("weeklyReview/sam/2026-11-09");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body).headers).toEqual({
      "List-Unsubscribe": "<https://troposfit.com/email/unsubscribe?u=a&t=b>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("sends neither when not given, as the account emails always have", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await sendViaResend({ to: "sam@example.com", subject: "s", html: "h" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
    expect(JSON.parse(init.body)).not.toHaveProperty("headers");
  });

  it.each([409, 422, 429, 500])(
    "a refusal carries Resend's status (%i), and no address",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status,
          text: async () => "Invalid `to` field: sam@example.com",
        })
      );
      const err = await sendViaResend({
        to: "sam@example.com",
        subject: "s",
        html: "h",
      }).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.status).toBe(status);
      expect(err.message).toContain(String(status));
      expect(err.message).not.toContain("sam@example.com");
    }
  );
});
