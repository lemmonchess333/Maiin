import { describe, it, expect, vi } from "vitest";
import {
  isLiftSessionOpen,
  liftSessionVersion,
  openLiftSession,
  subscribeLiftSession,
} from "../openLiftSession";

/**
 * The week rollover waits while a programme session is open
 * (`useProgram`); these pin the marker it reads. The hook-level proof that
 * the rollover actually waits is in `useProgramWriters.test.ts`.
 */
describe("openLiftSession", () => {
  it("is open from the call until its close", () => {
    expect(isLiftSessionOpen()).toBe(false);
    const close = openLiftSession();
    expect(isLiftSessionOpen()).toBe(true);
    close();
    expect(isLiftSessionOpen()).toBe(false);
  });

  it("stays open while any of two sessions is", () => {
    const first = openLiftSession();
    const second = openLiftSession();
    first();
    expect(isLiftSessionOpen()).toBe(true);
    second();
    expect(isLiftSessionOpen()).toBe(false);
  });

  it("tells subscribers once per change, and a second close is no change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLiftSession(listener);
    const before = liftSessionVersion();
    const close = openLiftSession();
    close();
    close();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(liftSessionVersion()).toBe(before + 2);
    unsubscribe();
    openLiftSession()();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
