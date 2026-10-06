import { Check } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export default function OptionCard({
  selected,
  onSelect,
  icon,
  label,
  desc,
  disabled,
  tone = "lifting",
}: {
  selected: boolean;
  onSelect: () => void;
  /** Omitted where no picture helps (the limitations step). */
  icon?: React.ReactNode;
  label: string;
  desc?: string;
  disabled?: boolean;
  tone?: "lifting" | "running";
}) {
  // The card is a container so its picture can give way at larger text:
  // under 15em the 3rem drawing left a word like "Experienced" no room,
  // and a single word cannot wrap. Wide-first, so a browser without
  // container queries keeps the designed card.
  return (
    <div className="@container">
      <Button
        variant="outline"
        fullWidth
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        className={cn(
          "h-auto justify-start gap-3 p-4 rounded-2xl text-left whitespace-normal",
          selected
            ? tone === "running"
              ? "bg-running/10 border-running/50"
              : "bg-primary/10 border-primary/50"
            : "bg-card"
        )}
      >
        {icon && (
          <span
            className={cn(
              "shrink-0 @max-[15em]:hidden",
              tone === "running" ? "text-running-strong" : "text-lifting-strong"
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        {/* A word wider than the card (larger text on a narrow phone)
          hyphenates rather than running out of it. */}
        <span className="flex-1 min-w-0 break-words hyphens-auto">
          <span className="block text-base font-semibold">{label}</span>
          {desc && (
            <span className="block mt-1 text-sm font-normal text-muted-foreground">
              {desc}
            </span>
          )}
        </span>
        <span className="w-4 shrink-0" aria-hidden="true">
          {selected && (
            <Check
              className={cn(
                "size-4",
                tone === "running"
                  ? "text-running-strong"
                  : "text-lifting-strong"
              )}
            />
          )}
        </span>
      </Button>
    </div>
  );
}
