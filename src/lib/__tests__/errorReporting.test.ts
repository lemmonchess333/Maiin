// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
import { describe, it, expect, beforeEach } from "vitest";
import {
  captureError,
  getRecentErrors,
  clearErrors,
  setErrorReportingUid,
  __getPendingPreAuthCount,
  initErrorMonitoring,
} from "../errorReporting";

describe("errorReporting", () => {
  beforeEach(() => {
    clearErrors();
    // Reset to the unauthenticated state + drop any pending pre-auth
    // queue so each test starts clean.
    setErrorReportingUid(null);
  });

  it("captures errors", () => {
    captureError(new Error("test error"));
    const errors = getRecentErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe("test error");
    expect(errors[0].type).toBe("error");
    expect(errors[0].timestamp).toBeGreaterThan(0);
  });

  it("captures errors with context", () => {
    captureError(new Error("network fail"), "network", {
      url: "/api/data",
      status: 500,
    });
    const errors = getRecentErrors();
    expect(errors[0].type).toBe("network");
    expect(errors[0].context?.url).toBe("/api/data");
  });

  it("caps buffer at MAX_STORED_ERRORS", () => {
    for (let i = 0; i < 60; i++) {
      captureError(new Error(`error ${i}`));
    }
    const errors = getRecentErrors();
    expect(errors.length).toBe(50);
    // Should keep the most recent
    expect(errors[errors.length - 1].message).toBe("error 59");
  });

  it("clears errors", () => {
    captureError(new Error("test"));
    clearErrors();
    expect(getRecentErrors().length).toBe(0);
  });

  it("returns readonly array", () => {
    captureError(new Error("test"));
    const errors = getRecentErrors();
    expect(Array.isArray(errors)).toBe(true);
  });

  it("stamps appVersion + a stable sessionId on every report", () => {
    captureError(new Error("one"));
    captureError(new Error("two"));
    const errors = getRecentErrors();
    expect(errors[0].appVersion).toBeTruthy();
    expect(errors[0].sessionId).toBeTruthy();
    // Same page-load → same session id across reports (so a cascade
    // groups together in triage).
    expect(errors[0].sessionId).toBe(errors[1].sessionId);
  });

  it("queues a pre-auth critical instead of dropping it", () => {
    // No uid set (pre-auth). A "component" error is critical → would
    // previously be dropped by persistToFirestore's null-uid guard.
    captureError(new Error("boom"), "component");
    expect(__getPendingPreAuthCount()).toBe(1);
  });

  it("does NOT queue a non-critical pre-auth error", () => {
    captureError(new Error("just a warning"), "error");
    expect(__getPendingPreAuthCount()).toBe(0);
  });

  it("flushes the pre-auth queue when a uid arrives", () => {
    captureError(new Error("login blew up"), "component");
    expect(__getPendingPreAuthCount()).toBe(1);
    // Sign-in resolves → flush (fire-and-forget persist; queue drains).
    setErrorReportingUid("user-123");
    expect(__getPendingPreAuthCount()).toBe(0);
  });

  it("drops the pre-auth queue on sign-out (no cross-account attribution)", () => {
    captureError(new Error("pre-auth crash"), "component");
    expect(__getPendingPreAuthCount()).toBe(1);
    setErrorReportingUid(null);
    expect(__getPendingPreAuthCount()).toBe(0);
  });
});

describe("initErrorMonitoring — global handler registration + cleanup", () => {
  beforeEach(() => clearErrors());

  it("captures window error events while active, and stops after cleanup", () => {
    const cleanup = initErrorMonitoring();

    // Message-only ErrorEvent (no `.error` object) so jsdom's default handler
    // has nothing to re-throw as an uncaught error; the monitor coerces
    // `event.message` → Error, so capture still exercises the same path.
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "boom",
        filename: "app.js",
        lineno: 12,
        colno: 5,
      })
    );
    const after = getRecentErrors();
    expect(after.some((e) => e.message === "boom")).toBe(true);
    const countWhileActive = after.length;

    // After cleanup the listener is removed → no further capture.
    cleanup();
    window.dispatchEvent(new ErrorEvent("error", { message: "after" }));
    expect(getRecentErrors().length).toBe(countWhileActive);
    expect(getRecentErrors().some((e) => e.message === "after")).toBe(false);
  });

  it("captures unhandled promise rejections while active", () => {
    const cleanup = initErrorMonitoring();
    // jsdom doesn't construct PromiseRejectionEvent; dispatch a plain event
    // carrying `reason`, which is all the handler reads.
    const ev = new Event("unhandledrejection");
    (ev as unknown as { reason: Error }).reason = new Error("rejected");
    window.dispatchEvent(ev);

    expect(getRecentErrors().some((e) => e.message === "rejected")).toBe(true);
    cleanup();
  });

  it("coerces a non-Error rejection reason into an Error message", () => {
    const cleanup = initErrorMonitoring();
    const ev = new Event("unhandledrejection");
    (ev as unknown as { reason: string }).reason = "string reason";
    window.dispatchEvent(ev);

    expect(getRecentErrors().some((e) => e.message === "string reason")).toBe(
      true
    );
    cleanup();
  });
});
