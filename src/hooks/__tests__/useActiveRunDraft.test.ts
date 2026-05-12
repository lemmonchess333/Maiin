/**
 * PR H2 — active-run draft hook tests.
 *
 * Pins: round-trip save/load, max-age expiry, point-cap trim,
 * resilience to corrupt JSON, and clear() idempotency.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActiveRunDraft } from "../useActiveRunDraft";

const STORAGE_KEY = "tropos_run_draft";

function makeMinimalDraft(overrides: Partial<Parameters<ReturnType<typeof useActiveRunDraft>["save"]>[0]> = {}) {
  return {
    runConfig: { activityType: "freerun" },
    elapsedSeconds: 600,
    points: [],
    treadmillDistance: 0,
    backgroundGapMs: 0,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("useActiveRunDraft — round trip", () => {
  it("save then load returns the same payload (savedAt stamped)", () => {
    const { result } = renderHook(() => useActiveRunDraft());
    act(() => {
      result.current.save(makeMinimalDraft({ elapsedSeconds: 1234 }));
    });
    const loaded = result.current.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.elapsedSeconds).toBe(1234);
    expect(loaded?.savedAt).toBeTypeOf("number");
    expect(Date.now() - (loaded!.savedAt as number)).toBeLessThan(1000);
  });

  it("load returns null when nothing has been saved", () => {
    const { result } = renderHook(() => useActiveRunDraft());
    expect(result.current.load()).toBeNull();
  });
});

describe("useActiveRunDraft — max age", () => {
  it("drafts older than 12h are treated as not-present and removed", () => {
    // Manually plant a stale draft and verify load() drops it.
    const stale = {
      ...makeMinimalDraft(),
      savedAt: Date.now() - 13 * 60 * 60 * 1000, // 13h ago
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stale));
    const { result } = renderHook(() => useActiveRunDraft());
    expect(result.current.load()).toBeNull();
    // …and the stale draft is purged so it doesn't accumulate.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("drafts within the 12h window are returned", () => {
    const fresh = {
      ...makeMinimalDraft(),
      savedAt: Date.now() - 60 * 60 * 1000, // 1h ago
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    const { result } = renderHook(() => useActiveRunDraft());
    expect(result.current.load()).not.toBeNull();
  });
});

describe("useActiveRunDraft — point cap", () => {
  it("trims the GPS points array to the last 500 on save (quota safety)", () => {
    const { result } = renderHook(() => useActiveRunDraft());
    // Build 800 fake fixes; verify the persisted version only keeps
    // the trailing 500 (the most recent — which is what matters for
    // "resume from here").
    const points = Array.from({ length: 800 }, (_, i) => ({
      lat: 0,
      lon: 0,
      timestamp: i,
      accuracy: 5,
      altitude: 0,
      speed: 0,
      rawLat: 0,
      rawLon: 0,
    }));
    act(() => {
      result.current.save(makeMinimalDraft({ points }));
    });
    const loaded = result.current.load();
    expect(loaded?.points.length).toBe(500);
    // Tail-trimmed: should keep the last 500 (timestamps 300..799).
    expect(loaded?.points[0].timestamp).toBe(300);
    expect(loaded?.points[499].timestamp).toBe(799);
  });

  it("does NOT trim when the array is under 500 fixes", () => {
    const { result } = renderHook(() => useActiveRunDraft());
    const points = Array.from({ length: 100 }, (_, i) => ({
      lat: 0,
      lon: 0,
      timestamp: i,
      accuracy: 5,
      altitude: 0,
      speed: 0,
      rawLat: 0,
      rawLon: 0,
    }));
    act(() => {
      result.current.save(makeMinimalDraft({ points }));
    });
    expect(result.current.load()?.points.length).toBe(100);
  });
});

describe("useActiveRunDraft — corrupt storage", () => {
  it("load returns null when localStorage contains invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { result } = renderHook(() => useActiveRunDraft());
    expect(result.current.load()).toBeNull();
  });

  it("load returns null when the persisted object lacks savedAt", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ runConfig: {}, elapsedSeconds: 0 }),
    );
    const { result } = renderHook(() => useActiveRunDraft());
    expect(result.current.load()).toBeNull();
  });
});

describe("useActiveRunDraft — clear", () => {
  it("clear removes the persisted draft", () => {
    const { result } = renderHook(() => useActiveRunDraft());
    act(() => {
      result.current.save(makeMinimalDraft());
    });
    expect(result.current.load()).not.toBeNull();
    act(() => {
      result.current.clear();
    });
    expect(result.current.load()).toBeNull();
  });

  it("clear is a no-op when nothing is persisted", () => {
    const { result } = renderHook(() => useActiveRunDraft());
    // Should not throw even though storage is empty.
    expect(() => act(() => result.current.clear())).not.toThrow();
  });
});
