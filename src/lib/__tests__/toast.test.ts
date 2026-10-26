import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sonner so we can inspect exactly what options the wrapper forwards.
// The wrapper's whole job is deriving a stable `id` from the message, so
// we assert on the second argument each sonner method receives.
const calls: Array<{ method: string; message: unknown; options: unknown }> = [];

vi.mock("sonner", () => {
  const make = (method: string) => (message: unknown, options: unknown) => {
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
import { TOAST_DURATION_MS } from "../toastDurations";
import { MEAL_UNDO_WINDOW_MS } from "../mealDeleteCommit";

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

/* Polish3 (7): a toast stays long enough to read its sentence, and to
   reach its button when it has one (WCAG 2.2.1, adjustable timing). Its
   life is set here, by what it carries. */
describe("how long a toast stays", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  function durationOf(show: () => void) {
    show();
    return (lastOptions() as { duration?: number } | undefined)?.duration;
  }
  const undo = { label: "Undo", onClick: () => {} };

  it("gives success, info and plain toasts three seconds", () => {
    expect(TOAST_DURATION_MS.default).toBe(3000);
    expect(durationOf(() => toast.success("Meal logged"))).toBe(3000);
    expect(durationOf(() => toast.info("Synced"))).toBe(3000);
    expect(durationOf(() => toast.message("Plan updated"))).toBe(3000);
    expect(durationOf(() => toast("Workout corrected"))).toBe(3000);
  });

  it("gives an error, and a warning, six seconds to read", () => {
    expect(TOAST_DURATION_MS.error).toBe(6000);
    expect(durationOf(() => toast.error("Couldn't save. Try again."))).toBe(
      6000
    );
    expect(durationOf(() => toast.warning("Shoes near their mileage"))).toBe(
      6000
    );
  });

  it("gives a toast with an action eight seconds, whatever its kind", () => {
    expect(TOAST_DURATION_MS.action).toBe(8000);
    expect(durationOf(() => toast("Oats deleted", { action: undo }))).toBe(
      8000
    );
    expect(
      durationOf(() => toast.success("Routine saved", { action: undo }))
    ).toBe(8000);
    expect(
      durationOf(() => toast.error("Search failed", { action: undo }))
    ).toBe(8000);
    expect(
      durationOf(() => toast.error("Search failed", { cancel: undo }))
    ).toBe(8000);
  });

  it("lets a call site lengthen a toast, never shorten it", () => {
    expect(
      durationOf(() => toast.success("Export ready", { duration: 10_000 }))
    ).toBe(10_000);
    expect(
      durationOf(() => toast.error("Past its mileage", { duration: 5000 }))
    ).toBe(6000);
    expect(
      durationOf(() => toast("Removed oats", { duration: 5000, action: undo }))
    ).toBe(8000);
    expect(
      durationOf(() => toast.success("Waiting", { duration: Infinity }))
    ).toBe(Infinity);
  });

  it("leaves a loading toast to the toast that replaces it", () => {
    expect(durationOf(() => toast.loading("Saving"))).toBeUndefined();
  });

  it("keeps a deleted meal's Undo for the life of its toast", () => {
    // The window's close dismisses the toast, so a shorter window would
    // take the Undo away before the toast's time was up.
    expect(MEAL_UNDO_WINDOW_MS).toBe(TOAST_DURATION_MS.action);
  });
});
