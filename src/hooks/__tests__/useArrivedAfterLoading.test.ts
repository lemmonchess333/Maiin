import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useArrivedAfterLoading } from "../useArrivedAfterLoading";

/** Content "arrives" only when it takes a placeholder's place (Pol1). */
describe("useArrivedAfterLoading", () => {
  const mount = (loading: boolean) =>
    renderHook(({ loading }) => useArrivedAfterLoading(loading), {
      initialProps: { loading },
    });

  it("is false while loading and true once the content replaces the placeholder", () => {
    const { result, rerender } = mount(true);
    expect(result.current.arrived).toBe(false);
    rerender({ loading: false });
    expect(result.current.arrived).toBe(true);
  });

  it("is false for content that was ready when it mounted", () => {
    const { result, rerender } = mount(false);
    expect(result.current.arrived).toBe(false);
    rerender({ loading: false });
    expect(result.current.arrived).toBe(false);
  });

  it("stops once the arrival has been shown, so content shown again does not fade", () => {
    // The Analytics overview, mounted again on the way back from one of
    // its pages: a view switch does not animate.
    const { result, rerender } = mount(true);
    rerender({ loading: false });
    act(() => result.current.onArrived());
    expect(result.current.arrived).toBe(false);
  });

  it("arms again for a later load", () => {
    const { result, rerender } = mount(true);
    rerender({ loading: false });
    act(() => result.current.onArrived());
    rerender({ loading: true });
    expect(result.current.arrived).toBe(false);
    rerender({ loading: false });
    expect(result.current.arrived).toBe(true);
  });
});
