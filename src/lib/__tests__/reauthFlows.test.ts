import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const h = vi.hoisted(() => ({
  native: false,
  credential: vi.fn(),
  popup: vi.fn(),
  revoke: vi.fn(),
  apple: vi.fn(),
  google: vi.fn(),
  fetch: vi.fn(),
  auth: {
    currentUser: { uid: "u1" },
    app: { options: { apiKey: "test-public-key" } },
    tenantId: null,
  },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => h.native },
}));
vi.mock("firebase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/auth")>()),
  reauthenticateWithCredential: h.credential,
  reauthenticateWithPopup: h.popup,
  revokeAccessToken: h.revoke,
  getAuth: () => h.auth,
}));
vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    signInWithApple: h.apple,
    signInWithGoogle: h.google,
  },
}));
vi.mock("@capacitor/app", () => ({
  App: { getInfo: async () => ({ id: "test.tropos" }) },
}));

import { OAuthProvider } from "firebase/auth";
import {
  reauthWithPassword,
  reauthWithGoogle,
  reauthWithApple,
} from "../reauth";

let user: User;
beforeEach(() => {
  vi.resetAllMocks();
  h.native = false;
  h.auth.currentUser = { uid: "u1" };
  h.apple.mockResolvedValue({
    credential: {
      idToken: "apple-id",
      nonce: "nonce",
      authorizationCode: "code",
    },
  });
  h.google.mockResolvedValue({
    credential: { idToken: "google-id", accessToken: "access" },
  });
  h.fetch.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", h.fetch);
  user = {
    uid: "u1",
    email: "person@example.com",
    getIdToken: vi.fn().mockResolvedValue("fresh-jwt"),
  } as unknown as User;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reauthentication of the existing account", () => {
  it("refreshes auth_time only after password reauthentication succeeds", async () => {
    await reauthWithPassword(user, "password");
    expect(h.credential).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ providerId: "password" })
    );
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(h.credential.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(user.getIdToken).mock.invocationCallOrder[0]
    );
  });

  it.each([reauthWithGoogle, reauthWithApple])(
    "uses the native credential against the existing JS user",
    async (reauth) => {
      h.native = true;
      await reauth(user);
      expect(h.credential).toHaveBeenCalledWith(user, expect.anything());
      expect(h.popup).not.toHaveBeenCalled();
      expect(user.getIdToken).toHaveBeenCalledWith(true);
      expect(h.fetch).not.toHaveBeenCalled();
    }
  );

  it.each([reauthWithGoogle, reauthWithApple])(
    "rejects a blocked web popup without treating a redirect as success",
    async (reauth) => {
      h.popup.mockRejectedValueOnce(
        Object.assign(new Error("blocked"), {
          code: "auth/operation-not-supported-in-this-environment",
        })
      );
      await expect(reauth(user)).rejects.toThrow("blocked");
      expect(user.getIdToken).not.toHaveBeenCalled();
    }
  );

  it("propagates token-refresh failure rather than allowing deletion", async () => {
    vi.mocked(user.getIdToken).mockRejectedValueOnce(new Error("offline"));
    await expect(reauthWithPassword(user, "password")).rejects.toThrow(
      "offline"
    );
  });
});

describe("Apple account-deletion revocation", () => {
  it("revokes the web access token only after confirming the account", async () => {
    vi.spyOn(OAuthProvider, "credentialFromResult").mockReturnValue(
      new OAuthProvider("apple.com").credential({ accessToken: "apple-access" })
    );
    await reauthWithApple(user, { forDeletion: true });
    expect(h.revoke).toHaveBeenCalledWith(h.auth, "apple-access");
    expect(vi.mocked(user.getIdToken).mock.invocationCallOrder[0]).toBeLessThan(
      h.revoke.mock.invocationCallOrder[0]
    );
  });

  it("uses the native authorization code and refreshed JS token without starting a native Firebase session", async () => {
    h.native = true;
    await reauthWithApple(user, { forDeletion: true });
    expect(h.credential).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ providerId: "apple.com" })
    );
    expect(h.fetch).toHaveBeenCalledOnce();
    const [url, init] = h.fetch.mock.calls[0];
    expect(url).toBe(
      "https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=test-public-key"
    );
    expect(JSON.parse(init.body)).toEqual({
      providerId: "apple.com",
      tokenType: "CODE",
      token: "code",
      idToken: "fresh-jwt",
    });
    expect(init.headers["X-Ios-Bundle-Identifier"]).toBe("test.tropos");
    expect(vi.mocked(user.getIdToken).mock.invocationCallOrder[0]).toBeLessThan(
      h.fetch.mock.invocationCallOrder[0]
    );
    expect(h.revoke).not.toHaveBeenCalled();
  });

  it("does not revoke another Apple account when reauthentication rejects a mismatch", async () => {
    h.native = true;
    h.credential.mockRejectedValueOnce(new Error("auth/user-mismatch"));
    await expect(reauthWithApple(user, { forDeletion: true })).rejects.toThrow(
      "auth/user-mismatch"
    );
    expect(h.fetch).not.toHaveBeenCalled();
    expect(user.getIdToken).not.toHaveBeenCalled();
  });

  it("rejects an incomplete native credential without attempting revocation", async () => {
    h.native = true;
    h.apple.mockResolvedValueOnce({
      credential: { idToken: "apple-id", nonce: "nonce" },
    });
    await expect(reauthWithApple(user, { forDeletion: true })).rejects.toThrow(
      "incomplete"
    );
    expect(h.credential).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("propagates revocation failure without exposing its response body", async () => {
    h.native = true;
    h.fetch.mockResolvedValueOnce({
      ok: false,
      text: () => "sensitive upstream diagnostic",
    });
    await expect(reauthWithApple(user, { forDeletion: true })).rejects.toThrow(
      "Couldn't disconnect Sign in with Apple"
    );
  });
});
