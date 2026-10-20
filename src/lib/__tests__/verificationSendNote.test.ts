// @vitest-environment jsdom
/**
 * Whether the link sign-up sent went: Home said "We sent a link" either
 * way. A failed first send is remembered on this device, and the next
 * send that works forgets it. (jsdom: the note lives in localStorage.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  currentUser: { uid: "u1", email: "a@b.com" } as {
    uid: string;
    email: string;
  } | null,
}));
vi.mock("../firebase", () => ({ auth: authState }));
vi.mock("firebase/auth", () => ({
  sendEmailVerification: vi.fn(),
  updatePassword: vi.fn(),
  verifyBeforeUpdateEmail: vi.fn(),
}));
const callable = vi.fn();
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => callable),
}));
vi.mock("../reauth", () => ({ reauthWithPassword: vi.fn() }));

import {
  sendInitialVerificationEmail,
  sendVerificationEmail,
  verificationSendFailed,
} from "../accountSecurity";

beforeEach(() => {
  localStorage.clear();
  callable.mockReset();
});

describe("the sign-up link's send", () => {
  it("is remembered as failed, and forgotten once a send works", async () => {
    callable.mockRejectedValueOnce(
      Object.assign(new Error("Too many requests"), {
        code: "functions/resource-exhausted",
      })
    );
    await expect(sendInitialVerificationEmail("u1")).rejects.toThrow();
    expect(verificationSendFailed("u1")).toBe(true);
    expect(verificationSendFailed("someone-else")).toBe(false);

    callable.mockResolvedValueOnce({ data: { ok: true } });
    await sendVerificationEmail();
    expect(verificationSendFailed("u1")).toBe(false);
  });

  it("leaves nothing to say when the first send works", async () => {
    authState.currentUser = { uid: "u2", email: "c@d.com" };
    callable.mockResolvedValueOnce({ data: { ok: true } });
    await sendInitialVerificationEmail("u2");
    expect(verificationSendFailed("u2")).toBe(false);
  });
});
