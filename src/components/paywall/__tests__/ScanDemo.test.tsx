/**
 * ScanDemo's motion rules, read off what each animated layer is actually
 * handed rather than off the source text.
 *
 * - One clock: every layer loops on the same 8-second LOOP, so the
 *   surface has one ambient loop and the beats stay in step.
 * - Only opacity and transform animate (the WKWebView-safe recipe).
 * - Opacity runs linear. The browser runs opacity animations natively,
 *   and there a single ease bends the whole loop's timeline instead of
 *   each step: an ease-out on the shutter flash fired it about 0.7 s
 *   before the reading beat it belongs to. Measured on a recording, and
 *   invisible in a unit test's DOM, so the rule is pinned where the
 *   props are set.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement, forwardRef, type Ref } from "react";

type Recorded = {
  animate: Record<string, unknown>;
  transition: Record<string, unknown> | undefined;
};
const recorded: Recorded[] = [];

/* motion.* components that record what they are asked to animate and
   render a plain element. Motion-only props are dropped so React does not
   see them as DOM attributes. */
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  const MOTION_ONLY = [
    "animate",
    "transition",
    "initial",
    "exit",
    "layout",
    "layoutDependency",
    "whileTap",
    "whileHover",
  ];
  const cache = new Map<string, unknown>();
  const make = (tag: string) => {
    if (!cache.has(tag)) {
      cache.set(
        tag,
        forwardRef(function Recorder(
          props: Record<string, unknown>,
          ref: Ref<unknown>
        ) {
          if (props.animate && typeof props.animate === "object") {
            recorded.push({
              animate: props.animate as Record<string, unknown>,
              transition: props.transition as
                | Record<string, unknown>
                | undefined,
            });
          }
          const rest = Object.fromEntries(
            Object.entries(props).filter(([k]) => !MOTION_ONLY.includes(k))
          );
          return createElement(tag, { ...rest, ref });
        })
      );
    }
    return cache.get(tag);
  };
  return {
    ...actual,
    motion: new Proxy({}, { get: (_t, tag: string) => make(tag) }),
  };
});

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: vi.fn(() => false),
}));

import { useReducedMotion } from "@/hooks/useReducedMotion";
import ScanDemo from "../ScanDemo";

/** The transition that governs one animated key. */
function transitionFor(r: Recorded, key: string): Record<string, unknown> {
  const t = r.transition ?? {};
  const own = t[key];
  return own && typeof own === "object" ? (own as Record<string, unknown>) : t;
}

beforeEach(() => {
  recorded.length = 0;
  vi.mocked(useReducedMotion).mockReturnValue(false);
});
afterEach(cleanup);

describe("ScanDemo motion", () => {
  it("animates its layers when motion is allowed", () => {
    render(<ScanDemo />);
    // The photo's drift, both reticles, the hint, the shutter and its
    // press, the flash, the veil, the laser, three stage lines, the sheet.
    expect(recorded.length).toBeGreaterThanOrEqual(12);
  });

  it("runs every layer on one clock: the same 8-second infinite loop", () => {
    render(<ScanDemo />);
    for (const r of recorded) {
      for (const key of Object.keys(r.animate)) {
        const t = transitionFor(r, key);
        expect(t.duration, key).toBe(8);
        expect(t.repeat, key).toBe(Infinity);
      }
    }
  });

  it("animates only opacity and transform", () => {
    render(<ScanDemo />);
    for (const r of recorded) {
      for (const key of Object.keys(r.animate)) {
        expect(["opacity", "x", "y", "scale"]).toContain(key);
      }
    }
  });

  it("runs every opacity track linear, so no ease can bend the loop's timeline", () => {
    render(<ScanDemo />);
    const opacityTracks = recorded.filter((r) => "opacity" in r.animate);
    expect(opacityTracks.length).toBeGreaterThanOrEqual(8);
    for (const r of opacityTracks) {
      expect(transitionFor(r, "opacity").ease).toBe("linear");
    }
  });

  it("keyframes and their times line up on every track", () => {
    render(<ScanDemo />);
    for (const r of recorded) {
      for (const [key, values] of Object.entries(r.animate)) {
        const times = transitionFor(r, key).times as number[] | undefined;
        expect(Array.isArray(values), key).toBe(true);
        expect(times?.length, key).toBe((values as unknown[]).length);
        expect(times?.[0], key).toBe(0);
        expect(times?.[times.length - 1], key).toBe(1);
      }
    }
  });

  it("under reduced motion, nothing animates", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    render(<ScanDemo />);
    expect(recorded).toHaveLength(0);
  });
});
