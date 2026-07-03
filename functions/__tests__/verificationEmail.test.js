import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  sendVerificationEmail,
  verifyEmailHtml,
} = require("../lib/verificationEmail");

describe("sendVerificationEmail", () => {
  it("generates a verification link and emails it", async () => {
    const generateLink = vi.fn().mockResolvedValue("https://verify.link/abc");
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const res = await sendVerificationEmail({
      generateLink,
      sendEmail,
      email: "a@b.com",
    });
    expect(res).toEqual({ sent: true });
    expect(generateLink).toHaveBeenCalledWith("a@b.com");
    const msg = sendEmail.mock.calls[0][0];
    expect(msg.to).toBe("a@b.com");
    expect(msg.subject).toBe("Verify your Tropos email");
    expect(msg.html).toContain("https://verify.link/abc");
  });

  it("rethrows generateLink failures so the caller can 500", async () => {
    const generateLink = vi
      .fn()
      .mockRejectedValue(new Error("backend unavailable"));
    await expect(
      sendVerificationEmail({
        generateLink,
        sendEmail: vi.fn(),
        email: "a@b.com",
      })
    ).rejects.toThrow(/backend unavailable/);
  });

  it("html embeds the link in both the button and the copy-paste fallback", () => {
    const html = verifyEmailHtml("https://x.y/z", "Tropos");
    expect(html.split("https://x.y/z").length - 1).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Confirm your email");
  });
});
