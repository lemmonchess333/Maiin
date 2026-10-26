/**
 * Every toast lives long enough to read, and can be put away early
 * (Polish3 (7)).
 *
 * Sonner's Toaster takes one duration for all its toasts, so the life by
 * kind (success 3 s, an error 6 s, a toast with an action 8 s) is set per
 * toast by `@/lib/toast`, whose own suite pins the numbers. Two things
 * here make that true of every toast: the Toaster's floor is the shortest
 * of them, and no source shows a toast past the wrapper by importing
 * sonner's own.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";

const toaster = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));
vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    toaster.props = props;
    return null;
  },
}));

import { ToastProvider } from "@/components/ToastProvider";
import { TOAST_DURATION_MS } from "@/lib/toastDurations";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "test") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("toast timing", () => {
  it("gives a toast no less than the shortest life, and a close button", () => {
    render(<ToastProvider />);
    expect(toaster.props?.duration).toBe(TOAST_DURATION_MS.default);
    expect(toaster.props?.duration).toBe(3000);
    expect(toaster.props?.closeButton).toBe(true);
  });

  it("shows every toast through @/lib/toast, which sets its life by kind", () => {
    // A `toast` taken from sonner directly skips the durations by kind:
    // an error shown that way would go after the floor's 3 s.
    const offenders = sourceFiles(resolve(repoRoot, "src"))
      .map((file) => relative(repoRoot, file).replaceAll("\\", "/"))
      .filter((rel) => rel !== "src/lib/toast.ts")
      .filter((rel) =>
        /import\s*\{[^}]*\btoast\b[^}]*\}\s*from\s*["']sonner["']/.test(
          readFileSync(resolve(repoRoot, rel), "utf8")
        )
      );
    expect(offenders).toEqual([]);
  });
});
