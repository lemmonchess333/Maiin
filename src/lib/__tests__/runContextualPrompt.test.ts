/**
 * Run9 phase 2 — contextual-prompt slot precedence contract.
 *
 * Pins the single-slot precedence (no-show > recovery-complete > fell-behind)
 * so the god-component banner-collapse can switch on one value instead of
 * stacking six independent banner conditions.
 */
import { describe, it, expect } from "vitest";
import {
  resolveRunContextualPrompt,
  type RunContextualPromptInput,
} from "../runContextualPrompt";

function input(
  overrides: Partial<RunContextualPromptInput> = {}
): RunContextualPromptInput {
  return {
    isNoShow: false,
    recoveryEnded: false,
    pendingFellBehind: false,
    ...overrides,
  };
}

describe("resolveRunContextualPrompt", () => {
  it("returns null when no prompt condition is active", () => {
    expect(resolveRunContextualPrompt(input())).toBeNull();
  });

  it("returns each prompt when it's the only active condition", () => {
    expect(resolveRunContextualPrompt(input({ isNoShow: true }))).toBe(
      "no-show"
    );
    expect(resolveRunContextualPrompt(input({ recoveryEnded: true }))).toBe(
      "recovery-complete"
    );
    expect(resolveRunContextualPrompt(input({ pendingFellBehind: true }))).toBe(
      "fell-behind"
    );
  });

  it("no-show wins over everything else", () => {
    expect(
      resolveRunContextualPrompt(
        input({
          isNoShow: true,
          recoveryEnded: true,
          pendingFellBehind: true,
        })
      )
    ).toBe("no-show");
  });

  it("recovery-complete wins over fell-behind", () => {
    expect(
      resolveRunContextualPrompt(
        input({ recoveryEnded: true, pendingFellBehind: true })
      )
    ).toBe("recovery-complete");
  });

  it("fell-behind only when it's the sole condition", () => {
    expect(
      resolveRunContextualPrompt(
        input({ isNoShow: true, pendingFellBehind: true })
      )
    ).toBe("no-show");
    expect(resolveRunContextualPrompt(input({ pendingFellBehind: true }))).toBe(
      "fell-behind"
    );
  });
});
