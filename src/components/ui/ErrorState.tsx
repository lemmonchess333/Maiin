/**
 * Tropos design-system ErrorState primitive.
 *
 * Sprint 4 — companion to EmptyState. Used for the load-failed-
 * retry pattern: a section couldn't fetch its data, so render a
 * destructive-tinted card with a title, an optional description,
 * and an optional retry button. This is the presentational
 * counterpart to SectionErrorBoundary (which is a React error
 * boundary — catches render-time exceptions). ErrorState is the
 * surface a parent renders when its data fetch resolves to an
 * error object.
 *
 * Pre-Sprint-4 callsites that did this hand-rolled (each with
 * slightly different padding / border / button styling):
 *   - Social.tsx Explore-feed error banner
 *   - SectionErrorBoundary fallback ("This section couldn't load")
 *
 * The visual idiom mirrors EmptyState — centred icon + title +
 * description + CTA — but with the destructive token rather than
 * the brand purple accent. The icon defaults to AlertTriangle from
 * lucide; callers can override.
 *
 * Accessibility:
 *   role="alert" + aria-live="assertive" so screen readers
 *   announce the failure when it appears. The retry button uses
 *   the canonical Button primitive (secondary variant — the
 *   destructive accent is on the icon, not the CTA, to avoid
 *   making "try again" feel like the dangerous action).
 */
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ErrorStateProps {
  title: string;
  description?: string;
  retry?: {
    label?: string;
    onClick: () => void;
  };
  /** Override the default AlertTriangle icon. */
  icon?: ReactNode;
}

export function ErrorState({
  title,
  description,
  retry,
  icon,
}: ErrorStateProps) {
  return (
    <div
      className="bg-card rounded-2xl p-6 text-center space-y-3"
      role="alert"
      aria-live="assertive"
    >
      <div
        className="size-12 rounded-2xl flex items-center justify-center mx-auto bg-destructive/10"
        aria-hidden="true"
      >
        <span className="text-destructive inline-flex">
          {icon ?? <AlertTriangle className="size-5" />}
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="text-xs text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {retry ? (
        <Button onClick={retry.onClick} size="sm" variant="secondary">
          {retry.label ?? "Try again"}
        </Button>
      ) : null}
    </div>
  );
}
