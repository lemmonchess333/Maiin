/**
 * B0 companion instrumentation — the event contract.
 *
 * These events exist to answer whether the companion batch made logging
 * cheaper and the finish quieter. That makes two things worth pinning, and
 * they are different in kind:
 *
 *   1. THE NAMES. A dashboard keys off the literal string. Renaming
 *      `food_log_saved` is free in TypeScript and silently orphans every
 *      chart built on it, so the strings are asserted as literals here
 *      rather than derived from the unions that declare them — a test that
 *      computed its expectation from the union would pin nothing.
 *   2. THE PAYLOAD SHAPE. The brief's rule is "no free text". The
 *      redaction layer enforces that centrally, so what is checked here is
 *      the narrower promise these particular events make: every dimension
 *      they carry is an enum, a number or a boolean, and none of them is a
 *      value a user typed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { track as trackFood } from "../foodAnalytics";
import { track as trackHome } from "../homeAnalytics";
import { track as trackLifecycle } from "../lifecycleAnalytics";
import * as analyticsClient from "../analyticsClient";
import { sanitizeAnalyticsParams } from "../analyticsRedaction";
import {
  beginCompletionWindow,
  noteCompletionSurface,
  flushCompletionSurfaces,
} from "../completionSurfaceCounter";

const emitSpy = vi.spyOn(analyticsClient, "emit").mockImplementation(() => {});
beforeEach(() => {
  emitSpy.mockClear();
  // Drain any window a previous test left open, through the real API — a
  // test-only reset export would be an unreachable symbol, which the
  // reachability gate rightly refuses.
  flushCompletionSurfaces();
});

describe("B0 event names", () => {
  it("food events keep their wire names", () => {
    trackFood("food_log_start", { slot: "lunch" });
    trackFood("food_log_saved", { path: "usual", taps: 2, durationMs: 900 });
    trackFood("food_log_undo", { path: "usual" });
    trackFood("meal_deleted", { ageSeconds: 12 });
    expect(emitSpy.mock.calls.map((c) => c[1])).toEqual([
      "food_log_start",
      "food_log_saved",
      "food_log_undo",
      "meal_deleted",
    ]);
    expect(emitSpy.mock.calls.every((c) => c[0] === "food")).toBe(true);
  });

  it("weigh-in events keep their wire names", () => {
    trackHome("weight_sheet_open");
    trackHome("weight_log_saved", {
      taps: 3,
      typed: false,
      picker: true,
      unit: "kg",
    });
    expect(emitSpy.mock.calls.map((c) => c[1])).toEqual([
      "weight_sheet_open",
      "weight_log_saved",
    ]);
    expect(emitSpy.mock.calls.every((c) => c[0] === "home")).toBe(true);
  });

  it("training-loop events keep their wire names", () => {
    trackLifecycle("session_started", { kind: "run", offPlan: true });
    trackLifecycle("completion_surfaces", { count: 1 });
    trackLifecycle("return_surface_shown", { surface: "fell-behind" });
    trackLifecycle("return_choice", { surface: "fell-behind", choice: "skip" });
    trackLifecycle("checkin_answered", { clarity: 4, ease: 5 });
    expect(emitSpy.mock.calls.map((c) => c[1])).toEqual([
      "session_started",
      "completion_surfaces",
      "return_surface_shown",
      "return_choice",
      "checkin_answered",
    ]);
    expect(emitSpy.mock.calls.every((c) => c[0] === "lifecycle")).toBe(true);
  });
});

describe("B0 payloads carry no user-authored text", () => {
  /**
   * Every dimension these events can carry, with a representative value.
   * A future field added to one of the metadata interfaces and used by a
   * B0 call site should be added here; a `string` that is not drawn from a
   * closed vocabulary is what this is watching for.
   */
  const allDimensions = {
    slot: "lunch",
    path: "usual",
    taps: 2,
    durationMs: 900,
    ageSeconds: 12,
    typed: false,
    picker: true,
    unit: "kg",
    kind: "run",
    offPlan: true,
    count: 1,
    surface: "fell-behind",
    choice: "skip",
    clarity: 4,
    ease: 5,
  };

  it("every value is an enum member, a number or a boolean", () => {
    const closedVocabularies: Record<string, readonly string[]> = {
      slot: ["breakfast", "lunch", "snacks", "dinner"],
      path: ["usual", "typeahead", "copy", "nl", "manual", "barcode", "photo"],
      unit: ["kg", "lbs", "st"],
      kind: ["lift", "run"],
      surface: ["trial-expired", "fell-behind", "badge", "priming"],
      choice: [
        "dismissed",
        "realign",
        "rebuild",
        "shift",
        "compress",
        "skip",
        "upgrade",
        "enable",
        "acknowledge",
      ],
    };
    for (const [key, value] of Object.entries(allDimensions)) {
      if (typeof value === "string") {
        expect(
          closedVocabularies[key],
          `${key} carries a string and must come from a closed vocabulary`
        ).toBeDefined();
        expect(closedVocabularies[key]).toContain(value);
      } else {
        expect(["number", "boolean"]).toContain(typeof value);
      }
    }
  });

  it("survives redaction unchanged — nothing here trips a PII rule", () => {
    // If a future dimension were named so that the key denylist ate it, the
    // event would ship to the provider missing that field and the loss
    // would be invisible at the call site. This is what catches that.
    expect(sanitizeAnalyticsParams(allDimensions)).toEqual(allDimensions);

    // …and the assertion above is only worth anything if the sanitizer is
    // actually removing things. A pass-through implementation would satisfy
    // it for the wrong reason, so prove the teeth in the same test.
    expect(
      sanitizeAnalyticsParams({ ...allDimensions, mealName: "porridge" })
    ).toEqual(allDimensions);
  });
});

describe("completion surface counter", () => {
  it("counts nothing outside a window", () => {
    noteCompletionSurface();
    noteCompletionSurface();
    expect(flushCompletionSurfaces()).toBeNull();
  });

  it("counts the surfaces raised between a finish and leaving", () => {
    beginCompletionWindow();
    noteCompletionSurface();
    noteCompletionSurface();
    expect(flushCompletionSurfaces()).toBe(2);
  });

  it("reports a quiet finish as zero, not as no window", () => {
    beginCompletionWindow();
    expect(flushCompletionSurfaces()).toBe(0);
  });

  it("closes the window on flush so the next session starts clean", () => {
    beginCompletionWindow();
    noteCompletionSurface();
    expect(flushCompletionSurfaces()).toBe(1);
    noteCompletionSurface();
    expect(flushCompletionSurfaces()).toBeNull();
  });

  it("a second finish does not inherit the first one's count", () => {
    beginCompletionWindow();
    noteCompletionSurface();
    beginCompletionWindow();
    expect(flushCompletionSurfaces()).toBe(0);
  });
});
