import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

type SummaryAction = {
  label: string;
  to: string;
};

interface SettingsSummaryRowProps {
  label: string;
  primary: string;
  secondary?: string;
  action?: SummaryAction;
  onPress?: () => void;
}

const baseClass =
  "w-full min-h-[72px] rounded-2xl border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/35 active:scale-[0.99]";

function RowContent({ label, primary, secondary, actionLabel }: {
  label: string;
  primary: string;
  secondary?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-[17px] font-medium leading-snug text-foreground">
          {primary}
        </p>
        {secondary ? (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
            {secondary}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        {actionLabel ? (
          <span className="max-w-24 truncate text-xs font-medium">{actionLabel}</span>
        ) : null}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </div>
    </div>
  );
}

export default function SettingsSummaryRow({
  label,
  primary,
  secondary,
  action,
  onPress,
}: SettingsSummaryRowProps) {
  if (action && onPress) {
    throw new Error("SettingsSummaryRow accepts either action or onPress, not both");
  }

  if (action) {
    return (
      <Link
        to={action.to}
        onClick={() => haptic("light")}
        className={cn(baseClass, "block")}
      >
        <RowContent
          label={label}
          primary={primary}
          secondary={secondary}
          actionLabel={action.label}
        />
      </Link>
    );
  }

  if (onPress) {
    return (
      <button
        type="button"
        onClick={() => {
          haptic("light");
          onPress();
        }}
        className={baseClass}
      >
        <RowContent
          label={label}
          primary={primary}
          secondary={secondary}
          actionLabel="Edit"
        />
      </button>
    );
  }

  return (
    <div className={baseClass}>
      <RowContent label={label} primary={primary} secondary={secondary} />
    </div>
  );
}
