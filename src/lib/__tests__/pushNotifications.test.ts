// @vitest-environment jsdom
/**
 * FCM client token lifecycle (packets 17/19). The client goes through the
 * server callables (claimPushDeviceToken / releasePushDeviceToken) — it never
 * writes users/{uid}/devices directly. Every getToken() uses the canonical
 * service-worker registration. A mid-flight account switch aborts as
 * account-changed and never invokes the claim callable under the new account.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "vapid-test-key");

const h = vi.hoisted(() => {
  let uid: string | null = "u1";
  return {
    setUid: (value: string | null) => {
      uid = value;
    },
    claimFn: vi.fn(async () => ({ data: { claimed: true } })),
    releaseFn: vi.fn(async () => ({ data: { released: true } })),
    getToken: vi.fn(async () => "tok123" as string | null),
    deleteToken: vi.fn(async () => true),
    getReg: vi.fn(async () => ({ id: "canonical-reg" })),
    authMock: {
      get currentUser() {
        return uid ? { uid } : null;
      },
    },
  };
});

vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: (_fns: unknown, name: string) =>
    name === "claimPushDeviceToken" ? h.claimFn : h.releaseFn,
}));
vi.mock("firebase/messaging", () => ({
  getMessaging: () => ({}),
  getToken: (...a: unknown[]) => h.getToken(...(a as [])),
  deleteToken: (...a: unknown[]) => h.deleteToken(...(a as [])),
  isSupported: async () => true,
  onMessage: () => () => {},
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/register-sw", () => ({
  getAppServiceWorkerRegistration: (...a: unknown[]) => h.getReg(...(a as [])),
}));
vi.mock("@/lib/firebase", () => ({ app: {}, db: {}, auth: h.authMock }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  h.setUid("u1");
  h.getToken.mockResolvedValue("tok123");
  localStorage.clear();
  Object.defineProperty(globalThis, "Notification", {
    value: { permission: "granted" },
    configurable: true,
    writable: true,
  });
  // jsdom navigator lacks serviceWorker; isPushSupported() needs it present.
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register: vi.fn(), ready: Promise.resolve({}) },
    configurable: true,
    writable: true,
  });
});

async function load() {
  return import("@/lib/pushNotifications");
}

const PUSH_SETTINGS = "users/u1/settings/push";

describe("registerDeviceToken (packet 19 — server-owned)", () => {
  it("claims the token via the callable with the ownerUid + a fresh binding id", async () => {
    const { registerDeviceToken } = await load();
    const result = await registerDeviceToken("u1");
    expect(result).toEqual({ ok: true, token: "tok123" });
    expect(h.claimFn).toHaveBeenCalledTimes(1);
    const claimCall = h.claimFn.mock.calls[0] as unknown[];
    const payload = claimCall[0] as {
      ownerUid: string;
      token: string;
      platform: string;
      bindingId: string;
    };
    expect(payload.ownerUid).toBe("u1");
    expect(payload.token).toBe("tok123");
    expect(payload.platform).toBe("web");
    expect(payload.bindingId).toMatch(/^[a-f0-9]{32}$/);
  });

  it("every getToken uses the canonical service-worker registration", async () => {
    const { registerDeviceToken } = await load();
    await registerDeviceToken("u1");
    expect(h.getReg).toHaveBeenCalled();
    const getTokenCall = h.getToken.mock.calls[0] as unknown[];
    const opts = getTokenCall[1] as {
      serviceWorkerRegistration: unknown;
    };
    expect(opts.serviceWorkerRegistration).toEqual({ id: "canonical-reg" });
  });

  it("returns account-changed and never claims when auth switches mid-getToken", async () => {
    const { registerDeviceToken } = await load();
    // getToken resolves only after we flip the current user to u2.
    h.getToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          h.setUid("u2");
          resolve("tok123");
        })
    );
    const result = await registerDeviceToken("u1");
    expect(result).toEqual({ ok: false, reason: "account-changed" });
    expect(h.claimFn).not.toHaveBeenCalled();
  });

  it("returns no-uid / no-permission without claiming", async () => {
    const mod = await load();
    expect(await mod.registerDeviceToken("")).toEqual({
      ok: false,
      reason: "no-uid",
    });
    (globalThis.Notification as { permission: string }).permission = "denied";
    expect(await mod.registerDeviceToken("u1")).toEqual({
      ok: false,
      reason: "no-permission",
    });
    expect(h.claimFn).not.toHaveBeenCalled();
  });
});

describe("unregisterDeviceToken (packet 19 — fenced release)", () => {
  it("releases the stored binding via the callable and never deletes docs directly", async () => {
    const { registerDeviceToken, unregisterDeviceToken } = await load();
    await registerDeviceToken("u1"); // seeds a stored binding
    h.releaseFn.mockClear();
    await unregisterDeviceToken("u1");
    expect(h.releaseFn).toHaveBeenCalledTimes(1);
    const releaseCall = h.releaseFn.mock.calls[0] as unknown[];
    const payload = releaseCall[0] as { ownerUid: string };
    expect(payload.ownerUid).toBe("u1");
  });

  it("the fallback (no stored binding) getToken also uses the canonical registration", async () => {
    const { unregisterDeviceToken } = await load();
    h.getReg.mockClear();
    await unregisterDeviceToken("u1"); // no stored binding → fallback path
    expect(h.getReg).toHaveBeenCalled();
  });

  it("callable-not-deployed (functions/not-found) does NOT block sign-out", async () => {
    // Issue #1636: the client shipped ahead of a stranded functions
    // deploy. A missing backend can't hold claims, so the fail-closed
    // barrier must not wedge auth transitions behind absent infra.
    const { registerDeviceToken, unregisterDeviceToken } = await load();
    await registerDeviceToken("u1"); // seeds a stored binding
    h.releaseFn.mockRejectedValueOnce(
      Object.assign(new Error("not-found"), { code: "functions/not-found" })
    );
    await expect(unregisterDeviceToken("u1")).resolves.toBeUndefined();
  });

  it("a real release failure still fails closed (throws)", async () => {
    const { registerDeviceToken, unregisterDeviceToken } = await load();
    await registerDeviceToken("u1");
    h.releaseFn.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { code: "functions/internal" })
    );
    await expect(unregisterDeviceToken("u1")).rejects.toThrow("boom");
  });
});

describe("refreshDeviceTokenForCurrentUser (consent-gated re-register)", () => {
  /**
   * Untested until 2026-07-26, and untestable by construction: this is the
   * only consumer of the module's Firestore read, and the inline stub
   * hard-coded `getDoc` to a non-existent snapshot. `DEFAULT_PUSH_CONSENT`
   * has `enabled: false`, so the consent gate ALWAYS bailed — the register
   * path below could never be reached whatever the suite did. Seeding a
   * real settings doc is what makes both branches expressible.
   */
  it("re-registers when stored consent has push enabled", async () => {
    seedFirestore({ [PUSH_SETTINGS]: { enabled: true } });
    const { refreshDeviceTokenForCurrentUser } = await load();
    await refreshDeviceTokenForCurrentUser("u1");
    expect(h.claimFn).toHaveBeenCalledTimes(1);
  });

  it("does nothing when stored consent has push disabled", async () => {
    seedFirestore({ [PUSH_SETTINGS]: { enabled: false } });
    const { refreshDeviceTokenForCurrentUser } = await load();
    await refreshDeviceTokenForCurrentUser("u1");
    expect(h.claimFn).not.toHaveBeenCalled();
  });

  it("does nothing when no consent doc exists (default is OFF)", async () => {
    const { refreshDeviceTokenForCurrentUser } = await load();
    await refreshDeviceTokenForCurrentUser("u1");
    expect(h.claimFn).not.toHaveBeenCalled();
  });

  it("never registers for a uid that is not the signed-in user", async () => {
    // Consent is ON for u1, but u2 is signed in: registering would bind
    // THIS device's token to u1 while u2 is the active account.
    //
    // SCOPE, measured rather than assumed. This is an END-TO-END property
    // check; it does NOT pin either uid guard inside
    // `refreshDeviceTokenForCurrentUser`. Mutation showed why: that
    // function has two (`!isCurrentUser(uid)` on entry, and again after
    // the consent read), and removing them ONE AT A TIME leaves this
    // green because the other still returns — and removing BOTH is still
    // green, because `registerDeviceToken` refuses on its own uid check.
    // So the guarantee is real and defended three deep, but the
    // enforcement this test observes lives downstream. Don't read a pass
    // here as cover for editing the guards above.
    seedFirestore({ [PUSH_SETTINGS]: { enabled: true } });
    h.setUid("u2");
    const { refreshDeviceTokenForCurrentUser } = await load();
    await refreshDeviceTokenForCurrentUser("u1");
    expect(h.claimFn).not.toHaveBeenCalled();
  });
});
