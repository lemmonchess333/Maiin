/**
 * The lift-volume re-credit drain.
 *
 * `OneTimeMaintenance` had no test at all. That was tolerable while every
 * migration here was a single fire-and-forget call; this one is a LOOP over
 * a paged callable, and a loop is the shape that can hang, re-run forever,
 * or stop early and mark itself done.
 *
 * The hazard is not hypothetical. Until #2048 the callable ignored any
 * cursor and returned `truncated: true` on every call for a long history —
 * so a drain that loops until `truncated === false` would never terminate.
 * That is why the bound exists, and why it is asserted rather than trusted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

const callable = vi.fn();
vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: (_fns: unknown, name: string) => {
    if (name !== "recreditMyLiftVolume") return async () => ({ data: {} });
    return (payload: unknown) => callable(payload);
  },
}));

/* The other two migrations in this component are not under test, but they
   still run — so Firestore has to answer. Bare mock + the shared fake, per
   ADR-0009: a hand-rolled factory here would be a second fake, which
   `firestoreHookCoverage` rejects for new suites (and did reject this one).
   Nothing is seeded, so the displayNameLower backfill reads a missing doc
   and returns, which is the path we want it on. */
vi.mock("firebase/firestore");
vi.mock("@/lib/firestoreWrite", () => ({ setDocGuarded: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const UID = "u-recredit";
vi.mock("@/lib/auth", () => ({ useUid: () => "u-recredit" }));

import OneTimeMaintenance from "../OneTimeMaintenance";

const FLAG = `${UID}:tropos.liftVolumeRecredited.v1`;
const CURSOR = `${UID}:tropos.liftVolumeRecredit.cursor.v1`;

/** One page response. */
function page(cursor: string | null, truncated: boolean) {
  return { data: { ok: true, scanned: 500, withVolume: 1, lifetimeKg: 1, truncated, cursor } };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  callable.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Mount, let the 800ms auth-settle debounce elapse, and drive the drain's
 * promise chain to a standstill.
 *
 * `waitFor` is deliberately not used: it polls on REAL timers, so under
 * `vi.useFakeTimers()` it never re-checks and every assertion times out
 * instead of failing on its merits. `advanceTimersByTimeAsync` flushes the
 * microtask queue between steps, which is what actually walks a chain of
 * awaited callable responses forward.
 */
async function mountAndSettle() {
  render(<OneTimeMaintenance />);
  await vi.advanceTimersByTimeAsync(1000);
  // Enough turns for the bounded loop's 20 sequential awaits to settle.
  for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(1);
}

describe("liftVolumeRecredit drain", () => {
  it("pages with the cursor until the history is exhausted, then flags done", async () => {
    callable
      .mockResolvedValueOnce(page("w-0499", true))
      .mockResolvedValueOnce(page("w-0999", true))
      .mockResolvedValueOnce(page("w-1200", false));

    await mountAndSettle();

    expect(callable).toHaveBeenCalledTimes(3);
    // First call starts at the beginning; each later one resumes.
    expect(callable).toHaveBeenNthCalledWith(1, {});
    expect(callable).toHaveBeenNthCalledWith(2, { startAfter: "w-0499" });
    expect(callable).toHaveBeenNthCalledWith(3, { startAfter: "w-0999" });
    expect(localStorage.getItem(FLAG)).toBe("1");
    // The cursor is cleaned up once there is nothing left to resume.
    expect(localStorage.getItem(CURSOR)).toBeNull();
  });

  it("does not loop forever when the callable never stops truncating", async () => {
    /* The pre-#2048 server behaviour exactly: cursor ignored, always more.
       Without the bound this hangs the drain and hammers the callable. */
    callable.mockResolvedValue(page("w-0499", true));

    await mountAndSettle();

    // Anchored on the positive first: it really did drain, and stopped at
    // the bound rather than never starting.
    expect(callable).toHaveBeenCalledTimes(20);
    // Nothing was completed, so it must NOT claim to be done.
    expect(localStorage.getItem(FLAG)).toBeNull();
    // ...and it left a cursor, so the next session picks up rather than
    // repeating these 20 pages.
    expect(localStorage.getItem(CURSOR)).toBe("w-0499");
  });

  it("resumes from the persisted cursor after an interrupted drain", async () => {
    /* The reason the cursor is persisted rather than kept in memory: a
       history longer than the bound would otherwise re-do its first pages
       every session and never reach the end. */
    localStorage.setItem(CURSOR, "w-4999");
    callable.mockResolvedValueOnce(page("w-5100", false));

    await mountAndSettle();

    expect(callable).toHaveBeenNthCalledWith(1, { startAfter: "w-4999" });
    expect(localStorage.getItem(FLAG)).toBe("1");
  });

  it("does not re-run once the flag is set", async () => {
    localStorage.setItem(FLAG, "1");
    await mountAndSettle();
    expect(callable).not.toHaveBeenCalled();
  });

  it("leaves the flag unset when the call fails, so the next session retries", async () => {
    callable.mockRejectedValue(new Error("offline"));
    await mountAndSettle();
    // Positive anchor before the negative: the call was attempted.
    expect(callable).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(FLAG)).toBeNull();
  });
});
