import { AlertTriangle, Footprints } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { useSteps } from "@/hooks/useSteps";
import { openHealthSettings } from "@/lib/healthKit";

/**
 * Settings → Health (surface C of the HealthKit steps work). The recoverable
 * discovery surface: mirrors NotificationsSection's anatomy — a connected-state
 * row, a connect action for the unprompted state, and — for the post-connect
 * zero-data *ambiguous* state — an inline hint banner mirroring the
 * notifications denied-banner, pointing at iOS Settings → Health → Data Access
 * & Devices → Tropos (the OS gives no direct deep-link, so we spell out the
 * path). No error state: iOS never confirms a denied READ scope, so a
 * connected-but-zero reading is treated as a hint, not a failure.
 */
export default function HealthSection({
  inline = false,
}: {
  inline?: boolean;
}) {
  const { status, steps, connect } = useSteps();
  const connected = status === "connected" || status === "ambiguous";

  return (
    <AccordionSection
      inline={inline}
      icon={<Footprints className="size-5 text-primary" />}
      title="Apple Health"
      subtitle="Daily step count on Home"
    >
      {status === "unavailable" && (
        <div className="p-4 rounded-lg bg-muted">
          <p className="text-sm text-foreground">Not available here</p>
          <p className="text-xs text-muted-foreground">
            Step tracking uses Apple Health, available in the Tropos iOS app.
          </p>
        </div>
      )}

      {status === "unprompted" && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-muted">
          <div className="pr-2">
            <p className="text-sm text-foreground">Connect Apple Health</p>
            <p className="text-xs text-muted-foreground">
              Show your daily step count on Home.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              haptic("light");
              void connect();
            }}
          >
            Connect
          </Button>
        </div>
      )}

      {connected && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Apple Health connected</p>
            <p className="text-xs text-muted-foreground">
              Steps refresh when you open Tropos.
            </p>
          </div>
          <span className="text-sm font-mono tabular-nums font-semibold text-foreground">
            {(steps ?? 0).toLocaleString()}
          </span>
        </div>
      )}

      {/* Ambiguous = connected but no step data. Because iOS won't reveal a
          denied READ scope, this is a hint (not an error) with the manual
          recovery path — mirrors the notifications denied-banner. */}
      {status === "ambiguous" && (
        <div
          role="alert"
          className="flex items-start gap-3 p-3 rounded-lg border border-warning/15 bg-warning-bg"
        >
          <AlertTriangle className="size-4 mt-[2px] shrink-0 text-warning-strong" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">No steps yet</p>
            <p className="text-xs leading-snug text-muted-foreground">
              If your steps stay at zero, allow Tropos to read steps in Settings
              → Health → Data Access &amp; Devices → Tropos.
            </p>
            <button
              type="button"
              onClick={() => {
                haptic("light");
                void openHealthSettings();
              }}
              className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
            >
              Open Settings
            </button>
          </div>
        </div>
      )}
    </AccordionSection>
  );
}
