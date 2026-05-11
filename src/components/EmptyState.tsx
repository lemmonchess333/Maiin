import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  accentColor?: string;
}

export function EmptyState({ icon, title, description, action, accentColor = '#7B72E9' }: EmptyStateProps) {
  // Sprint 1: CTA migrated to the <Button> primitive. accentColor
  // continues to drive the icon container colour (per-surface
  // theming for run/lift/food empty states), but the CTA itself
  // uses the canonical primary variant — design-system spec is one
  // primary CTA colour app-wide, not per-page accents.
  return (
    <div className="text-center py-12 px-6 space-y-4" role="status">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
        aria-hidden="true"
        style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}25` }}
      >
        <div style={{ color: accentColor }}>{icon}</div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground max-w-[240px] mx-auto leading-relaxed">
          {description}
        </p>
      </div>
      {action && (
        action.href ? (
          // Sprint 1: <Link> rendered with the same canonical
          // classes the Button primitive uses for size="sm"
          // primary. <a> elements can't be wrapped in <button>
          // (invalid HTML), so we replicate Button's class shape
          // directly here. Keep this in sync with
          // src/components/ui/Button.tsx if Button's primary
          // styling changes.
          <Link
            to={action.href}
            className="inline-flex items-center justify-center min-h-[36px] px-3 text-xs gap-1.5 rounded-xl font-semibold select-none bg-primary-strong text-primary-foreground hover:bg-primary-strong/90 active:scale-[0.97] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {action.label}
          </Link>
        ) : (
          <Button onClick={action.onClick} size="sm">
            {action.label}
          </Button>
        )
      )}
    </div>
  );
}
