import Button from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { useProCtaLabel } from "@/hooks/useProCtaLabel";

/**
 * The Pro offer on the scanner's photo tabs, for an account whose tier
 * has no photo scans. Its own component so the scanner only reads the
 * account (for the trial wording) when this offer is actually on screen.
 */
export default function ScanProButton({
  onUpgrade,
}: {
  onUpgrade: () => void;
}) {
  const label = useProCtaLabel();
  return (
    <Button
      variant="primary"
      onClick={() => {
        haptic();
        onUpgrade();
      }}
    >
      {label}
    </Button>
  );
}
