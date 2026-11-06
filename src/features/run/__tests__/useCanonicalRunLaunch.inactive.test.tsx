// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ mapper: vi.fn(), transport: vi.fn() }));
vi.mock("../canonicalRunLaunch", () => {
  h.mapper();
  throw Error("Inactive mapper loaded");
});
vi.mock("@/features/program/runningReviewTransport", () => {
  h.transport();
  throw Error("Inactive transport loaded");
});
vi.mock("@/lib/firebase", () => ({ auth: { currentUser: null } }));
import { useCanonicalRunLaunch } from "../useCanonicalRunLaunch";
import {
  CANONICAL_RUNNING_LAUNCH_ENABLED,
  RUNNING_PRESCRIPTION_GATE_ENABLED,
} from "@/features/program/runningPrescriptionFeature";
afterEach(cleanup);
it("keeps both release gates off and loads no canonical mapper or transport", () => {
  expect(CANONICAL_RUNNING_LAUNCH_ENABLED).toBe(false);
  expect(RUNNING_PRESCRIPTION_GATE_ENABLED).toBe(false);
  const { result } = renderHook(() =>
    useCanonicalRunLaunch({
      user: { uid: "runner" },
      sessionId: "session_1",
      access: { status: "ready", legacyAllowed: false, authority: {} },
    })
  );
  expect(result.current.enabled).toBe(false);
  expect(result.current.candidate).toBeNull();
  expect(result.current.matches(null)).toBe(false);
  expect(h.mapper).not.toHaveBeenCalled();
  expect(h.transport).not.toHaveBeenCalled();
});
