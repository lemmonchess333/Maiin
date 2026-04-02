import { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, Ban, Pause } from "lucide-react";
import { haptic } from "@/lib/haptic";
import type { DisplayDay } from "./weekViewTypes";

interface DayStepIndicatorProps {
  days: DisplayDay[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  firstIncompleteIndex: number;
  animatingCompletion?: number | null;
}

const GREEN = "#4CAF50";
const PURPLE = "#7C6BF0";

interface CirclePos {
  left: number;
  right: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export default function DayStepIndicator({
  days,
  selectedIndex,
  onSelect,
  firstIncompleteIndex,
  animatingCompletion = null,
}: DayStepIndicatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const circleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [positions, setPositions] = useState<CirclePos[] | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const measured: CirclePos[] = [];
    for (let i = 0; i < days.length; i++) {
      const el = circleRefs.current[i];
      if (!el) return; // not all mounted yet
      const r = el.getBoundingClientRect();
      measured.push({
        left: r.left - containerRect.left,
        right: r.right - containerRect.left,
        centerX: r.left - containerRect.left + r.width / 2,
        centerY: r.top - containerRect.top + r.height / 2,
        width: r.width,
        height: r.height,
      });
    }
    setPositions(measured);
  }, [days.length]);

  // Measure on mount and when days.length changes
  useLayoutEffect(() => {
    measure(); // eslint-disable-line react-hooks/set-state-in-effect -- measuring DOM layout requires sync setState
  }, [measure]);

  // Re-measure on container resize (rotation, layout shifts)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure]);

  if (days.length === 0) return null;

  const passedCount = days.filter(
    d => d.type === "rest" || d.workout.completed || d.workout.skipped,
  ).length;

  // Selected circle position for ring
  const selPos = positions?.[selectedIndex];

  return (
    <div ref={containerRef} className="px-2 py-1" style={{ position: "relative" }}>

      {/* ── Track segments (behind circles) ── */}
      {positions && days.map((_, i) => {
        if (i >= days.length - 1) return null;
        const from = positions[i];
        const to = positions[i + 1];
        if (!from || !to) return null;

        const displayDay = days[i];
        const filled = displayDay.type === "rest"
          ? isPrecedingFilled(days, i)
          : (displayDay.type === "workout" && (displayDay.workout.completed || !!displayDay.workout.skipped));

        return (
          <div
            key={`track-${i}`}
            style={{
              position: "absolute",
              left: from.right,
              width: to.left - from.right,
              top: from.centerY - 1.25,
              height: 2.5,
              borderRadius: 1.25,
              background: filled ? PURPLE : "var(--border)",
              opacity: passedCount === 0 ? 0.5 : 1,
              transition: "background 400ms ease, opacity 300ms ease",
            }}
          />
        );
      })}

      {/* ── Circle buttons ── */}
      <div className="flex items-center justify-between">
        {days.map((displayDay, i) => {
          const isRest = displayDay.type === "rest";
          const isCompleted = !isRest && displayDay.workout.completed;
          const isSkipped = !isRest && !!displayDay.workout.skipped && !displayDay.workout.completed;
          const isCurrent = i === firstIncompleteIndex;
          const isAnimating = animatingCompletion === i;

          const dayLabel = isRest ? "Rest" : displayDay.workout.dayName;
          const workoutNumber = isRest ? null : displayDay.workoutIndex + 1;

          return (
            <button
              key={i}
              onClick={() => { onSelect(i); haptic("light"); }}
              className="flex flex-col items-center"
              style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" }}
              aria-label={`${isRest ? "Rest day" : `Day ${workoutNumber}: ${dayLabel}`}${isCompleted ? " (completed)" : isSkipped ? " (skipped)" : isCurrent ? " (current)" : ""}`}
            >
              {/* Circle */}
              <div
                ref={(el) => { circleRefs.current[i] = el; }}
              >
                {isRest ? (
                  <div
                    className="flex items-center justify-center rounded-full bg-card"
                    style={{ width: 32, height: 32, border: "1.5px dashed var(--border)" }}
                  >
                    <Pause className="w-3 h-3 text-muted-foreground/60" />
                  </div>
                ) : isCompleted ? (
                  <motion.div
                    className="flex items-center justify-center rounded-full"
                    style={{ width: 32, height: 32, background: GREEN }}
                    animate={isAnimating ? { scale: [1, 1.2, 1] } : undefined}
                    transition={isAnimating ? { duration: 0.4, ease: "easeOut" } : undefined}
                  >
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  </motion.div>
                ) : isSkipped ? (
                  <div
                    className="flex items-center justify-center rounded-full bg-card"
                    style={{ width: 32, height: 32, border: "1.5px solid var(--border)" }}
                  >
                    <Ban className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                ) : isCurrent ? (
                  <motion.div
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: 32,
                      height: 32,
                      background: PURPLE,
                      boxShadow: "0 0 10px rgba(124, 107, 240, 0.35)",
                    }}
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                  >
                    <span className="text-white text-xs font-bold">{workoutNumber}</span>
                  </motion.div>
                ) : (
                  <div
                    className="flex items-center justify-center rounded-full bg-card"
                    style={{ width: 32, height: 32, border: "1.5px solid var(--border)" }}
                  >
                    <span className="text-xs text-muted-foreground font-medium">{workoutNumber}</span>
                  </div>
                )}
              </div>

              {/* Label */}
              <span className="text-[11px] text-muted-foreground mt-1.5 leading-none font-medium max-w-[48px] truncate text-center hidden min-[320px]:block">
                {dayLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Selection ring (above circles) ── */}
      {positions && selPos && (
        <motion.div
          style={{
            position: "absolute",
            pointerEvents: "none",
            borderRadius: 9999,
            border: `2.5px solid ${PURPLE}`,
            opacity: 0.35,
          }}
          animate={{
            left: selPos.centerX - (selPos.width + 10) / 2,
            top: selPos.centerY - (selPos.height + 10) / 2,
            width: selPos.width + 10,
            height: selPos.height + 10,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
    </div>
  );
}

/** Check if the preceding workout day (skipping rest) is completed or skipped */
function isPrecedingFilled(days: DisplayDay[], restIndex: number): boolean {
  for (let j = restIndex - 1; j >= 0; j--) {
    const d = days[j];
    if (d.type === "rest") continue;
    return d.workout.completed || !!d.workout.skipped;
  }
  return false;
}
