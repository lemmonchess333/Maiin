import type { ReactNode } from "react";
import { Link } from "react-router-dom";

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

export function EmptyState({ icon, title, description, action, accentColor = '#7C6EF6' }: EmptyStateProps) {
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
          <Link
            to={action.href}
            className="inline-flex items-center px-5 py-2.5 rounded-full text-xs font-semibold active:scale-95 transition-transform"
            style={{ background: accentColor, color: '#fff' }}
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="inline-flex items-center px-5 py-2.5 rounded-full text-xs font-semibold active:scale-95 transition-transform"
            style={{ background: accentColor, color: '#fff' }}
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
