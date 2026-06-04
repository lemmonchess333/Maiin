import { useState, useEffect, useRef } from "react";
import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { macroRingState } from "@/utils/formatters";

export default function MacroRing({
  value,
  target,
  color,
  label,
  unit = "",
  displayMode = "consumed",
}: {
  value: number;
  target: number;
  color: string;
  label: string;
  unit?: string;
  /** "consumed" (default) shows progress toward the target with the
   *  target as the small sub-label. "left" flips to remaining-to-go
   *  with a "left" sub-label — cal.ai-style tap-to-flip. The ring
   *  stroke always shows consumed/target so progress reads the same
   *  visually regardless of mode. */
  displayMode?: "consumed" | "left";
}) {
  const size = 68;
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const { pct, done } = macroRingState(value, target);
  const [flashKey, setFlashKey] = useState(0);
  const prevDoneRef = useRef(done);

  useEffect(
    function () {
      const wasDone = prevDoneRef.current;
      prevDoneRef.current = done;
      if (done && !wasDone) {
        // Schedule flash on next microtask to satisfy lint
        queueMicrotask(function () {
          setFlashKey(function (k) {
            return k + 1;
          });
        });
        haptic("heavy");
      }
    },
    [done]
  );

  // cal.ai-style: "left" clamps at 0 (no negative when over-target).
  const displayValue =
    displayMode === "consumed" ? value : Math.max(0, target - value);
  const subLabel = displayMode === "consumed" ? `${target}${unit}` : "left";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{
            transform: "rotate(-90deg)",
            position: "absolute",
            inset: 0,
          }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color + "18"}
            strokeWidth="4.5"
          />
          {pct > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="4.5"
              strokeDasharray={`${circ * Math.min(pct, 1)} ${circ}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold font-mono tabular-nums leading-none text-foreground">
            {Math.round(displayValue)}
            {unit}
          </span>
          {done && (
            <span className="text-xs" style={{ color }}>
              &#10003;
            </span>
          )}
        </div>
        {/* Completion flash overlay */}
        {flashKey > 0 && (
          <motion.div
            key={flashKey}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ backgroundColor: color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.3, 0] }}
            transition={{ duration: 0.5 }}
          />
        )}
      </div>
      <div className="text-center">
        <p
          className="text-xs uppercase tracking-wider font-medium"
          style={{ color: THEME.text.muted }}
        >
          {label}
        </p>
        <p className="text-micro" style={{ color: THEME.text.muted }}>
          {subLabel}
        </p>
      </div>
    </div>
  );
}
