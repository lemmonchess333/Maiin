import { describe, it, expect, vi, beforeEach } from "vitest";

// Spies referenced lazily inside the mock factories (call-time, so hoisting is fine).
const docSpy = vi.fn<(...args: unknown[]) => unknown>((...args) => args);
const setDocSpy = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const deleteDocSpy = vi.fn<(...args: unknown[]) => Promise<void>>(
  async () => {}
);
const getTokenSpy = vi.fn<(...args: unknown[]) => Promise<string | null>>(
  async () => "tok123"
);
const deleteTokenSpy = vi.fn<(...args: unknown[]) => Promise<boolean>>(
  async () => true
);
const isSupportedSpy = vi.fn<() => Promise<boolean>>(async () => true);

vi.mock("firebase/firestore", () => ({
  doc: (...a: unknown[]) => docSpy(...a),
  setDoc: (...a: unknown[]) => setDocSpy(...a),
  deleteDoc: (...a: unknown[]) => deleteDocSpy(...a),
  serverTimestamp: () => "TS",
}));
vi.mock("firebase/messaging", () => ({
  getMessaging: () => ({}),
  getToken: (...a: unknown[]) => getTokenSpy(...a),
  deleteToken: (...a: unknown[]) => deleteTokenSpy(...a),
  isSupported: () => isSupportedSpy(),
}));
vi.mock("@/lib/firebase", () => ({
  app: {},
  db: { __db: true },
  firebaseConfig: { apiKey: "k", projectId: "p" },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  isSupportedSpy.mockResolvedValue(true);
  getTokenSpy.mockResolvedValue("tok123");
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn(async () => ({ scope: "/Maiin/" })),
      ready: Promise.resolve({ scope: "/Maiin/" }),
    },
  });
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "vapid123");
});

describe("registerDeviceToken", () => {
  it("writes the token to users/{uid}/devices/{token} with platform web", async () => {
    const { registerDeviceToken } = await import("../pushNotifications");
    const result = await registerDeviceToken("u1");

    expect(result).toEqual({ ok: true, token: "tok123" });
    expect(docSpy).toHaveBeenCalledWith(
      { __db: true },
      "users",
      "u1",
      "devices",
      "tok123"
    );
    expect(setDocSpy).toHaveBeenCalledTimes(1);
    expect(setDocSpy.mock.calls[0][1]).toMatchObject({
      token: "tok123",
      platform: "web",
    });
  });

  it("reports 'unsupported' (no write) when the VAPID key is absent", async () => {
    vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "");
    vi.resetModules();
    const { registerDeviceToken } = await import("../pushNotifications");
    expect(await registerDeviceToken("u1")).toMatchObject({
      ok: false,
      reason: "unsupported",
    });
    expect(setDocSpy).not.toHaveBeenCalled();
  });

  it("reports 'no-permission' when permission isn't granted", async () => {
    vi.stubGlobal("Notification", { permission: "default" });
    const { registerDeviceToken } = await import("../pushNotifications");
    expect(await registerDeviceToken("u1")).toEqual({
      ok: false,
      reason: "no-permission",
    });
    expect(setDocSpy).not.toHaveBeenCalled();
  });

  it("reports 'token-failed' when getToken throws (surfaces the detail)", async () => {
    getTokenSpy.mockRejectedValue(new Error("SW not active"));
    const { registerDeviceToken } = await import("../pushNotifications");
    expect(await registerDeviceToken("u1")).toMatchObject({
      ok: false,
      reason: "token-failed",
      detail: "SW not active",
    });
    expect(setDocSpy).not.toHaveBeenCalled();
  });

  it("reports 'no-uid' without a uid", async () => {
    const { registerDeviceToken } = await import("../pushNotifications");
    expect(await registerDeviceToken("")).toEqual({
      ok: false,
      reason: "no-uid",
    });
    expect(setDocSpy).not.toHaveBeenCalled();
  });
});

describe("unregisterDeviceToken (delete-on-signout)", () => {
  it("deletes this device's token doc AND revokes the FCM token", async () => {
    const { unregisterDeviceToken } = await import("../pushNotifications");
    await unregisterDeviceToken("u1");

    expect(docSpy).toHaveBeenCalledWith(
      { __db: true },
      "users",
      "u1",
      "devices",
      "tok123"
    );
    expect(deleteDocSpy).toHaveBeenCalledTimes(1);
    expect(deleteTokenSpy).toHaveBeenCalledTimes(1);
  });

  it("never throws (sign-out must proceed) even if revocation fails", async () => {
    getTokenSpy.mockRejectedValue(new Error("boom"));
    const { unregisterDeviceToken } = await import("../pushNotifications");
    await expect(unregisterDeviceToken("u1")).resolves.toBeUndefined();
  });
});
