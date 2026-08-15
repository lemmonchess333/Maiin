/**
 * Ambient types for scripts/diff-screenshots.mjs — plain ESM that runs
 * under bare node in CI (app-screenshots.yml). Declared here so its
 * unit test stays typed without pulling the scripts dir into the app
 * tsconfig or teaching the build about .mjs modules.
 */
declare module "*scripts/diff-screenshots.mjs" {
  import type { PNG } from "pngjs";

  export interface DiffRow {
    file: string;
    status:
      | "unchanged"
      | "minor"
      | "changed"
      | "resized"
      | "added"
      | "removed"
      | "unreadable";
    pct: number | null;
    note: string | null;
  }

  export function comparePngs(
    baseline: PNG,
    current: PNG
  ): {
    status: "unchanged" | "minor" | "changed" | "resized";
    pct: number | null;
    diff: PNG | null;
    note: string | null;
  };
  export function diffDirectories(
    baselineDir: string,
    currentDir: string,
    outDir: string
  ): DiffRow[];
  export function renderReport(rows: DiffRow[]): string;
  export function main(
    baselineDir: string,
    currentDir: string,
    outDir: string
  ): void;
}
