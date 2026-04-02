import { motion } from "framer-motion";
import { Check, Ban } from "lucide-react";
import { haptic } from "@/lib/haptic";
import type { WorkoutDay } from "@/features/program/programTypes";

interface DayStepIndicatorProps {
  workouts: WorkoutDay[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  firstIncompleteIndex: number;
}

const GREEN = "#4CAF50";
const PURPLE = "#7C6BF0";
const CIRCLE = 32;
const RING = 42;

export default function DayStepIndicator({
  workouts,
  selectedIndex,
  onSelect,
  firstIncompleteIndex,
}: DayStepIndicatorProps) {
  if (workouts.length === 0) return null;

  const passedCount = workouts.filter(d => d.completed || d.skipped).length;
  const trackOpacity = passedCount === 0 ? 0.5 : 1;

  return (
    <div className="px-2 py-1">
      {/* Circles + tracks */}
      <div className="flex items-center justify-between">
        {workouts.map((day, i) => {
          const isCompleted = day.completed;
          const isSkipped = !!day.skipped && !day.completed;
          const isCurrent = i === firstIncompleteIndex;
          const isSelected = i === selectedIndex;

          return (
            <div
              key={i}
              className="flex items-center"
              style={{ flex: i < workouts.length - 1 ? 1 : undefined }}
            >
              {/* Circle + label column */}
              <button
                onClick={() => { onSelect(i); haptic("light"); }}
                className="relative flex flex-col items-center"
                style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
                aria-label={`Day ${i + 1}: ${day.dayName}${isCompleted ? " (completed)" : isSkipped ? " (skipped)" : isCurrent ? " (current)" : ""}`}
              >
                {/* Selection ring */}
                {isSelected && (
                  <motion.div
                    layoutId="week-day-ring"
                    className="absolute rounded-full"
                    style={{
                      width: RING,
                      height: RING,
                      border: `2px solid ${PURPLE}`,
                      opacity: 0.35,
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}

                {/* Circle */}
                {isCompleted ? (
                  <div
                    className="flex items-center justify-center rounded-full"
                    style={{ width: CIRCLE, height: CIRCLE, background: GREEN }}
                  >
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                ) : isSkipped ? (
                  <div
                    className="flex items-center justify-center rounded-full bg-card"
                    style={{
                      width: CIRCLE,
                      height: CIRCLE,
                      border: "1.5px solid var(--border)",
                    }}
                  >
                    <Ban className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                ) : isCurrent ? (
                  <motion.div
                    className="flex items-center justify-center rounded-full"
                    style={{ width: CIRCLE, height: CIRCLE, background: PURPLE }}
                    initial={{ scale: 1 }}
                    animate={{ scale: [1, 1.12, 1] }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                  >
                    <span className="text-white text-xs font-bold">{i + 1}</span>
                  </motion.div>
                ) : (
                  <div
                    className="flex items-center justify-center rounded-full bg-card"
                    style={{
                      width: CIRCLE,
                      height: CIRCLE,
                      border: "1.5px solid var(--border)",
                    }}
                  >
                    <span className="text-xs text-muted-foreground font-medium">{i + 1}</span>
                  </div>
                )}

                {/* Session name label */}
                <span className="text-[11px] text-muted-foreground mt-1.5 leading-none font-medium max-w-[48px] truncate text-center hidden min-[320px]:block">
                  {day.dayName}
                </span>
              </button>

              {/* Track segment */}
              {i < workouts.length - 1 && (
                <div className="flex-1 mx-1" style={{ opacity: trackOpacity, transition: "opacity 300ms ease" }}>
                  <div
                    className="h-[2px] rounded-full"
                    style={{
                      background: (isCompleted || isSkipped) ? PURPLE : "var(--border)",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
