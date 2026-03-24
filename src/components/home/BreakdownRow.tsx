import { THEME } from "@/lib/theme";

export default function BreakdownRow({ label, value, color, placeholder }: {
  label: string; value: number; color?: string; placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {value === 0 && placeholder && (
          <span className="text-micro text-muted-foreground">{placeholder}</span>
        )}
        <span className="text-xs font-semibold font-mono tabular-nums" style={{ color: color || THEME.textPrimary }}>
          {value > 0 ? value.toLocaleString() : "0"}
        </span>
      </div>
    </div>
  );
}
