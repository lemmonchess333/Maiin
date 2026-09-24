import { describe, it, expect, vi } from "vitest";
import { useScanButtonOverrides } from "../scanButtonOverrides";

/**
 * The scan gate. The button opens the scanner for every account; `locked`
 * is what the scanner reads to land on Barcode and hold the photo tabs
 * behind the Pro offer. A locked tap that went straight to the paywall is
 * what left free accounts unable to scan a barcode, which is free.
 */
describe("useScanButtonOverrides — scan gate", () => {
  const onScan = vi.fn();

  it("free account with no photo scans → still opens the scanner, locked", () => {
    const o = useScanButtonOverrides(0, false, onScan);
    expect(o.onClick).toBe(onScan);
    expect(o.locked).toBe(true);
  });

  it("Pro/trial (unlimited) → opens the scanner, unlocked", () => {
    const o = useScanButtonOverrides(0, true, onScan);
    expect(o.onClick).toBe(onScan);
    expect(o.locked).toBe(false);
  });

  it("scans remaining → opens the scanner, unlocked", () => {
    const o = useScanButtonOverrides(3, false, onScan);
    expect(o.onClick).toBe(onScan);
    expect(o.locked).toBe(false);
  });
});
