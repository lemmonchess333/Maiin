/**
 * Native OAuth sign-in seam. Pins the credential-building contract auth.tsx
 * depends on: the plugin's returned tokens are mapped to the right Firebase
 * credential shape (Google: idToken + accessToken; Apple: idToken + rawNonce).
 * The native flow itself is device-only, but this guards the wiring that's
 * easy to get subtly wrong (e.g. forgetting the Apple raw nonce).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const signInWithGoogle = vi.fn();
const signInWithApple = vi.fn();
vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    signInWithGoogle: () => signInWithGoogle(),
    signInWithApple: () => signInWithApple(),
  },
}));

const googleCredential = vi.fn(
  (idToken: string | null, accessToken: string | null) => ({
    providerId: "google.com",
    idToken,
    accessToken,
  })
);
const appleCredential = vi.fn((opts: Record<string, unknown>) => ({
  providerId: "apple.com",
  ...opts,
}));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: {
    credential: (idToken: string | null, accessToken: string | null) =>
      googleCredential(idToken, accessToken),
  },
  OAuthProvider: class {
    providerId: string;
    constructor(providerId: string) {
      this.providerId = providerId;
    }
    credential(opts: Record<string, unknown>) {
      return appleCredential(opts);
    }
  },
}));

import {
  getGoogleCredentialNative,
  getAppleCredentialNative,
} from "../nativeAuth";

describe("nativeAuth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Google: maps plugin idToken + accessToken into a Google credential", async () => {
    signInWithGoogle.mockResolvedValue({
      credential: { idToken: "g-id", accessToken: "g-at" },
    });
    const cred = await getGoogleCredentialNative();
    expect(googleCredential).toHaveBeenCalledWith("g-id", "g-at");
    expect(cred).toMatchObject({ providerId: "google.com", idToken: "g-id" });
  });

  it("Google: tolerates a null credential (passes nulls, never throws)", async () => {
    signInWithGoogle.mockResolvedValue({ credential: null });
    await expect(getGoogleCredentialNative()).resolves.toBeDefined();
    expect(googleCredential).toHaveBeenCalledWith(null, null);
  });

  it("Apple: maps plugin idToken + nonce into an Apple credential with rawNonce", async () => {
    signInWithApple.mockResolvedValue({
      credential: { idToken: "a-id", nonce: "a-nonce" },
    });
    const cred = await getAppleCredentialNative();
    expect(appleCredential).toHaveBeenCalledWith({
      idToken: "a-id",
      rawNonce: "a-nonce",
    });
    expect(cred).toMatchObject({ providerId: "apple.com", idToken: "a-id" });
  });

  it("Apple: tolerates a null credential (undefined fields, never throws)", async () => {
    signInWithApple.mockResolvedValue({ credential: null });
    await expect(getAppleCredentialNative()).resolves.toBeDefined();
    expect(appleCredential).toHaveBeenCalledWith({
      idToken: undefined,
      rawNonce: undefined,
    });
  });
});
