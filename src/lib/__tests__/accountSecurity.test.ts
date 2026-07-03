import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "firebase/auth";

const updatePassword = vi.fn();
const verifyBeforeUpdateEmail = vi.fn();
vi.mock("firebase/auth", () => ({
  updatePassword: (...a: unknown[]) => updatePassword(...a),
  verifyBeforeUpdateEmail: (...a: unknown[]) => verifyBeforeUpdateEmail(...a),
}));

const callableImpl = vi.fn();
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => callableImpl),
}));

const reauthWithPassword = vi.fn();
vi.mock("../reauth", () => ({
  reauthWithPassword: (...a: unknown[]) => reauthWithPassword(...a),
}));

import {
  sendVerificationEmail,
  changePassword,
  requestEmailChange,
} from "../accountSecurity";

const user = { uid: "u1", email: "a@b.com" } as unknown as User;

beforeEach(() => {
  vi.clearAllMocks();
  reauthWithPassword.mockResolvedValue(undefined);
  updatePassword.mockResolvedValue(undefined);
  verifyBeforeUpdateEmail.mockResolvedValue(undefined);
  callableImpl.mockResolvedValue({ data: { ok: true } });
});

describe("sendVerificationEmail", () => {
  it("invokes the server callable", async () => {
    await sendVerificationEmail();
    expect(callableImpl).toHaveBeenCalledOnce();
  });
});

describe("changePassword", () => {
  it("reauths with the current password BEFORE updating", async () => {
    const order: string[] = [];
    reauthWithPassword.mockImplementation(async () => {
      order.push("reauth");
    });
    updatePassword.mockImplementation(async () => {
      order.push("update");
    });
    await changePassword(user, "old-pass", "new-pass");
    expect(order).toEqual(["reauth", "update"]);
    expect(reauthWithPassword).toHaveBeenCalledWith(user, "old-pass");
    expect(updatePassword).toHaveBeenCalledWith(user, "new-pass");
  });

  it("does NOT update the password when reauth fails (wrong current password)", async () => {
    reauthWithPassword.mockRejectedValue(
      new Error("Firebase: Error (auth/invalid-credential).")
    );
    await expect(changePassword(user, "wrong", "new-pass")).rejects.toThrow(
      /invalid-credential/
    );
    expect(updatePassword).not.toHaveBeenCalled();
  });
});

describe("requestEmailChange", () => {
  it("reauths, then sends the confirm link to the trimmed new address", async () => {
    await requestEmailChange(user, "old-pass", "  new@b.com  ");
    expect(reauthWithPassword).toHaveBeenCalledWith(user, "old-pass");
    expect(verifyBeforeUpdateEmail).toHaveBeenCalledWith(user, "new@b.com");
  });

  it("does NOT touch the email when reauth fails", async () => {
    reauthWithPassword.mockRejectedValue(
      new Error("Firebase: Error (auth/invalid-credential).")
    );
    await expect(
      requestEmailChange(user, "wrong", "new@b.com")
    ).rejects.toThrow(/invalid-credential/);
    expect(verifyBeforeUpdateEmail).not.toHaveBeenCalled();
  });
});
