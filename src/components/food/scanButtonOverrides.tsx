/**
 * Returns the quota-based behaviour for the scan button.
 *
 * Active state (scans remaining or unlimited): `locked: false` — the button
 *   renders its full scan gradient + glow and runs `onScan`.
 * Exhausted state: `locked: true` — ScanMealButton renders the calm
 *   scan-tinted "locked" treatment (readable text + lock, no glow), and the
 *   tap opens the upgrade paywall (`onUpgrade`).
 */
export function useScanButtonOverrides(
  remaining: number,
  isUnlimited: boolean,
  onUpgrade: () => void,
  onScan: () => void
): { onClick: () => void; locked: boolean } {
  if (isUnlimited || remaining > 0) {
    return { onClick: onScan, locked: false };
  }
  return { onClick: onUpgrade, locked: true };
}
