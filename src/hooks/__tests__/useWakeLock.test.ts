/**
 * Tests for `useWakeLock` — the navigator.wakeLock wrapper that
 * keeps the screen on during an active run.
 *
 * Mocks navigator.wakeLock.request to a controllable sentinel so
 * tests pin:
 *   1. isSupported reflects feature detection.
 *   2. request() returns true and stores the sentinel.
 *   3. request() returns false gracefully when wakeLock is missing
 *      or the request throws (locked OS / unsupported context).
 *   4. release() awaits the sentinel's release().
 *   5. visibilitychange → visible re-requests when sentinel is null
 *      (recovers a lock that the OS dropped on background).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

interface FakeSentinel {
  release: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
}

let lastSentinel: FakeSentinel | null;
let requestImpl: () => Promise<FakeSentinel>;

function mockWakeLock() {
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    writable: true,
    value: {
      request: vi.fn(async () => {
        const sentinel = await requestImpl();
        lastSentinel = sentinel;
        return sentinel;
      }),
    },
  });
}

function unmockWakeLock() {
  /* delete is fine on a configurable own-property defined via
     defineProperty. */
  Reflect.deleteProperty(navigator as object, "wakeLock");
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
    writable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  lastSentinel = null;
  requestImpl = async () => ({
    release: vi.fn(async () => {}),
    addEventListener: vi.fn(),
  });
});

afterEach(() => {
  unmockWakeLock();
  setVisibility("visible");
});

describe("useWakeLock — isSupported", () => {
  it("reports false when navigator.wakeLock is absent", async () => {
    /* navigator.wakeLock isn't on the JSDOM navigator by default —
       must explicitly delete in case a previous test set it. */
    unmockWakeLock();
    const { useWakeLock } = await import("../useWakeLock");
    const { result } = renderHook(() => useWakeLock());
    expect(result.current.isSupported).toBe(false);
  });

  it("reports true when navigator.wakeLock is present", async () => {
    mockWakeLock();
    const { useWakeLock } = await import("../useWakeLock");
    const { result } = renderHook(() => useWakeLock());
    expect(result.current.isSupported).toBe(true);
  });
});

describe("useWakeLock — request / release", () => {
  it("request() returns false when the API isn't available", async () => {
    unmockWakeLock();
    const { useWakeLock } = await import("../useWakeLock");
    const { result } = renderHook(() => useWakeLock());
    const ok = await result.current.request();
    expect(ok).toBe(false);
  });

  it("request() returns true on a successful navigator.wakeLock.request", async () => {
    mockWakeLock();
    const { useWakeLock } = await import("../useWakeLock");
    const { result } = renderHook(() => useWakeLock());
    let ok = false;
    await act(async () => {
      ok = await result.current.request();
    });
    expect(ok).toBe(true);
  });

  it("request() returns false when the navigator throws (locked OS / unsupported)", async () => {
    mockWakeLock();
    requestImpl = async () => {
      throw new Error("NotAllowedError");
    };
    const { useWakeLock } = await import("../useWakeLock");
    const { result } = renderHook(() => useWakeLock());
    let ok = true;
    await act(async () => {
      ok = await result.current.request();
    });
    expect(ok).toBe(false);
  });

  it("release() calls the sentinel's release()", async () => {
    mockWakeLock();
    const { useWakeLock } = await import("../useWakeLock");
    const { result } = renderHook(() => useWakeLock());
    await act(async () => {
      await result.current.request();
    });
    expect(lastSentinel).not.toBeNull();
    await act(async () => {
      await result.current.release();
    });
    expect(lastSentinel?.release).toHaveBeenCalledTimes(1);
  });

  it("release() is a no-op when no sentinel was acquired", async () => {
    mockWakeLock();
    const { useWakeLock } = await import("../useWakeLock");
    const { result } = renderHook(() => useWakeLock());
    /* No prior request. */
    await act(async () => {
      await result.current.release();
    });
    /* No throw — and the request mock wasn't called. */
    expect(
      (navigator.wakeLock as { request: ReturnType<typeof vi.fn> }).request,
    ).not.toHaveBeenCalled();
  });
});
