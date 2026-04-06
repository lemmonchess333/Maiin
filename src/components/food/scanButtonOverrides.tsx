import { Lock } from "lucide-react";

/**
 * Returns style overrides and onClick handler for the scan button based on quota.
 * When quota is exhausted, the button becomes grey with a lock icon and opens upgrade.
 */
export function useScanButtonOverrides(
  remaining: number,
  isUnlimited: boolean,
  onUpgrade: () => void,
  onScan: () => void,
): { style: React.CSSProperties; onClick: () => void; icon: React.ReactNode } {
  if (isUnlimited || remaining > 0) {
    return {
      style: { background: "linear-gradient(135deg, #f07368, #f09060)" },
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
