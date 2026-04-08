import { Lock } from "lucide-react";

/**
 * Returns style overrides and onClick handler for the scan button based on quota.
 *
 * Active state (has scans remaining or unlimited): no inline style — the
 *   button inherits the calmed white pill styling from its Tailwind classes
 *   in Food.tsx so it visually matches the input bar alongside it.
 * Exhausted state: greyed background + lock icon, opens upgrade.
 */
export function useScanButtonOverrides(
  remaining: number,
  isUnlimited: boolean,
  onUpgrade: () => void,
  onScan: () => void,
): { style: React.CSSProperties; onClick: () => void; icon: React.ReactNode } {
  if (isUnlimited || remaining > 0) {
    return {
      style: {},
      onClick: onScan,
      icon: null,
    };
  }

  // Out of scans — disabled state
  return {
    style: { background: "#D1D5DB" },
    onClick: onUpgrade,
    icon: <Lock className="w-3.5 h-3.5 absolute -bottom-0.5 -right-0.5 text-muted-foreground" />,
  };
}
