/**
 * Per-flag failure policy pins (security audit 2026-05-25 finding #2,
 * revised by the 2026-07-09 money-path audit F6).
 *
 * Behaviours pinned:
 *   1. geminiEnabled is declared FAIL-CLOSED — it is the AI-cost kill-switch
 *      (index.js:950), so a config/flags read failure must block AI (not keep
 *      spending on Vertex). F6 flipped this from fail-open.
 *   2. Unknown flag defaults to fail-open (pre-audit legacy parity for callers
 *      that haven't declared a policy).
 *   3. fallbackForReadFailure(key) returns `false` for fail-closed (blocks the
 *      gated feature) and `true` for fail-open.
 *   4. FLAG_POLICIES is frozen.
 *   5. Convention guard — every AI/billing-guarding flag must be fail-closed, so
 *      a future flag can't silently inherit the fail-open default for a
 *      cost/trust-critical feature (the F6 regression class).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Keys that guard real AI/Vertex compute or billing/payment writes MUST fail
// closed — a read failure must not leave the cost/trust-critical feature on.
const COST_OR_BILLING_FLAG =
  /gemini|vertex|\bai\b|scan|stripe|billing|payment|charge|checkout/i;

describe("flagPolicies", () => {
  it("geminiEnabled is declared FAIL-CLOSED (the AI cost kill-switch)", () => {
    const { flagPolicyFor, FLAG_FAIL_CLOSED } = require("../lib/flagPolicies");
    expect(flagPolicyFor("geminiEnabled")).toBe(FLAG_FAIL_CLOSED);
  });

  it("unknown flag defaults to fail-open (legacy parity)", () => {
    const { flagPolicyFor, FLAG_FAIL_OPEN } = require("../lib/flagPolicies");
    expect(flagPolicyFor("not_a_real_flag")).toBe(FLAG_FAIL_OPEN);
    expect(flagPolicyFor("")).toBe(FLAG_FAIL_OPEN);
    expect(flagPolicyFor(undefined)).toBe(FLAG_FAIL_OPEN);
  });

  it("fallbackForReadFailure BLOCKS a fail-closed flag, allows a fail-open one", () => {
    const { fallbackForReadFailure } = require("../lib/flagPolicies");
    // geminiEnabled is fail-closed → read failure surfaces false → the AI
    // handler's `if (!isFlagEnabled(...)) block` blocks the scan.
    expect(fallbackForReadFailure("geminiEnabled")).toBe(false);
    // Unknown/legacy flag stays fail-open.
    expect(fallbackForReadFailure("unknown")).toBe(true);
  });

  it("FLAG_POLICIES is frozen (accidental mutation throws in strict mode)", () => {
    const { FLAG_POLICIES, FLAG_FAIL_CLOSED } = require("../lib/flagPolicies");
    expect(() => {
      FLAG_POLICIES.somethingNew = FLAG_FAIL_CLOSED;
    }).toThrow(TypeError);
  });

  it("convention: every AI/billing-guarding flag is declared fail-closed", () => {
    const { FLAG_POLICIES, FLAG_FAIL_CLOSED } = require("../lib/flagPolicies");
    const offenders = Object.entries(FLAG_POLICIES)
      .filter(([key]) => COST_OR_BILLING_FLAG.test(key))
      .filter(([, policy]) => policy !== FLAG_FAIL_CLOSED)
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });
});
