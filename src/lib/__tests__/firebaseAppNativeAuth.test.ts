/**
 * How Auth is set up in each shell (firebaseApp.ts). Inside the iPhone app,
 * `getAuth` waits on a frame from the auth domain that never loads, so the
 * first sign-in state never arrives and the app holds its startup spinner
 * (first TestFlight build, 2026-11-08). There it is initialised with
 * IndexedDB persistence and no popup helper; the web keeps `getAuth`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ value: false }));
const authCalls = vi.hoisted(() => ({
  getAuth: vi.fn(() => ({ kind: "getAuth" })),
  initializeAuth: vi.fn(() => ({ kind: "initializeAuth" })),
}));

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock("firebase/auth", () => ({
  getAuth: authCalls.getAuth,
  initializeAuth: authCalls.initializeAuth,
  indexedDBLocalPersistence: { type: "LOCAL", name: "indexedDB" },
  connectAuthEmulator: vi.fn(),
}));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => native.value }));
vi.mock("@/lib/appCheckNative", () => ({ registerNativeAppCheck: vi.fn() }));
vi.mock("@/lib/appCheck", () => ({ initAppCheck: vi.fn() }));
vi.mock("@/lib/analyticsProvider", () => ({ initAnalytics: vi.fn() }));

async function load() {
  vi.resetModules();
  return import("../firebaseApp");
}

beforeEach(() => {
  authCalls.getAuth.mockClear();
  authCalls.initializeAuth.mockClear();
});

describe("Auth set-up", () => {
  it("inside the iPhone app: IndexedDB persistence, no popup helper", async () => {
    native.value = true;
    const { auth } = await load();
    expect(authCalls.initializeAuth).toHaveBeenCalledTimes(1);
    const [, deps] = authCalls.initializeAuth.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(deps).toEqual({ persistence: { type: "LOCAL", name: "indexedDB" } });
    expect(deps).not.toHaveProperty("popupRedirectResolver");
    expect(authCalls.getAuth).not.toHaveBeenCalled();
    expect(auth).toEqual({ kind: "initializeAuth" });
  });

  it("on the web: getAuth, unchanged", async () => {
    native.value = false;
    const { auth } = await load();
    expect(authCalls.getAuth).toHaveBeenCalledTimes(1);
    expect(authCalls.initializeAuth).not.toHaveBeenCalled();
    expect(auth).toEqual({ kind: "getAuth" });
  });
});
