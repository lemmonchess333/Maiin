// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isNativePushAvailable,
  nativePushPermission,
  getNativePushToken,
  listenForNativePushActions,
  listenForNativePushRefresh,
} from "../nativePush";

const h = vi.hoisted(() => ({
  native: true,
  available: true,
  permission: vi.fn(),
  request: vi.fn(),
  getToken: vi.fn(),
  listeners: new Map<string, (event: Record<string, unknown>) => void>(),
  stops: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "ios", isPluginAvailable: () => h.available },
}));
vi.mock("../platform", () => ({ isNativePlatform: () => h.native }));
const add = async (
  name: string,
  callback: (event: Record<string, unknown>) => void
) => {
  h.listeners.set(name, callback);
  const remove = vi.fn();
  h.stops.push(remove);
  return { remove };
};
vi.mock("@capacitor-firebase/messaging", () => ({
  FirebaseMessaging: {
    checkPermissions: () => h.permission(),
    requestPermissions: () => h.request(),
    getToken: () => h.getToken(),
    addListener: (
      name: string,
      callback: (event: Record<string, unknown>) => void
    ) => add(name, callback),
  },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (
      name: string,
      callback: (event: Record<string, unknown>) => void
    ) => add(name, callback),
  },
}));

beforeEach(() => {
  h.native = true;
  h.available = true;
  h.permission.mockResolvedValue({ receive: "granted" });
  h.request.mockResolvedValue({ receive: "granted" });
  h.getToken.mockResolvedValue({ token: "fcm-token" });
  h.listeners.clear();
  h.stops = [];
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());
describe("native push adapter", () => {
  it("keeps old binaries and web builds unsupported without prompting", async () => {
    h.available = false;
    expect(isNativePushAvailable()).toBe(false);
    expect(await nativePushPermission(true)).toBe(false);
    expect(h.request).not.toHaveBeenCalled();
    h.available = true;
    h.native = false;
    expect(isNativePushAvailable()).toBe(false);
  });
  it("checks without prompting unless explicitly requested", async () => {
    expect(await nativePushPermission()).toBe(true);
    expect(h.request).not.toHaveBeenCalled();
    expect(await nativePushPermission(true)).toBe(true);
    expect(h.request).toHaveBeenCalledOnce();
  });
  it("waits out initial APNs registration but returns only Firebase's FCM token", async () => {
    h.getToken.mockRejectedValueOnce(new Error("APNS token has not been set"));
    const token = getNativePushToken();
    await vi.waitFor(() =>
      expect(h.listeners.has("apnsTokenReceived")).toBe(true)
    );
    h.listeners.get("apnsTokenReceived")?.({ token: "raw-apns-token" });
    expect(await token).toBe("fcm-token");
    expect(h.getToken).toHaveBeenCalledTimes(2);
    expect(h.stops[0]).toHaveBeenCalledOnce();
  });
  it("refreshes on rotated FCM tokens and native foreground, with removable handles", async () => {
    const refresh = vi.fn();
    const stop = await listenForNativePushRefresh(refresh);
    h.listeners.get("tokenReceived")?.({ token: "new-fcm-token" });
    h.listeners.get("appStateChange")?.({ isActive: false });
    expect(refresh).toHaveBeenCalledOnce();
    h.listeners.get("appStateChange")?.({ isActive: true });
    expect(refresh).toHaveBeenCalledTimes(2);
    stop();
    expect(h.stops.every((remove) => remove.mock.calls.length === 1)).toBe(
      true
    );
  });

  it("bounds an unavailable Apple registration and removes its waiting listener", async () => {
    vi.useFakeTimers();
    h.getToken.mockRejectedValueOnce(new Error("APNS token has not been set"));
    const token = getNativePushToken();
    const rejected = expect(token).rejects.toThrow(
      "Apple push registration did not complete"
    );
    await vi.advanceTimersByTimeAsync(12_000);
    await rejected;
    expect(h.getToken).toHaveBeenCalledOnce();
    expect(h.stops[0]).toHaveBeenCalledOnce();
  });
  it("forwards only taps, leaving foreground presentation to native iOS configuration", async () => {
    const tap = vi.fn();
    const stop = await listenForNativePushActions(tap);
    h.listeners.get("notificationActionPerformed")?.({
      actionId: "dismiss",
      notification: { data: { route: "/social" } },
    });
    expect(tap).not.toHaveBeenCalled();
    h.listeners.get("notificationActionPerformed")?.({
      actionId: "tap",
      notification: { data: { ownerUid: "me", route: "/social" } },
    });
    expect(tap).toHaveBeenCalledWith({ ownerUid: "me", route: "/social" });
    stop();
    expect(h.stops[0]).toHaveBeenCalledOnce();
  });
});
