import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";

interface RestTimerRingProps {
  restSeconds: number;
  restTarget: number;
  onStop: () => void;
  onChangeTarget: (target: number) => void;
}

const REST_PRESETS = [60, 90, 120, 180];

export default function RestTimerRing({
  restSeconds,
  restTarget,
  onStop,
  onChangeTarget,
}: RestTimerRingProps) {
  const RADIUS = 54;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const progress = Math.min(restSeconds / restTarget, 1);
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const isOver = restSeconds >= restTarget;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex flex-col items-center gap-3 py-2"
    >
      <div className="relative size-32">
        <svg className="size-full -rotate-90" viewBox="0 0 128 128">
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="8"
          />
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke={isOver ? THEME.success : THEME.teal}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p
            className={cn(
              "text-3xl font-extrabold font-mono tabular-nums tracking-tight",
              isOver ? "text-green-400" : "text-foreground"
            )}
          >
            {formatTime(restSeconds)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isOver ? "GO!" : `/ ${formatTime(restTarget)}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            haptic("light");
            onStop();
          }}
          className="flex items-center justify-center gap-1 min-h-11 px-3.5 rounded-lg bg-muted text-foreground text-xs font-medium"
        >
          <RotateCcw className="size-3" /> Skip
        </button>
        <div className="flex gap-1">
          {REST_PRESETS.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => {
                haptic("light");
                onChangeTarget(t);
              }}
              className={cn(
                "min-h-11 px-3 rounded text-xs font-medium font-mono tabular-nums transition-colors",
                restTarget === t
                  ? "text-white"
                  : "bg-muted text-muted-foreground"
              )}
              style={restTarget === t ? { background: THEME.teal } : undefined}
            >
              {t}s
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
