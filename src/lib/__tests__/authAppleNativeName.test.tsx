// @vitest-environment jsdom
/**
 * The native Apple sign-in keeps the name Apple shares (survey 22), and
 * every sign-in remembers its method for Login's "Last used" (Polish2
 * call 3), through the real AuthProvider and the one Firestore fake.
 *
 * Apple gives the name only on the first sign-in and only to the app: the
 * identity token carries none. Signing in with the credential alone made
 * a nameless account, and with Hide My Email setup then named it from the
 * relay address.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { render, act, cleanup, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({
  mockAuth: { currentUser: null as Record<string, unknown> | null },
  authCb: null as ((u: unknown) => void) | null,
  signInWithApple: null as null | (() => Promise<void>),
  appleName: "Sam Jones" as string | null,
  updateProfile: vi.fn(
    async (
      user: { displayName: string | null },
      p: { displayName: string }
    ) => {
      user.displayName = p.displayName;
    }
  ),
}));

vi.mock("../firebase", () => ({
  auth: H.mockAuth,
  db: {},
  app: {},
  storage: {},
  functions: {},
  firebaseConfig: {},
}));
vi.mock("../firebaseApp", () => ({
  auth: H.mockAuth,
  app: {},
  firebaseConfig: {},
}));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => true }));
vi.mock("@/lib/nativeAuth", () => ({
  getGoogleCredentialNative: vi.fn(),
  getAppleSignInNative: async () => ({
    credential: { providerId: "apple.com" },
    displayName: H.appleName,
  }),
}));
vi.mock("@/lib/pushNotifications", () => ({
  withPushTokenLifecycleTransition: (operation: () => Promise<unknown>) =>
    operation(),
  invalidatePushTokenLifecycle: vi.fn(),
  stopListeningForForegroundPush: vi.fn(),
  unregisterDeviceToken: vi.fn().mockResolvedValue(undefined),
  waitForPendingPushRegistration: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  cancelAllNotifications: vi.fn(async () => {}),
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    H.authCb = cb;
    return () => {
      H.authCb = null;
    };
  },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  signInWithCredential: vi.fn(async () => {
    const user = {
      uid: "apple-uid",
      displayName: null as string | null,
      email: "k7x9qzp2m@privaterelay.appleid.com",
      photoURL: null,
      getIdTokenResult: async () => ({ signInProvider: "apple.com" }),
    };
    H.mockAuth.currentUser = user;
    return { user };
  }),
  updateProfile: H.updateProfile,
  fetchSignInMethodsForEmail: vi.fn(),
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
  signOut: vi.fn(),
}));
vi.mock("firebase/firestore");
vi.mock("../errorReporting", () => ({ setErrorReportingUid: vi.fn() }));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: vi.fn().mockResolvedValue(undefined),
  updateDocGuarded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/accountSecurity", () => ({
  sendVerificationEmail: vi.fn(),
  sendInitialVerificationEmail: vi.fn(),
}));
vi.mock("@/lib/captureTimezone", () => ({
  getDeviceTimezone: () => "UTC",
  shouldUpdateTimezone: () => false,
}));

import { AuthProvider, useAuth } from "../auth";
import { readDoc, resetFirestore } from "@/test/firestoreHarness";
import { readLastSignInMethod } from "../signInMethod";

function Probe() {
  const auth = useAuth();
  useEffect(() => {
    H.signInWithApple = auth.signInWithApple;
  }, [auth.signInWithApple]);
  return null;
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  H.mockAuth.currentUser = null;
  H.updateProfile.mockClear();
  H.appleName = "Sam Jones";
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
});
afterEach(() => {
  cleanup();
  resetFirestore();
});

describe("native Apple sign-in", () => {
  it("names the new account with the name Apple shared", async () => {
    await act(async () => {
      await H.signInWithApple!();
    });
    expect(H.updateProfile).toHaveBeenCalledWith(expect.anything(), {
      displayName: "Sam Jones",
    });
    expect(readDoc("users/apple-uid")?.displayName).toBe("Sam Jones");
    expect(readDoc("users/apple-uid/public/profile")?.displayName).toBe(
      "Sam Jones"
    );
  });

  it("leaves the account as it is when Apple shares no name", async () => {
    H.appleName = null;
    await act(async () => {
      await H.signInWithApple!();
    });
    expect(H.updateProfile).not.toHaveBeenCalled();
  });
});

describe("the method a sign-in used", () => {
  it("is remembered for Login's Last used", async () => {
    await act(async () => {
      H.mockAuth.currentUser = {
        uid: "apple-uid",
        getIdTokenResult: async () => ({ signInProvider: "apple.com" }),
      };
      H.authCb?.(H.mockAuth.currentUser);
    });
    await waitFor(() => expect(readLastSignInMethod()).toBe("apple"));
  });
});
