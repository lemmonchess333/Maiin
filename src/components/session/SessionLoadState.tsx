/**
 * The three non-ready states of a saved-session detail page.
 *
 * One component so the two pages cannot drift: they had different bugs
 * from the same cause, and a fix applied twice is a fix that gets applied
 * once next time.
 *
 * MISSING and FAILED are deliberately different in both wording and
 * action. Missing is terminal — the session is gone or was never the
 * caller's — so the only honest action is to leave. Failed is transient,
 * so Retry is the action and the copy says the read failed rather than
 * accusing the user of following someone else's link. Offering Retry on
 * a deleted session would be a control that can never succeed; offering
 * only "History" on a dropped connection makes the user re-navigate to
 * do what one tap should.
 */
import { useNavigate } from "react-router-dom";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import type { SessionDocStatus } from "@/hooks/useSessionDoc";

export default function SessionLoadState({
  status,
  icon,
  loadingLabel,
  missingHeadline,
  missingSub,
  failedHeadline,
  failedSub,
  onRetry,
  backHref,
  backLabel,
  accent,
}: {
  status: SessionDocStatus;
  icon: LucideIcon;
  loadingLabel: string;
  missingHeadline: string;
  missingSub: string;
  failedHeadline: string;
  failedSub: string;
  onRetry: () => void;
  backHref: string;
  backLabel: string;
  accent?: string;
}) {
  const navigate = useNavigate();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size="lg" variant="primary" label={loadingLabel} />
      </div>
    );
  }

  const failed = status === "failed";
  return (
    <div className="min-h-screen bg-background px-4 pt-6">
      <IconButton
        icon={<ChevronLeft className="size-5" />}
        aria-label="Back"
        variant="ghost"
        onClick={() => navigate(-1)}
      />
      <EmptyState
        icon={icon}
        accent={accent}
        headline={failed ? failedHeadline : missingHeadline}
        sub={failed ? failedSub : missingSub}
        action={
          failed
            ? { label: "Try again", onClick: onRetry }
            : { label: backLabel, href: backHref }
        }
      />
    </div>
  );
}
