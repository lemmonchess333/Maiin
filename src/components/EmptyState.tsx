import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 space-y-3">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center mx-auto">
        {icon}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground max-w-[220px] mx-auto leading-relaxed">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 text-xs px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-medium shadow-[var(--ds-shadow-purple-glow)] active:scale-95 transition-transform"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
