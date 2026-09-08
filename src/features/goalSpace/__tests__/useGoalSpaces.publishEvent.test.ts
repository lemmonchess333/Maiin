import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// publishEvent writes a Circle event through addDocGuarded. The rules
// accept text only as absent, null, or a bounded string; the wrapper
// strips undefined but passes null through. A text-less event therefore
// omits the field entirely, and a text is trimmed and bounded before it
// is written. Both shapes are pinned here against the real privacy
// fence (checkEventPayload is NOT mocked).

const { addDocGuarded } = vi.hoisted(() => ({
  addDocGuarded: vi.fn(
    async (_ref: unknown, _payload: Record<string, unknown>) => ({ id: "e1" })
  ),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/firestoreWrite", () => ({ addDocGuarded }));
vi.mock("@/lib/dateHelpers", () => ({ localWeekKey: () => "2026-07-12" }));
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn()),
}));
vi.mock("firebase/firestore");

import { useGoalSpaces } from "../useGoalSpaces";
import { resetFirestore } from "@/test/firestoreHarness";

describe("useGoalSpaces.publishEvent — event payload shape", () => {
  beforeEach(() => {
    resetFirestore();
    addDocGuarded.mockClear();
  });

  it("omits text entirely when there is nothing to say", async () => {
    const { result } = renderHook(() => useGoalSpaces("me"));
    let ok = false;
    await act(async () => {
      ok = await result.current.publishEvent("space-1", "milestone");
    });
    expect(ok).toBe(true);
    expect(addDocGuarded).toHaveBeenCalledTimes(1);
    const payload = addDocGuarded.mock.calls[0][1];
    expect(payload).not.toHaveProperty("text");
    expect(payload).toMatchObject({
      uid: "me",
      kind: "milestone",
      weekKey: null,
    });
  });

  it("writes a trimmed, bounded string when there is text", async () => {
    const { result } = renderHook(() => useGoalSpaces("me"));
    await act(async () => {
      await result.current.publishEvent(
        "space-1",
        "milestone",
        "  Ran 10 km  "
      );
    });
    const payload = addDocGuarded.mock.calls[0][1];
    expect(payload.text).toBe("Ran 10 km");
  });

  it("treats whitespace-only text as no text", async () => {
    const { result } = renderHook(() => useGoalSpaces("me"));
    await act(async () => {
      await result.current.publishEvent("space-1", "needs_support", "   ");
    });
    const payload = addDocGuarded.mock.calls[0][1];
    expect(payload).not.toHaveProperty("text");
  });
});
