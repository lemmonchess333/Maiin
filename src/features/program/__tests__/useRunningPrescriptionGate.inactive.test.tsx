// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ loadRuntime: vi.fn() }));
vi.mock("../runningPrescriptionGateRuntime", () => {
  h.loadRuntime();
  throw new Error("The inactive gate must not load its runtime");
});
import { RUNNING_PRESCRIPTION_GATE_ENABLED } from "../runningPrescriptionFeature";
import { gateLegacyRunningProgram } from "../runningPrescriptionGate";
import type { ProgramState } from "../programTypes";
import { useRunningPrescriptionGate } from "../useRunningPrescriptionGate";

afterEach(cleanup);
it("preserves legacy access without importing the controller when disabled", async () => {
  expect(RUNNING_PRESCRIPTION_GATE_ENABLED).toBe(false);
  const state = { runDays: [{ id: "legacy" }] } as ProgramState;
  expect(gateLegacyRunningProgram(state, { legacyAllowed: true })).toBe(state);
  const { result, rerender } = renderHook(
    ({ user }) => useRunningPrescriptionGate(user),
    { initialProps: { user: { uid: "alice" } } }
  );
  expect(result.current).toEqual({
    status: "inactive",
    legacyAllowed: true,
    authority: null,
  });
  rerender({ user: { uid: "bob" } });
  await Promise.resolve();
  expect(result.current.legacyAllowed).toBe(true);
  expect(h.loadRuntime).not.toHaveBeenCalled();
});
