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
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  desc?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      fullWidth
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "h-auto justify-start gap-3 p-4 rounded-2xl text-left whitespace-normal",
        selected ? "bg-primary/10 border-primary/50" : "bg-card"
      )}
    >
      <span className="shrink-0 text-lifting-strong" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-semibold">{label}</span>
        {desc && (
          <span className="block mt-1 text-sm font-normal text-muted-foreground">
            {desc}
          </span>
        )}
      </span>
      <span className="w-4 shrink-0" aria-hidden="true">
        {selected && <Check className="size-4 text-lifting-strong" />}
      </span>
    </Button>
  );
}
