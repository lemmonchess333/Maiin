import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePriorHomeVisit } from "../usePriorHomeVisit";

beforeEach(() => window.localStorage.clear());

describe("usePriorHomeVisit", () => {
  it("holds the first visit clear after its marker is saved", () => {
    const first = renderHook(() => usePriorHomeVisit("alice"));
    expect(first.result.current.hadPriorVisit).toBe(false);
    act(() => first.result.current.markVisited());
    expect(window.localStorage.getItem("tropos-home-visited:alice")).toBe("1");
    expect(first.result.current.hadPriorVisit).toBe(false);

    first.unmount();
    const second = renderHook(() => usePriorHomeVisit("alice"));
    expect(second.result.current.hadPriorVisit).toBe(true);
  });

  it("holds the first visit's later asks until the app is opened again", () => {
    const first = renderHook(() => usePriorHomeVisit("carol"));
    expect(first.result.current.firstVisitThisOpen).toBe(false);
    act(() => first.result.current.markVisited());
    expect(first.result.current.firstVisitThisOpen).toBe(true);
    first.unmount();

    // Back on Home from the first session's finish, in the same open.
    const back = renderHook(() => usePriorHomeVisit("carol"));
    expect(back.result.current.hadPriorVisit).toBe(true);
    expect(back.result.current.firstVisitThisOpen).toBe(true);

    // The app goes to the background and is opened again.
    const visibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    act(() => visibility("hidden"));
    expect(back.result.current.firstVisitThisOpen).toBe(true);
    act(() => visibility("visible"));
    expect(back.result.current.firstVisitThisOpen).toBe(false);
  });

  it("keeps visits separate when the signed-in uid changes", () => {
    window.localStorage.setItem("tropos-home-visited:alice", "1");
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | null }) => usePriorHomeVisit(uid),
      { initialProps: { uid: "alice" as string | null } }
    );
    expect(result.current.hadPriorVisit).toBe(true);
    rerender({ uid: "bob" });
    expect(result.current.hadPriorVisit).toBe(false);
    act(() => result.current.markVisited());
    expect(window.localStorage.getItem("tropos-home-visited:bob")).toBe("1");
    expect(result.current.hadPriorVisit).toBe(false);
  });
});
