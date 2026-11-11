import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import BootSteps from "@/components/BootSteps";

/** How long the startup spinner shows before the steps appear under it. */
export const BOOT_STALL_MS = 10_000;

/**
 * Under the startup spinner, once starting has taken longer than it ever
 * should: what the app has done so far, newest last, and a way to try
 * again. A screenshot of it names the step that never finished
 * (bootTrace.ts says why this exists).
 */
export default function BootStallNotice() {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), BOOT_STALL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!stalled) return null;

  return (
    <div className="mt-6 w-full max-w-sm space-y-3 px-4 text-center">
      <p className="text-sm font-semibold">Tropos is taking a while to start</p>
      <BootSteps />
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </div>
  );
}
