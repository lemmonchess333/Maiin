import { useEffect, useState } from "react";
import BootSteps from "@/components/BootSteps";
import { isNativePlatform } from "@/lib/platform";

/** How long a checkout may wait before its steps are offered. */
export const STEP_DETAILS_AFTER_MS = 15_000;

/**
 * On the iPhone, a "Details" link with what each step did and how long it
 * took (bootTrace.ts), for a checkout that has failed (`failed`) or has been
 * waiting longer than it should (`waiting`, after 15 seconds). A device run
 * has no inspector; a screenshot of this list is the evidence.
 */
export default function StepDetails({
  failed,
  waiting,
}: {
  failed: boolean;
  waiting: boolean;
}) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!waiting) {
      setStalled(false);
      return;
    }
    const timer = window.setTimeout(
      () => setStalled(true),
      STEP_DETAILS_AFTER_MS
    );
    return () => window.clearTimeout(timer);
  }, [waiting]);

  if (!isNativePlatform() || !(failed || (waiting && stalled))) return null;

  return (
    <details className="text-left">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        {failed ? "Details" : "Taking a while? Details"}
      </summary>
      <div className="mt-2">
        <BootSteps />
      </div>
    </details>
  );
}
