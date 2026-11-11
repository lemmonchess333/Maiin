/**
 * useFoodAnalysis — the boundary between Gemini's JSON and our UI.
 *
 * This hook had no test at all, which is how three separate defects
 * survived in it:
 *
 * 1. It returned a bare `FoodAnalysis | null`, so the CALLER could not
 *    tell "the AI found nothing" from "the request failed", and could
 *    not surface WHY it failed. The server's own copy ("Rate limit
 *    reached. Wait a few minutes…", "Daily image-AI limit reached.
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
import { bootSteps } from "@/lib/bootTrace";

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

/** The steps written since `before` was taken, by identity: the list is
 *  one buffer for the process, capped at forty, so a length is no mark. */
function stepsSince(before: Set<unknown>) {
  return bootSteps()
    .filter((entry) => !before.has(entry))
    .map((entry) => entry.step);
}

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
      reply(429, {
        error:
          "Rate limit reached. Wait a few minutes before analysing more food.",
      })
    );
    const { result } = renderHook(() => useFoodAnalysis());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.data).toBeNull();
    expect(outcome.errorMessage).toBe(
      "Rate limit reached. Wait a few minutes before analysing more food."
    );
  });

  it("a refusal because AI analysis is off reads as a plain way back on", async () => {
    // functions/lib/aiConsent.js: failed-precondition, sent as 400, with a
    // stable reason. The message names where the switch is, whatever the
    // server's own wording.
    stubFetch(async () =>
      reply(400, {
        error: "AI food analysis is off for this account.",
        code: "failed-precondition",
        reason: "ai-analysis-disabled",
      })
    );
    const { result } = renderHook(() => useFoodAnalysis());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.data).toBeNull();
    expect(outcome.errorMessage).toBe(
      "AI food analysis is off. You can turn it on in Settings › Social & privacy."
    );
  });

  it("a typed meal refused because AI analysis is off comes back empty, for the parser to read", async () => {
    stubFetch(async () =>
      reply(400, {
        error: "AI food analysis is off for this account.",
        code: "failed-precondition",
        reason: "ai-analysis-disabled",
      })
    );
    const { result } = renderHook(() => useFoodAnalysis());
    let parsed: Awaited<ReturnType<typeof result.current.analyzeFoodText>> =
      GOOD;
    await act(async () => {
      parsed = await result.current.analyzeFoodText("2 eggs");
    });
    expect(parsed).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
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
    const before = new Set(bootSteps());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.errorMessage).toMatch(/couldn’t reach the server/i);
    expect(outcome.errorMessage).not.toMatch(/failed to fetch/i);
    // The browser's own words do reach the step list, which only the
    // iPhone's Details shows: they are what a screenshot needs. Only this
    // call's steps: the list is one buffer for the whole process.
    const steps = stepsSince(before);
    expect(steps).toEqual([
      expect.stringMatching(/^Scan: sending a \d+ KB photo$/),
      expect.stringMatching(/^Scan: signed the request in \d+ ms$/),
      expect.stringMatching(
        /^Scan: failed after \d+ ms \(TypeError: Failed to fetch\)$/
      ),
    ]);
  });

  it("a typed meal's request is traced under its own name, apart from a photo's", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { result } = renderHook(() => useFoodAnalysis());
    const before = new Set(bootSteps());
    let parsed: Awaited<ReturnType<typeof result.current.analyzeFoodText>> =
      GOOD;
    await act(async () => {
      parsed = await result.current.analyzeFoodText("2 eggs");
    });
    expect(parsed).toBeNull();
    expect(stepsSince(before)).toEqual([
      "Typed meal: sending",
      expect.stringMatching(/^Typed meal: signed the request in \d+ ms$/),
      expect.stringMatching(
        /^Typed meal: failed after \d+ ms \(TypeError: Failed to fetch\)$/
      ),
    ]);
  });

  it("a refused scan names the AI model's own answer in the step list", async () => {
    // The first TestFlight scans: the model, asked for in a region that
    // does not serve it, answered 404, and the list said only "server
    // answered 500".
    stubFetch(async () =>
      reply(500, {
        error: "ai-failed",
        message:
          "Couldn't analyse this. Try again. This one didn't use a scan.",
        modelStatus: 404,
      })
    );
    const { result } = renderHook(() => useFoodAnalysis());
    const before = new Set(bootSteps());
    let outcome!: Awaited<ReturnType<typeof result.current.analyzeFood>>;
    await act(async () => {
      outcome = await result.current.analyzeFood("QUJD");
    });
    expect(outcome.errorMessage).toMatch(/didn't use a scan/);
    expect(stepsSince(before)).toEqual([
      expect.stringMatching(/^Scan: sending a \d+ KB photo$/),
      expect.stringMatching(/^Scan: signed the request in \d+ ms$/),
      expect.stringMatching(/^Scan: server answered 500 in \d+ ms$/),
      "Scan: the AI model answered 404",
    ]);
  });

  it("a typed meal names the model's answer too, and a failure without one adds nothing", async () => {
    stubFetch(async () => reply(500, { error: "ai-failed", modelStatus: 403 }));
    const { result } = renderHook(() => useFoodAnalysis());
    let before = new Set(bootSteps());
    await act(async () => {
      await result.current.analyzeFoodText("2 eggs");
    });
    expect(stepsSince(before)).toContain(
      "Typed meal: the AI model answered 403"
    );

    stubFetch(async () =>
      reply(500, { error: "Failed to analyze food image" })
    );
    before = new Set(bootSteps());
    await act(async () => {
      await result.current.analyzeFood("QUJD");
    });
    expect(
      stepsSince(before).some((step) => step.includes("AI model answered"))
    ).toBe(false);
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

describe("useFoodAnalysis — a second read with a detail (Mob2, call 3)", () => {
  const sentBody = () =>
    JSON.parse(
      (vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit).body as string
    );

  it("sends the detail with the photo, and nothing extra without one", async () => {
    stubFetch(async () => reply(200, GOOD));
    const { result } = renderHook(() => useFoodAnalysis());
    await act(async () => {
      await result.current.analyzeFood("QUJD");
    });
    expect(sentBody()).toEqual({ imageBase64: "QUJD" });
    await act(async () => {
      await result.current.analyzeFood("QUJD", { detail: "cooked in butter" });
    });
    expect(sentBody()).toEqual({
      imageBase64: "QUJD",
      detail: "cooked in butter",
    });
  });

  it("refine keeps the first answer on screen, and replaces it only with a food", async () => {
    stubFetch(async () => reply(200, GOOD));
    const { result } = renderHook(() => useFoodAnalysis());
    await act(async () => {
      await result.current.analyzeFood("QUJD");
    });

    // A failed second read: the first answer stays, with no error over it.
    stubFetch(async () => reply(500, {}));
    let outcome!: Awaited<ReturnType<typeof result.current.refine>>;
    await act(async () => {
      outcome = await result.current.refine("QUJD", "and butter");
    });
    expect(outcome.adopted).toBe(false);
    expect(result.current.result?.foodName).toBe("Chicken and rice");
    expect(result.current.error).toBeNull();

    // An answer with no food in it: also left out.
    stubFetch(async () =>
      reply(200, { ...GOOD, foodName: "No food detected", items: [] })
    );
    await act(async () => {
      outcome = await result.current.refine("QUJD", "and butter");
    });
    expect(outcome.adopted).toBe(false);
    expect(result.current.result?.foodName).toBe("Chicken and rice");

    // A better answer replaces it.
    const better = { ...GOOD, foodName: "Chicken, rice and butter" };
    stubFetch(async () => reply(200, better));
    await act(async () => {
      outcome = await result.current.refine("QUJD", "and butter");
    });
    expect(outcome.adopted).toBe(true);
    expect(result.current.result?.foodName).toBe("Chicken, rice and butter");
  });

  it("refine drops an answer that arrives after the result was closed", async () => {
    stubFetch(async () => reply(200, GOOD));
    const { result } = renderHook(() => useFoodAnalysis());
    await act(async () => {
      await result.current.analyzeFood("QUJD");
    });
    let release!: () => void;
    const late = new Promise((resolve) => {
      release = () => resolve(reply(200, { ...GOOD, foodName: "Late" }));
    });
    stubFetch(() => late);
    let outcome!: Awaited<ReturnType<typeof result.current.refine>>;
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refine("QUJD", "late").then((o) => {
        outcome = o;
      });
    });
    act(() => result.current.reset());
    await act(async () => {
      release();
      await pending;
    });
    expect(outcome.adopted).toBe(false);
    expect(result.current.result).toBeNull();
  });
});
