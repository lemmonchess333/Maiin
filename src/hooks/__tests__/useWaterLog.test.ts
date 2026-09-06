/** Water reads plus the durable optimistic queue across navigation and days. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  functions: {},
  auth: {
    get currentUser() {
      return mockUser;
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockProfile: Record<string, unknown> | null = {};
let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
  useUid: () => ({ user: mockUser, profile: mockProfile }).user?.uid ?? null,
}));

import { flushWater, pendingWater } from "@/lib/waterActions";
import { useWaterLog } from "../useWaterLog";
import {
  seedFirestore,
  failNextFirestore,
  resetFirestore,
  readDoc,
  flushSnapshots,
} from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";

const TODAY = localDateString();
const PATH = `users/u1/waterLog/${TODAY}`;

/** Wait until the current server total is available. */
async function mountSettled() {
  const { result } = renderHook(() => useWaterLog());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  vi.clearAllMocks();
  mockUser = { uid: "u1" };
  mockProfile = {};
});

afterEach(async () => {
  await flushWater("u1");
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
  it("updates only after local persistence, then syncs without a debounce", async () => {
    const result = await mountSettled();

    act(() => result.current.logWater(250));
    expect(result.current.ml).toBe(250); // optimistic, no await
    expect(readDoc(PATH)).toBeUndefined(); // not yet written

    await act(async () => {
      await flushWater("u1");
    });
    expect(readDoc(PATH)).toMatchObject({ ml: 250, targetMl: 2000 });
  });

  it("preserves every tap in a burst", async () => {
    // Tapping + four times must not cost four writes.
    const result = await mountSettled();

    act(() => result.current.logWater(250));
    act(() => result.current.logWater(250));
    act(() => result.current.logWater(250));
    act(() => result.current.logWater(250));
    expect(result.current.ml).toBe(1000);

    await act(async () => {
      await flushWater("u1");
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
    const result = await mountSettled();

    act(() => result.current.logWater(500));
    await act(async () => {
      await flushWater("u1");
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

describe("navigation and account boundaries", () => {
  it("a tap survives immediate unmount", async () => {
    const view = renderHook(() => useWaterLog());
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    act(() => view.result.current.logWater(500));
    view.unmount();
    await flushWater("u1");
    expect(readDoc(PATH)?.ml).toBe(500);
  });
  it("keeps offline entries on their original day after midnight", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-05T23:59:00"));
    const view = renderHook(() => useWaterLog());
    await flushSnapshots();
    act(() => view.result.current.logWater(500));
    vi.setSystemTime(new Date("2026-09-06T00:01:00"));
    act(() => window.dispatchEvent(new Event("focus")));
    await flushSnapshots();
    expect(view.result.current.ml).toBe(0);
    expect(pendingWater("u1")[0].date).toBe("2026-09-05");
    act(() => view.result.current.logWater(250));
    expect(view.result.current.ml).toBe(250);
    vi.restoreAllMocks();
  });
  it("does not display another account's optimistic entries or serving preference", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const view = renderHook(() => useWaterLog());
    await flushSnapshots();
    act(() => {
      view.result.current.setServingMl(500);
      view.result.current.logWater(500);
    });
    mockUser = { uid: "u2" };
    view.rerender();
    await flushSnapshots();
    expect(view.result.current.ml).toBe(0);
    expect(view.result.current.servingMl).toBe(250);
    vi.restoreAllMocks();
  });
});

it("retry restores a failed live read", async () => {
  seedFirestore({ [PATH]: { ml: 750 } });
  failNextFirestore("onSnapshot");
  const { result } = renderHook(() => useWaterLog());
  await waitFor(() =>
    expect(result.current.syncStatus).toContain("Couldn't sync")
  );
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.ml).toBe(750));
  expect(result.current.syncStatus).toBe("");
});
