import { describe, it, expect, vi } from "vitest";
import { useScanButtonOverrides } from "../scanButtonOverrides";

/**
 * #978 — the AI-scan gate decision. `onUpgrade` is what Food.tsx now wires to
 * the inline ProModal, so this pins WHO reaches it: only free users who are
 * out of scans. Trial/Pro (isUnlimited) and free-with-scans-left go to onScan,
 * never the paywall.
 */
describe("useScanButtonOverrides — AI-scan gate", () => {
  const onUpgrade = vi.fn();
  const onScan = vi.fn();

  it("free user out of scans → onClick opens upgrade (the ProModal gate) + lock icon", () => {
    const o = useScanButtonOverrides(0, false, onUpgrade, onScan);
    expect(o.onClick).toBe(onUpgrade);
    expect(o.icon).not.toBeNull();
  });

  it("Pro/trial (unlimited) → never the paywall, just scans", () => {
    const o = useScanButtonOverrides(0, true, onUpgrade, onScan);
    expect(o.onClick).toBe(onScan);
    expect(o.icon).toBeNull();
  });

  it("free user with scans remaining → scans, no paywall", () => {
    const o = useScanButtonOverrides(3, false, onUpgrade, onScan);
    expect(o.onClick).toBe(onScan);
    expect(o.icon).toBeNull();
  });
});
