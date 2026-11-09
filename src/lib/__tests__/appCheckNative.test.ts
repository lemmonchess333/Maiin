import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capacitorPlugin } from "@/test/capacitorPlugin";

const mock = vi.hoisted(() => ({
  native: true,
  register: vi.fn(),
  initialize: vi.fn(),
  getToken: vi.fn(),
}));
vi.mock("../platform", () => ({ isNativePlatform: () => mock.native }));
vi.mock("../appCheck", () => ({ setNativeAppCheckProvider: mock.register }));
vi.mock("@capacitor-firebase/app-check", () => {
  return {
    FirebaseAppCheck: capacitorPlugin({
      initialize: mock.initialize,
      getToken: mock.getToken,
    }),
  };
});
vi.mock("firebase/app-check", () => ({
  CustomProvider: class {
    options: { getToken: () => Promise<unknown> };
    constructor(options: { getToken: () => Promise<unknown> }) {
      this.options = options;
    }
  },
}));
import {
  NATIVE_APP_CHECK_TIMEOUT_MS,
  registerNativeAppCheck,
} from "../appCheckNative";

function provider() {
  registerNativeAppCheck();
  return mock.register.mock.calls[0][0]().options;
}
afterEach(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.native = true;
  mock.initialize.mockResolvedValue(undefined);
  mock.getToken.mockResolvedValue({
    token: "verified-token",
    expireTimeMillis: Date.now() + 30 * 60 * 1000,
  });
});

describe("native App Check token bridge", () => {
  it("does not register or initialise the native plugin on web", () => {
    mock.native = false;
    registerNativeAppCheck();
    expect(mock.register).not.toHaveBeenCalled();
    expect(mock.initialize).not.toHaveBeenCalled();
  });
  it("registers synchronously but awaits native init before the first token", async () => {
    let release!: () => void;
    mock.initialize.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    const p = provider();
    expect(mock.register).toHaveBeenCalledOnce();
    const pending = p.getToken();
    await vi.waitFor(() => expect(mock.initialize).toHaveBeenCalledOnce());
    expect(mock.getToken).not.toHaveBeenCalled();
    release();
    await expect(pending).resolves.toMatchObject({ token: "verified-token" });
    expect(mock.initialize).toHaveBeenCalledWith({
      isTokenAutoRefreshEnabled: true,
      debugToken: false,
    });
    expect(mock.getToken).toHaveBeenCalledWith({ forceRefresh: true });
  });
  it("uses the SDK expiry exactly and initialises only once across refreshes", async () => {
    const expireTimeMillis = Date.now() + 40 * 60 * 1000;
    mock.getToken.mockResolvedValue({
      token: "verified-token",
      expireTimeMillis,
    });
    const p = provider();
    await expect(p.getToken()).resolves.toEqual({
      token: "verified-token",
      expireTimeMillis,
    });
    await p.getToken();
    expect(mock.initialize).toHaveBeenCalledOnce();
    expect(mock.getToken).toHaveBeenCalledTimes(2);
  });
  it.each([undefined, 0, Date.now() - 1000, NaN])(
    "rejects missing/expired native expiry %s",
    async (expireTimeMillis) => {
      mock.getToken.mockResolvedValue({
        token: "verified-token",
        expireTimeMillis,
      });
      await expect(provider().getToken()).rejects.toThrow("invalid or expired");
    }
  );
  it("propagates attestation failure without inventing a token", async () => {
    mock.getToken.mockRejectedValue(new Error("Attestation unavailable"));
    await expect(provider().getToken()).rejects.toThrow(
      "Attestation unavailable"
    );
  });
  it("retries a rejected plugin initialisation on a subsequent SDK request", async () => {
    mock.initialize.mockRejectedValueOnce(new Error("Bridge unavailable"));
    const p = provider();
    await expect(p.getToken()).rejects.toThrow("Bridge unavailable");
    await expect(p.getToken()).resolves.toMatchObject({
      token: "verified-token",
    });
    expect(mock.initialize).toHaveBeenCalledTimes(2);
  });
  /* Auth, Firestore and Functions wait for a token before every request,
     and Auth gives up at 30 s calling it a network failure: Google sign-in
     on the first TestFlight builds did exactly that. A token request that
     never answers fails at the limit instead, and the request goes on. */
  it("gives up on a token request that never answers", async () => {
    vi.useFakeTimers();
    mock.getToken.mockReturnValue(new Promise(() => {}));
    const pending = provider().getToken();
    const outcome = expect(pending).rejects.toThrow(
      "carrying on without App Check"
    );
    await vi.advanceTimersByTimeAsync(NATIVE_APP_CHECK_TIMEOUT_MS);
    await outcome;
    expect(NATIVE_APP_CHECK_TIMEOUT_MS).toBeLessThan(30_000);
  });
  it("gives up on a plugin set-up that never answers, and tries it again next time", async () => {
    vi.useFakeTimers();
    mock.initialize.mockReturnValueOnce(new Promise(() => {}));
    const p = provider();
    const first = expect(p.getToken()).rejects.toThrow(
      "App Check set-up took over"
    );
    await vi.advanceTimersByTimeAsync(NATIVE_APP_CHECK_TIMEOUT_MS);
    await first;
    expect(mock.getToken).not.toHaveBeenCalled();
    await expect(p.getToken()).resolves.toMatchObject({
      token: "verified-token",
    });
    expect(mock.initialize).toHaveBeenCalledTimes(2);
  });
});
