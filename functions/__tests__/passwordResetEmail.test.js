import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  sendPasswordResetEmail,
  resetEmailHtml,
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
