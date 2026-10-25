// @vitest-environment jsdom
/**
 * updateProfile offline: the change counts as made at once.
 *
 * The SDK has an offline write on the device the moment it is made and
 * sends it on reconnect, but the promise it returns waits for the server.
 * updateProfile awaited it, so every Settings save offline (heart-rate
 * zones, run fitness, units, every toggle) spun until the connection came
 * back, and the "check your connection" its callers promised never ran
 * (settleWrite.ts). Online nothing changes: a refusal still fails the save.
 *
 * Harness as authProviderAccountSwitch.test.tsx, with the write held open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import type { UpdateProfileResult, UserProfile } from "../auth";

const H = vi.hoisted(() => ({
  mockAuth: { currentUser: null as { uid: string } | null },
  authCb: null as ((u: { uid: string } | null) => void) | null,
  update: null as
    | null
    | ((
        p: Partial<UserProfile>,
        o?: { throwOnError?: boolean }
      ) => Promise<UpdateProfileResult>),
  setDoc: vi.fn(async (..._args: unknown[]) => {}),
  toastError: vi.fn(),
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
  onAuthStateChanged: (
    _a: unknown,
    cb: (u: { uid: string } | null) => void
  ) => {
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
  signInWithCredential: vi.fn(),
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
  signOut: vi.fn(),
}));
vi.mock("firebase/firestore");
vi.mock("../errorReporting", () => ({ setErrorReportingUid: vi.fn() }));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: (...args: unknown[]) => H.setDoc(...args),
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
vi.mock("@/lib/toast", () => ({
  toast: { error: H.toastError, success: vi.fn() },
}));

import { AuthProvider, useAuth } from "../auth";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

function Probe() {
  const auth = useAuth();
  useEffect(() => {
    H.update = auth.updateProfile;
  }, [auth.updateProfile]);
  return (
    <div
      data-testid="s"
      data-max-hr={String(auth.profile?.maxHeartRate ?? "none")}
    />
  );
}
const maxHr = () => screen.getByTestId("s").getAttribute("data-max-hr");

const setOnline = (online: boolean) =>
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });

beforeEach(async () => {
  resetFirestore();
  H.setDoc.mockReset().mockResolvedValue(undefined);
  H.toastError.mockClear();
  seedFirestore({ "users/A": { email: "A@x.z" } });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  H.mockAuth.currentUser = { uid: "A" };
  await act(async () => {
    H.authCb?.(H.mockAuth.currentUser);
  });
  await waitFor(() => expect(H.update).not.toBeNull());
});
afterEach(() => {
  cleanup();
  setOnline(true);
  resetFirestore();
});

describe("updateProfile offline", () => {
  it("resolves at once and shows the change while the write waits for the connection", async () => {
    setOnline(false);
    let refuse!: (err: Error) => void;
    H.setDoc.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        refuse = reject;
      })
    );
    let result: UpdateProfileResult | undefined;
    await act(async () => {
      result = await H.update!({ maxHeartRate: 190 }, { throwOnError: true });
    });
    expect(result).toEqual({ ok: true });
    expect(maxHr()).toBe("190");
    expect(H.toastError).not.toHaveBeenCalled();

    // Refused once back online: said then.
    await act(async () => {
      refuse(new Error("permission-denied"));
    });
    await waitFor(() =>
      expect(H.toastError).toHaveBeenCalledWith(
        "A change you made offline couldn't be saved. Check your settings.",
        { id: "update-profile-error" }
      )
    );
  });

  it("online, a refusal still fails the save", async () => {
    H.setDoc.mockRejectedValueOnce(new Error("permission-denied"));
    await act(async () => {
      await expect(
        H.update!({ maxHeartRate: 190 }, { throwOnError: true })
      ).rejects.toThrow("permission-denied");
    });
    expect(maxHr()).toBe("none");
  });
});
