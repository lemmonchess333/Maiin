/**
 * The scan button's behaviour for the account's photo-scan allowance.
 *
 * The button opens the scanner in both states. `locked` is true when the
 * tier has no photo scans left (a free account: its limit is 0), and the
 * scanner reads it: a locked account lands on Barcode, which is free
 * (F2b in the plan file), and the photo tabs show the Pro offer instead
 * of a shutter. Routing a locked tap straight to the paywall left free
 * accounts with no way to scan a barcode at all.
 */
export function useScanButtonOverrides(
  remaining: number,
  isUnlimited: boolean,
  onScan: (origin?: DOMRect) => void
): { onClick: (origin?: DOMRect) => void; locked: boolean } {
  return { onClick: onScan, locked: !isUnlimited && remaining <= 0 };
}
