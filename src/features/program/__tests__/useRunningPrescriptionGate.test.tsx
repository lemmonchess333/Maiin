// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("../runningPrescriptionGate", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../runningPrescriptionGate")>();
  return {
    ...original,
    RUNNING_PRESCRIPTION_GATE_ENABLED: true,
  };
});
vi.mock("../runningPrescriptionGateRuntime", async () => {
  const { createRunningPrescriptionGate } =
    await import("../runningPrescriptionGateController");
  return {
    runningPrescriptionGate: createRunningPrescriptionGate({
      enabled: true,
      transport: h.transport,
    }),
  };
});
import { useRunningPrescriptionGate } from "../useRunningPrescriptionGate";

function response(uid: string) {
  return {
    status: "ready",
    accountId: uid,
    checkedAtMs: Date.now(),
    schemaVersion: 1,
    revision: 2,
    authority: {
      schemaVersion: 1,
      accountId: uid,
      revision: 2,
      holds: [],
      plan: { sessions: [] },
    },
  };
}
beforeEach(() => {
  h.transport.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("mounted running gate lifecycle", () => {
  it("blocks until authenticated negotiation and still refuses legacy after ready", async () => {
    h.transport.mockImplementation(async ({ expectedUid }) =>
      response(expectedUid)
    );
    const user = { uid: "alice" };
    const { result, rerender } = renderHook(
      ({ account }) => useRunningPrescriptionGate(account),
      { initialProps: { account: null as typeof user | null } }
    );
    expect(result.current.legacyAllowed).toBe(false);
    expect(h.transport).not.toHaveBeenCalled();
    rerender({ account: user });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.legacyAllowed).toBe(false);
    rerender({ account: null });
    expect(result.current.authority).toBeNull();
  });
  it("suppresses authority on offline and requires a fresh reply after reconnect", async () => {
    h.transport
      .mockImplementationOnce(async () => response("alice"))
      .mockImplementationOnce(() => new Promise(() => {}));
    const user = { uid: "alice" };
    const { result } = renderHook(() => useRunningPrescriptionGate(user));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current.authority).toBeNull();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current.status).toBe("pending");
    expect(result.current.legacyAllowed).toBe(false);
    expect(h.transport).toHaveBeenCalledTimes(2);
  });
  it("rejects late A responses after switching accounts without exposing A to B", async () => {
    let resolveA!: (value: unknown) => void;
    h.transport
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          })
      )
      .mockImplementationOnce(async () => response("bob"));
    const { result, rerender } = renderHook(
      ({ account }) => useRunningPrescriptionGate(account),
      { initialProps: { account: { uid: "alice" } } }
    );
    await waitFor(() =>
      expect(h.transport).toHaveBeenCalledWith({
        expectedUid: "alice",
        supportedSchemaVersions: [1],
      })
    );
    rerender({ account: { uid: "bob" } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => resolveA(response("alice")));
    expect(result.current.authority?.accountId).toBe("bob");
  });
});
