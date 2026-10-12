/**
 * Types jest-dom's matchers for vitest 5. jest-dom's own `vitest` types
 * (6.9 and 7.0) still augment vitest 4's one-parameter `Assertion<T>`,
 * which no longer merges with vitest 5's `Assertion<R, T>`, so every
 * `toBeInTheDocument()` failed `tsc -b` while the matchers ran fine.
 * vitest 5 takes custom matchers on `Matchers<R, T>`; a merge must repeat
 * both parameters. Delete this once jest-dom's own types target vitest 5.
 */
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type -- a declaration merge: the parameters must match vitest's, and the members come from the supertype */
import "vitest";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<unknown, R> {}
}
