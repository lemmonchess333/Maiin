/**
 * Tests for `useSteps` — the HealthKit steps state machine — with the
 * healthKit bridge + Firestore fully mocked. Pins the status transitions
 * (unavailable → unprompted → connected/ambiguous), the priming-flag
 * persistence writes, and foreground refresh.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const isHealthAvailable = vi.fn();
const requestStepsReadPermission = vi.fn();
const getTodayStepTotal = vi.fn();
vi.mock("@/lib/healthKit", () => ({
  isHealthAvailable: () => isHealthAvailable(),
  requestStepsReadPermission: () => requestStepsReadPermission(),
  getTodayStepTotal: () => getTodayStepTotal(),
  openHealthSettings: vi.fn(),
}));

vi.mock("@/lib/auth", () => {
  const user = { uid: "u1" };
  return { useAuth: () => ({ user }) };
});
vi.mock("@/lib/firebase", () => ({ db: {} }));

// ADR-0009: the one shared Firestore fake — bare mock + seedFirestore.
vi.mock("firebase/firestore");

const setDocGuarded = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock("@/lib/firestoreWrite", () => ({
  setDocGuarded: (...args: unknown[]) => setDocGuarded(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

import { useSteps } from "../useSteps";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

const FLAG_DOC = "users/u1/settings/healthKit";

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  requestStepsReadPermission.mockResolvedValue("granted");
  getTodayStepTotal.mockResolvedValue(0);
});

describe("useSteps status", () => {
  it("is 'unavailable' when Health isn't available", async () => {
    isHealthAvailable.mockResolvedValue(false);
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(setDocGuarded).not.toHaveBeenCalled();
  });

  it("is 'unprompted' when available with no saved flags", async () => {
    isHealthAvailable.mockResolvedValue(true);
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.status).toBe("unprompted"));
    expect(result.current.primingShown).toBe(false);
  });

  it("loads as 'connected' with a real step total when the flag doc says connected", async () => {
    isHealthAvailable.mockResolvedValue(true);
    seedFirestore({ [FLAG_DOC]: { connected: true, primingShown: true } });
    getTodayStepTotal.mockResolvedValue(5000);
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.steps).toBe(5000);
  });

  it("connected + zero data is 'ambiguous' (the iOS read-denial quirk)", async () => {
    isHealthAvailable.mockResolvedValue(true);
    seedFirestore({ [FLAG_DOC]: { connected: true, primingShown: true } });
    getTodayStepTotal.mockResolvedValue(0);
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.status).toBe("ambiguous"));
    expect(result.current.steps).toBe(0);
  });
});

describe("useSteps connect / priming persistence", () => {
  it("connect() requests permission, persists {connected, primingShown}, and fetches steps", async () => {
    isHealthAvailable.mockResolvedValue(true);
    getTodayStepTotal.mockResolvedValue(4200);
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.status).toBe("unprompted"));

    await act(async () => {
      await result.current.connect();
    });

    expect(requestStepsReadPermission).toHaveBeenCalledTimes(1);
    expect(setDocGuarded).toHaveBeenCalledWith(
      expect.anything(),
      { connected: true, primingShown: true },
      { merge: true }
    );
    expect(result.current.status).toBe("connected");
    expect(result.current.steps).toBe(4200);
  });

  it("dismissPriming() persists primingShown without connecting", async () => {
    isHealthAvailable.mockResolvedValue(true);
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.status).toBe("unprompted"));

    await act(async () => {
      await result.current.dismissPriming();
    });

    expect(requestStepsReadPermission).not.toHaveBeenCalled();
    expect(setDocGuarded).toHaveBeenCalledWith(
      expect.anything(),
      { connected: false, primingShown: true },
      { merge: true }
    );
    // Still not connected — the tile keeps its Connect affordance.
    expect(result.current.status).toBe("unprompted");
    expect(result.current.primingShown).toBe(true);
  });
});

describe("useSteps foreground refresh", () => {
  it("re-fetches today's steps on visibilitychange → visible", async () => {
    isHealthAvailable.mockResolvedValue(true);
    seedFirestore({ [FLAG_DOC]: { connected: true, primingShown: true } });
    getTodayStepTotal.mockResolvedValue(5000);
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.steps).toBe(5000));

    getTodayStepTotal.mockResolvedValue(6000);
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
      writable: true,
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.steps).toBe(6000));
  });
});
