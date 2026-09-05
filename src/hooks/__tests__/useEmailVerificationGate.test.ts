import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { User } from "firebase/auth";
import { useEmailVerificationGate } from "../useEmailVerificationGate";

// recheck must reload the Auth user (a verification made elsewhere is
// invisible to the SDK) and then force a token refresh, because Firestore
// reuses the cached token — without the refresh the rules keep reading
// email_verified:false for up to an hour after the link was tapped.
function fakeUser(opts: { verifiedAfterReload: boolean }) {
  const user = {
    emailVerified: false,
    providerData: [{ providerId: "password" }],
    reload: vi.fn(async () => {
      user.emailVerified = opts.verifiedAfterReload;
    }),
    getIdToken: vi.fn(async () => "fresh-token"),
  };
  return user as unknown as User & typeof user;
}

describe("useEmailVerificationGate", () => {
  it("reports the gate for an unverified password account", () => {
    const { result } = renderHook(() =>
      useEmailVerificationGate(fakeUser({ verifiedAfterReload: false }))
    );
    expect(result.current.needsVerification).toBe(true);
  });

  it("recheck reloads, then refreshes the token once the account reads verified", async () => {
    const user = fakeUser({ verifiedAfterReload: true });
    const { result } = renderHook(() => useEmailVerificationGate(user));
    let verified = false;
    await act(async () => {
      verified = await result.current.recheck();
    });
    expect(verified).toBe(true);
    expect(user.reload).toHaveBeenCalledTimes(1);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(result.current.needsVerification).toBe(false);
  });

  it("recheck leaves the token alone while the account is still unverified", async () => {
    const user = fakeUser({ verifiedAfterReload: false });
    const { result } = renderHook(() => useEmailVerificationGate(user));
    let verified = true;
    await act(async () => {
      verified = await result.current.recheck();
    });
    expect(verified).toBe(false);
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(result.current.needsVerification).toBe(true);
  });

  it("recheck with no user resolves false", async () => {
    const { result } = renderHook(() => useEmailVerificationGate(null));
    expect(result.current.needsVerification).toBe(false);
    await expect(result.current.recheck()).resolves.toBe(false);
  });
});
