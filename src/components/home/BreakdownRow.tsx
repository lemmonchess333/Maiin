import { THEME } from "@/lib/theme";

export default function BreakdownRow({ label, value, color, placeholder }: {
  label: string; value: number; color?: string; placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-semibold font-mono tabular-nums" style={{ color: color || THEME.textPrimary }}>
        {value > 0 ? value.toLocaleString() : (placeholder || "\u2014")}
      </span>
    </div>
  );
}
