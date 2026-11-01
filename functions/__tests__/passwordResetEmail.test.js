import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  sendPasswordResetEmail,
  resetEmailHtml,
  readResetEmail,
  EMAIL_PATTERN,
  MAX_EMAIL_LENGTH,
} = require("../lib/passwordResetEmail");

describe("sendPasswordResetEmail", () => {
  it("generates a link and emails it for an existing account", async () => {
    const generateLink = vi.fn().mockResolvedValue("https://reset.link/abc");
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const res = await sendPasswordResetEmail({
      generateLink,
      sendEmail,
      email: "a@b.com",
    });
    expect(res).toEqual({ sent: true });
    expect(generateLink).toHaveBeenCalledWith("a@b.com");
    const msg = sendEmail.mock.calls[0][0];
    expect(msg.to).toBe("a@b.com");
    expect(msg.subject).toBe("Set your Tropos password");
    expect(msg.html).toContain("https://reset.link/abc");
  });

  it("stays silent (no send, no throw) when the account doesn't exist — enumeration defence", async () => {
    const generateLink = vi
      .fn()
      .mockRejectedValue(
        new Error("There is no user record (user-not-found).")
      );
    const sendEmail = vi.fn();
    const res = await sendPasswordResetEmail({
      generateLink,
      sendEmail,
      email: "ghost@b.com",
    });
    expect(res).toEqual({ sent: false, reason: "no-account" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rethrows a genuine failure (e.g. Admin outage) so the caller can 500", async () => {
    const generateLink = vi
      .fn()
      .mockRejectedValue(new Error("internal error / backend unavailable"));
    await expect(
      sendPasswordResetEmail({
        generateLink,
        sendEmail: vi.fn(),
        email: "a@b.com",
      })
    ).rejects.toThrow(/backend unavailable/);
  });

  it("html embeds the link in both the button and the copy-paste fallback", () => {
    const html = resetEmailHtml("https://x.y/z", "Tropos");
    // Appears at least twice: CTA href + the visible fallback URL.
    expect(html.split("https://x.y/z").length - 1).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Set a new password");
  });
});

describe("readResetEmail", () => {
  it("reads an address, trimmed", () => {
    expect(readResetEmail({ email: "  alice@example.com " })).toBe(
      "alice@example.com"
    );
    expect(readResetEmail({ email: "a.b+c@mail.example.co.uk" })).toBe(
      "a.b+c@mail.example.co.uk"
    );
  });

  it("refuses what is not an address", () => {
    for (const email of ["", "alice", "a@b", "a@b.", "@b.com", "a b@c.d"]) {
      expect(readResetEmail({ email })).toBeNull();
    }
    expect(readResetEmail({})).toBeNull();
    expect(readResetEmail(null)).toBeNull();
    expect(readResetEmail({ email: ["a@b.com"] })).toBeNull();
  });

  it("refuses an empty label in the domain", () => {
    expect(readResetEmail({ email: "a@.b.com" })).toBeNull();
    expect(readResetEmail({ email: "a@b..com" })).toBeNull();
  });

  it("takes 254 characters and refuses 255", () => {
    const at = (n) => `${"a".repeat(64)}@${"b".repeat(n - 64 - 5)}.com`;
    expect(at(254)).toHaveLength(MAX_EMAIL_LENGTH);
    expect(readResetEmail({ email: at(254) })).toBe(at(254));
    expect(readResetEmail({ email: at(255) })).toBeNull();
  });

  it("checks the length before the pattern", () => {
    const test = vi.spyOn(RegExp.prototype, "test");
    try {
      readResetEmail({ email: `a@${"a.".repeat(200)}@` });
      expect(test.mock.calls.some(([s]) => String(s).length > 254)).toBe(false);
    } finally {
      test.mockRestore();
    }
  });

  it("matches in time proportional to length, even past the length check", () => {
    // Defence in depth: the pattern alone stays fast on the string built
    // to make an overlapping pattern backtrack. Generous bound for CI.
    const crafted = `a@${"a.".repeat(200_000)}@`;
    const started = performance.now();
    expect(EMAIL_PATTERN.test(crafted)).toBe(false);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
