import { useEffect, useState } from "react";
import BootSteps from "@/components/BootSteps";
import { readString } from "@/lib/localStore";
import { isNativePlatform } from "@/lib/platform";
import { cn } from "@/lib/utils";

/** How long a checkout may wait before its steps are offered. */
export const STEP_DETAILS_AFTER_MS = 15_000;

/** On the web the link is for the preview loop: localStorage holding "on"
 *  under this key shows it there too (CLAUDE.md asks every surface the
 *  iPhone alone would show for a web-visible path). */
const STEP_DETAILS_ON_WEB_KEY = "tropos-step-details";

function askedForOnWeb(): boolean {
  return readString(STEP_DETAILS_ON_WEB_KEY) === "on";
}

/**
 * On the iPhone, a "Details" link with what each step did and how long it
 * took (bootTrace.ts), for a checkout or a scan that has failed (`failed`)
 * or has been waiting longer than it should (`waiting`, after 15 seconds).
 * A device run has no inspector; a screenshot of this list is the
 * evidence. `onDark` is for a black overlay, the scanner's.
 */
export default function StepDetails({
  failed,
  waiting,
  onDark = false,
}: {
  failed: boolean;
  waiting: boolean;
  onDark?: boolean;
}) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(
      () => setStalled(true),
      STEP_DETAILS_AFTER_MS
    );
    // A checkout that stops waiting starts its count again next time.
    return () => {
      window.clearTimeout(timer);
      setStalled(false);
    };
  }, [waiting]);

  if (!(isNativePlatform() || askedForOnWeb())) return null;
  if (!(failed || (waiting && stalled))) return null;

  return (
    <details className="text-left">
      <summary
        className={cn(
          "cursor-pointer text-xs",
          onDark ? "text-white/75" : "text-muted-foreground"
        )}
      >
        {failed ? "Details" : "Taking a while? Details"}
      </summary>
      <div className="mt-2">
        <BootSteps onDark={onDark} />
      </div>
    </details>
  );
}
