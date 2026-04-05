import { motion } from "framer-motion";
import { THEME, macroPastels, type MacroKey, getOverTargetColor } from "@/lib/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

interface MacroCardProps {
  macroKey: MacroKey;
  icon: React.ComponentType<{ className?: string }>;
  consumed: number;
  target: number;
  label: string;
  suffix: string;
  index: number;
}

function safeNum(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: 0.2 + i * 0.08,
      ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
    },
  }),
};

export default function MacroCard({
  macroKey,
  icon: Icon,
  consumed: rawConsumed,
  target,
  label,
  suffix,
  index,
}: MacroCardProps) {
  const reduce = useReducedMotion();
  const consumed = safeNum(rawConsumed);
  const remaining = Math.max(0, target - consumed);
  const isOver = consumed > target && target > 0;
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const isCal = macroKey === "calories";
  const color = THEME.macros[macroKey];
  const pastel = macroPastels[macroKey];
  const displayColor = isOver ? getOverTargetColor(consumed, target) : color;

  // Over: positive overshoot amount (no minus sign). Under: remaining.
  const displayValue = isOver ? consumed - target : remaining;

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial={reduce ? "visible" : "hidden"}
      animate="visible"
      className="min-w-0 rounded-xl p-3 relative overflow-hidden text-center"
      style={{
        backgroundColor: pastel,
      }}
    >
      <div className="relative z-10">
        <div className="flex justify-center mb-1.5" style={{ color: displayColor }}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-2xl font-bold font-mono tabular-nums leading-tight" style={{ color: displayColor }}>
          <AnimatedNumber
            value={displayValue}
            className="text-2xl font-bold font-mono tabular-nums"
          />
          {!isCal && <span className="text-xs font-medium opacity-80">{suffix}</span>}
        </p>
        <p className="text-[9px] font-mono tabular-nums" style={{ color: displayColor, opacity: 0.6 }}>
          {isCal ? `${CALORIE_UNIT} ` : ""}{isOver ? "over" : "left"}
        </p>
        <p className="text-[9px] font-mono tabular-nums mt-0.5" style={{ color: displayColor, opacity: 0.5 }}>
          <AnimatedNumber value={consumed} /> {isCal ? CALORIE_UNIT : suffix} eaten
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
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: displayColor, opacity: 0.7 }}
            initial={{ width: reduce ? `${Math.max(pct * 100, 2)}%` : "2%" }}
            animate={{ width: `${Math.max(pct * 100, 2)}%` }}
            transition={{
              duration: reduce ? 0 : 1,
              ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
              delay: reduce ? 0 : 0.5,
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}
