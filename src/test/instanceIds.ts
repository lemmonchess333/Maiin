import { afterEach, beforeEach } from "vitest";
import { setInstanceIdSource } from "@/features/program/programTypes";

/** A deterministic instance-id source: "ex-1", "ex-2", … */
export function sequentialInstanceIds(prefix = "ex"): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/**
 * For a test file or describe block: each test draws instance ids from a
 * fresh sequence, and the random source comes back after it, so a build of
 * the same plan gives the same ids every run.
 */
export function useSequentialInstanceIds(prefix = "ex"): void {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = setInstanceIdSource(sequentialInstanceIds(prefix));
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });
}
