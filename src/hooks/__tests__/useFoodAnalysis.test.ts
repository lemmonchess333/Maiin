/**
 * useFoodAnalysis — the boundary between Gemini's JSON and our UI.
 *
 * This hook had no test at all, which is how three separate defects
 * survived in it:
 *
 * 1. It returned a bare `FoodAnalysis | null`, so the CALLER could not
 *    tell "the AI found nothing" from "the request failed", and could
 *    not surface WHY it failed. The server's own copy ("Rate limit
 *    reached. Please wait a moment.", "Daily image-AI limit reached.
 *    Upgrade to Pro…") was computed, stored in hook state, and shown
 *    NOWHERE — a rate-limited user read a generic connection line
 *    telling them to retry a window that was still closed.
 * 2. A 200 response was trusted verbatim. The Cloud Function forwards
 *    whatever `JSON.parse` produced with no shape validation, so a
 *    body with a missing or non-array `items` shipped straight into
 *    React state and crashed the Food page inside a render memo.
 * 3. No timeout. A stalled connection (request accepted, response
 *    never arrives) left `loading` true until the TCP stack gave up —
 *    minutes of dead laser with the shutter disabled.
 *
 * `fetch` is stubbed per-test; auth is mocked to a fixed user.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: { getIdToken: async () => "tok" } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useFoodAnalysis } from "../useFoodAnalysis";

const GOOD = {
  foodName: "Chicken and rice",
  items: [
    {
      name: "Chicken breast",
      portionSize: "150g",
      calories: 240,
      protein: 45,
      carbs: 0,
      fat: 5,
    },
  ],
  totalCalories: 240,
  totalProtein: 45,
  totalCarbs: 0,
  totalFat: 5,
  confidence: "high",
};

function stubFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

/** A Response-alike carrying `body` at `status`. */
function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("useFoodAnalysis — the outcome contract", () => {
  it("a good body comes back as data with no error", async () => {
    stubFetch(async () => reply(200, GOOD));
    const { result } = renderHook(() => useFoodAnalysis());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.data?.foodName).toBe("Chicken and rice");
    expect(outcome.errorMessage).toBeNull();
  });

  it("the server's own reason travels to the caller, verbatim", async () => {
    // The whole point of the outcome shape: a rate-limited user must
    // be told to WAIT, not to retry a closed window.
    stubFetch(async () =>
      reply(429, { error: "Rate limit reached. Please wait a moment." })
    );
    const { result } = renderHook(() => useFoodAnalysis());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.data).toBeNull();
    expect(outcome.errorMessage).toBe(
      "Rate limit reached. Please wait a moment."
    );
  });

  it("a status with no server message still gets actionable copy", async () => {
    stubFetch(async () => reply(429, null));
    const { result } = renderHook(() => useFoodAnalysis());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.errorMessage).toMatch(/wait a moment/i);
  });

  it("a 200 with no items array is REFUSED, not passed on", async () => {
    // The server forwards Gemini's JSON unvalidated, so 200 is not
    // proof of the contract. Pre-guard, this shape reached a render
    // memo and crashed the whole Food page.
    stubFetch(async () => reply(200, { error: "cannot analyze" }));
    const { result } = renderHook(() => useFoodAnalysis());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.data).toBeNull();
    expect(outcome.errorMessage).toMatch(/garbled/i);
    // …and nothing poisoned the hook's own result state.
    expect(result.current.result).toBeNull();
  });

  it("a bare array body is refused too — items must be ON the object", async () => {
    stubFetch(async () => reply(200, [{ name: "Chicken" }]));
    const { result } = renderHook(() => useFoodAnalysis());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.data).toBeNull();
  });

  it("an EMPTY items array is a legitimate no-food answer, not garbled", async () => {
    // This is the contract shape the analyzeFood prompt promises for a
    // non-food photo. It must reach the caller as DATA so the scan
    // resolves to "No food detected" rather than a request error.
    stubFetch(async () =>
      reply(200, { ...GOOD, foodName: "No food detected", items: [] })
    );
    const { result } = renderHook(() => useFoodAnalysis());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.data).not.toBeNull();
    expect(outcome.errorMessage).toBeNull();
  });

  it("a dropped connection reads as a connection problem, not browser noise", async () => {
    // fetch rejects with TypeError("Failed to fetch") — a
    // browser-internal string that must never reach a user.
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { result } = renderHook(() => useFoodAnalysis());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.errorMessage).toMatch(/couldn't reach the server/i);
    expect(outcome.errorMessage).not.toMatch(/failed to fetch/i);
  });

  it("a stalled request times out instead of hanging forever", async () => {
    // A request that never settles must end as an honest timeout
    // rather than an indefinite loading state with the shutter dead.
    // Driven through the REAL timer the hook arms (fake clock advanced
    // past it) rather than a synthesised abort event, so the pin
    // covers the whole mechanism: timer → controller.abort() → the
    // signal the fetch was given → the AbortError branch.
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, rejectFetch) => {
            init.signal?.addEventListener("abort", () =>
              rejectFetch(
                new DOMException("The operation was aborted.", "AbortError")
              )
            );
          })
      )
    );
    const { result } = renderHook(() => useFoodAnalysis());
    let outcome: Awaited<ReturnType<typeof result.current.analyzeFood>> | null =
      null;
    const pending = result.current.analyzeFood("QUJD").then((o) => {
      outcome = o;
    });

    // Well short of the cap: still in flight, nothing resolved.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(outcome).toBeNull();

    // Past it: the abort fires and the call resolves as a timeout.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
      await pending;
    });
    expect(outcome!.data).toBeNull();
    expect(outcome!.errorMessage).toMatch(/taking too long/i);
    // Loading released — the shutter comes back.
    expect(result.current.loading).toBe(false);
  });
});
