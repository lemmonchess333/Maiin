import {
  CANONICAL_RUNNING_LAUNCH_ENABLED,
  RUNNING_PRESCRIPTION_GATE_ENABLED,
} from "@/features/program/runningPrescriptionFeature";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";

/** No templates, targets, suggested paces or cached plan in this surface. */
export default function RunningPrescriptionUnavailable({
  onRecord,
  onBack,
  canonical: requestedCanonical,
}: {
  onRecord: (mode: "gps" | "manual" | "treadmill") => void;
  onBack: () => void;
  canonical?: {
    ready: boolean;
    activityRecorded?: boolean;
    busy: boolean;
    failed?: boolean;
    expired?: boolean;
    onDiscardUnstarted?: () => void;
    onStart: () => void;
    onReview: () => void;
  };
}) {
  // Keep the source-only boundary local as well as in the hook and caller.
  // Inactive builds do not need to load canonical-only controls or copy.
  const canonical =
    CANONICAL_RUNNING_LAUNCH_ENABLED && RUNNING_PRESCRIPTION_GATE_ENABLED
      ? requestedCanonical
      : undefined;
  return (
    <div className="flex-1 flex flex-col gap-3 p-4 bg-background text-foreground">
      <Button variant="ghost" onClick={onBack}>
        Back
      </Button>
      <Banner
        variant="neutral"
        title={
          canonical?.activityRecorded
            ? "Activity recorded"
            : "Run guidance is unavailable"
        }
        description={
          canonical?.activityRecorded
            ? "An activity is linked to this session. This does not confirm completion or progression. You can still record without guidance."
            : "Your plan needs a fresh check. You can still record an activity without a prescribed session."
        }
      />
      {canonical && (
        <>
          {!canonical.expired && !canonical.activityRecorded && (
            <Button
              variant="sport"
              loading={canonical.busy}
              onClick={canonical.ready ? canonical.onStart : canonical.onReview}
            >
              {canonical.ready
                ? "Check and start today's session"
                : "Review plan before starting"}
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            {canonical.activityRecorded
              ? "Review your plan before starting another prescribed session."
              : canonical.expired
                ? "This start check expired before recording began. Discard the unstarted session before trying a new planned start, or record without guidance."
                : canonical.failed
                  ? "The start was not confirmed. A retry uses the same recording identity. You can also discard this unstarted session."
                  : canonical.ready
                    ? "The plan is checked again before recording begins."
                    : "A current safety review and a session for today are required. Open your plan to review it."}
          </p>
          {canonical.failed && (
            <Button
              variant="outline"
              disabled={canonical.busy}
              onClick={canonical.onDiscardUnstarted}
            >
              Discard unstarted session
            </Button>
          )}
        </>
      )}
      <Button disabled={canonical?.busy} onClick={() => onRecord("gps")}>
        Record without guidance
      </Button>
      <Button
        disabled={canonical?.busy}
        variant="outline"
        onClick={() => onRecord("manual")}
      >
        Record without GPS
      </Button>
      <Button
        disabled={canonical?.busy}
        variant="outline"
        onClick={() => onRecord("treadmill")}
      >
        Record on a treadmill
      </Button>
    </div>
  );
}
