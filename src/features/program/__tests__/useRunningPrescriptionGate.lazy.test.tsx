// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  let release!: () => void;
  const loading = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, loading, transport: vi.fn(), synced: vi.fn() };
});
vi.mock("../runningPrescriptionGate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../runningPrescriptionGate")>()),
  RUNNING_PRESCRIPTION_GATE_ENABLED: true,
}));
vi.mock("../runningPrescriptionGateRuntime", async () => {
  await h.loading;
  const { createRunningPrescriptionGate } =
    await import("../runningPrescriptionGateController");
  const gate = createRunningPrescriptionGate({
    enabled: true,
    transport: h.transport,
  });
  return {
    runningPrescriptionGate: {
      ...gate,
      setContext: (...args: Parameters<typeof gate.setContext>) => {
        h.synced(...args);
        gate.setContext(...args);
      },
    },
  };
});
import { useRunningPrescriptionGate } from "../useRunningPrescriptionGate";

function ready(accountId: string) {
  return {
    status: "ready",
    accountId,
    checkedAtMs: Date.now(),
    schemaVersion: 1,
    revision: 1,
    authority: {
      schemaVersion: 1,
      accountId,
      revision: 1,
      holds: [],
      plan: { sessions: [] },
    },
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("blocks through an account switch and offline while importing, then ignores the old account's pending negotiation", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  let resolveBob!: (value: unknown) => void;
  h.transport
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBob = resolve;
        })
    )
    .mockImplementationOnce(async () => ready("carol"));
  const { result, rerender } = renderHook(
    ({ user }) => useRunningPrescriptionGate(user),
    { initialProps: { user: { uid: "alice" } } }
  );
  expect(result.current.legacyAllowed).toBe(false);
  expect(result.current.authority).toBeNull();
  rerender({ user: { uid: "bob" } });
  online.mockReturnValue(false);
  act(() => window.dispatchEvent(new Event("offline")));
  await act(async () => h.release());
  await waitFor(() =>
    expect(h.synced).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "bob", online: false })
    )
  );
  expect(result.current.status).toBe("unavailable");
  expect(result.current.legacyAllowed).toBe(false);
  expect(h.transport).not.toHaveBeenCalled();
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("online")));
  expect(h.transport).toHaveBeenCalledWith({
    expectedUid: "bob",
    supportedSchemaVersions: [1],
  });
  expect(result.current.status).toBe("pending");
  rerender({ user: { uid: "carol" } });
  await waitFor(() =>
    expect(result.current.authority?.accountId).toBe("carol")
  );
  await act(async () => resolveBob(ready("bob")));
  expect(result.current.authority?.accountId).toBe("carol");
  expect(result.current.legacyAllowed).toBe(false);
  expect(h.transport).toHaveBeenCalledTimes(2);
});
