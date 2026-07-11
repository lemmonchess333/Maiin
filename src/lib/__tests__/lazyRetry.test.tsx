// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
/**
 * lazyRetry — recovery wrapper for lazy() page/chunk imports. After a deploy,
 * stale HTML/Service-Worker caches can reference chunk hashes that no longer
 * exist, so a dynamic import rejects with a "chunk load" error. lazyRetry
 * detects that, clears caches, and reloads ONCE per session (a guard against an
 * infinite reload loop). A non-chunk error is re-thrown to the error boundary.
 *
 * This is the app's deploy-resilience seam — a regression here strands users on
 * a broken page after every deploy, so it's worth pinning despite the React.lazy
 * + reload entanglement.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { Component, Suspense, type ComponentType, type ReactNode } from "react";
import { lazyRetry } from "../lazyRetry";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <div>boundary</div> : this.props.children;
  }
}

let reloadSpy: ReturnType<typeof vi.fn>;
const realLocation = window.location;

beforeEach(() => {
  sessionStorage.clear();
  reloadSpy = vi.fn();
  // jsdom's location.reload isn't spy-able directly ("Cannot redefine
  // property"), so replace the whole location object for the test.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, href: realLocation.href, reload: reloadSpy },
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
});

describe("lazyRetry", () => {
  it("reloads once on a chunk-load error (first occurrence this session)", async () => {
    const Comp = lazyRetry(() =>
      Promise.reject<{ default: ComponentType }>(
        new Error("Failed to fetch dynamically imported module: /assets/x.js")
      )
    );
    render(
      <Boundary>
        <Suspense fallback={<div>loading</div>}>
          <Comp />
        </Suspense>
      </Boundary>
    );
    // The chunk-error branch clears caches + reloads, then returns a
    // never-resolving promise so the component stays suspended (no error UI).
    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem("chunk-retry")).toBe("1");
  });

  it("does NOT reload a second time in the same session (infinite-loop guard)", async () => {
    sessionStorage.setItem("chunk-retry", "1"); // already retried once
    const Comp = lazyRetry(() =>
      Promise.reject<{ default: ComponentType }>(
        new Error("Loading chunk 42 failed")
      )
    );
    render(
      <Boundary>
        <Suspense fallback={<div>loading</div>}>
          <Comp />
        </Suspense>
      </Boundary>
    );
    // Re-throws → the error boundary renders, and we never reload again.
    await waitFor(() => expect(screen.getByText("boundary")).toBeTruthy());
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("re-throws a non-chunk error without reloading (real component failure)", async () => {
    const Comp = lazyRetry(() =>
      Promise.reject<{ default: ComponentType }>(
        new Error("TypeError: cannot read 'x' of undefined")
      )
    );
    render(
      <Boundary>
        <Suspense fallback={<div>loading</div>}>
          <Comp />
        </Suspense>
      </Boundary>
    );
    await waitFor(() => expect(screen.getByText("boundary")).toBeTruthy());
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
