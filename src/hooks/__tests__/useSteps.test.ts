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

// One object per account, kept between renders as the real hook's is; a
// test switches accounts by replacing it.
const auth = vi.hoisted(() => ({ user: { uid: "u1" } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: auth.user }) }));
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

const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

import { useSteps } from "../useSteps";
import { logger } from "@/lib/logger";
import {
  seedFirestore,
  resetFirestore,
  deferReads,
  releaseRead,
  rejectRead,
  pendingReads,
} from "@/test/firestoreHarness";

const FLAG_DOC = "users/u1/settings/healthKit";

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  auth.user = { uid: "u1" };
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

  it("a connected account asks iOS again before reading (new phone or reinstall)", async () => {
    // Apple Health's permission belongs to the install; `connected` lives
    // on the account. Without the re-ask, a reinstall reads nothing forever
    // and the tile never offers Connect again. iOS shows no sheet when this
    // install has already answered, so the ask is free in the usual case.
    isHealthAvailable.mockResolvedValue(true);
    seedFirestore({ [FLAG_DOC]: { connected: true, primingShown: true } });
    getTodayStepTotal.mockResolvedValue(5000);
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(requestStepsReadPermission).toHaveBeenCalledTimes(1);
    expect(requestStepsReadPermission.mock.invocationCallOrder[0]).toBeLessThan(
      getTodayStepTotal.mock.invocationCallOrder[0]
    );
    // A re-ask is not a new connection: nothing is written.
    expect(setDocGuarded).not.toHaveBeenCalled();
  });

  it("an unconnected account is never asked on load", async () => {
    isHealthAvailable.mockResolvedValue(true);
    seedFirestore({ [FLAG_DOC]: { connected: false, primingShown: true } });
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.primingShown).toBe(true));
    expect(result.current.status).toBe("unprompted");
    expect(requestStepsReadPermission).not.toHaveBeenCalled();
    expect(getTodayStepTotal).not.toHaveBeenCalled();
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

describe("useSteps ready: the account's saved answer has loaded", () => {
  // Health being available is known before the account's answer is, so
  // the status reads "unprompted" off the defaults while the answer is
  // still on its way. Home's prompt opened on that and closed again a
  // moment later for someone who had answered long ago (FV2).
  it("is false while the saved answer is still loading, true once it lands", async () => {
    isHealthAvailable.mockResolvedValue(true);
    seedFirestore({ [FLAG_DOC]: { connected: false, primingShown: true } });
    deferReads();
    const { result } = renderHook(() => useSteps());
    // Anchor: the hook has asked for the saved answer and is waiting on it.
    await waitFor(() => expect(pendingReads()).toEqual([FLAG_DOC]));
    expect(result.current.status).toBe("unprompted");
    expect(result.current.primingShown).toBe(false);
    expect(result.current.ready).toBe(false);

    await act(async () => {
      expect(releaseRead()).toBe(true);
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.primingShown).toBe(true);
  });

  it("stays false when the read fails: the answer is still unknown", async () => {
    isHealthAvailable.mockResolvedValue(true);
    deferReads();
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(pendingReads()).toEqual([FLAG_DOC]));

    await act(async () => {
      expect(rejectRead()).toBe(true);
    });
    // Anchor: the failure has been handled, which is the same step that
    // would have marked the answer loaded.
    await waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        "[steps] settings load failed",
        expect.anything()
      )
    );
    await act(async () => {});
    expect(result.current.ready).toBe(false);
  });

  it("another account's answer never counts as this one's", async () => {
    isHealthAvailable.mockResolvedValue(true);
    const { result, rerender } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.ready).toBe(true));

    deferReads();
    auth.user = { uid: "u2" };
    rerender();
    // Anchor: the second account's answer has been asked for.
    await waitFor(() =>
      expect(pendingReads()).toEqual(["users/u2/settings/healthKit"])
    );
    expect(result.current.ready).toBe(false);

    await act(async () => {
      expect(releaseRead()).toBe(true);
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
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
    expect(toastError).not.toHaveBeenCalled();
  });

  it("a failed request connects nothing: the prompt closes, Connect stays, and it says so", async () => {
    // requestStepsReadPermission reports "denied" only when the request
    // itself threw (a build without the Health permission) or off the
    // phone. Saving connected:true there is how the tile stuck at 0.
    isHealthAvailable.mockResolvedValue(true);
    requestStepsReadPermission.mockResolvedValue("denied");
    const { result } = renderHook(() => useSteps());
    await waitFor(() => expect(result.current.status).toBe("unprompted"));

    await act(async () => {
      await result.current.connect();
    });

    expect(setDocGuarded).toHaveBeenCalledTimes(1);
    expect(setDocGuarded).toHaveBeenCalledWith(
      expect.anything(),
      { connected: false, primingShown: true },
      { merge: true }
    );
    expect(result.current.status).toBe("unprompted");
    expect(result.current.primingShown).toBe(true);
    expect(getTodayStepTotal).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Couldn't connect Apple Health");
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
