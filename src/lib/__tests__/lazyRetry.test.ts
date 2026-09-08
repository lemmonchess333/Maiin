import { afterEach, describe, expect, it, vi } from "vitest";

// Expose React's lazy loader so the recovery policy can be tested without a
// browser navigation. Component rendering is covered by RunMapLazy's tests.
vi.mock("react", () => ({
  lazy: (factory: () => Promise<unknown>) => factory,
}));
import { lazyRetry } from "../lazyRetry";

afterEach(() => vi.unstubAllGlobals());

describe("lazy import recovery policy", () => {
  it("lets an optional map fail locally without reloading an active session", async () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    const error = new Error("Failed to fetch dynamically imported module");
    const load = lazyRetry(() => Promise.reject(error), {
      reloadOnChunkError: false,
    });
    await expect((load as unknown as () => Promise<unknown>)()).rejects.toBe(
      error
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it("preserves one-shot reload recovery for ordinary route imports", async () => {
    const reload = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem });
    const load = lazyRetry(() =>
      Promise.reject(new Error("Loading chunk failed"))
    );
    void (load as unknown as () => Promise<unknown>)();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(setItem).toHaveBeenCalledWith("chunk-retry", "1");
  });

  it("does not turn non-chunk errors into reloads", async () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    const error = new Error("Other import failure");
    const load = lazyRetry(() => Promise.reject(error));
    await expect((load as unknown as () => Promise<unknown>)()).rejects.toBe(
      error
    );
    expect(reload).not.toHaveBeenCalled();
  });
});
