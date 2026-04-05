import { THEME, macroPastels, type MacroKey } from "@/lib/theme";
import { formatCalories, formatMacro, CALORIE_UNIT } from "@/utils/formatNutrition";

const OVER_COLOR = "#B91C1C"; // red-700 — warning state for all macros

interface MacroCardProps {
  macroKey: MacroKey;
  icon: React.ComponentType<{ className?: string }>;
  consumed: number;
  target: number;
  label: string;
  suffix: string;
}

function safeNum(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

export default function MacroCard({
  macroKey,
  icon: Icon,
  consumed: rawConsumed,
  target,
  label,
  suffix,
}: MacroCardProps) {
  const consumed = safeNum(rawConsumed);
  const remaining = Math.max(0, target - consumed);
  const isOver = consumed > target && target > 0;
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const isCal = macroKey === "calories";
  const color = THEME.macros[macroKey];
  const pastel = macroPastels[macroKey];
  const displayColor = isOver ? OVER_COLOR : color;

  return (
    <div
      className="min-w-0 rounded-xl p-3 relative overflow-hidden"
      style={{
        backgroundColor: pastel,
        border: "1px solid rgba(255, 255, 255, 0.5)",
      }}
    >
      <div className="relative z-10">
        <div className="flex justify-center mb-1.5" style={{ color: displayColor }}>
          <Icon className="w-5 h-5" />
        </div>
        <p
          className="text-2xl font-bold font-mono tabular-nums leading-tight"
          style={{ color: displayColor }}
        >
          {isOver
            ? `-${isCal ? formatCalories(consumed - target) : formatMacro(consumed - target)}`
            : isCal ? formatCalories(remaining) : formatMacro(remaining)
          }
          {!isCal && <span className="text-xs font-medium opacity-80">{suffix}</span>}
        </p>
        <p className="text-[9px] font-mono tabular-nums" style={{ color: displayColor, opacity: 0.6 }}>
          {isCal ? `${CALORIE_UNIT} ` : ""}{isOver ? "over" : "left"}
        </p>
        <p className="text-[9px] font-mono tabular-nums mt-0.5" style={{ color: displayColor, opacity: 0.5 }}>
          {isCal ? formatCalories(consumed) : `${formatMacro(consumed)}${suffix}`} eaten
        </p>
        <p
          className="text-[10px] font-semibold uppercase tracking-wider mt-1"
          style={{ color: displayColor }}
        >
          {label}
        </p>
        <div
          className="mt-2 h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: `${color}20` }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.max(pct * 100, 2)}%`,
              backgroundColor: displayColor,
              opacity: 0.7,
            }}
          />
        </div>
      </div>
    </div>
  );
}
