// @vitest-environment jsdom
/** A successful native purchase/restore stays in the same WebView. Drive the
 * real checkout/provider -> callable -> Firestore -> AuthProvider -> scan gate
 * chain, including a webhook arriving after the best-effort callable failed. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { User } from "firebase/auth";
import * as firestore from "firebase/firestore";
import type {
  DocumentReference,
  DocumentSnapshot,
  FirestoreError,
  SnapshotListenOptions,
} from "firebase/firestore";
import type { UseProCheckoutResult } from "@/hooks/useProCheckout";
import type { UpdateProfileResult, UserProfile } from "../auth";

const h = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  onAuth: null as ((user: User | null) => void) | null,
  checkout: null as UseProCheckoutResult["startCheckout"] | null,
  updateProfile: null as
    ((patch: Partial<UserProfile>) => Promise<UpdateProfileResult>) | null,
  sync: vi.fn(),
}));

vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({ auth: h.auth, db: {}, functions: {} }));
vi.mock("../firebaseApp", () => ({ auth: h.auth }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, next: (user: User | null) => void) => {
    h.onAuth = next;
    return () => {
      h.onAuth = null;
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
vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: () => h.sync,
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
  // AuthProvider clears native Watch state before exposing another account.
  // This subscription test keeps that cleanup available without a native
  // bridge; account-transition behavior has its own focused tests.
  registerPlugin: () => ({
    clearSession: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  }),
}));
vi.mock("../nativeAuth", () => ({
  getGoogleCredentialNative: vi.fn(),
  getAppleSignInNative: vi.fn(),
}));
vi.mock("../revenuecat", () => ({
  isRevenueCatEnabled: () => true,
  rcPurchase: async () => ({ success: true, isProActive: true }),
  rcRestore: async () => ({ success: true, isProActive: true }),
  rcGetLocalizedPrices: async () => null,
}));
vi.mock("../errorReporting", () => ({ setErrorReportingUid: vi.fn() }));
vi.mock("@/lib/pushNotifications", () => ({
  withPushTokenLifecycleTransition: (operation: () => Promise<unknown>) =>
    operation(),
  invalidatePushTokenLifecycle: vi.fn(),
  stopListeningForForegroundPush: vi.fn(),
  unregisterDeviceToken: vi.fn(),
  waitForPendingPushRegistration: vi.fn(),
}));
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: vi.fn().mockResolvedValue(undefined),
  updateDocGuarded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/paywallAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/captureTimezone", () => ({
  getDeviceTimezone: () => "UTC",
  shouldUpdateTimezone: () => false,
}));

import { AuthProvider, useAuth } from "../auth";
import { db } from "../firebase";
import { useSubscription } from "../subscription";
import { restorePurchases } from "../purchaseProvider";
import { useProCheckout } from "@/hooks/useProCheckout";
import { useScanUsage } from "@/hooks/useScanUsage";
import {
  flushSnapshots,
  resetFirestore,
  seedFirestore,
  setSnapshotMetadata,
} from "@/test/firestoreHarness";

function Probe() {
  const { profile, updateProfile } = useAuth();
  const { tier } = useSubscription();
  const { limit } = useScanUsage();
  const { startCheckout } = useProCheckout();
  useEffect(() => {
    h.checkout = startCheckout;
    h.updateProfile = updateProfile;
  }, [startCheckout, updateProfile]);
  return (
    <div
      data-testid="subscription"
      data-uid={profile?.uid ?? "none"}
      data-name={profile?.displayName ?? ""}
      data-tier={tier}
      data-limit={String(limit)}
      data-source={profile?.subscriptionSource ?? "none"}
      data-trial={profile?.subscriptionTrial?.productId ?? "none"}
    />
  );
}

const state = () => screen.getByTestId("subscription").dataset;
const pro = {
  subscriptionTier: "pro",
  subscriptionSource: "ios_iap",
  subscriptionExpiresAt: "2999-01-01T00:00:00.000Z",
  hasUsedTrial: true,
  subscriptionTrial: { productId: "com.tropos.app.pro.monthly" },
};

async function emit(uid: string | null) {
  h.auth.currentUser = uid
    ? ({
        uid,
        email: `${uid}@example.com`,
        getIdTokenResult: async () => ({ signInProvider: "password" }),
      } as User)
    : null;
  await act(async () => h.onAuth?.(h.auth.currentUser));
  await waitFor(() => expect(state().uid).toBe(uid ?? "none"));
}

async function writeSubscription(patch: Record<string, unknown>) {
  await act(async () => {
    await firestore.setDoc(firestore.doc(db, "users", "A"), patch, {
      merge: true,
    });
  });
}

async function purchaseOrRestore(action: "purchase" | "restore") {
  await act(async () => {
    if (action === "purchase") await h.checkout!("monthly");
    else expect(await restorePurchases()).toEqual({ success: true });
  });
}

beforeEach(() => {
  resetFirestore();
  h.auth.currentUser = null;
  h.onAuth = null;
  h.sync.mockReset().mockImplementation(async () => {
    await firestore.setDoc(firestore.doc(db, "users", "A"), pro, {
      merge: true,
    });
    return { data: { tier: "pro" } };
  });
  seedFirestore({
    "users/A": { displayName: "A", subscriptionTier: "free" },
    "users/B": { displayName: "B", subscriptionTier: "free" },
  });
  render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetFirestore();
});

describe("AuthProvider — live subscription state", () => {
  it.each(["purchase", "restore"] as const)(
    "%s unlocks scans in the current app without another auth event",
    async (action) => {
      await emit("A");
      expect(state().tier).toBe("free");
      expect(state().limit).toBe("0");

      await purchaseOrRestore(action);

      await waitFor(() => expect(state().tier).toBe("pro"));
      expect(state().limit).toBe("100");
      expect(state().source).toBe("ios_iap");
      expect(state().trial).toBe("com.tropos.app.pro.monthly");
      expect(h.sync).toHaveBeenCalledOnce();
    }
  );

  it.each(["purchase", "restore"] as const)(
    "%s unlocks when the webhook arrives after the sync callable failed",
    async (action) => {
      await emit("A");
      h.sync.mockRejectedValueOnce(new Error("sync unavailable"));

      await purchaseOrRestore(action);
      expect(state().tier).toBe("free");

      await writeSubscription(pro);
      await waitFor(() => expect(state().tier).toBe("pro"));
      expect(state().limit).toBe("100");
    }
  );

  it("tracks cancellation and removed billing fields without replacing edited settings", async () => {
    await emit("A");
    await writeSubscription(pro);
    await waitFor(() => expect(state().tier).toBe("pro"));
    await act(async () => {
      await h.updateProfile!({ displayName: "Edited locally" });
    });
    expect(state().name).toBe("Edited locally");

    await act(async () => {
      // The remote name is deliberately older than the optimistic edit.
      await firestore.setDoc(firestore.doc(db, "users", "A"), {
        displayName: "A",
        subscriptionTier: "free",
      });
    });
    await waitFor(() => expect(state().tier).toBe("free"));
    expect(state().limit).toBe("0");
    expect(state().source).toBe("none");
    expect(state().trial).toBe("none");
    expect(state().name).toBe("Edited locally");
  });

  it("waits for server confirmation rather than applying a cached entitlement", async () => {
    await emit("A");
    setSnapshotMetadata("users/A", { fromCache: true });
    await writeSubscription(pro);
    expect(state().tier).toBe("free");

    setSnapshotMetadata("users/A", { fromCache: false });
    await flushSnapshots();
    await waitFor(() => expect(state().tier).toBe("pro"));
  });

  it("ignores an old account's queued entitlement after switching or signing out", async () => {
    const original = firestore.onSnapshot as unknown as (
      ...args: unknown[]
    ) => () => void;
    const queued: (() => void)[] = [];
    let hold = false;
    vi.spyOn(firestore, "onSnapshot").mockImplementation(((
      ...args: unknown[]
    ) => {
      const [ref, options, next, error] = args;
      if ((ref as DocumentReference).path !== "users/A")
        return original(...args);
      return original(
        ref,
        options as SnapshotListenOptions,
        (snapshot: DocumentSnapshot) => {
          const deliver = () =>
            (next as (s: DocumentSnapshot) => void)(snapshot);
          if (hold) queued.push(deliver);
          else deliver();
        },
        error as (error: FirestoreError) => void
      );
    }) as typeof firestore.onSnapshot);
    await emit("A");
    hold = true;
    await writeSubscription(pro);
    expect(queued).toHaveLength(1);

    await emit("B");
    act(() => queued[0]());
    expect(state().uid).toBe("B");
    expect(state().tier).toBe("free");
    expect(state().limit).toBe("0");
    expect(state().source).toBe("none");

    await emit(null);
    act(() => queued[0]());
    expect(state().uid).toBe("none");
    expect(state().tier).toBe("free");
  });
});
