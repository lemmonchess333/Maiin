// @vitest-environment jsdom
/**
 * App1 Q25: the "structured" run mode Run9 (3a) retired is out of the code.
 * An account whose profile still holds it loads as free running, which is
 * what the programme's loader moved every account it met to, and the
 * profile is stored as free running too, so nothing writes the retired mode
 * back. Run against the real AuthProvider and the one Firestore fake
 * (ADR-0009).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";

type FakeUser = {
  uid: string;
  emailVerified: boolean;
  providerData: { providerId: string }[];
};

const H = vi.hoisted(() => ({
  mockAuth: { currentUser: null as FakeUser | null },
  authCb: null as ((u: FakeUser | null) => void) | null,
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
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: FakeUser | null) => void) => {
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
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/captureTimezone", () => ({
  getDeviceTimezone: () => "UTC",
  shouldUpdateTimezone: () => false,
}));

import { AuthProvider, useAuth } from "../auth";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  writeLog,
} from "@/test/firestoreHarness";

const UID = "u1";

function seedAccount(extra: Record<string, unknown>) {
  seedFirestore({
    [`users/${UID}`]: {
      uid: UID,
      displayName: "Alex",
      onboardingComplete: true,
      ...extra,
    },
  });
}

function RunMode() {
  const { profile } = useAuth();
  return (
    <p>{profile ? `Run mode: ${profile.runMode ?? "none"}` : "Loading"}</p>
  );
}

async function signIn() {
  render(
    <AuthProvider>
      <RunMode />
    </AuthProvider>
  );
  H.mockAuth.currentUser = {
    uid: UID,
    emailVerified: true,
    providerData: [{ providerId: "password" }],
  };
  await act(async () => {
    H.authCb?.(H.mockAuth.currentUser);
  });
}

/** The run modes the sign-in wrote to the profile, in order. */
function runModeWrites(): unknown[] {
  return writeLog()
    .filter((w) => w.path === `users/${UID}`)
    .map((w) => (w.data ?? {}) as Record<string, unknown>)
    .filter((data) => "runMode" in data)
    .map((data) => data.runMode);
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  H.mockAuth.currentUser = null;
  H.authCb = null;
});

describe("a profile still holding the retired structured run mode", () => {
  it("loads as free running, and is stored as free running", async () => {
    seedAccount({ runMode: "structured" });
    await signIn();

    expect(await screen.findByText("Run mode: freeform")).toBeInTheDocument();
    await waitFor(() =>
      expect(readDoc(`users/${UID}`)?.runMode).toBe("freeform")
    );
    // Written once, and never as the retired mode.
    expect(runModeWrites()).toEqual(["freeform"]);
  });

  it("leaves every other run mode as it is, and writes none", async () => {
    seedAccount({ runMode: "race_prep" });
    await signIn();

    expect(await screen.findByText("Run mode: race_prep")).toBeInTheDocument();
    expect(readDoc(`users/${UID}`)?.runMode).toBe("race_prep");
    expect(runModeWrites()).toEqual([]);
  });
});
