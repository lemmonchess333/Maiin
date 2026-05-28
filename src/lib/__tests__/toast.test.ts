import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sonner so we can inspect exactly what options the wrapper forwards.
// The wrapper's whole job is deriving a stable `id` from the message, so
// we assert on the second argument each sonner method receives.
const calls: Array<{ method: string; message: unknown; options: unknown }> = [];

vi.mock("sonner", () => {
  const make =
    (method: string) =>
    (message: unknown, options: unknown) => {
      calls.push({ method, message, options });
      return method; // sonner returns the toast id; value is irrelevant here
    };
  const toast = Object.assign(make("default"), {
    success: make("success"),
    error: make("error"),
    info: make("info"),
    warning: make("warning"),
    message: make("message"),
    loading: make("loading"),
    promise: make("promise"),
    custom: make("custom"),
    dismiss: make("dismiss"),
  });
  return { toast };
});

import { toast } from "../toast";

function lastOptions() {
  return calls[calls.length - 1]?.options as { id?: string } | undefined;
}

describe("toast dedupe wrapper", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("derives a stable id from a string message", () => {
    toast.success("Saved!");
    const first = lastOptions()?.id;
    toast.success("Saved!");
    const second = lastOptions()?.id;

    expect(first).toBeTruthy();
    expect(first).toBe(second); // identical copy → same id → sonner collapses
  });

  it("gives different messages different ids", () => {
    toast.error("Network error");
    const a = lastOptions()?.id;
    toast.error("Validation error");
    const b = lastOptions()?.id;

    expect(a).not.toBe(b);
  });

  it("derives the same id regardless of which method shows the message", () => {
    toast.success("Hello");
    const viaSuccess = lastOptions()?.id;
    toast("Hello");
    const viaDefault = lastOptions()?.id;

    expect(viaSuccess).toBe(viaDefault);
  });

  it("respects an explicit id and does not override it", () => {
    toast.error("Boom", { id: "my-stable-id" });
    expect(lastOptions()?.id).toBe("my-stable-id");
  });

  it("preserves caller options while injecting the dedupe id", () => {
    toast.success("With duration", { duration: 5000 });
    const opts = lastOptions() as { id?: string; duration?: number };
    expect(opts.duration).toBe(5000);
    expect(opts.id).toBeTruthy();
  });

  it("passes non-string (ReactNode) messages through without an injected id", () => {
    const node = { $$typeof: Symbol.for("react.element") };
    toast.success(node as never);
    expect(lastOptions()?.id).toBeUndefined();
  });

  it("re-exports passthrough methods (promise/dismiss) from sonner", () => {
    expect(typeof toast.promise).toBe("function");
    expect(typeof toast.dismiss).toBe("function");
  });
});
