// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ loadRuntime: vi.fn() }));
vi.mock("../runningPrescriptionGate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../runningPrescriptionGate")>()),
  RUNNING_PRESCRIPTION_GATE_ENABLED: true,
}));
vi.mock("../runningPrescriptionGateRuntime", () => {
  h.loadRuntime();
  throw new Error("Runtime chunk unavailable");
});
import { useRunningPrescriptionGate } from "../useRunningPrescriptionGate";

afterEach(cleanup);
it("fails closed when the enabled runtime import rejects, including an account switch", async () => {
  const { result, rerender } = renderHook(
    ({ user }) => useRunningPrescriptionGate(user),
    { initialProps: { user: { uid: "alice" } } }
  );
  expect(result.current.legacyAllowed).toBe(false);
  await waitFor(() => expect(h.loadRuntime).toHaveBeenCalledOnce());
  expect(result.current).toEqual({
    status: "unavailable",
    legacyAllowed: false,
    authority: null,
  });
  rerender({ user: { uid: "bob" } });
  expect(result.current).toEqual({
    status: "unavailable",
    legacyAllowed: false,
    authority: null,
  });
});
