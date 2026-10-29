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
