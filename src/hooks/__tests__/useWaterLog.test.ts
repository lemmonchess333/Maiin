/**
 * useWaterLog — today's hydration, live.
 *
 * The interesting behaviour isn't the arithmetic, it's the echo-suppression.
 * The hook holds an optimistic `ml` locally, debounces a write, and sets
 * `skipNextSnapshot` so its own write doesn't bounce back through the
 * listener and overwrite what the user is mid-way through tapping. That
 * handshake is only observable against a store that actually re-fires — a
 * stub returning a canned snapshot cannot express it.
 *
 * It also migrates legacy `glasses`-only documents forward (× 250), so a
 * day logged before the ml model still renders instead of reading as zero.
 *
 * TIMER ORDERING: `vi.useFakeTimers` must come AFTER the mount has settled.
 * Faking `setTimeout` first freezes the clock `waitFor` polls on, and the
 * initial `await waitFor(...)` never resolves. Cost three failures to learn.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockProfile: Record<string, unknown> | null = {};
let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
  useUid: () => ({ user: mockUser, profile: mockProfile }).user?.uid ?? null,
}));

import { useWaterLog } from "../useWaterLog";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  flushSnapshots,
} from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";

const TODAY = localDateString();
const PATH = `users/u1/waterLog/${TODAY}`;

/** Mount, let the listener settle, THEN fake timers. See the header note. */
async function mountThenFakeTimers() {
  const { result } = renderHook(() => useWaterLog());
  await waitFor(() => expect(result.current.loading).toBe(false));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  return result;
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  mockUser = { uid: "u1" };
  mockProfile = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reading today", () => {
  it("starts at zero when nothing is logged", async () => {
    const { result } = renderHook(() => useWaterLog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ml).toBe(0);
  });

  it("reads today's document", async () => {
    seedFirestore({ [PATH]: { ml: 750, targetMl: 2000 } });
    const { result } = renderHook(() => useWaterLog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ml).toBe(750);
  });

  it("migrates a legacy glasses-only document forward", async () => {
    // Days logged before the ml model must still render, not read as zero.
    seedFirestore({ [PATH]: { glasses: 3 } });
    const { result } = renderHook(() => useWaterLog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ml).toBe(750); // 3 × 250
  });
});

describe("target", () => {
  it("defaults to 2 L when the profile has no preference", async () => {
    const { result } = renderHook(() => useWaterLog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.target).toBe(2000);
  });

  it("derives from the legacy glasses target", async () => {
    mockProfile = { targetWaterGlasses: 10 };
    const { result } = renderHook(() => useWaterLog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.target).toBe(2500); // 10 × 250
  });
});

describe("logging", () => {
  it("updates immediately and persists after the debounce", async () => {
    const result = await mountThenFakeTimers();

    act(() => result.current.logWater(250));
    expect(result.current.ml).toBe(250); // optimistic, no await
    expect(readDoc(PATH)).toBeUndefined(); // not yet written

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(readDoc(PATH)).toMatchObject({ ml: 250, targetMl: 2000 });
  });

  it("coalesces a burst of taps into ONE write", async () => {
    // Tapping + four times must not cost four writes.
    const result = await mountThenFakeTimers();

    act(() => result.current.logWater(250));
    act(() => result.current.logWater(250));
    act(() => result.current.logWater(250));
    act(() => result.current.logWater(250));
    expect(result.current.ml).toBe(1000);

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(readDoc(PATH)).toMatchObject({ ml: 1000 });
  });

  it("clamps at zero so the − button can't go negative", async () => {
    seedFirestore({ [PATH]: { ml: 250, targetMl: 2000 } });
    const { result } = renderHook(() => useWaterLog());
    await waitFor(() => expect(result.current.ml).toBe(250));

    act(() => result.current.logWater(-1000));
    expect(result.current.ml).toBe(0);
  });

  it("setWater replaces rather than accumulates", async () => {
    seedFirestore({ [PATH]: { ml: 500, targetMl: 2000 } });
    const { result } = renderHook(() => useWaterLog());
    await waitFor(() => expect(result.current.ml).toBe(500));

    act(() => result.current.setWater(1750));
    expect(result.current.ml).toBe(1750);
  });

  it("does not let its OWN write echo back over the local value", async () => {
    // The skipNextSnapshot handshake. Without it the listener re-fires with
    // the just-written value and can clobber a tap made in between.
    const result = await mountThenFakeTimers();

    act(() => result.current.logWater(500));
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(readDoc(PATH)).toMatchObject({ ml: 500 }); // write landed

    vi.useRealTimers();
    await flushSnapshots(); // its snapshot is swallowed…
    expect(result.current.ml).toBe(500); // …local value intact
  });

  it("progress reflects consumption against target", async () => {
    mockProfile = { targetWaterGlasses: 8 }; // 2000ml
    seedFirestore({ [PATH]: { ml: 1000 } });
    const { result } = renderHook(() => useWaterLog());
    await waitFor(() => expect(result.current.ml).toBe(1000));
    expect(result.current.progress).toBeCloseTo(0.5, 5);
  });
});

describe("signed out", () => {
  it("reports zero and stops loading", async () => {
    mockUser = null;
    const { result } = renderHook(() => useWaterLog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ml).toBe(0);
  });
});
