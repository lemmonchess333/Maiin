import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * The hook is the link that nothing held.
 *
 * `joinRejection.test.ts` pins the sentences and
 * `CirclesSection.join.test.tsx` pins that a reason reaches the toast —
 * but between them sits the one line that decides WHICH reason, and a
 * mutation replacing it with the fallback left both of those suites
 * green. So this file drives the real rejection through the real mapper:
 * `joinRejection` is deliberately not mocked, and the errors below carry
 * the shape the callable SDK delivers.
 */

const callable = vi.hoisted(() => vi.fn());
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/firestoreWrite", () => ({ addDocGuarded: vi.fn() }));
vi.mock("@/lib/dateHelpers", () => ({ localWeekKey: () => "2026-07-13" }));
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => callable),
}));
vi.mock("firebase/firestore");

import { useGoalSpaces } from "../useGoalSpaces";
import { JOIN_FAILED_FALLBACK } from "../joinRejection";
import { resetFirestore } from "@/test/firestoreHarness";
import { logger } from "@/lib/logger";

/** A rejection as the callable SDK delivers a mapped GoalSpaceError. */
function rejection(code: string, message: string) {
  const err = new Error(message) as Error & { code: string };
  err.code = `functions/${code}`;
  return err;
}

async function join(code = "K7P4-9M2H") {
  const { result } = renderHook(() => useGoalSpaces("me"));
  let outcome: Awaited<ReturnType<typeof result.current.joinCircle>>;
  await act(async () => {
    outcome = await result.current.joinCircle(code);
  });
  return outcome!;
}

describe("useGoalSpaces.joinCircle", () => {
  beforeEach(() => {
    resetFirestore();
    callable.mockReset();
    vi.mocked(logger.error).mockClear();
  });

  it("carries the refusal's own reason back, not the fallback", async () => {
    callable.mockRejectedValue(rejection("failed-precondition", "circle full"));
    const outcome = await join();
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe(
      "That circle is full. Someone has to leave before anyone else can join."
    );
    expect(outcome.ok === false && outcome.reason).not.toBe(
      JOIN_FAILED_FALLBACK
    );
  });

  it("distinguishes two refusals that used to read the same", async () => {
    callable.mockRejectedValueOnce(
      rejection("permission-denied", "bad invite")
    );
    const typo = await join();
    callable.mockRejectedValueOnce(
      rejection("resource-exhausted", "Too many attempts. Slow down.")
    );
    const limited = await join();
    expect(typo.ok === false && typo.reason).not.toBe(
      limited.ok === false && limited.reason
    );
    expect(limited.ok === false && limited.reason).toMatch(/Too many/);
  });

  it("still captures the raw error for reporting", async () => {
    // Translating for the user must not cost the diagnosis.
    const err = rejection("failed-precondition", "circle inactive");
    callable.mockRejectedValue(err);
    await join();
    expect(logger.error).toHaveBeenCalledWith("goalSpaces: join failed", err);
  });

  it("reports a plain success and passes the raw code through", async () => {
    callable.mockResolvedValue({ data: { ok: true } });
    const outcome = await join("  K7P4-9M2H  ");
    expect(outcome).toEqual({ ok: true });
    expect(callable).toHaveBeenCalledWith({ code: "  K7P4-9M2H  " });
  });
});
