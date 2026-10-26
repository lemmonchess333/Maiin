/**
 * Fades come out under Reduce Motion. `MotionConfig reducedMotion="user"`
 * settles framer's positions and leaves opacity alone, so an enter or
 * exit that fades would still fade for someone who has asked for less
 * motion.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderHook, render, screen, waitFor } from "@testing-library/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useMotionSafe,
  variantsWithoutFade,
  withoutFade,
} from "../useMotionSafe";

const realMatchMedia = window.matchMedia;
function reduceMotion(on: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: on && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe("withoutFade", () => {
  it("takes the opacity out and keeps the rest of the target", () => {
    expect(withoutFade({ opacity: 0, height: 0 })).toEqual({ height: 0 });
    expect(
      withoutFade({ opacity: 0, y: -80, transition: { duration: 1 } })
    ).toEqual({
      y: -80,
      transition: { duration: 1 },
    });
    expect(withoutFade({ opacity: 0 })).toEqual({});
  });

  it("leaves what is not a target with a fade as it is", () => {
    const still = { height: 0 };
    expect(withoutFade(still)).toBe(still);
    expect(withoutFade(false)).toBe(false);
    expect(withoutFade("hidden")).toBe("hidden");
    expect(withoutFade(undefined)).toBeUndefined();
  });

  it("does the same to each variant, a custom variant's function included", () => {
    const variants = variantsWithoutFade({
      enter: (dir: number) => ({ opacity: 0, x: dir * 50 }),
      center: { opacity: 1, x: 0 },
    });
    expect(variants.enter(1)).toEqual({ x: 50 });
    expect(variants.center).toEqual({ x: 0 });
  });
});

describe("useMotionSafe", () => {
  it("passes the targets through untouched while motion is allowed", () => {
    reduceMotion(false);
    const { result } = renderHook(() => useMotionSafe());
    const target = { opacity: 0, height: 0 };
    const variants = { hidden: { opacity: 0 } };
    expect(result.current(target)).toBe(target);
    expect(result.current.variants(variants)).toBe(variants);
  });

  it("takes the fades out under Reduce Motion", () => {
    reduceMotion(true);
    const { result } = renderHook(() => useMotionSafe());
    expect(result.current({ opacity: 0, height: 0 })).toEqual({ height: 0 });
    expect(result.current.variants({ hidden: { opacity: 0, y: 12 } })).toEqual({
      hidden: { y: 12 },
    });
  });

  it("shows at once, and an exit that only faded still leaves", async () => {
    reduceMotion(true);
    function Note({ shown }: { shown: boolean }) {
      const motionSafe = useMotionSafe();
      return (
        <AnimatePresence>
          {shown && (
            <motion.p
              data-testid="note"
              initial={motionSafe({ opacity: 0 })}
              animate={{ opacity: 1 }}
              exit={motionSafe({ opacity: 0 })}
            >
              Saved
            </motion.p>
          )}
        </AnimatePresence>
      );
    }
    const { rerender } = render(<Note shown={false} />);
    rerender(<Note shown />);
    expect(screen.getByTestId("note").style.opacity).not.toBe("0");
    rerender(<Note shown={false} />);
    await waitFor(() => expect(screen.queryByTestId("note")).toBeNull());
  });
});

/* The sites this pass gated, held to it: in each, a framer target that
   takes opacity to 0 does so inside `motionSafe(…)` or
   `motionSafe.variants(…)`. Collapse keeps its targets in constants, so
   its own suite renders it under Reduce Motion instead. */
const GATED = [
  "src/components/run/RunSetupModal.tsx",
  "src/pages/Program.tsx",
  "src/components/program/ExercisePicker.tsx",
  "src/features/challenges/ChallengeCard.tsx",
  "src/components/NotificationBubble.tsx",
  "src/components/home/DayPeekCard.tsx",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Whether the call that encloses `at` is `motionSafe(` or
 *  `motionSafe.variants(`, looking out through the brackets around it. */
function insideMotionSafe(src: string, at: number): boolean {
  let depth = 0;
  for (let i = at - 1; i >= Math.max(0, at - 800); i--) {
    if (src[i] === ")") depth++;
    else if (src[i] === "(") {
      if (depth > 0) depth--;
      else if (/motionSafe(\.variants)?\s*$/.test(src.slice(i - 30, i)))
        return true;
    }
  }
  return false;
}

describe("the fades this pass gated", () => {
  it.each(GATED)("%s fades only through motionSafe", (rel) => {
    const src = readFileSync(resolve(repoRoot, rel), "utf8");
    const ungated = [...src.matchAll(/\bopacity:\s*0(?![.\d])/g)]
      .filter((m) => !insideMotionSafe(src, m.index))
      .map((m) => `line ${src.slice(0, m.index).split("\n").length}`);
    expect(ungated).toEqual([]);
  });
});
