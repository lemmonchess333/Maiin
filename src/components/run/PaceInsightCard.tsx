import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import type { PaceInsight } from "@/lib/runPaces";
import type { PaceInsightAcceptResult } from "@/hooks/usePaceInsight";

interface Props {
  insight: PaceInsight;
  onAccept: () => Promise<PaceInsightAcceptResult>;
  onDismiss: () => void;
}

/**
 * Adaptive-pace recalibration card — the explicit approve/dismiss surface for
 * the shipped pace-insight engine. Never silently changes the benchmark:
 * success is announced only AFTER persistence succeeds; a failure leaves the
 * card mounted and retryable; an account switch mid-write ("stale") is silent.
 * Used both in Settings (RunFitnessSection) and post-run (RunSummary).
 */
export default function PaceInsightCard({
  insight,
  onAccept,
  onDismiss,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (accepted) return null;

  async function handleAccept() {
    setSaving(true);
    let result: PaceInsightAcceptResult = "failure";
    try {
      result = await onAccept();
    } catch {
      result = "failure";
    } finally {
      if (mountedRef.current) setSaving(false);
    }
    if (!mountedRef.current || result === "stale") return;
    if (result === "success") {
      haptic("success");
      toast.success("Training paces updated");
      setAccepted(true);
    } else {
      toast.error("Couldn't update your paces. Try again.");
    }
  }

  return (
    <section
      aria-label="Pace insight"
      className="rounded-xl border border-running/25 bg-running/10 p-3 space-y-3"
    >
      <div>
        <p className="text-sm font-semibold text-foreground">
          {insight.direction === "faster"
            ? "Your recent runs support faster targets"
            : "Your saved targets may be too quick right now"}
        </p>
        <p className="text-xs text-muted-foreground">
          Update every upcoming training pace from VDOT{" "}
          <span className="font-mono tabular-nums">{insight.currentVdot}</span>{" "}
          to{" "}
          <span className="font-mono tabular-nums">
            {insight.suggestedVdot}
          </span>
          ?
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant="sport"
          loading={saving}
          onClick={() => void handleAccept()}
          className="flex-1"
        >
          Update paces
        </Button>
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => {
            haptic("light");
            onDismiss();
          }}
          className="flex-1"
        >
          Not now
        </Button>
      </div>
    </section>
  );
}
